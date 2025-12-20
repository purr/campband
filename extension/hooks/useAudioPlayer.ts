import { useEffect, useCallback, useRef } from 'react';
import { audioEngine } from '@/lib/audio';
import { usePlayerStore, useQueueStore, useLibraryStore, useSettingsStore, useAlbumStore, useRouterStore } from '@/lib/store';
import { refreshStreamUrl } from '@/lib/api';
import { buildArtUrl, ImageSizes } from '@/types';
import { getDisplayTitle } from '@/lib/utils';

// Enable debug logging for hot reload troubleshooting
const DEBUG_HOT_RELOAD = false;
// Enable debug logging for song operations
const DEBUG_SONGS = false;

function logSong(...args: any[]) {
  if (DEBUG_SONGS) {
    console.log('[useAudioPlayer]', ...args);
  }
}

/**
 * Hook to connect the audio engine with Zustand stores.
 * This should be called once at the app root.
 *
 * Hot Reload Strategy:
 * - On mount, syncs with AudioEngine's actual state
 * - Checks DOM for playing audio before pausing/loading
 * - Prevents store reset from interrupting playback
 */
export function useAudioPlayer() {
  const {
    currentTrack,
    isPlaying,
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
  // Track if we should restore saved position after loading
  const shouldRestorePosition = useRef<number | null>(null);

  // Initialize library on mount
  useEffect(() => {
    initLibrary();
  }, [initLibrary]);

  // Sync with audio engine state on mount (handles hot reload)
  useEffect(() => {
    // Force resync with DOM to find any playing audio (only once on mount)
    audioEngine.resyncWithDOM(true);

    // Small delay to let the audio element stabilize after potential hot reload
    const syncTimeout = setTimeout(() => {
      const actuallyPlaying = audioEngine.isPlaying();
      const currentTime = audioEngine.getCurrentTime();
      const duration = audioEngine.getDuration();

      if (DEBUG_HOT_RELOAD) console.log('[useAudioPlayer] Mount sync check:', { actuallyPlaying, currentTime, duration });

      if (actuallyPlaying || currentTime > 0) {
        if (DEBUG_HOT_RELOAD) console.log('[useAudioPlayer] Hot reload - audio is playing, syncing store');
        if (actuallyPlaying) {
          setIsPlaying(true);
        }
        if (duration > 0 && !isNaN(duration)) {
          setDuration(duration);
        }
        if (currentTime > 0) {
          setCurrentTime(currentTime);
        }
      }
    }, 50);

    return () => clearTimeout(syncTimeout);
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Update audio engine with playback settings
  useEffect(() => {
    audioEngine.updateSettings({
      crossfadeEnabled: audioSettings.crossfadeEnabled,
      crossfadeDuration: audioSettings.crossfadeDuration,
      volumeNormalization: audioSettings.volumeNormalization,
      gaplessPlayback: audioSettings.gaplessPlayback,
    });
  }, [audioSettings.crossfadeEnabled, audioSettings.crossfadeDuration, audioSettings.volumeNormalization, audioSettings.gaplessPlayback]);

  // Update EQ settings separately (more granular control)
  // Also run on mount to ensure EQ is applied after hot-reload
  useEffect(() => {
    audioEngine.updateEqSettings({
      enabled: audioSettings.eq.enabled,
      gains: audioSettings.eq.gains,
    });
  }, [audioSettings.eq.enabled, audioSettings.eq.gains]);

  // Force reconnect and EQ reapply on mount (for hot-reload)
  useEffect(() => {
    // Small delay to ensure audio graph is ready, then force reconnect
    const timer = setTimeout(async () => {
      await audioEngine.forceReconnect();
      audioEngine.updateEqSettings({
        enabled: audioSettings.eq.enabled,
        gains: audioSettings.eq.gains,
      });
    }, 150);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply volume/mute early (runs before callbacks effect)
  useEffect(() => {
    audioEngine.setVolume(volume);
    audioEngine.setMuted(isMuted);
  }, [volume, isMuted]);

  // Set up audio engine callbacks
  useEffect(() => {
    audioEngine.setCallbacks({
      onPlay: () => {
        setIsPlaying(true);
        setIsBuffering(false);
      },
      onPause: () => setIsPlaying(false),
      onEnded: () => {
        const currentRepeat = repeatRef.current;
        const { queue: currentQueue } = queueRef.current;

        logSong('TRACK ENDED', { repeat: currentRepeat, queueLength: currentQueue.length, hasNext: hasNext() });

        // Repeat track: restart the same track
        if (currentRepeat === 'track') {
          logSong('REPEAT TRACK - seeking to start');
          audioEngine.seek(0);
          audioEngine.play().catch(console.error);
          return;
        }

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
        // Only ignore if sources don't match AND we have an expected source
        // AND the currentSrc is NOT the expected source (meaning it's from old element)
        if (expectedSrc && currentSrc && currentSrc !== expectedSrc) {
          // This might be from an old element, but also might be the new track loading
          // Check if the currentSrc matches any track in the queue
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
        }

        logSong('CAN PLAY', { trackId: actualCurrentTrack?.id, currentSrc: currentSrc?.substring(0, 50) });
        setIsBuffering(false);

        // CRITICAL: Get and set duration immediately when audio can play
        // This fixes duration issues when clicking to play
        // Only update if duration actually changed to reduce spam
        const audioDuration = audioEngine.getDuration();
        if (audioDuration > 0 && !isNaN(audioDuration) && audioDuration !== duration) {
          logSong('SETTING DURATION from canPlay', { duration: audioDuration, oldDuration: duration });
          setDuration(audioDuration);
        } else if (audioDuration > 0 && !isNaN(audioDuration)) {
          // Duration is same, skip logging to reduce spam
        }

        // Restore saved position if we have one
        if (shouldRestorePosition.current !== null && shouldRestorePosition.current > 0) {
          const savedPosition = shouldRestorePosition.current;
          shouldRestorePosition.current = null;
          logSong('RESTORING POSITION from canPlay', savedPosition);
          audioEngine.seek(savedPosition);
          setCurrentTime(savedPosition);
        }

        if (shouldAutoPlay.current) {
          logSong('AUTO PLAY from canPlay');
          shouldAutoPlay.current = false;
          audioEngine.play().catch((err) => {
            if (err instanceof DOMException && err.name === 'AbortError') {
              return;
            }
            logSong('AUTO PLAY FAILED', err);
            console.error('[useAudioPlayer] Auto-play failed:', err);
            setError('Playback failed - click play to retry');
          });
        }
      },
      onError: (error) => {
        setError(error);
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

    // Don't destroy on cleanup - let audio continue playing across hot reloads
    // Audio engine is a singleton that persists for the lifetime of the app
  }, [hasNext, playNext, advanceToNext, playTrackAt, setIsPlaying, setCurrentTime, setDuration, setIsBuffering, setError, clearError, volume, isMuted]);

  // Track the last track ID we tried to load
  const lastLoadedTrackId = useRef<number | null>(null);
  // Track if this is the first load after mount (for restoring position)
  const isFirstLoad = useRef(true);
  // Track failed load attempts to prevent infinite loops
  const failedLoadAttempts = useRef<Map<number, number>>(new Map());
  // Track if we're currently refreshing a stream URL
  const isRefreshingStreamUrl = useRef(false);
  // Track if we're currently seeking (to prevent race conditions)
  const isSeeking = useRef(false);
  // Track the expected track ID for duration/time updates (to prevent stale data)
  const expectedTrackIdForUpdates = useRef<number | null>(null);

  // Get cache update function
  const updateCachedAlbum = useAlbumStore((state) => state.updateCachedAlbum);

  // Load when current track changes
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

    // CRITICAL: Check if audio is already playing this source (after crossfade)
    // If so, skip load to avoid pausing the audio
    // BUT: Don't skip if we just stopped (loop all scenario)
    const currentSrc = audioEngine.getCurrentSrc();
    if (currentSrc === currentTrack.streamUrl && audioEngine.isPlaying() && !shouldAutoPlay.current) {
      logSong('SKIP LOAD - already playing this source (crossfade completed)');
      // Update the last loaded ID so we don't try to load again
      lastLoadedTrackId.current = currentTrack.id;
      // Ensure playing state is correct
      if (isPlaying && !audioEngine.isPlaying()) {
        audioEngine.play().catch(console.error);
      }
      return;
    }

    // Remember user's intent to play
    const intendedPlay = isPlaying || shouldAutoPlay.current;
    shouldAutoPlay.current = intendedPlay;

    // Prevent infinite loops - max 2 attempts per track (original + 1 refresh)
    const attempts = failedLoadAttempts.current.get(currentTrack.id) || 0;
    if (attempts >= 2) {
      logSong('MAX LOAD ATTEMPTS REACHED', currentTrack.id);
      console.error('[useAudioPlayer] Max load attempts reached for track:', currentTrack.id);
      setError('Stream unavailable - try refreshing the page');
      setIsPlaying(false);
      return;
    }

    // Check if this is a NEW track (user changed it) or same track (hot reload/restore)
    const isNewTrack = lastLoadedTrackId.current !== null && lastLoadedTrackId.current !== currentTrack.id;

    logSong('TRACK LOAD DECISION', { isNewTrack, lastLoadedId: lastLoadedTrackId.current, currentId: currentTrack.id });

    // Reset failed attempts when switching to a new track
    if (isNewTrack) {
      failedLoadAttempts.current.delete(lastLoadedTrackId.current || 0);
      // Reset seeking state when switching tracks
      isSeeking.current = false;
      // CRITICAL: Reset time to 0 when track changes
      setCurrentTime(0);
      setDuration(0);
    }

    lastLoadedTrackId.current = currentTrack.id;
    // Set expected track ID for duration/time updates
    expectedTrackIdForUpdates.current = currentTrack.id;

    // For new tracks, force load (user intentionally changed)
    // For same track (hot reload), don't force - let AudioEngine decide
    // If this is the first load and we have a saved position, restore it
    if (isFirstLoad.current && currentTime > 0) {
      shouldRestorePosition.current = currentTime;
      isFirstLoad.current = false;
      logSong('RESTORING POSITION', currentTime);
    } else if (isNewTrack) {
      shouldRestorePosition.current = null;
    }

    // Async load with stream URL refresh on 410
    const loadTrack = async () => {
      // Show loading state while switching tracks
      if (isNewTrack) {
        logSong('NEW TRACK - setting buffering state');
        setIsBuffering(true);
        setIsPlaying(false); // show as loading, not playing
        // CRITICAL: Reset time to 0 when starting to load new track
        setCurrentTime(0);
        setDuration(0);
      }

      logSong('LOADING TRACK', { trackId: currentTrack.id, force: isNewTrack });
      const result = await audioEngine.load(currentTrack.streamUrl!, isNewTrack);

      if (!result.success) {
        logSong('LOAD FAILED', { error: result.error, expired: result.expired, trackId: currentTrack.id });
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
              logSong('STREAM URL REFRESH FAILED');
              failedLoadAttempts.current.set(currentTrack.id, 2); // Max out attempts
              setError('Could not refresh stream URL');
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
        } else if (!result.expired && result.error !== 'Aborted') {
          // Other non-recoverable error
          logSong('LOAD ERROR - non-recoverable', result.error);
          failedLoadAttempts.current.set(currentTrack.id, 2);
          setError(result.error || 'Failed to load audio');
          setIsPlaying(false);
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
    }
  }, [currentTrack?.id, currentTrack?.streamUrl, updateCachedAlbum, setError, setIsPlaying, setIsBuffering]);

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

  // Track if this is initial mount (for hot reload handling)
  const isInitialMount = useRef(true);

  // Handle play/pause state changes
  useEffect(() => {
    // Skip if autoplay will handle it (onCanPlay callback will handle play)
    if (shouldAutoPlay.current) {
      return;
    }

    // Skip if we're refreshing a stream URL
    if (isRefreshingStreamUrl.current) {
      return;
    }

    // Normal play/pause handling
    if (isPlaying && currentTrack?.streamUrl && currentTrack.streamUrl.startsWith('http')) {
      // Check if audio is actually ready to play
      const audioState = audioEngine.getState();

      // If audio isn't loaded or has no duration, don't try to play yet
      // The onCanPlay callback will handle playback once ready
      if (!audioState.src || audioState.duration === 0) {
        // Audio not ready yet - let onCanPlay handle it via shouldAutoPlay
        shouldAutoPlay.current = true;
        return;
      }

      audioEngine.play().catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error('[useAudioPlayer] Play failed:', err);
        // Play failed - sync UI state
        setIsPlaying(false);
        setError('Playback failed - click play to retry');
      });
    } else if (!isPlaying) {
      // On initial mount, use safePause to avoid stopping music during hot reload
      if (isInitialMount.current) {
        isInitialMount.current = false;
        // Check if any audio is actually playing in DOM
        const allAudio = document.querySelectorAll('audio');
        for (const audio of allAudio) {
          if (!audio.paused) {
            if (DEBUG_HOT_RELOAD) console.log('[useAudioPlayer] Initial mount - audio playing in DOM, syncing store');
            setIsPlaying(true);
            return;
          }
        }
      }
      audioEngine.pause();
    }
  }, [isPlaying, currentTrack?.streamUrl, setIsPlaying, setError]);

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
    const currentDuration = audioEngine.getDuration();
    const actualCurrentTrack = usePlayerStore.getState().currentTrack;
    const isBuffering = usePlayerStore.getState().isBuffering;

    if (!actualCurrentTrack) {
      logSong('SEEK IGNORED - no current track');
      return;
    }

    // BLOCK seeking during loading/buffering - user requested this behavior
    if (isBuffering || !currentDuration || currentDuration === 0 || isNaN(currentDuration)) {
      logSong('SEEK BLOCKED - track still loading', { time, isBuffering, duration: currentDuration });
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
