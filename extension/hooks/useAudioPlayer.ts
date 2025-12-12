import { useEffect, useCallback, useRef } from 'react';
import { audioEngine } from '@/lib/audio';
import { usePlayerStore, useQueueStore, useLibraryStore, useSettingsStore } from '@/lib/store';
import { buildArtUrl, ImageSizes } from '@/types';
import { getDisplayTitle } from '@/lib/utils';

// Enable debug logging for hot reload troubleshooting
const DEBUG_HOT_RELOAD = false;

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

  const { queue, currentIndex, playNext, playPrevious, playTrackAt, hasNext, advanceToNext } = useQueueStore();
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
  }, [repeat]);

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

        // Repeat track: restart the same track
        if (currentRepeat === 'track') {
          audioEngine.seek(0);
          audioEngine.play().catch(console.error);
          return;
        }

        // Has more tracks in queue
        if (hasNext()) {
          playNext();
          return;
        }

        // No more tracks - check repeat all
        if (currentRepeat === 'all' && currentQueue.length > 0) {
          playTrackAt(0);
          return;
        }

        // No repeat, no more tracks - stop
        setIsPlaying(false);
      },
      onTimeUpdate: (time) => {
        // Don't update time during crossfade (keep showing old track's progress)
        if (!isCrossfading.current) {
          setCurrentTime(time);
        }
      },
      onDurationChange: (dur) => {
        // Don't update duration during crossfade (keep showing old track's duration)
        if (!isCrossfading.current) {
          setDuration(dur);
        }
      },
      onLoadStart: () => {
        setIsBuffering(true);
        clearError();
      },
      onCanPlay: () => {
        setIsBuffering(false);

        // Restore saved position if we have one
        if (shouldRestorePosition.current !== null && shouldRestorePosition.current > 0) {
          const savedPosition = shouldRestorePosition.current;
          shouldRestorePosition.current = null;
          audioEngine.seek(savedPosition);
          setCurrentTime(savedPosition);
        }

        if (shouldAutoPlay.current) {
          shouldAutoPlay.current = false;
          audioEngine.play().catch((err) => {
            if (err instanceof DOMException && err.name === 'AbortError') {
              return;
            }
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
  }, [hasNext, playNext, advanceToNext, playTrackAt, setIsPlaying, setCurrentTime, setDuration, setIsBuffering, setError, clearError]);

  // Track the last track ID we tried to load
  const lastLoadedTrackId = useRef<number | null>(null);
  // Track if this is the first load after mount (for restoring position)
  const isFirstLoad = useRef(true);

  // Load when current track changes
  useEffect(() => {
    // Must have a valid stream URL (starts with http)
    if (!currentTrack?.streamUrl || !currentTrack.streamUrl.startsWith('http')) {
      return;
    }

    // Check if this is a NEW track (user changed it) or same track (hot reload/restore)
    const isNewTrack = lastLoadedTrackId.current !== null && lastLoadedTrackId.current !== currentTrack.id;
    lastLoadedTrackId.current = currentTrack.id;

    // For new tracks, force load (user intentionally changed)
    // For same track (hot reload), don't force - let AudioEngine decide
      shouldAutoPlay.current = isPlaying;

    // If this is the first load and we have a saved position, restore it
    if (isFirstLoad.current && currentTime > 0) {
      shouldRestorePosition.current = currentTime;
      isFirstLoad.current = false;
    } else if (isNewTrack) {
      shouldRestorePosition.current = null;
    }

    audioEngine.load(currentTrack.streamUrl, isNewTrack);

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
  }, [currentTrack?.id, currentTrack?.streamUrl]);

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
    // Skip if autoplay will handle it
    if (shouldAutoPlay.current) {
      return;
    }

    // Normal play/pause handling
    if (isPlaying && currentTrack?.streamUrl && currentTrack.streamUrl.startsWith('http')) {
      audioEngine.play().catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error('[useAudioPlayer] Play failed:', err);
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
  }, [isPlaying, currentTrack?.streamUrl, setIsPlaying]);

  // Handle volume changes
  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume]);

  // Handle mute changes
  useEffect(() => {
    audioEngine.setMuted(isMuted);
  }, [isMuted]);

  // Media Session API - metadata + Document title
  useEffect(() => {
    // Use getDisplayTitle to compute cleaned title (artist prefix removed)
    const displayTitle = currentTrack ? getDisplayTitle(currentTrack) : null;
    const artist = currentTrack?.artist || currentTrack?.bandName || 'Unknown Artist';

    // Update document title for tab display and extensions like auto-stop
    if (currentTrack && displayTitle) {
      document.title = `${artist} - ${displayTitle} | CampBand`;
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
  }, [currentTrack?.id, currentTrack?.title, currentTrack?.artist, currentTrack?.bandName, currentTrack?.albumTitle, currentTrack?.artId]);

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
    audioEngine.seek(time);
    setCurrentTime(time);
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
