import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  Volume1,
  VolumeX,
  ListMusic,
  Loader2,
} from 'lucide-react';
import { cn, getDisplayTitle } from '@/lib/utils';
import { formatTime } from '@/lib/utils';
import { usePlayerStore, useQueueStore, useUIStore, useRouterStore, useLibraryStore, useSettingsStore } from '@/lib/store';
import { IconButton, Slider, HeartButton, useUnlikeConfirm, useContextMenu } from '@/components/ui';
import { buildArtUrl, ImageSizes } from '@/types';
import { LAYOUT_CLASSES } from '@/lib/constants/layout';
import { audioEngine } from '@/lib/audio';

interface PlayerBarProps {
  onSeek?: (time: number) => void;
}

// ============================================
// Volume Control Component
// ============================================

interface VolumeControlProps {
  volume: number;
  isMuted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
}

function VolumeControl({ volume, isMuted, onVolumeChange, onToggleMute }: VolumeControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupPosition, setPopupPosition] = useState({ bottom: 0, right: 0 });
  const displayVolume = isMuted ? 0 : Math.round(volume * 100);
  const volumeUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get volume icon based on level
  const VolumeIcon = isMuted || volume === 0
    ? VolumeX
    : volume < 0.5
      ? Volume1
      : Volume2;

  // Update popup position when opened
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const updatePosition = () => {
        if (buttonRef.current) {
          const rect = buttonRef.current.getBoundingClientRect();
          setPopupPosition({
            bottom: window.innerHeight - rect.top + 12, // More spacing to avoid covering button
            right: window.innerWidth - rect.right,
          });
        }
      };
      updatePosition();
      // Update on scroll/resize
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (volumeUpdateTimeoutRef.current) {
        clearTimeout(volumeUpdateTimeoutRef.current);
      }
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Close popup when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        popupRef.current && !popupRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value) / 100;
    // Debounce volume updates to prevent lag
    if (volumeUpdateTimeoutRef.current) {
      clearTimeout(volumeUpdateTimeoutRef.current);
    }
    volumeUpdateTimeoutRef.current = setTimeout(() => {
      onVolumeChange(newVolume);
    }, 16); // ~60fps updates
  };

  // Handle scroll wheel to change volume (non-passive to allow preventDefault)
  useEffect(() => {
    const container = containerRef.current;
    const popup = popupRef.current;

    const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -5 : 5; // Scroll down = decrease, scroll up = increase
    const newVolume = Math.max(0, Math.min(100, displayVolume + delta));
    // Debounce wheel updates too
    if (volumeUpdateTimeoutRef.current) {
      clearTimeout(volumeUpdateTimeoutRef.current);
    }
    volumeUpdateTimeoutRef.current = setTimeout(() => {
      onVolumeChange(newVolume / 100);
    }, 16);
  };

    // Must use { passive: false } to allow preventDefault on wheel events
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }
    if (popup) {
      popup.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
      if (popup) {
        popup.removeEventListener('wheel', handleWheel);
      }
    };
  }, [displayVolume, onVolumeChange, isOpen]);

  return (
    <div ref={containerRef} className="relative">
      {/* Expanded view - shown on wider screens */}
      <div className="hidden lg:flex items-center gap-2">
        <IconButton
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          size="sm"
          onClick={onToggleMute}
          className={isMuted ? 'text-love' : ''}
        >
          <VolumeIcon size={18} />
        </IconButton>

        <div className="flex items-center gap-2 w-28">
          <Slider
            className="flex-1"
            value={displayVolume}
            max={100}
            onChange={handleSliderChange}
          />
          <span className="text-xs text-text/60 tabular-nums w-8 text-right">
            {displayVolume}%
          </span>
        </div>
      </div>

      {/* Collapsed view - shown on narrower screens */}
      <div className="lg:hidden">
        <div
          ref={containerRef}
          onMouseEnter={() => {
            // Clear any pending close
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
            }
            // Clear any pending hide
            if (hideTimeoutRef.current) {
              clearTimeout(hideTimeoutRef.current);
            }
            // Delay showing popup by 300ms
            hoverTimeoutRef.current = setTimeout(() => {
              setIsOpen(true);
              // Small delay to ensure DOM is ready, then trigger animation
              requestAnimationFrame(() => {
                setIsVisible(true);
              });
            }, 300);
          }}
          onMouseLeave={() => {
            // Clear pending open
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
            }
            // Clear any pending hide
            if (hideTimeoutRef.current) {
              clearTimeout(hideTimeoutRef.current);
            }
            // Wait 0.5s before starting exit animation (when collapsed/small)
            hideTimeoutRef.current = setTimeout(() => {
              // Start exit animation
              setIsVisible(false);
              // Keep in DOM during animation, then remove (500ms)
              hideTimeoutRef.current = setTimeout(() => {
                setIsOpen(false);
              }, 500);
            }, 500);
          }}
          className="relative"
        >
          <button
            ref={buttonRef}
            onClick={onToggleMute}
            className={cn(
              'flex items-center justify-center',
              'w-9 h-9 rounded-full',
              'text-text/70 hover:text-text',
              'hover:bg-white/10',
              'transition-all duration-200',
              isMuted && 'text-love'
            )}
          >
            <VolumeIcon size={18} />
          </button>

        {/* Popup - rendered via portal to escape backdrop-filter nesting */}
        {isOpen && createPortal(
          <div
            ref={popupRef}
            onMouseEnter={() => {
              // Clear any pending close
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
              }
              // Ensure it's visible when hovering the popup
              if (!isVisible) {
                setIsVisible(true);
              }
            }}
            onMouseLeave={() => {
              // Clear any pending operations
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
              }
              // Delay hiding by 0.5s
              hoverTimeoutRef.current = setTimeout(() => {
                // Start exit animation
                setIsVisible(false);
                // Keep in DOM during animation, then remove (500ms)
                hoverTimeoutRef.current = setTimeout(() => {
                  setIsOpen(false);
                }, 500);
              }, 500);
            }}
            className={cn(
              'fixed z-[9999]',
              'px-3 py-4 rounded-2xl',
              'w-12',
              'liquid-glass-glow',
              'transition-all duration-500 ease-out',
              isVisible
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-2 pointer-events-none'
            )}
            style={{
              bottom: popupPosition.bottom,
              right: popupPosition.right,
              // Add margin to prevent covering the button
              marginBottom: '4px',
            }}
          >
            {/* Vertical slider with volume display */}
            <div className="flex flex-col items-center gap-2">
              {/* Volume percentage */}
              <span className="text-xs font-medium text-text/80 tabular-nums w-full text-center">
                {displayVolume}%
              </span>

              {/* Vertical slider track */}
              <div className="relative h-24 w-1.5 bg-white/10 rounded-full overflow-hidden">
                {/* Fill */}
                <div
                  className="absolute bottom-0 left-0 right-0 bg-rose rounded-full transition-all"
                  style={{ height: `${displayVolume}%` }}
                />
                {/* Invisible input for interaction */}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={displayVolume}
                  onChange={handleSliderChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  style={{
                    writingMode: 'vertical-lr',
                    direction: 'rtl',
                  }}
                />
              </div>

            </div>
          </div>,
          document.body
        )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Player Bar Component
// ============================================

export function PlayerBar({ onSeek }: PlayerBarProps) {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    volume,
    isMuted,
    repeat,
    error,
    toggle,
    setVolume,
    toggleMute,
    toggleRepeat,
  } = usePlayerStore();

  const { playNext, playPrevious, hasNext, hasPrevious, shuffle, setShuffle } = useQueueStore();
  const { toggleQueuePanel, queuePanelOpen } = useUIStore();
  const { navigate } = useRouterStore();
  const { isFavoriteTrack, addFavoriteTrack, removeFavoriteTrack } = useLibraryStore();
  const confirmOnUnlike = useSettingsStore((state) => state.app.confirmOnUnlike);
  const { confirmUnlikeTrack } = useUnlikeConfirm();

  // Context menu for track
  const { openTrackMenu } = useContextMenu();

  const handleTrackContextMenu = (e: React.MouseEvent) => {
    if (currentTrack) {
      openTrackMenu(e, currentTrack);
    }
  };

  // Refs for smooth progress bar animation (bypasses React state)
  const progressFillRef = useRef<HTMLDivElement>(null);
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const rafIdRef = useRef<number | null>(null);

  // Store refs for values needed in RAF loop
  const durationRef = useRef(duration);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Smooth progress bar animation using requestAnimationFrame
  useEffect(() => {
    const updateProgress = () => {
      const time = audioEngine.getCurrentTime();
      const dur = durationRef.current;
      const percent = dur > 0 ? (time / dur) * 100 : 0;

      // Update DOM directly (no React re-render)
      if (progressFillRef.current) {
        progressFillRef.current.style.width = `${percent}%`;
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${formatTime(time)} / ${formatTime(dur)}`;
      }

      // Keep looping while playing
      if (isPlayingRef.current) {
        rafIdRef.current = requestAnimationFrame(updateProgress);
      }
    };

    if (isPlaying) {
      rafIdRef.current = requestAnimationFrame(updateProgress);
    }

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isPlaying]);

  // Update progress when paused (from store state)
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  useEffect(() => {
    if (!isPlaying) {
      // When paused, sync from store state
      if (progressFillRef.current) {
        progressFillRef.current.style.width = `${progressPercent}%`;
      }
      if (timeDisplayRef.current) {
        timeDisplayRef.current.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
      }
    }
  }, [isPlaying, currentTime, duration, progressPercent]);

  // Reset progress bar to 0 when track changes or when buffering starts
  useEffect(() => {
    if (progressFillRef.current) {
      progressFillRef.current.style.width = '0%';
    }
    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = `${formatTime(0)} / ${formatTime(duration)}`;
    }
  }, [currentTrack?.id, isBuffering]);

  const isTrackFavorite = currentTrack ? isFavoriteTrack(currentTrack.id) : false;

  const handleToggleFavorite = async () => {
    if (!currentTrack) return;
    if (isTrackFavorite) {
      if (confirmOnUnlike) {
        const confirmed = await confirmUnlikeTrack(currentTrack.title);
        if (confirmed) {
          removeFavoriteTrack(currentTrack.id);
        }
      } else {
        removeFavoriteTrack(currentTrack.id);
      }
    } else {
      addFavoriteTrack(currentTrack);
    }
  };

  const handleShuffleToggle = () => {
    setShuffle(!shuffle);
  };

  const handleTitleClick = () => {
    if (currentTrack?.albumUrl) {
      navigate({ name: 'album', url: currentTrack.albumUrl });
    }
  };

  const handleArtistClick = () => {
    if (currentTrack?.bandUrl) {
      navigate({ name: 'artist', url: currentTrack.bandUrl });
    }
  };

  const handleArtClick = () => {
    // Navigate to where playback started from (playlist, artist page, album, etc.)
    const sourceRoute = useQueueStore.getState().getPlaybackSourceRoute();
    if (sourceRoute) {
      navigate(sourceRoute);
    } else if (currentTrack?.albumUrl) {
      // Fallback to album if no source route
      navigate({ name: 'album', url: currentTrack.albumUrl });
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Disable seeking during loading/buffering or when duration is not available
    if (!currentTrack || !duration || duration === 0 || isBuffering) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    onSeek?.(Math.max(0, Math.min(newTime, duration)));
  };

  return (
    <div className="relative shrink-0 liquid-glass-bar border-t border-white/5">
      {/* Progress bar - full width at top, grows on hover */}
      <div
        className={cn(
          'absolute top-0 left-0 right-0',
          'h-1.5 hover:h-2.5 hover:-mt-1',
          'bg-white/10',
          'transition-all duration-200 ease-out',
          // Disable interaction during loading
          (isBuffering || !duration || duration === 0)
            ? 'cursor-not-allowed opacity-50'
            : 'cursor-pointer'
        )}
        onClick={handleProgressClick}
      >
        {/* Progress fill */}
        <div
          ref={progressFillRef}
          className="h-full bg-rose shadow-sm shadow-rose/30 rounded-r-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Main player content - same height as header */}
      <div className={cn(LAYOUT_CLASSES.BAR_HEIGHT, 'px-4 flex items-center gap-4')}>
        {/* Left section - Track info */}
        <div className="flex items-center gap-2 w-64 lg:w-80 min-w-0">
        {currentTrack ? (
          <>
              {/* Heart button - LEFT of cover */}
              <HeartButton
                isFavorite={isTrackFavorite}
                onClick={handleToggleFavorite}
                size="sm"
                className="shrink-0"
              />

              {/* Album art */}
            <button
              onClick={handleArtClick}
              onContextMenu={handleTrackContextMenu}
              className={cn(
                  'w-12 h-12 rounded-md overflow-hidden shrink-0 bg-highlight-med shadow-lg relative',
                'transition-transform duration-200 hover:scale-105 cursor-pointer'
              )}
            >
              {currentTrack.artId && (
                <img
                  src={buildArtUrl(currentTrack.artId, ImageSizes.THUMB_100)}
                  alt={currentTrack.albumTitle || currentTrack.title}
                  className={cn(
                    'w-full h-full object-cover object-center transition-opacity duration-200',
                    isBuffering && 'opacity-50'
                  )}
                />
              )}
              {/* Buffering indicator */}
              {isBuffering && (
                <div className="absolute inset-0 flex items-center justify-center bg-base/30">
                    <Loader2 size={16} className="animate-spin text-rose" />
                </div>
              )}
            </button>

              {/* Title & Artist */}
            <div className="min-w-0 flex flex-col" onContextMenu={handleTrackContextMenu}>
              <button
                onClick={handleTitleClick}
                onContextMenu={handleTrackContextMenu}
                disabled={!currentTrack.albumUrl}
                className={cn(
                    'font-medium text-text text-sm truncate text-left',
                  'transition-colors duration-150',
                  currentTrack.albumUrl && 'hover:text-rose  cursor-pointer'
                )}
              >
                {getDisplayTitle(currentTrack)}
              </button>
              <button
                onClick={handleArtistClick}
                onContextMenu={handleTrackContextMenu}
                disabled={!currentTrack.bandUrl}
                className={cn(
                    'text-xs text-text/60 truncate text-left',
                  'transition-colors duration-150',
                  currentTrack.bandUrl && 'hover:text-text  cursor-pointer'
                )}
              >
                {currentTrack.artist || currentTrack.bandName}
              </button>
              {error && (
                <p className="text-xs text-love truncate">{error}</p>
              )}
            </div>
          </>
        ) : (
            <div className="text-text/50 text-sm pl-2">No track playing</div>
        )}
      </div>

        {/* Center section - Playback controls */}
        <div className="flex-1 flex items-center justify-center gap-1">
          <IconButton
            aria-label="Shuffle"
            size="sm"
            variant="ghost"
            onClick={handleShuffleToggle}
            className={cn(shuffle && 'text-rose hover:text-rose')}
          >
            <Shuffle size={18} />
          </IconButton>

          <IconButton
            aria-label="Previous"
            size="sm"
            onClick={playPrevious}
            disabled={!hasPrevious()}
          >
            <SkipBack size={20} />
          </IconButton>

          <IconButton
            aria-label={isPlaying ? 'Pause' : 'Play'}
            size="md"
            variant="solid"
            onClick={toggle}
            disabled={!currentTrack}
          >
            {isBuffering ? (
              <Loader2 size={22} className="animate-spin" />
            ) : isPlaying ? (
              <Pause size={22} />
            ) : (
              <Play size={22} className="ml-0.5" />
            )}
          </IconButton>

          <IconButton
            aria-label="Next"
            size="sm"
            onClick={playNext}
            disabled={!hasNext()}
          >
            <SkipForward size={20} />
          </IconButton>

          <IconButton
            aria-label="Repeat"
            size="sm"
            variant="ghost"
            onClick={toggleRepeat}
            className={cn(repeat !== 'off' && 'text-rose hover:text-rose')}
          >
            {repeat === 'track' ? <Repeat1 size={18} /> : <Repeat size={18} />}
          </IconButton>
        </div>

        {/* Right section - Time, Queue, Volume */}
        <div className="flex items-center gap-3 justify-end w-64 lg:w-80">
          {/* Time display */}
          <span ref={timeDisplayRef} className="text-xs text-text/70 tabular-nums whitespace-nowrap">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

        <IconButton
          aria-label="Queue"
          size="sm"
          onClick={toggleQueuePanel}
          className={cn(queuePanelOpen && 'text-rose hover:text-rose')}
        >
          <ListMusic size={18} />
        </IconButton>

        <VolumeControl
          volume={volume}
          isMuted={isMuted}
          onVolumeChange={setVolume}
          onToggleMute={toggleMute}
        />
        </div>
      </div>
    </div>
  );
}
