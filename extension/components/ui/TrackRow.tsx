import { Play, Heart, ListPlus, Check, Music } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { formatTime, formatSmartDate, formatPlayCount } from '@/lib/utils';
import { buildArtUrl, ImageSizes } from '@/types';
import { useContextMenu } from './ContextMenu';

interface TrackRowProps {
  track: {
    id: number;
    title: string;
    artist?: string;
    bandName?: string;
    albumTitle?: string;
    albumId?: number;
    artId?: number;
    bandId?: number;
    duration: number;
    albumUrl?: string;
    bandUrl?: string;
    streamUrl?: string;
  };
  index?: number;
  onPlay: () => void;
  onTitleClick?: () => void;
  onArtistClick?: () => void;
  onAlbumClick?: () => void;
  onLike?: () => void;
  onAddToQueue?: () => void;
  isLiked?: boolean;
  showLikeButton?: boolean;
  showQueueButton?: boolean;
  timestamp?: string;
  addedAt?: Date;
  playCount?: number;
  showMeta?: 'timestamp' | 'addedAt' | 'playCount' | 'none';
}

export function TrackRow({
  track,
  index,
  onPlay,
  onTitleClick,
  onArtistClick,
  onAlbumClick,
  onLike,
  onAddToQueue,
  isLiked = false,
  showLikeButton = true,
  showQueueButton = true,
  timestamp,
  addedAt,
  playCount,
  showMeta = 'none',
}: TrackRowProps) {
  const [showQueueCheck, setShowQueueCheck] = useState(false);
  const { openMenu } = useContextMenu();

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToQueue?.();
    setShowQueueCheck(true);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    // Create a track object that includes all necessary fields
    const trackData = {
      ...track,
      artist: track.artist || track.bandName,
    };
    openMenu(trackData as any, e);
  };

  useEffect(() => {
    if (showQueueCheck) {
      const timer = setTimeout(() => setShowQueueCheck(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [showQueueCheck]);

  const canPlay = !!track.streamUrl;

  // Render metadata based on showMeta prop
  const renderMeta = () => {
    switch (showMeta) {
      case 'timestamp':
        return timestamp ? (
          <span className="text-xs text-muted flex-shrink-0 min-w-[3rem] text-right">{timestamp}</span>
        ) : null;
      case 'addedAt':
        return addedAt ? (
          <span className="text-xs text-muted flex-shrink-0 min-w-[4rem] text-right">{formatSmartDate(addedAt)}</span>
        ) : null;
      case 'playCount':
        return playCount !== undefined ? (
          <span className={cn(
            'text-xs flex-shrink-0 min-w-[4rem] text-right',
            playCount > 0 ? 'text-foam' : 'text-muted'
          )}>
            {playCount > 0 ? `${playCount}×` : '—'}
          </span>
        ) : null;
      default:
        return null;
    }
  };

  return (
    <div
      className="group flex items-center gap-3 p-2 rounded-lg hover:bg-surface transition-colors"
      onContextMenu={handleContextMenu}
    >
      {/* Art with play button */}
      <button
        onClick={onPlay}
        disabled={!canPlay}
        className={cn(
          'w-11 h-11 rounded overflow-hidden bg-highlight-med flex-shrink-0 relative group/art',
          !canPlay && 'opacity-50 cursor-not-allowed'
        )}
      >
        {track.artId ? (
          <img
            src={buildArtUrl(track.artId, ImageSizes.THUMB_100)}
            alt={track.title}
            className="w-full h-full object-cover object-center"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted">
            <Music size={18} />
          </div>
        )}
        {/* Play overlay */}
        {canPlay && (
          <div className="absolute inset-0 bg-base/60 flex items-center justify-center opacity-0 group-hover/art:opacity-100 transition-opacity">
            <Play size={18} fill="currentColor" className="text-text" />
          </div>
        )}
      </button>

      {/* Info - clickable title and artist */}
      <div className="flex-1 min-w-0">
        <button
          onClick={onTitleClick}
          disabled={!track.albumUrl}
          className={cn(
            'font-medium text-text truncate text-left block w-full text-sm',
            'transition-colors duration-150',
            track.albumUrl && 'hover:text-rose  cursor-pointer'
          )}
        >
          {track.title}
        </button>
        <div className="flex items-center gap-1 text-xs text-muted truncate">
          <button
            onClick={onArtistClick}
            disabled={!track.bandUrl}
            className={cn(
              'truncate text-left',
              'transition-colors duration-150',
              track.bandUrl && 'hover:text-text  cursor-pointer'
            )}
          >
            {track.artist}
          </button>
          {track.albumTitle && (
            <>
              <span className="flex-shrink-0">•</span>
              <button
                onClick={onAlbumClick || onTitleClick}
                disabled={!track.albumUrl}
                className={cn(
                  'truncate text-left',
                  'transition-colors duration-150',
                  track.albumUrl && 'hover:text-text  cursor-pointer'
                )}
              >
                {track.albumTitle}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Meta info (timestamp, addedAt, or playCount) */}
      {renderMeta()}

      {/* Right section - fixed width for consistent button positioning */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Duration - always render container for consistent spacing */}
        <span className="text-xs text-muted tabular-nums w-14 text-right">
          {track.duration > 0 ? formatTime(track.duration) : ''}
        </span>

        {/* Action buttons - fixed width container */}
        <div className="flex items-center gap-1 w-16 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Like button */}
        {showLikeButton && onLike && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLike();
            }}
            className={cn(
              'p-1.5 rounded-full transition-all duration-200',
              'hover:bg-highlight-low active:scale-90',
              isLiked ? 'text-love opacity-100' : 'text-muted hover:text-love'
            )}
            aria-label={isLiked ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} />
          </button>
        )}

        {/* Add to queue button */}
        {showQueueButton && onAddToQueue && canPlay && (
          <button
            onClick={handleAddToQueue}
            className={cn(
              'p-1.5 rounded-full transition-all duration-200',
              'hover:bg-highlight-low active:scale-90',
              showQueueCheck ? 'text-foam opacity-100' : 'text-muted hover:text-text'
            )}
            aria-label="Add to queue"
          >
            {showQueueCheck ? (
              <Check size={16} className="animate-scale-in" />
            ) : (
              <ListPlus size={16} />
            )}
          </button>
        )}
        </div>
      </div>
    </div>
  );
}
