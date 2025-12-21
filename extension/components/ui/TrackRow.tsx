import { Play, Music } from 'lucide-react';
import { cn, getDisplayTitle } from '@/lib/utils';
import { formatTime, formatSmartDate } from '@/lib/utils';
import { buildArtUrl, ImageSizes } from '@/types';
import { useContextMenu } from './GlobalContextMenu';
import { HeartButton } from './HeartButton';
import { AddToQueueButton } from './AddToQueueButton';

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
  addedAt?: number; // Unix timestamp (ms)
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
  const { openTrackMenu } = useContextMenu();

  const handleContextMenu = (e: React.MouseEvent) => {
    // Create a track object that includes all necessary fields for context menu
    const trackData = {
      ...track,
      artist: track.artist || track.bandName,
    };
    openTrackMenu(e, trackData as any);
  };

  const canPlay = !!track.streamUrl;

  // Render metadata based on showMeta prop
  const renderMeta = () => {
    switch (showMeta) {
      case 'timestamp':
        return timestamp ? (
          <span className="text-xs text-muted shrink-0 min-w-12 text-right">{timestamp}</span>
        ) : null;
      case 'addedAt':
        return addedAt ? (
          <span className="text-xs text-muted shrink-0 min-w-16 text-right">{formatSmartDate(addedAt)}</span>
        ) : null;
      case 'playCount':
        return playCount !== undefined ? (
          <span className={cn(
            'text-xs shrink-0 min-w-16 text-right',
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
          'w-11 h-11 rounded overflow-hidden bg-highlight-med shrink-0 relative group/art',
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
          {getDisplayTitle(track)}
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
              <span className="shrink-0">•</span>
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
      <div className="flex items-center gap-2 shrink-0">
        {/* Duration - always render container for consistent spacing */}
        <span className="text-xs text-muted tabular-nums w-14 text-right">
          {track.duration > 0 ? formatTime(track.duration) : ''}
        </span>

        {/* Action buttons - fixed width container */}
        <div className="flex items-center gap-1 w-16 justify-end">
        {/* Like button */}
        {showLikeButton && onLike && (
            <HeartButton
              isFavorite={isLiked}
              onClick={onLike}
              size="sm"
              showOnGroupHover
            />
        )}

        {/* Add to queue button */}
          {showQueueButton && onAddToQueue && (
            <AddToQueueButton
              onClick={onAddToQueue}
              size="sm"
              disabled={!canPlay}
              showOnGroupHover
            />
        )}
        </div>
      </div>
    </div>
  );
}
