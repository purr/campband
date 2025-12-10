import { useState, useEffect } from 'react';
import { Play, Shuffle, Heart, ListPlus, Check, ExternalLink, Pencil, Trash2, Calendar, Clock, Pause, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTime, formatSmartDate } from '@/lib/utils/format';
import { Button, ImageBackdrop, Skeleton, TrackContextMenu, useTrackContextMenu, PlayingIndicator } from '@/components/ui';
import { useLibraryStore, useQueueStore, useRouterStore } from '@/lib/store';
import { buildArtUrl, ImageSizes } from '@/types';

// ============================================
// Shared Track Row Styles (single source of truth)
// ============================================

const TRACK_ROW = {
  // Grid columns: [cover/num, title, (album?), (dateAdded?), actions, duration]
  COLS_BASE: '40px 1fr 80px 56px',
  // Playlist: cover, title+artist, album, date added, actions, duration
  COLS_PLAYLIST: '40px minmax(200px, 1fr) minmax(120px, 0.6fr) 96px 80px 56px',
  // Row styling
  ROW_CLASS: 'px-4 py-2 rounded-lg min-h-[60px]',
  // First column (cover art or track number)
  FIRST_COL_SIZE: 'w-10 h-10',
} as const;

// ============================================
// Collection Header
// ============================================

export interface CollectionHeaderProps {
  /** Collection title */
  title: string;
  /** Type label (Album, Single, Playlist) */
  typeLabel: string;
  /** Cover art - URL string or React node for custom covers */
  cover: string | React.ReactNode;
  /** Subtitle - artist name for albums */
  subtitle?: string;
  /** Click handler for subtitle */
  onSubtitleClick?: () => void;
  /** Description (for playlists) */
  description?: string;
  /** Release date (for albums) */
  releaseDate?: string;
  /** Created date (for playlists) */
  createdAt?: Date;
  /** Track count */
  trackCount: number;
  /** Number of hidden/unlisted tracks */
  hiddenTrackCount?: number;
  /** Total duration in seconds */
  totalDuration: number;
  /** Whether this collection is favorited */
  isFavorite?: boolean;
  /** Callback when heart clicked - if undefined, no heart button shown */
  onFavoriteToggle?: () => void;
  /** Callback for play all */
  onPlayAll?: () => void;
  /** Callback for shuffle */
  onShuffleAll?: () => void;
  /** Callback for add to queue - if undefined, no queue button shown */
  onAddToQueue?: () => void;
  /** External URL (for Bandcamp link) */
  externalUrl?: string;
  /** Whether editable (for playlists) */
  isEditable?: boolean;
  /** Callback for edit */
  onEdit?: () => void;
  /** Callback for delete */
  onDelete?: () => void;
  /** Accent color for gradient backdrop */
  accentColor?: 'rose' | 'love' | 'iris' | 'foam' | 'pine';
}

export function CollectionHeader({
  title,
  typeLabel,
  cover,
  subtitle,
  onSubtitleClick,
  description,
  releaseDate,
  createdAt,
  trackCount,
  hiddenTrackCount,
  totalDuration,
  isFavorite,
  onFavoriteToggle,
  onPlayAll,
  onShuffleAll,
  onAddToQueue,
  externalUrl,
  isEditable,
  onEdit,
  onDelete,
  accentColor = 'rose',
}: CollectionHeaderProps) {
  const [showQueueCheck, setShowQueueCheck] = useState(false);
  const coverUrl = typeof cover === 'string' ? cover : undefined;

  const handleAddToQueue = () => {
    onAddToQueue?.();
    setShowQueueCheck(true);
  };

  useEffect(() => {
    if (showQueueCheck) {
      const timer = setTimeout(() => setShowQueueCheck(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [showQueueCheck]);

  // Format release date or created date
  const formattedDate = releaseDate
    ? new Date(releaseDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : createdAt
      ? createdAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : undefined;

  const dateLabel = releaseDate ? 'Released' : createdAt ? 'Created' : undefined;

  return (
    <div className="relative">
      {/* Backdrop - blurred image or gradient */}
      {coverUrl ? (
        <ImageBackdrop
          imageUrl={coverUrl}
          blur="3xl"
          scale={1.4}
          opacity={0.5}
          accentGlow={accentColor}
        />
      ) : (
        <div className={cn(
          'absolute inset-0 bg-gradient-to-b to-transparent',
          accentColor === 'love' && 'from-love/20',
          accentColor === 'rose' && 'from-rose/20',
          accentColor === 'iris' && 'from-iris/20',
          accentColor === 'foam' && 'from-foam/20',
          accentColor === 'pine' && 'from-pine/20',
        )} />
      )}

      {/* Content - EXACT same padding for all */}
      <div className="relative z-10 px-8 pt-8 pb-8">
        <div className="flex items-end gap-8">
          {/* Cover art */}
          <div className="w-56 h-56 rounded-lg overflow-hidden bg-surface shadow-2xl flex-shrink-0 ring-1 ring-white/10">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={title}
                className="w-full h-full object-cover"
              />
            ) : (
              cover
            )}
          </div>

          {/* Info */}
          <div className="flex-1 pb-2 min-w-0">
            {/* Type label with optional artist */}
            <p className="text-sm font-medium text-subtle tracking-wide mb-2 flex items-center gap-1.5">
              <span>{typeLabel}</span>
              {subtitle && (
                <>
                  <span>by</span>
                  <button
                    onClick={onSubtitleClick}
                    disabled={!onSubtitleClick}
                    className={cn(
                      'truncate max-w-[300px]',
                      'transition-colors duration-150',
                      onSubtitleClick && 'hover:text-text cursor-pointer'
                    )}
                  >
                    {subtitle}
                  </button>
                </>
              )}
            </p>
            <h1 className="text-4xl font-bold text-text mb-4 leading-tight truncate">
              {title}
            </h1>

            {/* Description (playlists) */}
            {description && (
              <p className="text-sm text-text/60 mb-4 line-clamp-2">{description}</p>
            )}

            {/* Meta info */}
            <div className="flex items-center gap-4 text-text/60 text-sm">
              {formattedDate && dateLabel && (
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} />
                  {dateLabel} {formattedDate}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Clock size={14} />
                {trackCount} {trackCount === 1 ? 'track' : 'tracks'} • {formatTime(totalDuration)}
              </span>
              {hiddenTrackCount && hiddenTrackCount > 0 && (
                <span className="flex items-center gap-1.5 text-subtle/70" title={`${hiddenTrackCount} hidden track${hiddenTrackCount > 1 ? 's' : ''} not available for streaming`}>
                  <EyeOff size={14} />
                  {hiddenTrackCount} hidden
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-6">
          <Button onClick={onPlayAll} disabled={trackCount === 0} className="gap-2">
            <Play size={18} fill="currentColor" />
            Play
          </Button>

          {trackCount > 1 && (
            <Button variant="secondary" onClick={onShuffleAll} className="gap-2">
              <Shuffle size={18} />
              Shuffle
            </Button>
          )}

          {/* Heart button */}
          {onFavoriteToggle && (
            <button
              onClick={onFavoriteToggle}
              className={cn(
                'p-3 rounded-full transition-all duration-200',
                'hover:bg-highlight-low active:scale-90',
                isFavorite ? 'text-love' : 'text-text/60 hover:text-love'
              )}
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart size={24} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
          )}

          {/* Add to queue button */}
          {onAddToQueue && (
            <button
              onClick={handleAddToQueue}
              className={cn(
                'p-3 rounded-full transition-all duration-200',
                'hover:bg-highlight-low active:scale-90',
                showQueueCheck ? 'text-foam' : 'text-text/60 hover:text-text'
              )}
              aria-label="Add all tracks to queue"
            >
              {showQueueCheck ? (
                <Check size={24} className="animate-scale-in" />
              ) : (
                <ListPlus size={24} />
              )}
            </button>
          )}

          {/* Edit/Delete for playlists */}
          {isEditable && (
            <>
              <button
                onClick={onEdit}
                className={cn(
                  'p-3 rounded-full transition-all duration-200',
                  'text-text/60 hover:text-text hover:bg-highlight-low active:scale-90'
                )}
                aria-label="Edit"
              >
                <Pencil size={20} />
              </button>
              <button
                onClick={onDelete}
                className={cn(
                  'p-3 rounded-full transition-all duration-200',
                  'text-text/60 hover:text-love hover:bg-highlight-low active:scale-90'
                )}
                aria-label="Delete"
              >
                <Trash2 size={20} />
              </button>
            </>
          )}

          {/* External link - liquid glass styled */}
          {externalUrl && (
            <a
              href={externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl',
                'text-xs font-medium',
                'bg-rose/15 text-rose border border-rose/20',
                'hover:bg-rose/25 hover:border-rose/30 hover:shadow-lg hover:shadow-rose/10',
                'transition-all duration-200'
              )}
            >
              <ExternalLink size={12} />
              Bandcamp
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function CollectionHeaderSkeleton() {
  return (
    <div className="px-8 pt-8 pb-8">
      <div className="flex items-end gap-8">
        <Skeleton className="w-56 h-56 rounded-lg" />
        <div className="flex-1 pb-2 space-y-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <Skeleton className="h-10 w-24 rounded-xl" />
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>
    </div>
  );
}

// ============================================
// Track List (for albums - no cover art per track)
// ============================================

export interface TrackListProps {
  tracks: TrackItem[];
  onTrackPlay?: (track: TrackItem, index: number) => void;
  currentTrackId?: number;
  isPlaying?: boolean;
}

export interface TrackItem {
  id: number;
  title: string;
  artist?: string;
  bandName?: string;
  bandUrl?: string;
  duration: number;
  streamUrl?: string;
  trackNum?: number;
}

export function TrackList({ tracks, onTrackPlay, currentTrackId, isPlaying }: TrackListProps) {
  const { isFavoriteTrack, addFavoriteTrack, removeFavoriteTrack } = useLibraryStore();
  const { addToQueue } = useQueueStore();
  const { state: contextMenuState, openMenu, closeMenu } = useTrackContextMenu();

  return (
    <div className="px-8 py-6">
      {/* Header */}
      <div
        className="grid gap-4 px-4 py-2 text-xs text-text/60 uppercase tracking-wider border-b border-highlight-low"
        style={{ gridTemplateColumns: TRACK_ROW.COLS_BASE }}
      >
        <span className="text-center">#</span>
        <span>Title</span>
        <span></span>
        <span className="text-right">Duration</span>
      </div>

      {/* Tracks */}
      <div className="divide-y divide-highlight-low/50">
        {tracks.map((track, index) => (
          <TrackListRow
            key={track.id}
            track={track}
            index={index}
            isCurrentTrack={currentTrackId === track.id}
            isPlaying={isPlaying && currentTrackId === track.id}
            isFavorite={isFavoriteTrack(track.id)}
            onPlay={() => onTrackPlay?.(track, index)}
            onFavorite={() => {
              if (isFavoriteTrack(track.id)) {
                removeFavoriteTrack(track.id);
              } else {
                addFavoriteTrack(track as any);
              }
            }}
            onAddToQueue={() => addToQueue(track as any)}
            onContextMenu={(e) => openMenu(e, track as any)}
          />
        ))}
      </div>

      {/* Context Menu */}
      {contextMenuState.isOpen && contextMenuState.track && (
        <TrackContextMenu
          position={contextMenuState.position}
          track={contextMenuState.track}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

interface TrackListRowProps {
  track: TrackItem;
  index: number;
  isCurrentTrack: boolean;
  isPlaying: boolean;
  isFavorite: boolean;
  onPlay: () => void;
  onFavorite: () => void;
  onAddToQueue: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function TrackListRow({
  track,
  index,
  isCurrentTrack,
  isPlaying,
  isFavorite,
  onPlay,
  onFavorite,
  onAddToQueue,
  onContextMenu,
}: TrackListRowProps) {
  const [showQueueCheck, setShowQueueCheck] = useState(false);
  const isStreamable = !!track.streamUrl;
  const { navigate } = useRouterStore();

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToQueue();
    setShowQueueCheck(true);
  };

  const handleArtistClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (track.bandUrl) {
      navigate({ name: 'artist', url: track.bandUrl });
    }
  };

  useEffect(() => {
    if (showQueueCheck) {
      const timer = setTimeout(() => setShowQueueCheck(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [showQueueCheck]);

  const artistName = track.artist || track.bandName;

  return (
    <div
      onContextMenu={onContextMenu}
      className={cn(
        'grid gap-4 items-center',
        TRACK_ROW.ROW_CLASS,
        'transition-colors',
        'hover:bg-highlight-low/50',
        'group',
        isCurrentTrack && 'bg-highlight-low',
        !isStreamable && 'opacity-50'
      )}
      style={{ gridTemplateColumns: TRACK_ROW.COLS_BASE }}
    >
      {/* Track number / Play indicator - match playlist cover size */}
      <div className={cn(TRACK_ROW.FIRST_COL_SIZE, 'flex items-center justify-center')}>
        <button
          onClick={onPlay}
          disabled={!isStreamable}
          className="w-full h-full flex items-center justify-center disabled:cursor-not-allowed"
        >
          {isCurrentTrack && isPlaying ? (
            <PlayingIndicator size="md" />
          ) : (
            <>
              <span className={cn(
                'text-sm tabular-nums',
                isCurrentTrack ? 'text-rose' : 'text-text/60',
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
      </div>

      {/* Title & Artist - always 2 lines for consistent height */}
      <div className="min-w-0">
        <button
          onClick={onPlay}
          disabled={!isStreamable}
          className="block w-full text-left disabled:cursor-not-allowed"
        >
          <p className={cn(
            'font-medium truncate',
            isCurrentTrack ? 'text-rose' : 'text-text'
          )}>
            {track.title}
          </p>
        </button>
        {artistName ? (
          <button
            onClick={handleArtistClick}
            disabled={!track.bandUrl}
            className={cn(
              'text-sm text-text/60 truncate text-left block w-full',
              'transition-colors duration-150',
              track.bandUrl && 'hover:text-text cursor-pointer'
            )}
          >
            {artistName}
          </button>
        ) : (
          <p className="text-sm text-text/60">&nbsp;</p>
        )}
      </div>

      {/* Action buttons (heart + queue) */}
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); onFavorite(); }}
          className={cn(
            'p-1.5 rounded-full transition-all duration-200',
            'hover:bg-highlight-med active:scale-90',
            'opacity-0 group-hover:opacity-100',
            isFavorite ? 'text-love opacity-100' : 'text-text/60 hover:text-love'
          )}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>

        <button
          onClick={handleAddToQueue}
          disabled={!isStreamable}
          className={cn(
            'p-1.5 rounded-full transition-all duration-200',
            'hover:bg-highlight-med active:scale-90',
            'opacity-0 group-hover:opacity-100',
            showQueueCheck ? 'text-foam opacity-100' : 'text-text/60 hover:text-text',
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
      <span className="text-sm text-text/60 tabular-nums text-right">
        {formatTime(track.duration)}
      </span>
    </div>
  );
}

export function TrackListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="px-8 py-6">
      <div
        className="grid gap-4 px-4 py-2 text-xs text-text/60 uppercase tracking-wider border-b border-highlight-low"
        style={{ gridTemplateColumns: TRACK_ROW.COLS_BASE }}
      >
        <span className="text-center">#</span>
        <span>Title</span>
        <span></span>
        <span className="text-right">Duration</span>
      </div>

      <div className="divide-y divide-highlight-low/50">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={cn('grid gap-4 items-center', TRACK_ROW.ROW_CLASS)}
            style={{ gridTemplateColumns: TRACK_ROW.COLS_BASE }}
          >
            <Skeleton className={cn(TRACK_ROW.FIRST_COL_SIZE, 'rounded')} />
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="w-16 h-4" />
            <Skeleton className="w-12 h-4" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Playlist Track List (with cover art & date added)
// ============================================

export interface PlaylistTrackItem extends TrackItem {
  artId?: number;
  albumTitle?: string;
  albumUrl?: string;
  bandUrl?: string;
  addedAt?: Date;
}

export interface PlaylistTrackListProps {
  tracks: PlaylistTrackItem[];
  onTrackPlay?: (track: PlaylistTrackItem, index: number) => void;
  currentTrackId?: number;
  isPlaying?: boolean;
}

export function PlaylistTrackList({
  tracks,
  onTrackPlay,
  currentTrackId,
  isPlaying,
}: PlaylistTrackListProps) {
  const { isFavoriteTrack, addFavoriteTrack, removeFavoriteTrack } = useLibraryStore();
  const { addToQueue } = useQueueStore();
  const { state: contextMenuState, openMenu, closeMenu } = useTrackContextMenu();

  return (
    <div className="px-8 py-6">
      {/* Header */}
      <div
        className="grid gap-4 px-4 py-2 text-xs text-text/60 uppercase tracking-wider border-b border-highlight-low"
        style={{ gridTemplateColumns: TRACK_ROW.COLS_PLAYLIST }}
      >
        <span></span>
        <span>Title</span>
        <span>Album</span>
        <span>Added</span>
        <span></span>
        <span className="text-right">Duration</span>
      </div>

      {/* Tracks */}
      <div className="divide-y divide-highlight-low/50">
        {tracks.map((track, index) => (
          <PlaylistTrackRow
            key={track.id}
            track={track}
            index={index}
            isCurrentTrack={currentTrackId === track.id}
            isPlaying={isPlaying && currentTrackId === track.id}
            isFavorite={isFavoriteTrack(track.id)}
            onPlay={() => onTrackPlay?.(track, index)}
            onFavorite={() => {
              if (isFavoriteTrack(track.id)) {
                removeFavoriteTrack(track.id);
              } else {
                addFavoriteTrack(track as any);
              }
            }}
            onAddToQueue={() => addToQueue(track as any)}
            onContextMenu={(e) => openMenu(e, track as any)}
          />
        ))}
      </div>

      {/* Context Menu */}
      {contextMenuState.isOpen && contextMenuState.track && (
        <TrackContextMenu
          position={contextMenuState.position}
          track={contextMenuState.track}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

interface PlaylistTrackRowProps {
  track: PlaylistTrackItem;
  index: number;
  isCurrentTrack: boolean;
  isPlaying: boolean;
  isFavorite: boolean;
  onPlay: () => void;
  onFavorite: () => void;
  onAddToQueue: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function PlaylistTrackRow({
  track,
  index,
  isCurrentTrack,
  isPlaying,
  isFavorite,
  onPlay,
  onFavorite,
  onAddToQueue,
  onContextMenu,
}: PlaylistTrackRowProps) {
  const [showQueueCheck, setShowQueueCheck] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const isStreamable = !!track.streamUrl;
  const { navigate } = useRouterStore();

  const handleAddToQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToQueue();
    setShowQueueCheck(true);
  };

  const handleArtistClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (track.bandUrl) {
      navigate({ name: 'artist', url: track.bandUrl });
    }
  };

  const handleAlbumClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (track.albumUrl) {
      navigate({ name: 'album', url: track.albumUrl });
    }
  };

  useEffect(() => {
    if (showQueueCheck) {
      const timer = setTimeout(() => setShowQueueCheck(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [showQueueCheck]);

  return (
    <div
      onContextMenu={onContextMenu}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={cn(
        'grid gap-4 items-center',
        TRACK_ROW.ROW_CLASS,
        'transition-colors',
        'hover:bg-highlight-low/50',
        'group',
        isCurrentTrack && 'bg-highlight-low',
        !isStreamable && 'opacity-50'
      )}
      style={{ gridTemplateColumns: TRACK_ROW.COLS_PLAYLIST }}
    >
      {/* Cover art with play button */}
      <div className={cn(TRACK_ROW.FIRST_COL_SIZE, 'flex items-center justify-center')}>
        <button
          onClick={onPlay}
          disabled={!isStreamable}
          className="relative w-full h-full rounded overflow-hidden bg-highlight-med flex-shrink-0 disabled:cursor-not-allowed group/cover"
        >
          {track.artId ? (
            <img
              src={buildArtUrl(track.artId, ImageSizes.THUMB_100)}
              alt={track.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text/60">
              <Play size={14} />
            </div>
          )}

          {/* Playing indicator overlay - always show when playing */}
          {isCurrentTrack && isPlaying ? (
            <div className="absolute inset-0 flex items-center justify-center bg-base/60 backdrop-blur-sm">
              <PlayingIndicator size="sm" />
            </div>
          ) : (
            /* Play overlay on hover (only when not playing) */
            <div className={cn(
              'absolute inset-0 flex items-center justify-center',
              'bg-base/60 backdrop-blur-sm',
              'transition-opacity duration-150',
              isHovering ? 'opacity-100' : 'opacity-0'
            )}>
              <Play size={18} fill="currentColor" className="text-text" />
            </div>
          )}
        </button>
      </div>

      {/* Title & Artist */}
      <div className="min-w-0">
        <button
          onClick={onPlay}
          disabled={!isStreamable}
          className="block w-full text-left disabled:cursor-not-allowed"
        >
          <p className={cn(
            'font-medium truncate',
            isCurrentTrack ? 'text-rose' : 'text-text'
          )}>
            {track.title}
          </p>
        </button>
        <button
          onClick={handleArtistClick}
          disabled={!track.bandUrl}
          className={cn(
            'text-sm text-text/60 truncate text-left block w-full',
            'transition-colors duration-150',
            track.bandUrl && 'hover:text-text cursor-pointer'
          )}
        >
          {track.artist || track.bandName || 'Unknown Artist'}
        </button>
      </div>

      {/* Album */}
      <button
        onClick={handleAlbumClick}
        disabled={!track.albumUrl}
        className={cn(
          'text-sm text-text/60 truncate text-left',
          'transition-colors duration-150',
          track.albumUrl && 'hover:text-text cursor-pointer'
        )}
      >
        {track.albumTitle || '—'}
      </button>

      {/* Date Added */}
      <span className="text-sm text-text/60 truncate">
        {track.addedAt ? formatSmartDate(track.addedAt) : '—'}
      </span>

      {/* Action buttons (heart + queue) */}
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); onFavorite(); }}
          className={cn(
            'p-1.5 rounded-full transition-all duration-200',
            'hover:bg-highlight-med active:scale-90',
            'opacity-0 group-hover:opacity-100',
            isFavorite ? 'text-love opacity-100' : 'text-text/60 hover:text-love'
          )}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>

        <button
          onClick={handleAddToQueue}
          disabled={!isStreamable}
          className={cn(
            'p-1.5 rounded-full transition-all duration-200',
            'hover:bg-highlight-med active:scale-90',
            'opacity-0 group-hover:opacity-100',
            showQueueCheck ? 'text-foam opacity-100' : 'text-text/60 hover:text-text',
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
      <span className="text-sm text-text/60 tabular-nums text-right">
        {formatTime(track.duration)}
      </span>
    </div>
  );
}

export function PlaylistTrackListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="px-8 py-6">
      <div
        className="grid gap-4 px-4 py-2 text-xs text-text/60 uppercase tracking-wider border-b border-highlight-low"
        style={{ gridTemplateColumns: TRACK_ROW.COLS_PLAYLIST }}
      >
        <span></span>
        <span>Title</span>
        <span>Album</span>
        <span>Added</span>
        <span></span>
        <span className="text-right">Duration</span>
      </div>

      <div className="divide-y divide-highlight-low/50">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={cn('grid gap-4 items-center', TRACK_ROW.ROW_CLASS)}
            style={{ gridTemplateColumns: TRACK_ROW.COLS_PLAYLIST }}
          >
            <Skeleton className={cn(TRACK_ROW.FIRST_COL_SIZE, 'rounded')} />
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="w-24 h-4" />
            <Skeleton className="w-20 h-4" />
            <Skeleton className="w-16 h-4" />
            <Skeleton className="w-12 h-4" />
          </div>
        ))}
      </div>
    </div>
  );
}

