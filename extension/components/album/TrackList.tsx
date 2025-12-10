import { Play, Heart, ListPlus, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils';
import { Skeleton, PlayingIndicator } from '@/components/ui';
import { usePlayerStore, useQueueStore, useLibraryStore } from '@/lib/store';
import type { Track } from '@/types';

interface TrackListProps {
  tracks: Track[];
  onTrackPlay?: (track: Track, index: number) => void;
}

export function TrackList({ tracks, onTrackPlay }: TrackListProps) {
  const { currentTrack, isPlaying } = usePlayerStore();
  const { playTrackAt, queue, addToQueue } = useQueueStore();
  const { isFavoriteTrack, addFavoriteTrack, removeFavoriteTrack } = useLibraryStore();

  const handleTrackClick = (track: Track, index: number) => {
    // Check if this track is already in the current queue
    const queueIndex = queue.findIndex(t => t.id === track.id);
    if (queueIndex !== -1) {
      playTrackAt(queueIndex);
    } else {
      onTrackPlay?.(track, index);
    }
  };

  const handleFavoriteClick = (e: React.MouseEvent, track: Track) => {
    e.stopPropagation();
    if (isFavoriteTrack(track.id)) {
      removeFavoriteTrack(track.id);
    } else {
      addFavoriteTrack(track);
    }
  };

  return (
    <div className="px-8 py-6">
      {/* Header */}
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-2 text-xs text-muted uppercase tracking-wider border-b border-highlight-low">
        <span className="w-8 text-center">#</span>
        <span>Title</span>
        <span className="w-16"></span>
        <span>Duration</span>
        <span className="w-4"></span>
      </div>

      {/* Tracks */}
      <div className="divide-y divide-highlight-low/50">
        {tracks.map((track, index) => (
          <TrackRow
            key={track.id}
            track={track}
            index={index}
            isCurrentTrack={currentTrack?.id === track.id}
            isPlaying={isPlaying && currentTrack?.id === track.id}
            isFavorite={isFavoriteTrack(track.id)}
            onPlay={() => handleTrackClick(track, index)}
            onFavorite={(e) => handleFavoriteClick(e, track)}
            onAddToQueue={() => addToQueue(track)}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================
// Track Row Component
// ============================================

interface TrackRowProps {
  track: Track;
  index: number;
  isCurrentTrack: boolean;
  isPlaying: boolean;
  isFavorite: boolean;
  onPlay: () => void;
  onFavorite: (e: React.MouseEvent) => void;
  onAddToQueue: () => void;
}

function TrackRow({
  track,
  index,
  isCurrentTrack,
  isPlaying,
  isFavorite,
  onPlay,
  onFavorite,
  onAddToQueue,
}: TrackRowProps) {
  const [showQueueCheck, setShowQueueCheck] = useState(false);
  const isStreamable = !!track.streamUrl;

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToQueue();
    setShowQueueCheck(true);
  };

  useEffect(() => {
    if (showQueueCheck) {
      const timer = setTimeout(() => setShowQueueCheck(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [showQueueCheck]);

  return (
    <div
      className={cn(
        'grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center',
        'px-4 py-3 rounded-lg',
        'transition-colors',
        'hover:bg-highlight-low/50',
        'group',
        isCurrentTrack && 'bg-highlight-low',
        !isStreamable && 'opacity-50'
      )}
    >
      {/* Track number / Play indicator */}
      <button
        onClick={onPlay}
        disabled={!isStreamable}
        className="w-8 flex items-center justify-center disabled:cursor-not-allowed"
      >
        {isCurrentTrack && isPlaying ? (
          <PlayingIndicator size="md" />
        ) : (
          <>
            <span className={cn(
              'text-sm tabular-nums',
              isCurrentTrack ? 'text-rose' : 'text-muted',
              'group-hover:hidden'
            )}>
              {track.trackNum || index + 1}
            </span>
            <Play
              size={16}
              className={cn(
                'hidden group-hover:block',
                isCurrentTrack ? 'text-rose' : 'text-text'
              )}
              fill="currentColor"
            />
          </>
        )}
      </button>

      {/* Title & Artist */}
      <button
        onClick={onPlay}
        disabled={!isStreamable}
        className="min-w-0 text-left disabled:cursor-not-allowed"
      >
        <p className={cn(
          'font-medium truncate',
          isCurrentTrack ? 'text-rose' : 'text-text'
        )}>
          {track.title}
        </p>
        {track.artist && track.artist !== track.bandName && (
          <p className="text-sm text-muted truncate">
            {track.artist}
          </p>
        )}
      </button>

      {/* Action buttons (heart + queue) */}
      <div className="w-16 flex items-center justify-end gap-1">
        {/* Heart button */}
        <button
          onClick={onFavorite}
          className={cn(
            'p-1.5 rounded-full transition-all duration-200',
            'hover:bg-highlight-med active:scale-90',
            'opacity-0 group-hover:opacity-100',
            isFavorite ? 'text-love opacity-100' : 'text-muted hover:text-love'
          )}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>

        {/* Add to queue button */}
        <button
          onClick={handleAddToQueue}
          disabled={!isStreamable}
          className={cn(
            'p-1.5 rounded-full transition-all duration-200',
            'hover:bg-highlight-med active:scale-90',
            'opacity-0 group-hover:opacity-100',
            showQueueCheck ? 'text-foam opacity-100' : 'text-muted hover:text-text',
            !isStreamable && 'cursor-not-allowed'
          )}
          aria-label="Add to queue"
        >
          {showQueueCheck ? (
            <Check size={16} className="animate-scale-in" />
          ) : (
            <ListPlus size={16} />
          )}
        </button>
      </div>

      {/* Duration */}
      <span className="text-sm text-muted tabular-nums">
        {formatTime(track.duration)}
      </span>

      {/* Spacer for alignment */}
      <div className="w-4" />
    </div>
  );
}

export function TrackListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="px-8 py-6">
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-2 text-xs text-muted uppercase tracking-wider border-b border-highlight-low">
        <span className="w-8 text-center">#</span>
        <span>Title</span>
        <span className="w-16"></span>
        <span>Duration</span>
        <span className="w-4"></span>
      </div>

      <div className="divide-y divide-highlight-low/50">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 items-center px-4 py-3">
            <Skeleton className="w-8 h-4" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="w-16 h-4" />
            <Skeleton className="h-4 w-12" />
            <div className="w-4" />
          </div>
        ))}
      </div>
    </div>
  );
}
