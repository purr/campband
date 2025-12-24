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
  // CRITICAL: Only set callbacks once to prevent EventEmitter memory leaks
  // The callbacks use getState() to get fresh values, so they don't need to be recreated
  useEffect(() => {
    // Skip if callbacks already set (prevents re-setting on every dependency change)
    if (callbacksSet.current) {
      return;
    }

    callbacksSet.current = true;
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
        const playerState = usePlayerStore.getState();
        const actualCurrentTrack = playerState.currentTrack;

        console.log('[useAudioPlayer] TRACK ENDED', {
          trackId: actualCurrentTrack?.id,
          trackTitle: actualCurrentTrack?.title,
          repeat: currentRepeat,
          queueLength: currentQueue.length,
          currentIndex: queueRef.current.currentIndex,
          hasNext: hasNext(),
          currentTime: audioEngine.getCurrentTime(),
          duration: audioEngine.getDuration(),
          isPlaying: playerState.isPlaying
        });
        logSong('TRACK ENDED', { repeat: currentRepeat, queueLength: currentQueue.length, hasNext: hasNext(), isPlaying: playerState.isPlaying });

        // CRITICAL: If track was paused by user, don't auto-advance
        // The "ended" event can fire when pausing at the end of a track
        // Only auto-advance if the track was actually playing when it ended
        const isActuallyPlaying = audioEngine.isPlaying();
        const currentTime = audioEngine.getCurrentTime();
        const duration = audioEngine.getDuration();
        const isAtEnd = duration > 0 && Math.abs(currentTime - duration) < 0.5;

        // Check if user recently paused (within last 2 seconds)
        const timeSinceUserPause = Date.now() - lastUserPauseTime.current;
        const recentlyPaused = lastUserPauseTime.current > 0 && timeSinceUserPause < 2000;

        // CRITICAL: If track is at the end, it naturally ended - always advance
        // Don't block natural endings even if there was a recent pause
        // (The pause might have been automatic when track ended)
        if (isAtEnd) {
          logSong('TRACK ENDED - natural ending at end of track, advancing', {
            trackId: actualCurrentTrack?.id,
            currentTime,
            duration,
            storeIsPlaying: playerState.isPlaying,
            audioIsPlaying: isActuallyPlaying
          });
          // Continue to advance logic below
        } else if (recentlyPaused) {
          // Track not at end but user recently paused - don't advance
          logSong('TRACK ENDED IGNORED - track was paused by user (not at end)', {
            trackId: actualCurrentTrack?.id,
            storeIsPlaying: playerState.isPlaying,
            audioIsPlaying: isActuallyPlaying,
            timeSinceUserPause: `${timeSinceUserPause}ms`,
            currentTime,
            duration
          });
          return;
        } else if (!playerState.isPlaying && !isActuallyPlaying) {
          // Not playing and not at end and not recently paused - might be paused, don't advance
          logSong('TRACK ENDED IGNORED - track not playing and not at end (likely paused)', {
            trackId: actualCurrentTrack?.id,
            currentTime,
            duration
          });
          return;
        }

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
        // Validate duration is reasonable (not NaN, not negative)
        // Allow 0 duration (some tracks might have it)
        if (isNaN(dur) || dur < 0) {
          logSong('DURATION CHANGE IGNORED - invalid duration', { duration: dur });
          return;
        }
        logSong('DURATION CHANGE', { duration: dur, trackId: actualCurrentTrack?.id });
        // ALWAYS update duration when valid - don't skip 0
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
          logSong('SETTING DURATION from canPlay', { duration: audioDuration, oldDuration: duration });
          // ALWAYS update duration - don't check if different, just set it
          setDuration(audioDuration);
        }

        // CRITICAL: Always restore position from persisted state on page reload
        // This allows resuming from where user left off
        // Only restore if it's the same track (check by track ID)
        // BUT: Don't restore if crossfade is in progress or just completed (crossfade starts at 0)
        const storeState = usePlayerStore.getState();
        const isSameTrack = storeState.currentTrack?.id === actualCurrentTrack?.id;
        const isCurrentlyCrossfading = isCrossfading.current;
        const isActuallyPlaying = audioEngine.isPlaying();

        // Don't restore position if:
        // 1. Crossfade is in progress (crossfade starts new track at 0)
        // 2. Audio is already playing (likely from crossfade, which starts at 0)
        // Only restore on page reload when track is paused and not from crossfade
        if (isSameTrack && storeState.currentTime > 0 && audioDuration > 0 && !isCurrentlyCrossfading && !isActuallyPlaying) {
          const currentAudioTime = audioEngine.getCurrentTime();
          // Restore if position is different (clamp to valid range: 0 to duration)
          // Use smaller threshold (0.5s) to always restore on page reload
          const savedPosition = Math.max(0, Math.min(storeState.currentTime, audioDuration));
          if (Math.abs(currentAudioTime - savedPosition) > 0.5) {
            logSong('RESTORING POSITION from persisted state (page reload)', {
              savedPosition: savedPosition,
              currentTime: currentAudioTime,
              duration: audioDuration,
              trackId: actualCurrentTrack?.id
            });
            audioEngine.seek(savedPosition);
            setCurrentTime(savedPosition);
          } else if (currentAudioTime < 0.5 && savedPosition > 0.5) {
            // Even if close, ensure it's set (in case audio element is at 0 but we have saved position)
            logSong('RESTORING POSITION (audio at start but saved position exists)', {
              savedPosition: savedPosition,
              currentTime: currentAudioTime
            });
            audioEngine.seek(savedPosition);
            setCurrentTime(savedPosition);
          }
        } else if (isCurrentlyCrossfading || isActuallyPlaying) {
          logSong('SKIP POSITION RESTORE - crossfade in progress or audio already playing', {
            isCrossfading: isCurrentlyCrossfading,
            isPlaying: isActuallyPlaying,
            currentTime: audioEngine.getCurrentTime(),
            trackId: actualCurrentTrack?.id
          });
        }

        // Auto-play only if explicitly requested (not on page reload)
        // Check if this is the first load by checking if lastLoadedTrackId was null before
        if (shouldAutoPlay.current && lastLoadedTrackId.current !== null) {
          logSong('AUTO PLAY from canPlay');

          // CRITICAL: Verify track matches before auto-playing
          const canPlaySrc = audioEngine.getCurrentSrc();
          const canPlayExpectedSrc = actualCurrentTrack?.streamUrl;

          // CRITICAL: If source is undefined, this canPlay is from a stale/cleared audio element
          // Wait for the actual load to complete - don't try to play yet
          if (!canPlaySrc) {
            logSong('AUTO PLAY DEFERRED - source not set yet, waiting for load', {
              expectedTrackId: actualCurrentTrack?.id,
              lastLoadedId: lastLoadedTrackId.current,
              expectedSrc: canPlayExpectedSrc?.substring(0, 50),
              isLoading: isLoadingTrack.current === actualCurrentTrack?.id
            });
            // Keep shouldAutoPlay true so we try again when the real canPlay fires
            return;
          }

          // CRITICAL: Don't try to play if load is still in progress
          // canPlay can fire during blob fetch, but we need to wait for load to complete
          if (isLoadingTrack.current === actualCurrentTrack?.id) {
            logSong('AUTO PLAY DEFERRED - load still in progress, waiting for completion', {
              expectedTrackId: actualCurrentTrack?.id,
              lastLoadedId: lastLoadedTrackId.current
            });
            // Keep shouldAutoPlay true so we try again when load completes
            return;
          }

          const canPlayIsBlobUrl = canPlaySrc.startsWith('blob:');
          const canPlayTrackMatches = lastLoadedTrackId.current === actualCurrentTrack?.id;
          const canPlaySourceMatches = canPlaySrc === canPlayExpectedSrc || canPlayIsBlobUrl;

          if (!canPlayTrackMatches || !canPlaySourceMatches) {
            logSong('AUTO PLAY BLOCKED - track verification failed', {
              expectedTrackId: actualCurrentTrack?.id,
              lastLoadedId: lastLoadedTrackId.current,
              expectedSrc: canPlayExpectedSrc?.substring(0, 50),
              audioSrc: canPlaySrc?.substring(0, 50),
              trackMatches: canPlayTrackMatches,
              sourceMatches: canPlaySourceMatches
            });
            shouldAutoPlay.current = false;
            setIsPlaying(false);
            return;
          }

          shouldAutoPlay.current = false;

          // Restore position from persisted state before playing (only if same track)
          const storeState = usePlayerStore.getState();
          const isSameTrack = storeState.currentTrack?.id === actualCurrentTrack?.id;
          if (isSameTrack && storeState.currentTime > 0 && audioDuration > 0) {
            const currentAudioTime = audioEngine.getCurrentTime();
            // Restore if position is different (clamp to valid range)
            const savedPosition = Math.max(0, Math.min(storeState.currentTime, audioDuration));
            if (Math.abs(currentAudioTime - savedPosition) > 0.5) {
              logSong('RESTORING POSITION before auto-play', {
                savedPosition: savedPosition,
                currentTime: currentAudioTime,
                audioDuration
              });
              audioEngine.seek(savedPosition);
              setCurrentTime(savedPosition);
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

          // CRITICAL: Verify track matches before auto-playing
          const canPlaySrc = audioEngine.getCurrentSrc();
          const canPlayExpectedSrc = actualCurrentTrack?.streamUrl;

          // CRITICAL: If source is undefined, this canPlay is from a stale/cleared audio element
          // Wait for the actual load to complete - don't try to play yet
          if (!canPlaySrc) {
            logSong('AUTO PLAY DEFERRED - source not set yet, waiting for load', {
              expectedTrackId: actualCurrentTrack?.id,
              lastLoadedId: lastLoadedTrackId.current,
              expectedSrc: canPlayExpectedSrc?.substring(0, 50),
              isLoading: isLoadingTrack.current === actualCurrentTrack?.id
            });
            // Keep shouldAutoPlay true so we try again when the real canPlay fires
            return;
          }

          // CRITICAL: Don't try to play if load is still in progress
          // canPlay can fire during blob fetch, but we need to wait for load to complete
          if (isLoadingTrack.current === actualCurrentTrack?.id) {
            logSong('AUTO PLAY DEFERRED - load still in progress, waiting for completion', {
              expectedTrackId: actualCurrentTrack?.id,
              lastLoadedId: lastLoadedTrackId.current
            });
            // Keep shouldAutoPlay true so we try again when load completes
            return;
          }

          const canPlayIsBlobUrl = canPlaySrc.startsWith('blob:');
          const canPlayTrackMatches = lastLoadedTrackId.current === actualCurrentTrack?.id;
          const canPlaySourceMatches = canPlaySrc === canPlayExpectedSrc || canPlayIsBlobUrl;

          if (!canPlayTrackMatches || !canPlaySourceMatches) {
            logSong('AUTO PLAY BLOCKED - track verification failed', {
              expectedTrackId: actualCurrentTrack?.id,
              lastLoadedId: lastLoadedTrackId.current,
              expectedSrc: canPlayExpectedSrc?.substring(0, 50),
              audioSrc: canPlaySrc?.substring(0, 50),
              trackMatches: canPlayTrackMatches,
              sourceMatches: canPlaySourceMatches
            });
            shouldAutoPlay.current = false;
            setIsPlaying(false);
            return;
          }

          shouldAutoPlay.current = false;

          // Restore position from persisted state before playing (only if same track)
          const storeState = usePlayerStore.getState();
          const isSameTrack = storeState.currentTrack?.id === actualCurrentTrack?.id;
          if (isSameTrack && storeState.currentTime > 0 && audioDuration > 0) {
            const currentAudioTime = audioEngine.getCurrentTime();
            // Restore if position is different (clamp to valid range)
            const savedPosition = Math.max(0, Math.min(storeState.currentTime, audioDuration));
            if (Math.abs(currentAudioTime - savedPosition) > 0.5) {
              logSong('RESTORING POSITION before auto-play', {
                savedPosition: savedPosition,
                currentTime: currentAudioTime,
                audioDuration
              });
              audioEngine.seek(savedPosition);
              setCurrentTime(savedPosition);
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

            // CRITICAL: Update lastLoadedTrackId BEFORE advanceToNext to prevent load effect from resetting position
            // The crossfade already loaded and started the new track, so we don't want to reload/reset it
            lastLoadedTrackId.current = nextTrack.id;
            expectedTrackIdForUpdates.current = nextTrack.id;

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

    // No cleanup needed - callbacks are set once and persist for the lifetime of the app
    // The callbacks use getState() to get fresh values, so they don't need to be recreated
  }, []); // Empty deps - set callbacks once on mount

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
  // Track if we're currently loading a track (to prevent duplicate loads)
  const isLoadingTrack = useRef<number | null>(null);
  // Force reload counter - incrementing this will trigger the load effect to re-run
  const [forceReloadCounter, setForceReloadCounter] = useState(0);
  // Track if callbacks have been set to prevent re-setting on every render
  const callbacksSet = useRef(false);

  // Get cache update function
  const updateCachedAlbum = useAlbumStore((state) => state.updateCachedAlbum);

  // Load when current track changes or force reload is triggered
  useEffect(() => {
    // CRITICAL: Skip loading if crossfade is in progress
    // The crossfade is already handling the track transition, so we shouldn't interfere
    if (isCrossfading.current) {
      logSong('SKIP LOAD - crossfade in progress, letting crossfade handle track transition', {
        trackId: currentTrack?.id,
        lastLoadedId: lastLoadedTrackId.current
      });
      return;
    }

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

    // CRITICAL: Check if track is already loaded and playing (e.g., after crossfade)
    // If crossfade just completed, the track is already loaded and we should NOT reset it
    const isAlreadyLoadedFromCrossfade = lastLoadedTrackId.current === currentTrack.id &&
                                         (currentSrc === currentTrack.streamUrl || isBlobUrl) &&
                                         isActuallyPlaying;

    if (isAlreadyLoadedFromCrossfade) {
      // Track is already loaded and playing (from crossfade) - just sync time, don't reset
      logSong('TRACK ALREADY LOADED FROM CROSSFADE - syncing time, skipping reset', {
        trackId: currentTrack.id,
        currentTime: audioEngine.getCurrentTime(),
        duration: audioEngine.getDuration()
      });
      const currentAudioTime = audioEngine.getCurrentTime();
      if (currentAudioTime >= 0) {
        setCurrentTime(currentAudioTime);
      }
      const audioDuration = audioEngine.getDuration();
      if (audioDuration > 0 && audioDuration !== duration) {
        setDuration(audioDuration);
      }
      // Already marked as loaded, so return early
      return;
    }

    // If lastLoadedTrackId is null, we MUST load (track was cleared to force reload)
    const needsLoad = lastLoadedTrackId.current === null;

    // Check if this is a NEW track (user changed it) or same track
    // CRITICAL: If lastLoadedId is null, check if it's a page reload (same track) or new track
    // Get store state early to check for page reload
    const storeState = usePlayerStore.getState();
    const isPageReload = lastLoadedTrackId.current === null && storeState.currentTrack?.id === currentTrack.id;
    const isNewTrack = !isPageReload && (lastLoadedTrackId.current === null || lastLoadedTrackId.current !== currentTrack.id);

    // Only consider it "already loaded" if lastLoadedTrackId matches AND we don't need to force reload
    const isAlreadyThisTrack = !needsLoad && lastLoadedTrackId.current === currentTrack.id &&
      (currentSrc === currentTrack.streamUrl || (isBlobUrl && currentSrc)); // Accept blob URLs as valid

    // If we need to load (lastLoadedTrackId is null), skip the "already loaded" check
    // ALSO: Never skip if it's a new track - we must stop old and load new
    if (!needsLoad && !isNewTrack && isAlreadyThisTrack) {
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
    // AND: Never skip if it's a new track (isNewTrack) - we must load the new track
    if (!needsLoad && !isNewTrack && currentSrc === currentTrack.streamUrl && isActuallyPlaying && !shouldAutoPlay.current) {
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
    // UNLESS: shouldAutoPlay was explicitly set (user wants to play) OR isPlaying is true (user clicked play)
    const isInitialMount = lastLoadedTrackId.current === null;
    // CRITICAL: If isPlaying is true, user wants to play - respect that!
    // If shouldAutoPlay is already true, respect it even on "initial mount" (forced reload)
    // This handles the case where user clicks play but audio isn't ready - we force reload
    const intendedPlay = isInitialMount && !shouldAutoPlay.current && !isPlaying ? false : (isPlaying || shouldAutoPlay.current);

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

    logSong('TRACK LOAD DECISION', { isNewTrack, lastLoadedId: lastLoadedTrackId.current, currentId: currentTrack.id, intendedPlay });

    // Reset failed attempts when switching to a new track
    if (isNewTrack) {
      failedLoadAttempts.current.delete(lastLoadedTrackId.current || 0);
      // Reset seeking state when switching tracks
      isSeeking.current = false;

      // CRITICAL: When changing tracks - stop old completely, clear state, reset duration
      // This prevents the old track from playing briefly before the new one loads
      const isActuallyDifferentTrack = lastLoadedTrackId.current !== null && lastLoadedTrackId.current !== currentTrack.id;

      if (isActuallyDifferentTrack) {
        logSong('NEW TRACK - stopping old track completely and resetting');
        // Stop the old track immediately and clear it completely
        audioEngine.stop();
        // Clear the loaded track ID immediately to prevent any playback of old track
        lastLoadedTrackId.current = null;
        isLoadingTrack.current = null;
        // Reset time and duration to 0
        setCurrentTime(0);
        setDuration(0);
        // Also reset in audio engine to ensure it's at 0
        audioEngine.seek(0);
        // CRITICAL: Don't allow playback until new track is fully loaded and verified
        shouldAutoPlay.current = false;
      } else if (isPageReload) {
        // Page reload with same track - preserve duration from storage
        logSong('PAGE RELOAD - same track, preserving duration');
        setCurrentTime(0);
        // DON'T reset duration - keep the persisted duration from storage
        // It will be updated when audio loads, but this prevents the flash of 0
        audioEngine.seek(0);
      } else {
        // Same track ID but not page reload (force reload scenario)
        logSong('SAME TRACK RELOAD - resetting time but keeping duration');
        setCurrentTime(0);
        // DON'T reset duration - keep the persisted duration from storage
        audioEngine.seek(0);
      }

      // CRITICAL: Update previousIsPlaying to current state to prevent false pause detection
      // When switching tracks, any isPlaying changes are NOT user actions
      previousIsPlaying.current = isPlaying;
    }

    // On page reload (initial mount), check user intent
    // CRITICAL: If user clicked play (isPlaying is true), respect that even on initial mount
    if (isInitialMount) {
      // If user wants to play (isPlaying is true), set shouldAutoPlay
      if (isPlaying) {
        shouldAutoPlay.current = true;
        logSong('INITIAL MOUNT - user wants to play, setting shouldAutoPlay');
      } else {
        shouldAutoPlay.current = false;
        setIsPlaying(false); // Force paused on page reload
        clearError(); // Clear any errors on page reload
      }
    } else {
      // Set shouldAutoPlay based on intended play state (only for track changes after mount)
      // CRITICAL: For new tracks, set shouldAutoPlay if user wants to play (isPlaying is true)
      // The onCanPlay callback will verify the track before auto-playing
      if (isNewTrack) {
        // If user wants to play (isPlaying is true), set shouldAutoPlay so it plays when ready
        // onCanPlay will verify the track matches before actually playing
        shouldAutoPlay.current = isPlaying || intendedPlay;
        logSong('NEW TRACK - setting shouldAutoPlay based on user intent', {
          isPlaying,
          intendedPlay,
          shouldAutoPlay: shouldAutoPlay.current
        });
      } else {
        shouldAutoPlay.current = shouldAutoPlay.current || intendedPlay;
      }
    }

    // Set expected track ID for duration/time updates
    expectedTrackIdForUpdates.current = currentTrack.id;

    logSong('SET shouldAutoPlay', { intendedPlay, wasPlaying: isPlaying, shouldAutoPlay: shouldAutoPlay.current });

    // CRITICAL: Check if we're already loading this track to prevent duplicate loads
    // Also check if it's already loaded and ready
    if (isLoadingTrack.current === currentTrack.id) {
      logSong('SKIP LOAD - already loading this track', { trackId: currentTrack.id });
      return;
    }

    // If already loaded and ready, skip load
    if (lastLoadedTrackId.current === currentTrack.id && audioEngine.getCurrentSrc() === currentTrack.streamUrl) {
      const audio = audioEngine.getState();
      if (audio.src && audio.duration > 0) {
        logSong('SKIP LOAD - track already loaded and ready', { trackId: currentTrack.id });
        return;
      }
    }

    // Mark as loading to prevent duplicate loads
    isLoadingTrack.current = currentTrack.id;

    // CRITICAL: Set lastLoadedTrackId BEFORE calling load() so that canPlay verification works
    // This ensures that when canPlay fires during the load, it can verify the track correctly
    // We'll clear it if load fails
    const previousLastLoadedId = lastLoadedTrackId.current;
    lastLoadedTrackId.current = currentTrack.id;

    // Async load with stream URL refresh on 410
    // CRITICAL: Capture track info at start to avoid closure issues
    const trackIdToLoad = currentTrack.id;
    const streamUrlToLoad = currentTrack.streamUrl;
    const albumUrlToLoad = currentTrack.albumUrl;
    const trackTitleToLoad = currentTrack.title;

    const loadTrack = async () => {
      // Verify track hasn't changed during async operation
      const currentTrackNow = usePlayerStore.getState().currentTrack;
      if (currentTrackNow?.id !== trackIdToLoad) {
        logSong('LOAD CANCELLED - track changed during load', {
          expectedTrackId: trackIdToLoad,
          currentTrackId: currentTrackNow?.id
        });
        // Clear loading flag
        if (isLoadingTrack.current === trackIdToLoad) {
          isLoadingTrack.current = null;
        }
        return;
      }

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
        // Time and duration already reset above when isNewTrack was detected
        // Only stop if it's actually a different track (not just reloading same track)
        const isActuallyDifferentTrack = lastLoadedTrackId.current !== null && lastLoadedTrackId.current !== trackIdToLoad;
        if (isActuallyDifferentTrack) {
          logSong('NEW TRACK - stopping old track completely');
          audioEngine.stop();
        }
        audioEngine.seek(0);
      }

      // CRITICAL: Always use force=true when switching tracks to ensure old track stops
      // If it's a new track OR lastLoadedId is null (fresh load), force it
      const shouldForce = isNewTrack;
      logSong('LOADING TRACK', { trackId: trackIdToLoad, force: shouldForce, isNewTrack, lastLoadedId: lastLoadedTrackId.current });

      if (!streamUrlToLoad || !streamUrlToLoad.startsWith('http')) {
        logSong('LOAD CANCELLED - invalid stream URL', { trackId: trackIdToLoad });
        if (isLoadingTrack.current === trackIdToLoad) {
          isLoadingTrack.current = null;
        }
        return;
      }

      const result = await audioEngine.load(streamUrlToLoad, shouldForce);

      // Load succeeded - onCanPlay will handle auto-play if shouldAutoPlay is true

      // Verify track hasn't changed during async load
      const currentTrackAfterLoad = usePlayerStore.getState().currentTrack;
      if (currentTrackAfterLoad?.id !== trackIdToLoad) {
        logSong('LOAD CANCELLED - track changed during load', {
          expectedTrackId: trackIdToLoad,
          currentTrackId: currentTrackAfterLoad?.id
        });
        // Clear loading flag
        if (isLoadingTrack.current === trackIdToLoad) {
          isLoadingTrack.current = null;
        }
        // Restore lastLoadedId since we didn't actually load this
        lastLoadedTrackId.current = previousLastLoadedId;
        return;
      }

      if (!result.success) {
        logSong('LOAD FAILED', { error: result.error, expired: result.expired, trackId: trackIdToLoad });

        // Ignore abort errors - they're expected when cancelling loads
        if (result.error === 'Aborted' || result.error?.includes('aborted')) {
          // Clear loading flag
          if (isLoadingTrack.current === trackIdToLoad) {
            isLoadingTrack.current = null;
          }
          return; // Don't show error or retry - just return silently
        }

        // Handle expired stream URL (410 Gone)
        if (result.expired && albumUrlToLoad && !isRefreshingStreamUrl.current) {
          logSong('STREAM URL EXPIRED - refreshing');
          console.log('[useAudioPlayer] Stream URL expired, refreshing...');
          isRefreshingStreamUrl.current = true;
          setIsBuffering(true);
          setIsPlaying(false); // show loading
          shouldAutoPlay.current = true; // ensure we auto-play after refresh

          try {
            const freshUrl = await refreshStreamUrl(
              { id: trackIdToLoad, albumUrl: albumUrlToLoad },
              updateCachedAlbum
            );

            if (freshUrl) {
              logSong('STREAM URL REFRESHED', { trackId: trackIdToLoad });
              // Update the track in the queue with fresh URL
              const queueState = useQueueStore.getState();
              const updatedQueue = queueState.queue.map(t =>
                t.id === trackIdToLoad ? { ...t, streamUrl: freshUrl } : t
              );
              useQueueStore.setState({ queue: updatedQueue });

              // Update current track in player store (only if it's still the same track)
              const currentTrackForUpdate = usePlayerStore.getState().currentTrack;
              if (currentTrackForUpdate?.id === trackIdToLoad) {
                usePlayerStore.setState({
                  currentTrack: { ...currentTrackForUpdate, streamUrl: freshUrl }
                });
              }

              // Track the refresh attempt
              failedLoadAttempts.current.set(trackIdToLoad, attempts + 1);
              shouldAutoPlay.current = true; // play after refreshed load

              console.log('[useAudioPlayer] Retrying with fresh stream URL');
              // The state update will trigger this effect again with the fresh URL
            } else {
              const errorMsg = 'Could not refresh stream URL';
              logSong('STREAM URL REFRESH FAILED');
              console.error('[useAudioPlayer]', errorMsg, {
                trackId: trackIdToLoad,
                trackTitle: trackTitleToLoad
              });
              failedLoadAttempts.current.set(trackIdToLoad, 2); // Max out attempts
              setError(errorMsg);
              setIsPlaying(false);
              setIsBuffering(false);
            }
          } catch (err) {
            logSong('STREAM URL REFRESH ERROR', err);
            console.error('[useAudioPlayer] Failed to refresh stream URL:', err);
            failedLoadAttempts.current.set(trackIdToLoad, 2);
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
            trackId: trackIdToLoad,
            trackTitle: trackTitleToLoad,
            error: result.error
          });
          failedLoadAttempts.current.set(trackIdToLoad, 2);
          setError(errorMsg);
          setIsPlaying(false);
        } else {
          // Abort or "Load failed" error - just clear buffering, don't show error
          setIsBuffering(false);
        }

        // Clear loading flag on error
        if (isLoadingTrack.current === trackIdToLoad) {
          isLoadingTrack.current = null;
        }

        // CRITICAL: If load failed, restore previous lastLoadedId or clear it
        // This prevents canPlay from thinking the wrong track is loaded
        if (result.error && result.error !== 'Aborted' && !result.error?.includes('aborted') && result.error !== 'Load failed') {
          lastLoadedTrackId.current = previousLastLoadedId;
        }
      } else {
        logSong('LOAD SUCCESS', { trackId: trackIdToLoad });
        // lastLoadedTrackId already set before load() - no need to set again

        // Clear loading flag on success
        if (isLoadingTrack.current === trackIdToLoad) {
          isLoadingTrack.current = null;
        }
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
    // CRITICAL: Skip if crossfade is in progress
    // The crossfade is already handling playback, so we shouldn't interfere
    if (isCrossfading.current) {
      logSong('SKIP PLAY/PAUSE - crossfade in progress');
      previousIsPlaying.current = isPlaying;
      return;
    }

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
    // AND: Don't fix if we have a source (canPlay has fired, audio is ready even if duration isn't set yet)
    const hasSource = audioState.src && audioState.src.length > 0;
    if (isPlaying && !actualIsPlaying && !hasSource) {
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
    // BUT: Don't clear lastLoadedTrackId if track is already loading - wait for it
    if (shouldAutoPlay.current && isPlaying && !isAudioReady) {
      // If track is already loading, just wait for it - don't clear lastLoadedTrackId
      if (isLoadingTrack.current === currentTrack?.id) {
        logSong('FORCE LOAD SKIPPED - track already loading, waiting for completion', {
          trackId: currentTrack.id,
          src: audioState.src,
          duration: audioState.duration,
          lastLoadedId: lastLoadedTrackId.current
        });
        return;
      }

      // If we have a track but audio isn't loaded, force a load
      if (currentTrack?.streamUrl && currentTrack.streamUrl.startsWith('http')) {
        logSong('FORCE LOAD - user wants to play but audio not ready', {
          trackId: currentTrack.id,
          src: audioState.src,
          duration: audioState.duration,
          lastLoadedId: lastLoadedTrackId.current
        });

        // CRITICAL: Only clear lastLoadedTrackId if track doesn't match
        // If track matches, just wait for canPlay to set duration
        if (lastLoadedTrackId.current !== currentTrack.id) {
          // Wrong track - force reload
          lastLoadedTrackId.current = null;
          shouldAutoPlay.current = true;
          // The load effect will detect lastLoadedTrackId is null and load the track
          return;
        } else {
          // Track matches but not ready - wait for canPlay
          logSong('FORCE LOAD - track matches, waiting for canPlay');
          shouldAutoPlay.current = true;
          return;
        }
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

    // SIMPLIFIED: Normal play/pause handling
    if (isPlaying && currentTrack?.streamUrl && currentTrack.streamUrl.startsWith('http')) {
      // If already playing the correct track, do nothing
      if (actualIsPlaying && lastLoadedTrackId.current === currentTrack.id) {
        logSong('SKIP PLAY - already playing correct track');
        return;
      }

      // CRITICAL: Strict verification - only play if track ID, source, and duration all match
      const audioDuration = audioEngine.getDuration();
      const audioState = audioEngine.getState();
      const currentSrc = audioEngine.getCurrentSrc();
      const expectedSrc = currentTrack.streamUrl;
      const audioSrc = audioState.src || currentSrc;
      const isBlobUrl = audioSrc?.startsWith('blob:');

      // Track is ready ONLY if:
      // 1. Track ID matches (was loaded)
      // 2. Source matches (either exact match or blob URL)
      // 3. Has valid duration OR source is set (canPlay has fired, audio is ready even if duration isn't set yet)
      const trackMatches = lastLoadedTrackId.current === currentTrack.id;
      const sourceMatches = audioSrc && (audioSrc === expectedSrc || isBlobUrl);
      const hasValidDuration = audioDuration > 0 && !isNaN(audioDuration);
      const isCurrentlyLoading = isLoadingTrack.current === currentTrack.id;
      const hasSource = audioSrc && audioSrc.length > 0;

      // CRITICAL: Track is ready if ID and source match, AND either:
      // - Has valid duration, OR
      // - Is currently loading (duration will be set when canPlay fires), OR
      // - Has source (canPlay has fired, audio is ready even if duration isn't set yet)
      const isReady = trackMatches && sourceMatches && (hasValidDuration || isCurrentlyLoading || hasSource);

      if (!isReady) {
        // Track not loaded or wrong track - force reload
        logSong('PLAY BLOCKED - track verification failed, forcing reload', {
          trackId: currentTrack.id,
          trackMatches,
          sourceMatches,
          hasValidDuration,
          isCurrentlyLoading,
          expectedSrc: expectedSrc.substring(0, 50),
          audioSrc: audioSrc?.substring(0, 50),
          duration: audioDuration,
          lastLoadedId: lastLoadedTrackId.current,
          isLoading: isLoadingTrack.current === currentTrack.id
        });

        // If already loading, just wait for it
        if (isCurrentlyLoading) {
          logSong('PLAY - already loading, waiting for load to complete');
          shouldAutoPlay.current = true;
          return;
        }

        // CRITICAL: If track ID matches but source doesn't, or source matches but duration isn't ready,
        // don't clear lastLoadedTrackId - just wait for canPlay to set duration
        // Only force reload if track ID doesn't match (wrong track)
        if (!trackMatches) {
          // Wrong track - stop and force reload
          logSong('PLAY - wrong track, forcing reload');
          audioEngine.stop();
          lastLoadedTrackId.current = null;
          isLoadingTrack.current = null;
          shouldAutoPlay.current = true;
          setCurrentTime(0);
          setDuration(0);
          // Load effect will handle loading and playing
          return;
        } else {
          // Track ID matches but source/duration issue - wait for canPlay
          logSong('PLAY - track matches but not ready, waiting for canPlay', {
            sourceMatches,
            hasValidDuration,
            hasSource: audioSrc && audioSrc.length > 0
          });
          shouldAutoPlay.current = true;
          return;
        }
      }

      // Audio is ready - play it

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

      // Audio has duration - restore position if needed, then play (only if same track)
      const isSameTrack = storeState.currentTrack?.id === currentTrack?.id;
      if (isSameTrack && storeState.currentTime > 0 && actualAudioDuration > 0) {
        const currentAudioTime = audioEngine.getCurrentTime();
        // Restore if position is different (clamp to valid range)
        const savedPosition = Math.max(0, Math.min(storeState.currentTime, actualAudioDuration));
        if (Math.abs(currentAudioTime - savedPosition) > 0.5) {
          logSong('RESTORING POSITION before play', {
            savedPosition: savedPosition,
            currentTime: currentAudioTime,
            audioDuration: actualAudioDuration,
            trackId: currentTrack.id
          });
          audioEngine.seek(savedPosition);
          setCurrentTime(savedPosition);
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

      // CRITICAL: Final verification before playing - ensure track ID, source, and duration all match
      const finalSrc = audioEngine.getCurrentSrc();
      const finalExpectedSrc = currentTrack.streamUrl;
      const finalAudioState = audioEngine.getState();
      const finalAudioSrc = finalAudioState.src || finalSrc;
      const finalIsBlobUrl = finalAudioSrc?.startsWith('blob:');
      const finalTrackMatches = lastLoadedTrackId.current === currentTrack.id;
      const finalSourceMatches = finalAudioSrc && (finalAudioSrc === finalExpectedSrc || finalIsBlobUrl);

      if (!finalTrackMatches || !finalSourceMatches) {
        logSong('PLAY BLOCKED - final verification failed, wrong track', {
          expectedTrackId: currentTrack.id,
          lastLoadedId: lastLoadedTrackId.current,
          expectedSrc: finalExpectedSrc.substring(0, 50),
          audioSrc: finalAudioSrc?.substring(0, 50),
          trackMatches: finalTrackMatches,
          sourceMatches: finalSourceMatches
        });
        // Stop wrong track and reload
        audioEngine.stop();
        lastLoadedTrackId.current = null;
        isLoadingTrack.current = null;
        shouldAutoPlay.current = true;
        setCurrentTime(0);
        setDuration(0);
        return;
      }

      // No position to restore or already at correct position - play immediately
      logSong('PLAYING - all verifications passed', { trackId: currentTrack.id, trackTitle: currentTrack.title, duration: actualAudioDuration });
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
