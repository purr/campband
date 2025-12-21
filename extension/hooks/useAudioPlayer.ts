import { useEffect, useCallback, useRef } from 'react';
import { audioEngine } from '@/lib/audio';
import { usePlayerStore, useQueueStore, useLibraryStore, useSettingsStore, useAlbumStore, useRouterStore } from '@/lib/store';
import { refreshStreamUrl } from '@/lib/api';
import { buildArtUrl, ImageSizes } from '@/types';
import { getDisplayTitle } from '@/lib/utils';
import { scrobblingService } from '@/lib/scrobbling/scrobblingService';

// Enable debug logging for song operations
const DEBUG_SONGS = true; // Enable for troubleshooting

function logSong(...args: any[]) {
  if (DEBUG_SONGS) {
    console.log('[useAudioPlayer]', ...args);
  }
}

/**
 * Hook to connect the audio engine with Zustand stores.
 * This should be called once at the app root.
 */
export function useAudioPlayer() {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    volume,
    isMuted,
    currentTime,
    duration,
    repeat,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setIsBuffering,
    setError,
    clearError,
    setCurrentTrack,
  } = usePlayerStore();

  const { queue, currentIndex, playNext, playPrevious, playTrackAt, hasNext, advanceToNext, expandQueueForLoop } = useQueueStore();
  const { addToHistory, init: initLibrary } = useLibraryStore();
  const audioSettings = useSettingsStore((state) => state.audio);

  // Track the last track we added to history to avoid duplicates
  const lastHistoryTrackId = useRef<number | null>(null);
  // Track if we should auto-play after loading
  const shouldAutoPlay = useRef(false);
  // Track if we're in the middle of a crossfade (to freeze duration display)
  const isCrossfading = useRef(false);
  // Track last sync time to prevent rapid re-syncing
  const lastSyncTime = useRef(0);
  // Track when user last paused to prevent syncing back to playing immediately
  const lastUserPauseTime = useRef(0);
  // Track previous isPlaying state to detect user actions
  const previousIsPlaying = useRef<boolean | null>(null);

  // Initialize previousIsPlaying on mount
  useEffect(() => {
    if (previousIsPlaying.current === null) {
      previousIsPlaying.current = isPlaying;
    }
  }, [isPlaying]);

  // Initialize library on mount
  useEffect(() => {
    initLibrary();
  }, [initLibrary]);


  // Store repeat mode in ref so callback always has latest value
  const repeatRef = useRef(repeat);
  useEffect(() => {
    repeatRef.current = repeat;
    // When loop (repeat all) is enabled, expand queue with remaining tracks
    if (repeat === 'all') {
      expandQueueForLoop();
    }
  }, [repeat, expandQueueForLoop]);

  // Store queue info in refs for the onEnded callback
  const queueRef = useRef({ queue, currentIndex });
  useEffect(() => {
    queueRef.current = { queue, currentIndex };
  }, [queue, currentIndex]);

  // Set up volume getter from store (centralized source of truth)
  useEffect(() => {
    // Set volume getter to always get from store
    audioEngine.setVolumeGetter(() => volume);
  }, [volume]);

  // Update audio settings - use unified sync function
  // This ensures all settings are applied together correctly
  useEffect(() => {
    audioEngine.syncAllAudioSettings({
      volume: volume, // Always get from store
      volumeNormalization: audioSettings.volumeNormalization,
      eqEnabled: audioSettings.eq.enabled,
      eqGains: audioSettings.eq.gains,
      crossfadeEnabled: audioSettings.crossfadeEnabled,
      crossfadeDuration: audioSettings.crossfadeDuration,
      gaplessPlayback: audioSettings.gaplessPlayback,
    }).catch((error) => {
      console.error('[useAudioPlayer] Failed to sync audio settings:', error);
    });
  }, [
    volume,
    audioSettings.volumeNormalization,
    audioSettings.eq.enabled,
    audioSettings.eq.gains,
    audioSettings.crossfadeEnabled,
    audioSettings.crossfadeDuration,
    audioSettings.gaplessPlayback,
  ]);

  // Handle mute separately (doesn't need full sync)
  useEffect(() => {
    audioEngine.setMuted(isMuted);
  }, [isMuted]);

  // Set up audio engine callbacks
  useEffect(() => {
    audioEngine.setCallbacks({
      onPlay: () => {
        // Clear any errors when playback starts successfully
        clearError();
        setIsPlaying(true);
        setIsBuffering(false);

        // Start scrobbling for current track (only when actually playing)
        const currentTrack = usePlayerStore.getState().currentTrack;
        if (currentTrack) {
          scrobblingService.startTrack(currentTrack, true).catch(console.error);
        }
      },
      onPause: () => {
        const actualCurrentTrack = usePlayerStore.getState().currentTrack;
        console.log('[useAudioPlayer] PAUSED', {
          trackId: actualCurrentTrack?.id,
          trackTitle: actualCurrentTrack?.title,
          currentTime: audioEngine.getCurrentTime(),
          duration: audioEngine.getDuration(),
          reason: 'Audio element paused event'
        });
        // Mark that pause completed to allow syncing again after a delay
        lastUserPauseTime.current = Date.now();
        setIsPlaying(false);
        // Don't stop scrobbling on pause - user might resume
      },
      onEnded: () => {
        const currentRepeat = repeatRef.current;
        const { queue: currentQueue } = queueRef.current;
        const actualCurrentTrack = usePlayerStore.getState().currentTrack;

        console.log('[useAudioPlayer] TRACK ENDED', {
          trackId: actualCurrentTrack?.id,
          trackTitle: actualCurrentTrack?.title,
          repeat: currentRepeat,
          queueLength: currentQueue.length,
          currentIndex: queueRef.current.currentIndex,
          hasNext: hasNext(),
          currentTime: audioEngine.getCurrentTime(),
          duration: audioEngine.getDuration()
        });
        logSong('TRACK ENDED', { repeat: currentRepeat, queueLength: currentQueue.length, hasNext: hasNext() });

        // Repeat track: restart the same track
        if (currentRepeat === 'track') {
          logSong('REPEAT TRACK - seeking to start');
          // Send queued scrobbles immediately before restarting
          scrobblingService.stopTrack(true);
          audioEngine.seek(0);
          audioEngine.play().catch(console.error);
          return;
        }

        // Track ended - send queued scrobbles immediately
        scrobblingService.stopTrack(true);

        // Has more tracks in queue
        if (hasNext()) {
          logSong('HAS NEXT - playing next');
          playNext();
          return;
        }

        // No more tracks - check repeat all
        if (currentRepeat === 'all' && currentQueue.length > 0) {
          logSong('REPEAT ALL - playing first track', { queueLength: currentQueue.length });
          // CRITICAL: Stop current playback and clear state before looping
          // This ensures the old audio element doesn't interfere
          audioEngine.stop();
          // Reset crossfade state
          isCrossfading.current = false;
          // Set auto-play flag so the new track will play
          shouldAutoPlay.current = true;
          // Reset last loaded ID so the new track loads properly
          lastLoadedTrackId.current = null;

          // CRITICAL: Update current track IMMEDIATELY before playing
          // This ensures UI shows correct track during loop
          const firstTrack = currentQueue[0];
          if (firstTrack) {
            logSong('REPEAT ALL - updating currentTrack to first track', { trackId: firstTrack.id, title: firstTrack.title });
            setCurrentTrack(firstTrack, true); // Reset time when looping
          }

          // Small delay to ensure audio engine is fully stopped before loading new track
          setTimeout(() => {
            playTrackAt(0);
          }, 100);
          return;
        }

        // No repeat, no more tracks - stop
        logSong('NO MORE TRACKS - stopping');
        setIsPlaying(false);
      },
      onTimeUpdate: (time) => {
        // Don't update time during crossfade (keep showing old track's progress)
        if (isCrossfading.current) {
          return;
        }
        // Don't update time while seeking (prevents race conditions)
        if (isSeeking.current) {
          return;
        }
        // Validate this update is for the current track
        const actualCurrentTrack = usePlayerStore.getState().currentTrack;
        if (expectedTrackIdForUpdates.current && actualCurrentTrack?.id !== expectedTrackIdForUpdates.current) {
          logSong('TIME UPDATE IGNORED - wrong track', {
            expected: expectedTrackIdForUpdates.current,
            actual: actualCurrentTrack?.id
          });
          return;
        }
        setCurrentTime(time);

        // Update scrobbling progress (only if actually playing)
        const isActuallyPlaying = usePlayerStore.getState().isPlaying;
        scrobblingService.updateProgress(time, isActuallyPlaying);
      },
      onDurationChange: (dur) => {
        // Don't update duration during crossfade (keep showing old track's duration)
        if (isCrossfading.current) {
          logSong('DURATION CHANGE SKIPPED (crossfading)');
          return;
        }
        // Validate this update is for the current track
        const actualCurrentTrack = usePlayerStore.getState().currentTrack;
        if (expectedTrackIdForUpdates.current && actualCurrentTrack?.id !== expectedTrackIdForUpdates.current) {
          logSong('DURATION CHANGE IGNORED - wrong track', {
            duration: dur,
            expected: expectedTrackIdForUpdates.current,
            actual: actualCurrentTrack?.id
          });
          return;
        }
        // Validate duration is reasonable (not NaN, not 0 for loaded track, not negative)
        if (isNaN(dur) || dur < 0 || (dur === 0 && actualCurrentTrack && audioEngine.isPlaying())) {
          logSong('DURATION CHANGE IGNORED - invalid duration', { duration: dur });
          return;
        }
        logSong('DURATION CHANGE', { duration: dur, trackId: actualCurrentTrack?.id });
        setDuration(dur);
      },
      onLoadStart: () => {
        setIsBuffering(true);
        clearError();
      },
      onCanPlay: () => {
        // CRITICAL: Get current track from store (not closure) to avoid stale data
        // The closure's currentTrack might be from when callback was set up
        const actualCurrentTrack = usePlayerStore.getState().currentTrack;
        const currentSrc = audioEngine.getCurrentSrc();
        const expectedSrc = actualCurrentTrack?.streamUrl;

        // Check if this is from an old element (after crossfade swap)
        // CRITICAL: Blob URLs are valid - they're created from the stream URL
        // So if currentSrc is a blob URL, it's still valid for the current track
        if (expectedSrc && currentSrc && currentSrc !== expectedSrc) {
          // If currentSrc is a blob URL, it's valid (created from stream URL)
          const isBlobUrl = currentSrc.startsWith('blob:');

          if (!isBlobUrl) {
            // Not a blob URL - check if it matches any track in the queue
          const queueState = useQueueStore.getState();
          const isInQueue = queueState.queue.some(t => t.streamUrl === currentSrc);

          if (!isInQueue) {
            // This source is not in the queue at all - it's definitely from an old element
            logSong('CAN PLAY IGNORED - source not in queue', {
              currentSrc: currentSrc?.substring(0, 50),
              expectedSrc: expectedSrc?.substring(0, 50),
              trackId: actualCurrentTrack?.id
            });
            return;
            }
          } else {
            // It's a blob URL - this is valid, accept it
            logSong('CAN PLAY - blob URL detected (valid after hot reload)', {
              currentSrc: currentSrc?.substring(0, 50),
              trackId: actualCurrentTrack?.id
            });
          }
        }

        logSong('CAN PLAY', { trackId: actualCurrentTrack?.id, currentSrc: currentSrc?.substring(0, 50) });

        // CRITICAL: Verify the track matches before proceeding
        // If track doesn't match, this canPlay is from an old/stale audio element
        if (actualCurrentTrack && expectedSrc && currentSrc) {
          if (currentSrc !== expectedSrc) {
            const isBlobUrl = currentSrc.startsWith('blob:');
            if (!isBlobUrl) {
              // Not a blob URL and doesn't match - ignore this canPlay
              logSong('CAN PLAY IGNORED - track mismatch', {
                expectedTrackId: actualCurrentTrack.id,
                expectedSrc: expectedSrc.substring(0, 50),
                currentSrc: currentSrc.substring(0, 50)
              });
              return;
            }
          }
        }

        setIsBuffering(false);

        // CRITICAL: Sync all audio settings when audio can play
        // This ensures volume and all settings are correct when audio is ready to play
        // This is especially important on initial load
        audioEngine.syncAllAudioSettings({
          volume: volume, // Get from store
          volumeNormalization: audioSettings.volumeNormalization,
          eqEnabled: audioSettings.eq.enabled,
          eqGains: audioSettings.eq.gains,
          crossfadeEnabled: audioSettings.crossfadeEnabled,
          crossfadeDuration: audioSettings.crossfadeDuration,
          gaplessPlayback: audioSettings.gaplessPlayback,
        }).catch((error) => {
          console.error('[useAudioPlayer] Failed to sync audio settings on canPlay:', error);
        });

        // CRITICAL: Get and set duration immediately when audio can play
        // This fixes duration issues when clicking to play
        const audioDuration = audioEngine.getDuration();
        if (audioDuration > 0 && !isNaN(audioDuration)) {
          if (audioDuration !== duration) {
          logSong('SETTING DURATION from canPlay', { duration: audioDuration, oldDuration: duration });
          setDuration(audioDuration);
          }
        }

        // Restore position from persisted state if we have one and audio is ready
        const storeState = usePlayerStore.getState();
        if (storeState.currentTime > 0 && audioDuration > 0) {
          const currentAudioTime = audioEngine.getCurrentTime();
          // Only restore if position is significantly different (more than 1 second)
          if (Math.abs(currentAudioTime - storeState.currentTime) > 1) {
            logSong('RESTORING POSITION from persisted state', {
              savedPosition: storeState.currentTime,
              currentTime: currentAudioTime
            });
            audioEngine.seek(storeState.currentTime);
            setCurrentTime(storeState.currentTime);
          }
        }

        // Auto-play only if explicitly requested (not on page reload)
        // Check if this is the first load by checking if lastLoadedTrackId was null before
        if (shouldAutoPlay.current && lastLoadedTrackId.current !== null) {
          logSong('AUTO PLAY from canPlay');
          shouldAutoPlay.current = false;

          // Restore position from persisted state before playing
          const storeState = usePlayerStore.getState();
          if (storeState.currentTime > 0 && audioDuration > 0) {
            const currentAudioTime = audioEngine.getCurrentTime();
            // Only restore if position is significantly different (more than 1 second)
            if (Math.abs(currentAudioTime - storeState.currentTime) > 1) {
              logSong('RESTORING POSITION before auto-play', {
                savedPosition: storeState.currentTime,
                currentTime: currentAudioTime,
                audioDuration
              });
              audioEngine.seek(storeState.currentTime);
              setCurrentTime(storeState.currentTime);
              // Small delay to ensure seek completes before playing
              setTimeout(() => {
                setIsPlaying(true);
                audioEngine.play().then(() => {
                  logSong('AUTO PLAY SUCCEEDED after position restore');
                }).catch((err) => {
            if (err instanceof DOMException && err.name === 'AbortError') {
              return;
            }
                  logSong('AUTO PLAY FAILED after position restore', err);
                  setIsPlaying(false);
                });
              }, 100);
              return;
            }
          }

          // Ensure store says playing before we play
          setIsPlaying(true);
          audioEngine.play().then(() => {
            // Play succeeded - onPlay callback will handle setIsPlaying(true)
            logSong('AUTO PLAY SUCCEEDED');
          }).catch((err) => {
            if (err instanceof DOMException && err.name === 'AbortError') {
              return;
            }
            const errorMsg = 'Playback failed - click play to retry';
            console.error('[useAudioPlayer] Auto-play failed:', err, {
              trackId: actualCurrentTrack?.id,
              trackTitle: actualCurrentTrack?.title,
              error: err
            });
            logSong('AUTO PLAY FAILED', err);
            const now = Date.now();
            if ((now - lastSyncTime.current) > 500) {
              lastSyncTime.current = now;
              setIsPlaying(false);
            }
            // Only show error if track is stable (not switching)
            // During track switching, errors are expected and will recover
            const isTrackSwitching = lastLoadedTrackId.current !== actualCurrentTrack?.id;
            if (!isTrackSwitching) {
              setError(errorMsg);
            }
          });
        } else if (shouldAutoPlay.current) {
          // User wants to play - restore position and play even after page reload
          logSong('AUTO PLAY from canPlay (user requested)');
          shouldAutoPlay.current = false;

          // Restore position from persisted state before playing
          const storeState = usePlayerStore.getState();
          if (storeState.currentTime > 0 && audioDuration > 0) {
            const currentAudioTime = audioEngine.getCurrentTime();
            // Only restore if position is significantly different (more than 1 second)
            if (Math.abs(currentAudioTime - storeState.currentTime) > 1) {
              logSong('RESTORING POSITION before auto-play', {
                savedPosition: storeState.currentTime,
                currentTime: currentAudioTime,
                audioDuration
              });
              audioEngine.seek(storeState.currentTime);
              setCurrentTime(storeState.currentTime);
              // Small delay to ensure seek completes before playing
              setTimeout(() => {
                setIsPlaying(true);
                audioEngine.play().then(() => {
                  logSong('AUTO PLAY SUCCEEDED after position restore');
                }).catch((err) => {
                  if (err instanceof DOMException && err.name === 'AbortError') {
                    return;
                  }
                  const errorMsg = 'Playback failed - click play to retry';
                  console.error('[useAudioPlayer] Auto-play failed after position restore (user requested):', err, {
                    trackId: actualCurrentTrack?.id,
                    trackTitle: actualCurrentTrack?.title,
                    error: err
                  });
                  logSong('AUTO PLAY FAILED after position restore', err);
                  setIsPlaying(false);
                  // Only show error if track is stable (not switching)
                  const isTrackSwitching = lastLoadedTrackId.current !== actualCurrentTrack?.id;
                  if (!isTrackSwitching) {
                    setError(errorMsg);
                  }
                });
              }, 100);
              return;
            }
          }

          // No position to restore or already at correct position - play immediately
          setIsPlaying(true);
          audioEngine.play().then(() => {
            logSong('AUTO PLAY SUCCEEDED');
          }).catch((err) => {
            if (err instanceof DOMException && err.name === 'AbortError') {
              return;
            }
            const errorMsg = 'Playback failed - click play to retry';
            console.error('[useAudioPlayer] Auto-play failed (user requested, no position restore):', err, {
              trackId: actualCurrentTrack?.id,
              trackTitle: actualCurrentTrack?.title,
              error: err
            });
            logSong('AUTO PLAY FAILED', err);
            setIsPlaying(false);
            // Only show error if track is stable (not switching)
            const isTrackSwitching = lastLoadedTrackId.current !== actualCurrentTrack?.id;
            if (!isTrackSwitching) {
              setError(errorMsg);
            }
          });
        }
      },
      onError: (error) => {
        // Ignore abort errors - they're expected when cancelling loads
        // Check for various abort error messages
        const isAbortError =
          error === 'Playback aborted' ||
          error === 'Aborted' ||
          error?.toLowerCase().includes('aborted') ||
          error?.toLowerCase().includes('abort');

        if (isAbortError) {
          logSong('ERROR IGNORED - abort error (expected)', {
            error,
            trackId: currentTrack?.id
          });
          return;
        }

        // Also ignore "Load failed" errors - they're usually from aborted fetches
        if (error === 'Load failed') {
          return; // Silently ignore - likely from abort
        }

        console.error('[useAudioPlayer] AUDIO ERROR:', error, {
          trackId: currentTrack?.id,
          trackTitle: currentTrack?.title,
          streamUrl: currentTrack?.streamUrl?.substring(0, 50),
          currentTime: audioEngine.getCurrentTime(),
          duration: audioEngine.getDuration(),
          isPlaying: audioEngine.isPlaying(),
          currentSrc: audioEngine.getCurrentSrc()?.substring(0, 50)
        });
        const errorMsg = error;
        console.error('[useAudioPlayer] ERROR CALLBACK', {
          error: errorMsg,
          trackId: currentTrack?.id,
          trackTitle: currentTrack?.title,
          streamUrl: currentTrack?.streamUrl?.substring(0, 50),
          currentTime: audioEngine.getCurrentTime(),
          duration: audioEngine.getDuration(),
          isPlaying: audioEngine.isPlaying(),
          currentSrc: audioEngine.getCurrentSrc()?.substring(0, 50)
        });
        logSong('ERROR CALLBACK', {
          error: errorMsg,
          trackId: currentTrack?.id,
          trackTitle: currentTrack?.title
        });
        setError(errorMsg);
        setIsPlaying(false);
        setIsBuffering(false);
        shouldAutoPlay.current = false;
      },
      onCrossfadeStart: () => {
        const currentRepeat = repeatRef.current;
        const { queue, currentIndex } = queueRef.current;

        // Loop single track: crossfade to the same track
        if (currentRepeat === 'track') {
          const currentTrack = queue[currentIndex];
          if (currentTrack?.streamUrl) {
            isCrossfading.current = true;

            // CRITICAL: Ensure currentTrack in store matches what's playing
            const playerStore = usePlayerStore.getState();
            if (playerStore.currentTrack?.id !== currentTrack.id) {
              logSong('REPEAT TRACK - updating currentTrack to match', {
                storeTrackId: playerStore.currentTrack?.id,
                actualTrackId: currentTrack.id
              });
              setCurrentTrack(currentTrack, false); // Don't reset time during crossfade
            }

            audioEngine.crossfadeTo(currentTrack.streamUrl).then(() => {
              isCrossfading.current = false;
              // Reset time display but don't change queue
              setCurrentTime(0);
            }).catch((err) => {
              console.error('[useAudioPlayer] Loop crossfade failed:', err);
              isCrossfading.current = false;
              // Fallback: just seek to start
              audioEngine.seek(0);
            });
          }
          return;
        }

        // Get next track URL and start crossfade
        const nextTrack = queue[currentIndex + 1];

        if (nextTrack?.streamUrl) {
          // CRITICAL: Update current track IMMEDIATELY when crossfade starts
          // This ensures UI shows correct track even during crossfade
          const playerStore = usePlayerStore.getState();
          if (playerStore.currentTrack?.id !== nextTrack.id) {
            logSong('CROSSFADE START - updating currentTrack to next track', {
              storeTrackId: playerStore.currentTrack?.id,
              nextTrackId: nextTrack.id,
              storeTitle: playerStore.currentTrack?.title,
              nextTitle: nextTrack.title,
            });
            setCurrentTrack(nextTrack, false); // Don't reset time during crossfade
          }

          // Freeze duration updates during crossfade
          isCrossfading.current = true;

          // Start crossfade to next track
          audioEngine.crossfadeTo(nextTrack.streamUrl).then(() => {
            // Crossfade complete - now update to new track
            isCrossfading.current = false;
            // After crossfade completes, advance queue state without reloading
            advanceToNext();
          }).catch((err) => {
            console.error('[useAudioPlayer] Crossfade failed:', err);
            isCrossfading.current = false;
            // Fallback to regular skip
            playNext();
          });
        }
      },
    });

    // Don't destroy on cleanup - audio engine is a singleton that persists for the lifetime of the app
  }, [hasNext, playNext, advanceToNext, playTrackAt, setIsPlaying, setCurrentTime, setDuration, setIsBuffering, setError, clearError, volume, isMuted]);

  // Track the last track ID we tried to load
  const lastLoadedTrackId = useRef<number | null>(null);
  // Track failed load attempts to prevent infinite loops
  const failedLoadAttempts = useRef<Map<number, number>>(new Map());
  // Track if we're currently refreshing a stream URL
  const isRefreshingStreamUrl = useRef(false);
  // Track if we're currently seeking (to prevent race conditions)
  const isSeeking = useRef(false);
  // Track the expected track ID for duration/time updates (to prevent stale data)
  const expectedTrackIdForUpdates = useRef<number | null>(null);
  // Force reload counter - incrementing this will trigger the load effect to re-run
  const [forceReloadCounter, setForceReloadCounter] = useState(0);

  // Get cache update function
  const updateCachedAlbum = useAlbumStore((state) => state.updateCachedAlbum);

  // Load when current track changes or force reload is triggered
  useEffect(() => {
    // Must have a valid stream URL (starts with http)
    if (!currentTrack?.streamUrl || !currentTrack.streamUrl.startsWith('http')) {
      logSong('SKIP LOAD - no valid stream URL', currentTrack?.id);
      return;
    }

    logSong('TRACK CHANGED', {
      trackId: currentTrack.id,
      title: currentTrack.title,
      streamUrl: currentTrack.streamUrl.substring(0, 50),
      isPlaying,
      lastLoadedId: lastLoadedTrackId.current
    });

    // CRITICAL: Check if we're already loading/playing this exact track
    // This prevents duplicate loads when the effect runs multiple times
    // NOTE: Blob URLs are valid - they're created from stream URLs, so we accept them
    const currentSrc = audioEngine.getCurrentSrc();
    const isActuallyPlaying = audioEngine.isPlaying();
    const isBlobUrl = currentSrc?.startsWith('blob:');

    // If lastLoadedTrackId is null, we MUST load (track was cleared to force reload)
    const needsLoad = lastLoadedTrackId.current === null;

    // Only consider it "already loaded" if lastLoadedTrackId matches AND we don't need to force reload
    const isAlreadyThisTrack = !needsLoad && lastLoadedTrackId.current === currentTrack.id &&
      (currentSrc === currentTrack.streamUrl || (isBlobUrl && currentSrc)); // Accept blob URLs as valid

    // If we need to load (lastLoadedTrackId is null), skip the "already loaded" check
    if (!needsLoad && isAlreadyThisTrack) {
      // Check if track is actually loaded and ready
      const audio = audioEngine.getState();
      if (audio.src && audio.duration > 0) {
        // Track is loaded and ready
        if (shouldAutoPlay.current && !isActuallyPlaying) {
          logSong('RESUMING - track already loaded, auto-playing', { trackId: currentTrack.id });
          setIsPlaying(true); // Update store first
          audioEngine.play().then(() => {
            setIsPlaying(true); // Ensure sync after play
          }).catch((err) => {
            if (err instanceof DOMException && err.name === 'AbortError') {
              return;
            }
            console.error('[useAudioPlayer] Failed to resume:', err);
            setIsPlaying(false);
          });
        } else if (isActuallyPlaying && !isPlaying) {
          // Audio is playing but store says paused - sync store
          logSong('SYNCING - audio playing but store says paused', { trackId: currentTrack.id });
          setIsPlaying(true);
        } else if (!isActuallyPlaying && isPlaying) {
          // Store says playing but audio is paused - try to play if audio is ready
          logSong('STORE SAYS PLAYING BUT AUDIO PAUSED - attempting to play', {
            trackId: currentTrack.id,
            duration: audio.duration
          });
          // CRITICAL: If audio has duration, it's ready - play immediately
          if (audio.duration > 0) {
            audioEngine.play().then(() => {
              setIsPlaying(true);
              logSong('RESUMED SUCCESSFULLY from load check', { trackId: currentTrack.id });
            }).catch((err) => {
              if (err instanceof DOMException && err.name === 'AbortError') {
                return;
              }
              console.error('[useAudioPlayer] Failed to play from load check:', err);
              setIsPlaying(false);
            });
          } else {
            // Audio not ready yet - set autoplay flag
            logSong('AUDIO NOT READY - setting autoplay flag', { trackId: currentTrack.id });
            shouldAutoPlay.current = true;
          }
          // Don't return here - let the play/pause effect also handle it as backup
        }
        logSong('SKIP LOAD - already loaded this track', {
          trackId: currentTrack.id,
          currentSrc: currentSrc?.substring(0, 50),
          isActuallyPlaying,
          isPlaying,
          shouldAutoPlay: shouldAutoPlay.current
        });
        // CRITICAL: If store says playing but we're not actually playing, don't return
        // Let the play/pause effect handle it to ensure play() is called
        if (isPlaying && !isActuallyPlaying && audio.duration > 0) {
          logSong('TRACK LOADED BUT NOT PLAYING - letting play/pause effect handle it', {
            trackId: currentTrack.id
          });
          // Don't return - let play/pause effect trigger play
        } else {
          return;
        }
      }
      // Track IDs match but audio isn't actually loaded (e.g., after hot reload)
      // However, if we have a blob URL, the audio might be loaded but just needs position restore
      if (isBlobUrl && audio.src) {
        if (audio.duration === 0) {
          // Blob URL exists but duration is 0 - audio is still loading, wait for it
          logSong('TRACK HAS BLOB URL BUT NOT READY - waiting for load', {
            trackId: currentTrack.id,
            hasSrc: !!audio.src
          });
          // Set autoplay if needed
          if (shouldAutoPlay.current) {
            logSong('AUTO-PLAY pending - blob URL exists, waiting for canPlay');
          }
          return;
        } else if (audio.duration > 0) {
          // Blob URL exists and audio is loaded
          logSong('TRACK HAS BLOB URL AND IS LOADED', {
            trackId: currentTrack.id,
            duration: audio.duration,
            currentTime: audio.currentTime
          });

          // Resume if needed
          if (shouldAutoPlay.current && !isActuallyPlaying) {
            logSong('RESUMING from blob URL check', { trackId: currentTrack.id });
            setIsPlaying(true);
            audioEngine.play().then(() => {
              setIsPlaying(true);
            }).catch((err) => {
              if (err instanceof DOMException && err.name === 'AbortError') {
                return;
              }
              console.error('[useAudioPlayer] Failed to resume from blob URL:', err);
              setIsPlaying(false);
            });
          } else if (isActuallyPlaying && !isPlaying) {
            // Audio is playing but store says paused - sync store
            logSong('SYNCING - audio playing but store says paused (blob URL)', { trackId: currentTrack.id });
            setIsPlaying(true);
          }

          return;
        }
      }

      // Force reload by clearing the last loaded ID
      logSong('TRACK ID MATCHES BUT AUDIO NOT LOADED - forcing reload', {
        trackId: currentTrack.id,
        hasSrc: !!audio.src,
        duration: audio.duration,
        isBlobUrl
      });
      lastLoadedTrackId.current = null;
      // Fall through to load the track
    }

    // CRITICAL: Check if audio is already playing this source (after crossfade)
    // If so, skip load to avoid pausing the audio
    // BUT: Don't skip if we need to force reload (lastLoadedTrackId is null) or if we just stopped (loop all scenario)
    if (!needsLoad && currentSrc === currentTrack.streamUrl && isActuallyPlaying && !shouldAutoPlay.current) {
      logSong('SKIP LOAD - already playing this source (crossfade completed)', {
        trackId: currentTrack.id,
        currentSrc: currentSrc?.substring(0, 50),
        isActuallyPlaying
      });
      // Update the last loaded ID so we don't try to load again
      lastLoadedTrackId.current = currentTrack.id;
      // Ensure playing state is correct
      if (isPlaying && !isActuallyPlaying) {
        console.warn('[useAudioPlayer] State mismatch - store says playing but audio is not, resuming');
        audioEngine.play().catch((err) => {
          console.error('[useAudioPlayer] Failed to resume after state mismatch:', err);
        });
      }
      return;
    }

    // On page reload, ALWAYS start paused - never auto-play
    // CRITICAL: Capture user's intent to play BEFORE we change any state
    // This must happen before setIsPlaying(false) is called
    // BUT: On initial load (page reload), always set to false to prevent auto-play
    // UNLESS: shouldAutoPlay was explicitly set (user wants to play)
    const isInitialMount = lastLoadedTrackId.current === null;
    // If shouldAutoPlay is already true, respect it even on "initial mount" (forced reload)
    // This handles the case where user clicks play but audio isn't ready - we force reload
    const intendedPlay = isInitialMount && !shouldAutoPlay.current ? false : (isPlaying || shouldAutoPlay.current);

    // Prevent infinite loops - max 2 attempts per track (original + 1 refresh)
    const attempts = failedLoadAttempts.current.get(currentTrack.id) || 0;
    if (attempts >= 2) {
      const errorMsg = 'Stream unavailable - try refreshing the page';
      logSong('MAX LOAD ATTEMPTS REACHED', currentTrack.id);
      console.error('[useAudioPlayer] Max load attempts reached for track:', currentTrack.id, {
        trackId: currentTrack.id,
        trackTitle: currentTrack.title
      });
      setError(errorMsg);
      setIsPlaying(false);
      return;
    }

    // Check if this is a NEW track (user changed it) or same track
    const isNewTrack = lastLoadedTrackId.current !== null && lastLoadedTrackId.current !== currentTrack.id;

    logSong('TRACK LOAD DECISION', { isNewTrack, lastLoadedId: lastLoadedTrackId.current, currentId: currentTrack.id, intendedPlay });

    // Reset failed attempts when switching to a new track
    if (isNewTrack) {
      failedLoadAttempts.current.delete(lastLoadedTrackId.current || 0);
      // Reset seeking state when switching tracks
      isSeeking.current = false;
      // CRITICAL: Reset time and duration to 0 when track changes
      setCurrentTime(0);
      setDuration(0);
      // Also reset in audio engine to ensure it's at 0
      audioEngine.seek(0);
      // CRITICAL: Update previousIsPlaying to current state to prevent false pause detection
      // When switching tracks, any isPlaying changes are NOT user actions
      previousIsPlaying.current = isPlaying;
    }

    // On page reload (initial mount), ALWAYS keep paused - no auto-play
    // UNLESS: shouldAutoPlay was explicitly set (user wants to play after forcing reload)
    // Check this BEFORE setting lastLoadedTrackId
    if (isInitialMount) {
      // Only reset shouldAutoPlay if it wasn't explicitly set by user action
      // If shouldAutoPlay is true, it means user clicked play and we're forcing a reload
      if (!shouldAutoPlay.current) {
        shouldAutoPlay.current = false;
        setIsPlaying(false); // Force paused on page reload
      }
      // Don't clear error if we're forcing a reload (user wants to play)
      if (!shouldAutoPlay.current) {
        clearError(); // Clear any errors on page reload
      }
    } else {
      // Set shouldAutoPlay based on intended play state (only for track changes after mount)
      if (isNewTrack) {
        shouldAutoPlay.current = intendedPlay;
      } else {
        shouldAutoPlay.current = shouldAutoPlay.current || intendedPlay;
      }
    }

    lastLoadedTrackId.current = currentTrack.id;
    // Set expected track ID for duration/time updates
    expectedTrackIdForUpdates.current = currentTrack.id;

    logSong('SET shouldAutoPlay', { intendedPlay, wasPlaying: isPlaying, shouldAutoPlay: shouldAutoPlay.current });

    // Async load with stream URL refresh on 410
    const loadTrack = async () => {
      // Show loading state while switching tracks
      if (isNewTrack) {
        logSong('NEW TRACK - setting buffering state');
        setIsBuffering(true);
        // CRITICAL: Don't set isPlaying(false) here - it triggers false user pause detection
        // Instead, let the play/pause effect handle it based on shouldAutoPlay
        // Only set to false if we're not supposed to auto-play
        if (!shouldAutoPlay.current) {
        setIsPlaying(false); // show as loading, not playing
        }
        // CRITICAL: Reset time and duration to 0 when starting to load new track
        setCurrentTime(0);
        setDuration(0);
        // Also ensure audio engine is at position 0
        audioEngine.seek(0);
      }

      logSong('LOADING TRACK', { trackId: currentTrack.id, force: isNewTrack });
      const result = await audioEngine.load(currentTrack.streamUrl!, isNewTrack);

      // Load succeeded - onCanPlay will handle auto-play if shouldAutoPlay is true

      if (!result.success) {
        logSong('LOAD FAILED', { error: result.error, expired: result.expired, trackId: currentTrack.id });

        // Ignore abort errors - they're expected when cancelling loads
        if (result.error === 'Aborted' || result.error?.includes('aborted')) {
          return; // Don't show error or retry - just return silently
        }

        // Handle expired stream URL (410 Gone)
        if (result.expired && currentTrack.albumUrl && !isRefreshingStreamUrl.current) {
          logSong('STREAM URL EXPIRED - refreshing');
          console.log('[useAudioPlayer] Stream URL expired, refreshing...');
          isRefreshingStreamUrl.current = true;
          setIsBuffering(true);
          setIsPlaying(false); // show loading
          shouldAutoPlay.current = true; // ensure we auto-play after refresh

          try {
            const freshUrl = await refreshStreamUrl(
              { id: currentTrack.id, albumUrl: currentTrack.albumUrl },
              updateCachedAlbum
            );

            if (freshUrl) {
              logSong('STREAM URL REFRESHED', { trackId: currentTrack.id });
              // Update the track in the queue with fresh URL
              const queueState = useQueueStore.getState();
              const updatedQueue = queueState.queue.map(t =>
                t.id === currentTrack.id ? { ...t, streamUrl: freshUrl } : t
              );
              useQueueStore.setState({ queue: updatedQueue });

              // Update current track in player store
              usePlayerStore.setState({
                currentTrack: { ...currentTrack, streamUrl: freshUrl }
              });

              // Track the refresh attempt
              failedLoadAttempts.current.set(currentTrack.id, attempts + 1);
              shouldAutoPlay.current = true; // play after refreshed load

              console.log('[useAudioPlayer] Retrying with fresh stream URL');
              // The state update will trigger this effect again with the fresh URL
            } else {
              const errorMsg = 'Could not refresh stream URL';
              logSong('STREAM URL REFRESH FAILED');
              console.error('[useAudioPlayer]', errorMsg, {
                trackId: currentTrack.id,
                trackTitle: currentTrack.title
              });
              failedLoadAttempts.current.set(currentTrack.id, 2); // Max out attempts
              setError(errorMsg);
              setIsPlaying(false);
              setIsBuffering(false);
            }
          } catch (err) {
            logSong('STREAM URL REFRESH ERROR', err);
            console.error('[useAudioPlayer] Failed to refresh stream URL:', err);
            failedLoadAttempts.current.set(currentTrack.id, 2);
            setError('Failed to refresh stream');
            setIsPlaying(false);
            setIsBuffering(false);
          } finally {
            isRefreshingStreamUrl.current = false;
          }
        } else if (!result.expired && result.error !== 'Aborted' && !result.error?.includes('aborted') && result.error !== 'Load failed') {
          // Other non-recoverable error (but not abort or generic "Load failed")
          const errorMsg = result.error || 'Failed to load audio';
          logSong('LOAD ERROR - non-recoverable', result.error);
          console.error('[useAudioPlayer]', errorMsg, {
            trackId: currentTrack.id,
            trackTitle: currentTrack.title,
            error: result.error
          });
          failedLoadAttempts.current.set(currentTrack.id, 2);
          setError(errorMsg);
          setIsPlaying(false);
        } else {
          // Abort or "Load failed" error - just clear buffering, don't show error
          setIsBuffering(false);
        }
      } else {
        logSong('LOAD SUCCESS', { trackId: currentTrack.id });
      }
    };

    loadTrack();

    // Add to history
    if (currentTrack.id !== lastHistoryTrackId.current) {
      lastHistoryTrackId.current = currentTrack.id;
      addToHistory({
        type: 'track',
        itemId: currentTrack.id,
        title: currentTrack.title,
        artist: currentTrack.artist || currentTrack.bandName,
        artId: currentTrack.artId,
        albumUrl: currentTrack.albumUrl,
        bandUrl: currentTrack.bandUrl,
      });

      // Stop previous track scrobbling before starting new track
      // Send queued scrobbles immediately since we're skipping to a new track
      scrobblingService.stopTrack(true);
      // New track will start scrobbling when playback begins (in onPlay callback)
    }
  }, [currentTrack?.id, currentTrack?.streamUrl, updateCachedAlbum, setError, setIsPlaying, setIsBuffering, addToHistory, forceReloadCounter]);

  // Stop scrobbling when currentTrack becomes null OR when music stops playing
  // BUT: Don't stop during track loading (isBuffering) to avoid interfering with playback
  useEffect(() => {
    // Only stop scrobbling if we truly have no track OR music is stopped AND not buffering
    // This prevents stopping scrobbling during track switches when isPlaying is temporarily false
    if (!currentTrack || (!isPlaying && !isBuffering)) {
      scrobblingService.stopTrack();
    }
  }, [currentTrack, isPlaying, isBuffering]);

  // Preload next track for gapless/crossfade playback
  useEffect(() => {
    if (!audioSettings.gaplessPlayback && !audioSettings.crossfadeEnabled) return;

    const nextTrack = queue[currentIndex + 1];
    const nextStreamUrl = nextTrack?.streamUrl;
    if (nextStreamUrl && nextStreamUrl.startsWith('http')) {
      // Preload after a short delay to not interfere with current load
      const timeout = setTimeout(() => {
        audioEngine.preloadNext(nextStreamUrl);
      }, 2000);

      return () => clearTimeout(timeout);
    }
  }, [currentIndex, queue, audioSettings.gaplessPlayback, audioSettings.crossfadeEnabled]);

  // Handle play/pause state changes
  useEffect(() => {
    // Skip if we're refreshing a stream URL
    if (isRefreshingStreamUrl.current) {
      logSong('SKIP PLAY/PAUSE - refreshing stream URL');
      previousIsPlaying.current = isPlaying;
      return;
    }

    // CRITICAL: Detect user pause action (store changed from playing to paused)
    // This happens when user clicks pause button
    // BUT: Exclude track switching - when switching tracks, isPlaying might change but it's not a user action
    // AND: Exclude when buffering (track is loading) - state changes during loading are expected
    const wasPlaying = previousIsPlaying.current;
    const isTrackSwitching = lastLoadedTrackId.current !== currentTrack?.id;
    const isUserPauseAction = wasPlaying === true && isPlaying === false && !isTrackSwitching && !isBuffering;
    const isUserPlayAction = wasPlaying === false && isPlaying === true;

    if (isUserPauseAction) {
      // User just paused - mark it to prevent immediate re-sync
      const now = Date.now();
      lastUserPauseTime.current = now;
      logSong('USER PAUSE ACTION DETECTED - preventing sync', {
        wasPlaying,
        isPlaying
      });
    } else if (isUserPlayAction) {
      // User just played - clear pause time so sync can work normally
      lastUserPauseTime.current = 0;
      logSong('USER PLAY ACTION DETECTED', {
        wasPlaying,
        isPlaying
      });
    }

    // Update previous state for next run
    previousIsPlaying.current = isPlaying;

    // CRITICAL: Check actual audio state
    const actualIsPlaying = audioEngine.isPlaying();
    const audioState = audioEngine.getState();

    // CRITICAL: If store says playing but audio isn't actually playing and audio isn't loaded,
    // set store to paused to prevent showing "playing" when nothing is playing
    // BUT: Don't fix state if we're buffering (track is loading) - that's expected
    // AND: Don't fix state if we're switching tracks (isTrackSwitching already calculated above)
    if (isPlaying && !actualIsPlaying && (!audioState.src || isNaN(audioState.duration) || audioState.duration === 0)) {
      // Audio isn't loaded/ready - don't show as playing
      // BUT: Only fix if we're not buffering (track loading) and not switching tracks
      if (!isUserPauseAction && !isUserPlayAction && !isBuffering && !isTrackSwitching) {
        logSong('FIXING STATE - store says playing but audio not loaded, setting to paused', {
          src: audioState.src,
          duration: audioState.duration,
          isBuffering,
          isTrackSwitching
        });
        setIsPlaying(false);
        return; // Exit early - let the effect run again with correct state
      }
    }

    // Only sync state if there's a mismatch AND we haven't synced recently (prevent loops)
    // Only sync if audio is actually loaded and ready
    // CRITICAL: Don't sync if user just paused (within last 5 seconds) - pause() is async and we need longer cooldown
    const now = Date.now();
    const timeSinceUserPause = now - lastUserPauseTime.current;
    const shouldAllowSync = timeSinceUserPause > 5000 || lastUserPauseTime.current === 0; // Wait 5 seconds after user pause

    // CRITICAL: If user just paused, don't sync at all - respect user action
    if (isUserPauseAction) {
      logSong('USER PAUSED - skipping all sync checks to respect user action');
      // Don't sync, just proceed to pause logic below
    } else if (isPlaying !== actualIsPlaying && audioState.src && audioState.duration > 0 && !isNaN(audioState.duration) && (now - lastSyncTime.current) > 500 && shouldAllowSync) {
      if (!isPlaying && actualIsPlaying) {
        // Store says paused but audio is playing - sync store to match (audio event happened)
        // BUT: CRITICAL - Never sync from paused->playing if user recently paused
        // Even if more than 2 seconds ago, if store says paused, respect it (user might have paused)
        // Only sync if we're confident this is an audio event (like autoplay), not a user pause
        // Check: if lastUserPauseTime is set and store says paused, don't sync to playing
        if (lastUserPauseTime.current > 0 && !isPlaying) {
          logSong('SKIP SYNC TO PLAYING - user paused recently, respecting pause state', {
            timeSinceUserPause: `${timeSinceUserPause}ms`
          });
          // Actually, if user paused and audio is still playing, force pause the audio
          if (actualIsPlaying) {
            logSong('FORCING PAUSE - store says paused but audio is playing, pausing audio');
            audioEngine.pause();
          }
          return;
        }
        logSong('SYNCING - audio is playing but store says paused, updating store', {
          timeSinceUserPause: `${timeSinceUserPause}ms`,
          isUserPauseAction
        });
        lastSyncTime.current = now;
        setIsPlaying(true);
        return; // Let the effect run again with correct state
      }
      // If store says playing but audio is paused, don't auto-sync
      // This could be intentional (user paused) or audio stopped - let play logic handle it
    } else if (!shouldAllowSync && !isPlaying && actualIsPlaying && !isUserPauseAction) {
      logSong('SKIP SYNC - user just paused, waiting for pause to complete', {
        timeSinceUserPause: `${timeSinceUserPause}ms`
      });
    }

    // Skip if autoplay will handle it (onCanPlay callback will handle play)
    // BUT: Don't skip if we need to pause (autoplay only handles play)
    // CRITICAL: Don't skip if audio is already loaded and ready - play immediately
    const hasBlobUrl = audioState.src?.startsWith('blob:');
    // Audio is ready if it has src and valid duration (not NaN, not 0)
    const isAudioReady = audioState.src && audioState.duration > 0 && !isNaN(audioState.duration);

    // CRITICAL: If user wants to play but audio isn't ready, force a load
    // Don't just skip - actually trigger the load
    if (shouldAutoPlay.current && isPlaying && !isAudioReady) {
      // If we have a track but audio isn't loaded, force a load
      if (currentTrack?.streamUrl && currentTrack.streamUrl.startsWith('http')) {
        logSong('FORCE LOAD - user wants to play but audio not ready', {
          trackId: currentTrack.id,
          src: audioState.src,
          duration: audioState.duration,
          lastLoadedId: lastLoadedTrackId.current
        });
        // Force load by clearing lastLoadedTrackId
        lastLoadedTrackId.current = null;
        shouldAutoPlay.current = true;
        // The load effect will detect lastLoadedTrackId is null and load the track
        return;
      } else {
        // No track to load - can't play
        logSong('SKIP PLAY - autoplay will handle (audio not ready yet, no track)', {
          src: audioState.src?.substring(0, 50),
          duration: audioState.duration
        });
        setIsPlaying(false); // Don't show as playing if we can't actually play
        return;
      }
    }
    // If audio is ready, don't wait for autoplay - play immediately
    if (shouldAutoPlay.current && isPlaying && isAudioReady) {
      logSong('AUDIO READY - clearing autoplay flag and playing immediately', {
        duration: audioState.duration
      });
      shouldAutoPlay.current = false;
      // Fall through to play logic below
    }

    // CRITICAL: Don't pause during buffering (track loading)
    // This prevents pausing when switching tracks
    if (!isPlaying && isBuffering) {
      logSong('SKIP PAUSE - buffering (track loading)');
      return;
    }

    // Normal play/pause handling
    if (isPlaying && currentTrack?.streamUrl && currentTrack.streamUrl.startsWith('http')) {
      // CRITICAL: Verify the track matches what's actually loaded before playing
      const currentSrc = audioEngine.getCurrentSrc();
      const expectedSrc = currentTrack.streamUrl;
      const isBlobUrl = currentSrc?.startsWith('blob:');

      // If audio is loaded but doesn't match current track, we need to reload
      if (currentSrc && currentSrc !== expectedSrc && !isBlobUrl) {
        logSong('PLAY BLOCKED - track mismatch, forcing reload', {
          expectedTrackId: currentTrack.id,
          expectedSrc: expectedSrc.substring(0, 50),
          currentSrc: currentSrc.substring(0, 50),
          lastLoadedId: lastLoadedTrackId.current
        });
        // Force reload by clearing lastLoadedTrackId
        lastLoadedTrackId.current = null;
        shouldAutoPlay.current = true;
        // Pause current audio to stop wrong track
      if (actualIsPlaying) {
          audioEngine.pause();
        }
        // The load effect will detect lastLoadedTrackId is null and load the correct track
        // Return here - the load effect will handle loading and then onCanPlay will handle play
        return;
      }

      // If audio is already playing, ensure store is in sync and return
      if (actualIsPlaying) {
        // Double-check the track matches
        if (currentSrc && currentSrc !== expectedSrc && !isBlobUrl) {
          logSong('PLAY BLOCKED - playing wrong track, stopping', {
            expectedTrackId: currentTrack.id,
            expectedSrc: expectedSrc.substring(0, 50),
            currentSrc: currentSrc.substring(0, 50)
          });
          audioEngine.pause();
          lastLoadedTrackId.current = null;
          shouldAutoPlay.current = true;
          return;
        }
        logSong('SKIP PLAY - already playing');
        return;
      }

      // Check if audio is ready - must have valid duration (not NaN, not 0)
      const hasBlobUrl = audioState.src?.startsWith('blob:');
      // Audio is ready only if it has a valid duration (not NaN, not 0)
      // Don't use persisted duration as fallback - wait for actual audio duration
      const isAudioReady = audioState.src && audioState.duration > 0 && !isNaN(audioState.duration);

      if (!isAudioReady) {
        // Audio not ready - need to load it first
        if (currentTrack?.streamUrl && currentTrack.streamUrl.startsWith('http')) {
          logSong('PLAY REQUESTED - audio not ready, forcing load', {
            trackId: currentTrack.id,
            lastLoadedId: lastLoadedTrackId.current,
            src: audioState.src,
            duration: audioState.duration,
            isPlaying
          });
          // CRITICAL: Set shouldAutoPlay BEFORE clearing lastLoadedTrackId
          // This ensures the load effect knows user wants to play
        shouldAutoPlay.current = true;
          // Force load by clearing lastLoadedTrackId and triggering reload
          lastLoadedTrackId.current = null;
          setForceReloadCounter(prev => prev + 1); // Trigger load effect to re-run
          // The load effect will detect lastLoadedTrackId is null and load the track
          // It will see shouldAutoPlay.current = true and set intendedPlay correctly
          // Then onCanPlay will handle play when audio is ready
          return;
        } else {
          logSong('SKIP PLAY - no track to load');
          setIsPlaying(false); // Don't show as playing if we can't actually play
        return;
      }
      }

      // Audio is ready (has src and duration) - restore position if needed and play
      if (audioState.duration === 0 && duration > 0) {
        // Audio engine duration not ready yet, but we have persisted duration
        // Wait a bit for audio to be fully ready, but set autoplay
        logSong('PLAY REQUESTED - audio loading but have persisted duration, waiting briefly', {
          trackId: currentTrack.id,
          persistedDuration: duration
        });
        shouldAutoPlay.current = true;
        return;
      }

      // CRITICAL: Audio is loaded and ready - restore position if needed, then play
      const actualAudioDuration = audioEngine.getDuration();
      const storeState = usePlayerStore.getState();

      // If audio doesn't have duration yet, wait for onCanPlay to handle it
      // Don't try to play with NaN duration - it causes issues
      if (actualAudioDuration === 0 || isNaN(actualAudioDuration)) {
        // Wait for audio to be fully ready - onCanPlay will handle play
        logSong('PLAY REQUESTED - audio loading (duration not ready), will restore position and play when ready', {
          trackId: currentTrack.id,
          persistedDuration: duration,
          persistedPosition: storeState.currentTime,
          actualAudioDuration
        });
        shouldAutoPlay.current = true;
        return;
      }

      // Audio has duration - restore position if needed, then play
      if (storeState.currentTime > 0 && actualAudioDuration > 0) {
        const currentAudioTime = audioEngine.getCurrentTime();
        // Only restore if position is significantly different (more than 1 second)
        if (Math.abs(currentAudioTime - storeState.currentTime) > 1) {
          logSong('RESTORING POSITION before play', {
            savedPosition: storeState.currentTime,
            currentTime: currentAudioTime,
            audioDuration: actualAudioDuration
          });
          audioEngine.seek(storeState.currentTime);
          setCurrentTime(storeState.currentTime);
          // Small delay to ensure seek completes before playing
          setTimeout(() => {
            logSong('PLAYING after position restore', { trackId: currentTrack.id, duration: actualAudioDuration });
            audioEngine.play().then(() => {
              logSong('PLAY SUCCEEDED after position restore');
            }).catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
              logSong('PLAY FAILED after position restore', err);
              setIsPlaying(false);
            });
          }, 100);
          return;
        }
      }

      // No position to restore or already at correct position - play immediately
      logSong('PLAYING', { trackId: currentTrack.id, trackTitle: currentTrack.title, duration: actualAudioDuration });
      audioEngine.play().then(() => {
        // Play succeeded - verify it's actually playing
        setTimeout(() => {
          const actuallyPlaying = audioEngine.isPlaying();
          if (actuallyPlaying) {
            // Ensure store is in sync (onPlay callback should handle this, but double-check)
            if (!isPlaying) {
              const now = Date.now();
              if ((now - lastSyncTime.current) > 500) {
                lastSyncTime.current = now;
                setIsPlaying(true);
              }
            }
            logSong('PLAY VERIFIED - audio is actually playing');
          } else {
            // Wait a bit longer - audio might take time to start
            setTimeout(() => {
              const stillNotPlaying = !audioEngine.isPlaying();
              if (stillNotPlaying) {
                const errorMsg = 'Playback failed - audio did not start';
                console.error('[useAudioPlayer]', errorMsg, {
                  trackId: currentTrack.id,
                  trackTitle: currentTrack.title,
                  duration: actualAudioDuration,
                  currentSrc: audioEngine.getCurrentSrc()?.substring(0, 50)
                });
                logSong('PLAY WARNING - play() succeeded but audio is not playing after delay', {
                  trackId: currentTrack.id
                });
                const now = Date.now();
                if ((now - lastSyncTime.current) > 500) {
                  lastSyncTime.current = now;
                  setIsPlaying(false);
                }
                // Only show error if track is stable (not switching)
                // During track switching, this is expected and will recover
                const isTrackSwitching = lastLoadedTrackId.current !== currentTrack.id;
                if (!isTrackSwitching) {
                  setError(errorMsg);
                }
              } else {
                // Audio started after delay - clear any errors
                logSong('PLAY STARTED AFTER DELAY - clearing error');
                clearError();
              }
            }, 1000);
          }
        }, 500);
      }).catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        const errorMsg = 'Playback failed - click play to retry';
        console.error('[useAudioPlayer] Play failed:', err, {
          trackId: currentTrack.id,
          trackTitle: currentTrack.title,
          streamUrl: currentTrack.streamUrl?.substring(0, 50),
          error: err
        });
        // Play failed - sync UI state
        const now = Date.now();
        if ((now - lastSyncTime.current) > 500) {
          lastSyncTime.current = now;
        setIsPlaying(false);
        }
        // Only show error if track is stable (not switching)
        // During track switching, errors are expected and will recover
        const isTrackSwitching = lastLoadedTrackId.current !== currentTrack.id;
        if (!isTrackSwitching) {
          setError(errorMsg);
        }
      });
    } else if (!isPlaying) {
      // CRITICAL: If user just paused, force pause immediately and return
      // Don't let any sync logic interfere
      if (isUserPauseAction && actualIsPlaying) {
        logSong('USER PAUSED - forcing pause immediately', {
          trackId: currentTrack?.id,
          trackTitle: currentTrack?.title
        });
        // Mark pause time BEFORE pausing to prevent sync logic from overriding
        const now = Date.now();
        lastUserPauseTime.current = now;
        audioEngine.pause();
        // onPause callback will handle setIsPlaying(false)
        return; // Exit early - don't let sync logic run
      }

      // CRITICAL: Only pause if audio is actually playing
      // This prevents accidental pauses when store says paused but audio already paused
      if (actualIsPlaying) {
        logSong('PAUSING', {
          trackId: currentTrack?.id,
          trackTitle: currentTrack?.title,
          currentTime: audioState.currentTime,
          duration: audioState.duration,
          isUserPauseAction
        });
        // Mark that user just paused to prevent immediate re-sync (if not already marked)
        if (isUserPauseAction) {
          // Already marked above, but ensure it's recent
          lastUserPauseTime.current = Date.now();
        }
        audioEngine.pause();
        // onPause callback will handle setIsPlaying(false)
      } else {
        logSong('SKIP PAUSE - audio already paused');
        // Store should already be false, but ensure sync if needed
        if (isPlaying) {
          const now = Date.now();
          if ((now - lastSyncTime.current) > 500) {
            lastSyncTime.current = now;
            setIsPlaying(false);
          }
        }
      }
    }
  }, [isPlaying, isBuffering, currentTrack?.streamUrl, setIsPlaying, setError]);

  // Handle volume changes
  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume]);

  // Handle mute changes
  useEffect(() => {
    audioEngine.setMuted(isMuted);
  }, [isMuted]);

  // Get page title for fallback when no music is playing
  const pageTitle = useRouterStore((state) => state.pageTitle);

  // Media Session API - metadata + Document title
  useEffect(() => {
    // Use getDisplayTitle to compute cleaned title (artist prefix removed)
    const displayTitle = currentTrack ? getDisplayTitle(currentTrack) : null;
    const artist = currentTrack?.artist || currentTrack?.bandName || 'Unknown Artist';

    // Update document title for tab display and extensions like auto-stop
    if (currentTrack && displayTitle) {
      document.title = `${artist} - ${displayTitle} | CampBand`;
    } else if (pageTitle) {
      // Fall back to page title (artist name, album name, playlist name, etc.)
      document.title = `${pageTitle} | CampBand`;
    } else {
      document.title = 'CampBand';
    }

    // Media Session API
    if (!('mediaSession' in navigator)) return;

    if (currentTrack && displayTitle) {
      const artUrl = currentTrack.artId
        ? buildArtUrl(currentTrack.artId, ImageSizes.MEDIUM_700)
        : undefined;

      navigator.mediaSession.metadata = new MediaMetadata({
        title: displayTitle,
        artist,
        album: currentTrack.albumTitle || '',
        artwork: artUrl
          ? [{ src: artUrl, sizes: '700x700', type: 'image/jpeg' }]
          : [],
      });
    } else {
      navigator.mediaSession.metadata = null;
    }
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.artist, currentTrack?.bandName, currentTrack?.albumTitle, currentTrack?.artId, pageTitle]);

  // Media Session API - action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handlePreviousTrack = () => playPrevious();
    const handleNextTrack = () => {
      if (hasNext()) playNext();
    };
    const handleSeekTo = (details: MediaSessionActionDetails) => {
      if (details.seekTime !== undefined) {
        audioEngine.seek(details.seekTime);
        setCurrentTime(details.seekTime);
      }
    };

    navigator.mediaSession.setActionHandler('play', handlePlay);
    navigator.mediaSession.setActionHandler('pause', handlePause);
    navigator.mediaSession.setActionHandler('previoustrack', handlePreviousTrack);
    navigator.mediaSession.setActionHandler('nexttrack', handleNextTrack);
    navigator.mediaSession.setActionHandler('seekto', handleSeekTo);

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('seekto', null);
    };
  }, [setIsPlaying, playNext, playPrevious, hasNext, setCurrentTime]);

  // Media Session API - playback state
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  // Media Session API - position state
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    try {
      navigator.mediaSession.setPositionState({
        duration: duration || 0,
        playbackRate: 1,
        position: Math.min(currentTime, duration || 0),
      });
    } catch {
      // Ignore errors
    }
  }, [currentTime, duration, currentTrack?.id]);

  // Seek function
  const seek = useCallback((time: number) => {
    // Validate seek time
    const audioDuration = audioEngine.getDuration();
    const storeState = usePlayerStore.getState();
    const actualCurrentTrack = storeState.currentTrack;
    const isBuffering = storeState.isBuffering;
    // Use persisted duration from store as fallback if audio engine duration is not ready
    const currentDuration = (audioDuration > 0 && !isNaN(audioDuration)) ? audioDuration : storeState.duration;

    if (!actualCurrentTrack) {
      logSong('SEEK IGNORED - no current track');
      return;
    }

    // BLOCK seeking only if we have NO duration at all (neither from audio nor store)
    // If we have persisted duration, allow seeking even if audio isn't ready yet
    if (isBuffering || (!currentDuration || currentDuration === 0 || isNaN(currentDuration))) {
      logSong('SEEK BLOCKED - track still loading', { time, isBuffering, audioDuration, storeDuration: storeState.duration, currentDuration });
      // Don't store the position - just ignore the seek completely
      return;
    }

    // Clamp seek time to valid range
    const clampedTime = Math.max(0, Math.min(time, currentDuration || 0));

    logSong('SEEK', {
      time: clampedTime,
      duration: currentDuration,
      trackId: actualCurrentTrack.id
    });

    // Set seeking flag to prevent race conditions
    isSeeking.current = true;

    // Store if we were playing before seek (to resume if needed)
    const wasPlaying = audioEngine.isPlaying();
    const shouldPlayAfterSeek = wasPlaying || usePlayerStore.getState().isPlaying;

    // Perform seek
    audioEngine.seek(clampedTime);
    setCurrentTime(clampedTime);

    // If audio was playing and got paused by seek, resume it
    // This can happen when seeking on a loading track or during track changes
    if (shouldPlayAfterSeek) {
      // Small delay to let seek complete, then resume playback
      setTimeout(() => {
        const playerState = usePlayerStore.getState();
        if (playerState.isPlaying && !audioEngine.isPlaying()) {
          logSong('SEEK - resuming playback after seek');
          audioEngine.play().catch((err) => {
            if (err instanceof DOMException && err.name === 'AbortError') {
              return;
            }
            console.error('[useAudioPlayer] Resume after seek failed:', err);
          });
        }
      }, 50);
    }

    // Clear seeking flag after a short delay (allows seek to complete)
    setTimeout(() => {
      isSeeking.current = false;
    }, 100);
  }, [setCurrentTime]);

  // Seek by percentage
  const seekPercent = useCallback((percent: number) => {
    audioEngine.seekPercent(percent);
  }, []);

  return {
    seek,
    seekPercent,
  };
}
