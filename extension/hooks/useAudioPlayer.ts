import { useEffect, useCallback, useRef } from 'react';
import { audioEngine } from '@/lib/audio';
import { usePlayerStore, useQueueStore, useLibraryStore, useSettingsStore } from '@/lib/store';
import { EQ_PRESETS } from '@/lib/store/settingsStore';
import { buildArtUrl, ImageSizes } from '@/types';

/**
 * Hook to connect the audio engine with Zustand stores.
 * This should be called once at the app root.
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

  // Initialize library on mount
  useEffect(() => {
    initLibrary();
  }, [initLibrary]);

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

  // Update audio engine with ALL settings
  useEffect(() => {
    const eqGains = audioSettings.equalizerPreset === 'custom'
      ? audioSettings.customEqGains
      : EQ_PRESETS[audioSettings.equalizerPreset];

    audioEngine.updateSettings({
      crossfadeEnabled: audioSettings.crossfadeEnabled,
      crossfadeDuration: audioSettings.crossfadeDuration,
      equalizerEnabled: audioSettings.equalizerEnabled,
      eqGains,
      volumeNormalization: audioSettings.volumeNormalization,
      monoAudio: audioSettings.monoAudio,
      gaplessPlayback: audioSettings.gaplessPlayback,
    });
  }, [audioSettings]);

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

    return () => {
      audioEngine.destroy();
    };
  }, [hasNext, playNext, advanceToNext, playTrackAt, setIsPlaying, setCurrentTime, setDuration, setIsBuffering, setError, clearError]);

  // Load when current track changes
  useEffect(() => {
    // Must have a valid stream URL (starts with http)
    if (currentTrack?.streamUrl && currentTrack.streamUrl.startsWith('http')) {
      shouldAutoPlay.current = isPlaying;
      audioEngine.load(currentTrack.streamUrl);

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

  // Handle play/pause state changes
  useEffect(() => {
    if (shouldAutoPlay.current) {
      return;
    }

    // Must have a valid stream URL to play
    if (isPlaying && currentTrack?.streamUrl && currentTrack.streamUrl.startsWith('http')) {
      audioEngine.play().catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error('[useAudioPlayer] Play failed:', err);
      });
    } else if (!isPlaying) {
      audioEngine.pause();
    }
  }, [isPlaying, currentTrack?.streamUrl]);

  // Handle volume changes
  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume]);

  // Handle mute changes
  useEffect(() => {
    audioEngine.setMuted(isMuted);
  }, [isMuted]);

  // Media Session API - metadata
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    if (currentTrack) {
      const artUrl = currentTrack.artId
        ? buildArtUrl(currentTrack.artId, ImageSizes.MEDIUM_700)
        : undefined;

      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist || currentTrack.bandName || 'Unknown Artist',
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
