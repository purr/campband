import { useState, useMemo, useCallback, useEffect } from 'react';
import { Play, Shuffle, Heart, ListPlus, Check, ExternalLink, Pencil, Trash2, Calendar, Clock, EyeOff, ChevronUp, ChevronDown } from 'lucide-react';
import { cn, useConfirmationState, toPlayableTrack } from '@/lib/utils';
import { formatTime, formatSmartDate } from '@/lib/utils/format';
import { Button, ImageBackdrop, Skeleton, PlayingIndicator, HeartButton, AddToQueueButton, useUnlikeConfirm, useContextMenu } from '@/components/ui';
import { useLibraryStore, useQueueStore, useRouterStore, useSettingsStore } from '@/lib/store';
import { buildArtUrl, ImageSizes } from '@/types';

// ============================================
// Responsive Column Breakpoints
// ============================================

// Hook to track container width for responsive columns
function useContainerWidth(containerRef: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(1200);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [containerRef]);

  return width;
}

// Breakpoints for responsive columns
// Order of hiding as page gets narrower: Added → Album → Duration
const BREAKPOINTS = {
  HIDE_ADDED: 750,    // Hide "Added" column first
  HIDE_ALBUM: 550,    // Hide "Album" column
  HIDE_DURATION: 400, // Hide "Duration" column (extreme narrow)
} as const;

// ============================================
// Sorting Types
// ============================================

export type SortField = 'title' | 'album' | 'added' | 'duration' | 'trackNum';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

// ============================================
// Shared Track Row Styles (single source of truth)
// ============================================

const TRACK_ROW = {
  // Row styling
  ROW_CLASS: 'px-4 py-2 rounded-lg min-h-[60px]',
  // First column (cover art or track number)
  FIRST_COL_SIZE: 'w-10 h-10',
} as const;

// Dynamic grid columns based on visible columns
function getGridColumns(showAlbum: boolean, showAdded: boolean, showDuration: boolean, isPlaylist: boolean): string {
  if (isPlaylist) {
    // Playlist: cover, title+artist, [album?], [added?], actions, [duration?]
    const cols = ['40px', 'minmax(200px, 1fr)'];
    if (showAlbum) cols.push('minmax(100px, 0.5fr)');
    if (showAdded) cols.push('80px');
    cols.push('80px'); // actions
    if (showDuration) cols.push('52px');
    return cols.join(' ');
  } else {
    // Album track list: num, title, actions, [duration?]
    const cols = ['40px', '1fr', '80px'];
    if (showDuration) cols.push('52px');
    return cols.join(' ');
  }
}

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
  const [showQueueCheck, triggerQueueCheck] = useConfirmationState();
  const coverUrl = typeof cover === 'string' ? cover : undefined;

  const handleAddToQueue = () => {
    onAddToQueue?.();
    triggerQueueCheck();
  };

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
  /** Enable sorting - pass initial sort config */
  sortable?: boolean;
  /** External sort control (optional - for controlled sorting) */
  sort?: SortConfig;
  onSortChange?: (sort: SortConfig) => void;
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
  // Additional fields needed for favoriting
  artId?: number;
  albumId?: number;
  albumTitle?: string;
  albumUrl?: string;
  bandId?: number;
}

export function TrackList({
  tracks,
  onTrackPlay,
  currentTrackId,
  isPlaying,
  sortable = false,
  sort: externalSort,
  onSortChange,
}: TrackListProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);
  const { isFavoriteTrack, addFavoriteTrack, removeFavoriteTrack } = useLibraryStore();
  const { addToQueue } = useQueueStore();
  const { openTrackMenu } = useContextMenu();
  const confirmOnUnlike = useSettingsStore((state) => state.app.confirmOnUnlike);
  const { confirmUnlikeTrack } = useUnlikeConfirm();

  // Internal sort state (used when not controlled externally)
  const [internalSort, setInternalSort] = useState<SortConfig>({ field: 'trackNum', direction: 'asc' });
  const sort = externalSort || internalSort;
  const setSort = onSortChange || setInternalSort;

  // Responsive columns
  const showDuration = width >= BREAKPOINTS.HIDE_DURATION;
  const gridColumns = getGridColumns(false, false, showDuration, false);

  // Sort tracks
  const sortedTracks = useMemo(() => {
    if (!sortable) return tracks;

    return [...tracks].sort((a, b) => {
      const dir = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'title':
          return dir * a.title.localeCompare(b.title);
        case 'duration':
          return dir * (a.duration - b.duration);
        case 'trackNum':
        default:
          return dir * ((a.trackNum || 0) - (b.trackNum || 0));
      }
    });
  }, [tracks, sort, sortable]);

  const handleSort = useCallback((field: SortField) => {
    if (!sortable) return;
    setSort({
      field,
      direction: sort.field === field && sort.direction === 'asc' ? 'desc' : 'asc',
    });
  }, [sort, sortable, setSort]);

  const handleToggleFavorite = async (track: TrackItem) => {
    if (isFavoriteTrack(track.id)) {
      if (confirmOnUnlike) {
        const confirmed = await confirmUnlikeTrack(track.title);
        if (confirmed) {
          removeFavoriteTrack(track.id);
        }
      } else {
        removeFavoriteTrack(track.id);
      }
    } else {
      addFavoriteTrack(toPlayableTrack(track));
    }
  };

  return (
    <div ref={containerRef} className="px-8 py-6">
      {/* Header */}
      <div
        className="grid gap-4 px-4 py-2 text-xs text-text/60 border-b border-highlight-low"
        style={{ gridTemplateColumns: gridColumns }}
      >
        <span className="text-center">#</span>
        <SortableHeader
          field="title"
          currentSort={sort}
          onSort={handleSort}
          sortable={sortable}
        >
          Title
        </SortableHeader>
        <span></span>
        {showDuration && (
          <SortableHeader
            field="duration"
            currentSort={sort}
            onSort={handleSort}
            sortable={sortable}
            align="right"
            title="Duration"
          >
            <Clock size={14} />
          </SortableHeader>
        )}
      </div>

      {/* Tracks */}
      <div>
        {sortedTracks.map((track, index) => (
          <TrackListRow
            key={track.id}
            track={track}
            index={index}
            isCurrentTrack={currentTrackId === track.id}
            isPlaying={isPlaying && currentTrackId === track.id}
            isFavorite={isFavoriteTrack(track.id)}
            onPlay={() => onTrackPlay?.(track, index)}
            onFavorite={() => handleToggleFavorite(track)}
            onAddToQueue={() => addToQueue(toPlayableTrack(track))}
            onContextMenu={(e) => openTrackMenu(e, track)}
            gridColumns={gridColumns}
            showDuration={showDuration}
          />
        ))}
      </div>
    </div>
  );
}

// Import React for useRef
import * as React from 'react';

// ============================================
// Sortable Header Component
// ============================================

interface SortableHeaderProps {
  field: SortField;
  /** Content to display (text or icon) */
  children: React.ReactNode;
  currentSort: SortConfig;
  onSort: (field: SortField) => void;
  sortable: boolean;
  align?: 'left' | 'right';
  title?: string;
}

function SortableHeader({
  field,
  children,
  currentSort,
  onSort,
  sortable,
  align = 'left',
  title
}: SortableHeaderProps) {
  const isActive = currentSort.field === field;

  if (!sortable) {
    return (
      <span
        className={cn('uppercase tracking-wider flex items-center', align === 'right' && 'justify-end')}
        title={title}
      >
        {children}
      </span>
    );
  }

  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        'flex items-center uppercase tracking-wider transition-colors',
        'hover:text-text',
        isActive && 'text-rose',
        align === 'right' && 'justify-end ml-auto'
      )}
      title={title}
    >
      {children}
      {/* Always reserve space for arrow to prevent layout shift */}
      <span className={cn('w-3 flex justify-center', !isActive && 'opacity-0')}>
        {isActive ? (
          currentSort.direction === 'asc'
            ? <ChevronUp size={10} />
            : <ChevronDown size={10} />
        ) : (
          <ChevronUp size={10} />
      )}
      </span>
    </button>
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
  gridColumns: string;
  showDuration: boolean;
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
  gridColumns,
  showDuration,
}: TrackListRowProps) {
  const isStreamable = !!track.streamUrl;
  const { navigate } = useRouterStore();

  const handleArtistClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (track.bandUrl) {
      navigate({ name: 'artist', url: track.bandUrl });
    }
  };

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
      style={{ gridTemplateColumns: gridColumns }}
    >
      {/* Track number / Play indicator */}
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
        <HeartButton
          isFavorite={isFavorite}
          onClick={onFavorite}
          size="sm"
          showOnGroupHover
        />
        <AddToQueueButton
          onClick={onAddToQueue}
          size="sm"
          disabled={!isStreamable}
          showOnGroupHover
        />
      </div>

      {/* Duration */}
      {showDuration && (
      <span className="text-sm text-text/60 tabular-nums text-right">
        {formatTime(track.duration)}
      </span>
      )}
    </div>
  );
}

export function TrackListSkeleton({ count = 8 }: { count?: number }) {
  const gridColumns = getGridColumns(false, false, true, false);

  return (
    <div className="px-8 py-6">
      <div
        className="grid gap-4 px-4 py-2 text-xs text-text/60 border-b border-highlight-low"
        style={{ gridTemplateColumns: gridColumns }}
      >
        <span className="text-center">#</span>
        <span className="uppercase tracking-wider">Title</span>
        <span></span>
        <span className="flex justify-end"><Clock size={14} /></span>
      </div>

      <div>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={cn('grid gap-4 items-center', TRACK_ROW.ROW_CLASS)}
            style={{ gridTemplateColumns: gridColumns }}
          >
            <Skeleton className={cn(TRACK_ROW.FIRST_COL_SIZE, 'rounded')} />
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="w-16 h-4" />
            <Skeleton className="w-10 h-4 ml-auto" />
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
  /** Enable sorting */
  sortable?: boolean;
  /** External sort control (optional) */
  sort?: SortConfig;
  onSortChange?: (sort: SortConfig) => void;
}

export function PlaylistTrackList({
  tracks,
  onTrackPlay,
  currentTrackId,
  isPlaying,
  sortable = true, // Playlists default to sortable
  sort: externalSort,
  onSortChange,
}: PlaylistTrackListProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);
  const { isFavoriteTrack, addFavoriteTrack, removeFavoriteTrack } = useLibraryStore();
  const { addToQueue } = useQueueStore();
  const { openTrackMenu } = useContextMenu();
  const confirmOnUnlike = useSettingsStore((state) => state.app.confirmOnUnlike);
  const { confirmUnlikeTrack } = useUnlikeConfirm();

  // Internal sort state
  const [internalSort, setInternalSort] = useState<SortConfig>({ field: 'added', direction: 'desc' });
  const sort = externalSort || internalSort;
  const setSort = onSortChange || setInternalSort;

  // Responsive columns - hide in order: Added → Album → Duration
  const showAdded = width >= BREAKPOINTS.HIDE_ADDED;
  const showAlbum = width >= BREAKPOINTS.HIDE_ALBUM;
  const showDuration = width >= BREAKPOINTS.HIDE_DURATION;
  const gridColumns = getGridColumns(showAlbum, showAdded, showDuration, true);

  // Sort tracks
  const sortedTracks = useMemo(() => {
    if (!sortable) return tracks;

    return [...tracks].sort((a, b) => {
      const dir = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'title':
          return dir * a.title.localeCompare(b.title);
        case 'album':
          return dir * (a.albumTitle || '').localeCompare(b.albumTitle || '');
        case 'added':
          const aTime = a.addedAt?.getTime() || 0;
          const bTime = b.addedAt?.getTime() || 0;
          return dir * (aTime - bTime);
        case 'duration':
          return dir * (a.duration - b.duration);
        default:
          return 0;
      }
    });
  }, [tracks, sort, sortable]);

  const handleSort = useCallback((field: SortField) => {
    if (!sortable) return;
    setSort({
      field,
      direction: sort.field === field && sort.direction === 'asc' ? 'desc' : 'asc',
    });
  }, [sort, sortable, setSort]);

  const handleToggleFavorite = async (track: PlaylistTrackItem) => {
    if (isFavoriteTrack(track.id)) {
      if (confirmOnUnlike) {
        const confirmed = await confirmUnlikeTrack(track.title);
        if (confirmed) {
          removeFavoriteTrack(track.id);
        }
      } else {
        removeFavoriteTrack(track.id);
      }
    } else {
      addFavoriteTrack(toPlayableTrack(track));
    }
  };

  return (
    <div ref={containerRef} className="px-8 py-6">
      {/* Header */}
      <div
        className="grid gap-4 px-4 py-2 text-xs text-text/60 border-b border-highlight-low"
        style={{ gridTemplateColumns: gridColumns }}
      >
        <span></span>
        <SortableHeader
          field="title"
          currentSort={sort}
          onSort={handleSort}
          sortable={sortable}
        >
          Title
        </SortableHeader>
        {showAlbum && (
          <SortableHeader
            field="album"
            currentSort={sort}
            onSort={handleSort}
            sortable={sortable}
          >
            Album
          </SortableHeader>
        )}
        {showAdded && (
          <SortableHeader
            field="added"
            currentSort={sort}
            onSort={handleSort}
            sortable={sortable}
          >
            Added
          </SortableHeader>
        )}
        <span></span>
        {showDuration && (
          <SortableHeader
            field="duration"
            currentSort={sort}
            onSort={handleSort}
            sortable={sortable}
            align="right"
            title="Duration"
          >
            <Clock size={14} />
          </SortableHeader>
        )}
      </div>

      {/* Tracks */}
      <div>
        {sortedTracks.map((track, index) => (
          <PlaylistTrackRow
            key={track.id}
            track={track}
            index={index}
            isCurrentTrack={currentTrackId === track.id}
            isPlaying={isPlaying && currentTrackId === track.id}
            isFavorite={isFavoriteTrack(track.id)}
            onPlay={() => onTrackPlay?.(track, index)}
            onFavorite={() => handleToggleFavorite(track)}
            onAddToQueue={() => addToQueue(toPlayableTrack(track))}
            onContextMenu={(e) => openTrackMenu(e, track)}
            gridColumns={gridColumns}
            showAlbum={showAlbum}
            showAdded={showAdded}
            showDuration={showDuration}
          />
        ))}
      </div>
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
  gridColumns: string;
  showAlbum: boolean;
  showAdded: boolean;
  showDuration: boolean;
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
  gridColumns,
  showAlbum,
  showAdded,
  showDuration,
}: PlaylistTrackRowProps) {
  const [isHovering, setIsHovering] = useState(false);
  const isStreamable = !!track.streamUrl;
  const { navigate } = useRouterStore();

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
      style={{ gridTemplateColumns: gridColumns }}
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
      {showAlbum && (
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
      )}

      {/* Date Added */}
      {showAdded && (
      <span className="text-sm text-text/60 truncate">
        {track.addedAt ? formatSmartDate(track.addedAt) : '—'}
      </span>
      )}

      {/* Action buttons (heart + queue) */}
      <div className="flex items-center justify-end gap-1">
        <HeartButton
          isFavorite={isFavorite}
          onClick={onFavorite}
          size="sm"
          showOnGroupHover
        />
        <AddToQueueButton
          onClick={onAddToQueue}
          size="sm"
          disabled={!isStreamable}
          showOnGroupHover
        />
      </div>

      {/* Duration */}
      {showDuration && (
      <span className="text-sm text-text/60 tabular-nums text-right">
        {formatTime(track.duration)}
      </span>
      )}
    </div>
  );
}

export function PlaylistTrackListSkeleton({ count = 8 }: { count?: number }) {
  // Show all columns in skeleton (full width assumed)
  const gridColumns = getGridColumns(true, true, true, true);

  return (
    <div className="px-8 py-6">
      <div
        className="grid gap-4 px-4 py-2 text-xs text-text/60 border-b border-highlight-low"
        style={{ gridTemplateColumns: gridColumns }}
      >
        <span></span>
        <span className="uppercase tracking-wider">Title</span>
        <span className="uppercase tracking-wider">Album</span>
        <span className="uppercase tracking-wider">Added</span>
        <span></span>
        <span className="flex justify-end"><Clock size={14} /></span>
      </div>

      <div>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={cn('grid gap-4 items-center', TRACK_ROW.ROW_CLASS)}
            style={{ gridTemplateColumns: gridColumns }}
          >
            <Skeleton className={cn(TRACK_ROW.FIRST_COL_SIZE, 'rounded')} />
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="w-24 h-4" />
            <Skeleton className="w-16 h-4" />
            <Skeleton className="w-16 h-4" />
            <Skeleton className="w-10 h-4 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

