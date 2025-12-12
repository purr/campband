import { useRef, useState, useEffect } from 'react';
import { X, Play, Trash2, ListX, GripVertical, Repeat, Repeat1, Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils';
import { IconButton, PlayingIndicator } from '@/components/ui';
import { useQueueStore, usePlayerStore, useUIStore, useRouterStore } from '@/lib/store';
import { useSmoothScroll } from '@/hooks/useSmoothScroll';
import { buildArtUrl, ImageSizes } from '@/types';

export function QueuePanel() {
  const { queuePanelOpen, setQueuePanelOpen } = useUIStore();
  const {
    queue,
    currentIndex,
    removeFromQueue,
    moveTrack,
    clearQueue,
    playTrackAt,
    shuffle,
    setShuffle,
  } = useQueueStore();
  const { isPlaying, repeat, toggleRepeat } = usePlayerStore();
  const { navigate } = useRouterStore();

  // Scroll state for fade indicators
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  // Smooth scroll for queue list
  useSmoothScroll(scrollRef);

  // Drag state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Check scroll position
  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;

    setCanScrollUp(el.scrollTop > 5);
    setCanScrollDown(el.scrollTop < el.scrollHeight - el.clientHeight - 5);
  };

  // Update scroll state when queue changes or panel opens
  useEffect(() => {
    if (queuePanelOpen) {
      const timer = setTimeout(updateScrollState, 50);
      return () => clearTimeout(timer);
    }
  }, [queuePanelOpen, queue.length, currentIndex]);

  // Click outside to close
  useEffect(() => {
    if (!queuePanelOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Don't close if clicking on the queue button itself (let toggle handle it)
      if (target.closest('[aria-label="Queue"]')) {
        return;
      }

      if (panelRef.current && !panelRef.current.contains(target)) {
        setQueuePanelOpen(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [queuePanelOpen, setQueuePanelOpen]);

  // Navigation handlers
  const handleTitleClick = (albumUrl?: string) => {
    if (albumUrl) {
      navigate({ name: 'album', url: albumUrl });
      setQueuePanelOpen(false);
    }
  };

  const handleArtistClick = (bandUrl?: string) => {
    if (bandUrl) {
      navigate({ name: 'artist', url: bandUrl });
      setQueuePanelOpen(false);
    }
  };

  // Drag handlers
  const handleDragStart = (index: number) => {
    if (index === currentIndex) return;
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (index === currentIndex || draggedIndex === null) return;
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      moveTrack(draggedIndex, dragOverIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Queue: now playing + upcoming tracks only
  const nowPlaying = queue[currentIndex];
  const nextUp = queue.slice(currentIndex + 1);
  const upcomingCount = nextUp.length;

  return (
    <div
      ref={panelRef}
      className={cn(
        'fixed right-4 bottom-24 z-50',
        'w-80',
        'liquid-glass-glow rounded-2xl',
        'transition-all duration-300 ease-out',
        'origin-bottom-right',
        queuePanelOpen
          ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
          : 'opacity-0 translate-y-4 scale-95 pointer-events-none'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-text">Queue</h2>

          {/* Playback Mode Indicators */}
          <div className="flex items-center gap-1">
            {/* Shuffle Button */}
            <button
              onClick={() => setShuffle(!shuffle)}
              className={cn(
                'p-1.5 rounded-md transition-all duration-200',
                shuffle
                  ? 'text-rose bg-rose/15 hover:bg-rose/25'
                  : 'text-text/40 hover:text-text/70 hover:bg-white/5'
              )}
              title={shuffle ? 'Shuffle on' : 'Shuffle off'}
            >
              <Shuffle size={14} />
            </button>

            {/* Repeat Button */}
            <button
              onClick={toggleRepeat}
              className={cn(
                'p-1.5 rounded-md transition-all duration-200',
                repeat !== 'off'
                  ? 'text-rose bg-rose/15 hover:bg-rose/25'
                  : 'text-text/40 hover:text-text/70 hover:bg-white/5'
              )}
              title={
                repeat === 'off' ? 'Repeat off' :
                repeat === 'all' ? 'Repeat all' :
                'Repeat track'
              }
            >
              {repeat === 'track' ? <Repeat1 size={14} /> : <Repeat size={14} />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {queue.length > 0 && (
            <button
              onClick={clearQueue}
              className="flex items-center gap-1 px-2 py-1 text-xs text-text/60 hover:text-love rounded transition-colors cursor-pointer"
            >
              <ListX size={12} />
              Clear
            </button>
          )}
          <IconButton
            aria-label="Close queue"
            size="sm"
            onClick={() => setQueuePanelOpen(false)}
          >
            <X size={16} />
          </IconButton>
        </div>
      </div>


      {/* Content */}
      <div className="relative">
        {/* Top fade - transparent gradient */}
        <div
          className={cn(
            'absolute top-0 left-0 right-2 h-8 z-10',
            'bg-gradient-to-b from-base/40 via-base/20 to-transparent',
            'pointer-events-none transition-opacity duration-200',
            canScrollUp ? 'opacity-100' : 'opacity-0'
          )}
        />

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          onScroll={updateScrollState}
          className="overflow-y-auto overscroll-contain scroll-smooth scrollbar-thin"
          style={{ maxHeight: 'calc(70vh - 120px)' }}
        >
          {queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-text/60">
              <ListX size={32} className="mb-3 opacity-50" />
              <p className="text-sm">Queue is empty</p>
              <p className="text-xs mt-1 text-center">Play some tracks to add them here</p>
            </div>
          ) : (
            <div className="py-2">
              {/* Now Playing */}
              {nowPlaying && (
                <div className="px-3 py-1">
                  <h3 className="text-[10px] font-medium text-text/60 uppercase tracking-wider mb-1.5 px-1">
                    Now Playing {repeat === 'track' && <span className="text-rose">· Looping</span>}
                  </h3>
                  <QueueTrackItem
                    track={nowPlaying}
                    index={currentIndex}
                    isCurrentTrack={true}
                    isPlaying={isPlaying}
                    canDrag={false}
                    canRemove={false}
                    onPlay={() => {}}
                    onRemove={() => {}}
                    onTitleClick={() => handleTitleClick(nowPlaying.albumUrl)}
                    onArtistClick={() => handleArtistClick(nowPlaying.bandUrl)}
                  />
                </div>
              )}

              {/* Next Up - dimmed when looping single track */}
              {nextUp.length > 0 && (
                <div className={cn(
                  'px-3 py-1 mt-1 transition-opacity duration-300',
                  repeat === 'track' && 'opacity-30'
                )}>
                  <h3 className="text-[10px] font-medium text-text/60 uppercase tracking-wider mb-1.5 px-1">
                    Next Up ({nextUp.length})
                  </h3>
                  <div className="space-y-0.5">
                    {nextUp.map((track, idx) => {
                      const actualIndex = currentIndex + 1 + idx;
                      const isDragging = draggedIndex === actualIndex;
                      const isDragOver = dragOverIndex === actualIndex;

                      return (
                        <QueueTrackItem
                          key={`${track.id}-${actualIndex}`}
                          track={track}
                          index={actualIndex}
                          isCurrentTrack={false}
                          isPlaying={false}
                          canDrag={true}
                          canRemove={true}
                          isDragging={isDragging}
                          isDragOver={isDragOver}
                          onPlay={() => playTrackAt(actualIndex)}
                          onRemove={() => removeFromQueue(actualIndex)}
                          onTitleClick={() => handleTitleClick(track.albumUrl)}
                          onArtistClick={() => handleArtistClick(track.bandUrl)}
                          onDragStart={() => handleDragStart(actualIndex)}
                          onDragOver={(e) => handleDragOver(e, actualIndex)}
                          onDragEnd={handleDragEnd}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty next up state */}
              {nextUp.length === 0 && nowPlaying && (
                <div className="px-3 py-4 text-center">
                  <p className="text-xs text-text/60">
                    {repeat === 'track' ? 'Looping current track' : 'No more tracks in queue'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom fade - transparent gradient */}
        <div
          className={cn(
            'absolute bottom-0 left-0 right-2 h-8 z-10',
            'bg-gradient-to-t from-base/40 via-base/20 to-transparent',
            'pointer-events-none transition-opacity duration-200',
            canScrollDown ? 'opacity-100' : 'opacity-0'
          )}
        />
      </div>

      {/* Footer */}
      {queue.length > 0 && (
        <div className="px-4 py-2.5 border-t border-white/5 text-[10px] text-text/60">
          {upcomingCount > 0 ? (
            <>{upcomingCount} {upcomingCount === 1 ? 'track' : 'tracks'} up next • {formatTime(nextUp.reduce((acc, t) => acc + t.duration, 0))}</>
          ) : (
            <>Playing last track</>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Queue Track Item
// ============================================

interface QueueTrackItemProps {
  track: {
    id: number;
    title: string;
    artist?: string;
    bandName?: string;
    artId?: number;
    duration: number;
    albumUrl?: string;
    bandUrl?: string;
  };
  index: number;
  isCurrentTrack: boolean;
  isPlaying: boolean;
  canDrag: boolean;
  canRemove: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  onPlay: () => void;
  onRemove: () => void;
  onTitleClick?: () => void;
  onArtistClick?: () => void;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

function QueueTrackItem({
  track,
  isCurrentTrack,
  isPlaying,
  canDrag,
  canRemove,
  isDragging,
  isDragOver,
  onPlay,
  onRemove,
  onTitleClick,
  onArtistClick,
  onDragStart,
  onDragOver,
  onDragEnd,
}: QueueTrackItemProps) {
  return (
    <div
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={cn(
        'flex items-center gap-1.5 px-1.5 py-1.5 rounded-xl group',
        'transition-all duration-150',
        'hover:bg-white/5',
        isCurrentTrack && 'bg-white/8',
        isDragging && 'opacity-40',
        isDragOver && 'bg-rose/15 ring-1 ring-rose/30'
      )}
    >
      {/* Drag handle */}
      {canDrag ? (
        <div className="w-5 flex items-center justify-center cursor-grab active:cursor-grabbing text-text/60 opacity-0 group-hover:opacity-60 transition-opacity">
          <GripVertical size={12} />
        </div>
      ) : (
        <div className="w-5" />
      )}

      {/* Art - click to play */}
      <button
        onClick={onPlay}
        className="w-8 h-8 rounded overflow-hidden bg-highlight-med flex-shrink-0 relative group/play"
      >
        {track.artId ? (
          <img
            src={buildArtUrl(track.artId, ImageSizes.THUMB_100)}
            alt={track.title}
            className="w-full h-full object-cover object-center"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text/60 text-xs">
            ♪
          </div>
        )}

        {/* Play overlay */}
        {!isCurrentTrack && (
          <div className="absolute inset-0 bg-base/60 flex items-center justify-center opacity-0 group-hover/play:opacity-100 transition-opacity">
            <Play size={12} fill="currentColor" className="text-text" />
          </div>
        )}

        {/* Playing indicator */}
        {isCurrentTrack && isPlaying && (
          <div className="absolute inset-0 bg-base/60 flex items-center justify-center">
            <PlayingIndicator size="sm" />
          </div>
        )}
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <button
          onClick={onTitleClick}
          disabled={!track.albumUrl}
          className={cn(
            'text-xs font-medium truncate text-left block w-full',
            'transition-colors duration-150',
            isCurrentTrack ? 'text-rose' : 'text-text',
            track.albumUrl && ' cursor-pointer'
          )}
        >
          {track.title}
        </button>
        <button
          onClick={onArtistClick}
          disabled={!track.bandUrl}
          className={cn(
            'text-[10px] text-text/60 truncate text-left block w-full',
            'transition-colors duration-150',
            track.bandUrl && 'hover:text-text  cursor-pointer'
          )}
        >
          {track.artist || track.bandName}
        </button>
      </div>

      {/* Duration */}
      <span className="text-[10px] text-text/60 tabular-nums">
        {formatTime(track.duration)}
      </span>

      {/* Remove button */}
      {canRemove ? (
        <button
          onClick={onRemove}
          className="p-1 text-text/60 hover:text-love opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
          aria-label="Remove from queue"
        >
          <Trash2 size={12} />
        </button>
      ) : (
        <div className="w-6" />
      )}
    </div>
  );
}
