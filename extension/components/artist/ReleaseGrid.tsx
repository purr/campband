import { Play, Disc3, Music, Calendar, ListMusic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton, useContextMenu } from '@/components/ui';
import type { DiscographyItem } from '@/types';
import { getArtworkUrl, ImageSizes } from '@/types';

type ViewMode = 'grid' | 'list';

interface ReleaseGridProps {
  releases: DiscographyItem[];
  viewMode?: ViewMode;
  /** Band info to include in context menu (for proper liking) */
  bandInfo?: {
    id: number;
    name: string;
    url: string;
  };
  onReleaseClick?: (release: DiscographyItem) => void;
  onReleasePlay?: (release: DiscographyItem) => void;
}

export function ReleaseGrid({ releases, viewMode = 'grid', bandInfo, onReleaseClick, onReleasePlay }: ReleaseGridProps) {
  const { openAlbumMenu } = useContextMenu();

  const handleContextMenu = (e: React.MouseEvent, release: DiscographyItem) => {
    openAlbumMenu(e, {
      id: release.itemId,
      title: release.title,
      // Use band name from bandInfo (passed from artist page) or fall back to release data
      artist: bandInfo?.name || release.bandName || release.artistOverride || '',
      url: release.url,
      artId: release.artId,
      // Include band info for proper favoriting
      bandId: bandInfo?.id || release.bandId,
      bandUrl: bandInfo?.url,
      releaseDate: release.releaseDate,
    });
  };

  if (releases.length === 0) {
    return (
      <div className="text-center py-12 text-muted">
        No releases found
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div className="space-y-1">
        {releases.map((release) => (
          <ReleaseListItem
            key={`${release.itemType}-${release.itemId}`}
            release={release}
            onClick={() => onReleaseClick?.(release)}
            onPlay={() => onReleasePlay?.(release)}
            onContextMenu={(e) => handleContextMenu(e, release)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
      {releases.map((release) => (
        <ReleaseCard
          key={`${release.itemType}-${release.itemId}`}
          release={release}
          onClick={() => onReleaseClick?.(release)}
          onPlay={() => onReleasePlay?.(release)}
          onContextMenu={(e) => handleContextMenu(e, release)}
        />
      ))}
    </div>
  );
}

interface ReleaseCardProps {
  release: DiscographyItem;
  onClick?: () => void;
  onPlay?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

function ReleaseCard({ release, onClick, onPlay, onContextMenu }: ReleaseCardProps) {
  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onPlay?.();
  };

  const handleCardClick = () => {
    onClick?.();
  };

  return (
    <div
      className={cn(
        'group p-3 rounded-xl cursor-pointer',
        'bg-surface/50 hover:bg-surface',
        'transition-all duration-300'
      )}
      onClick={handleCardClick}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      {/* Cover art */}
      <div className="relative aspect-square mb-3 rounded-lg overflow-hidden bg-highlight-med shadow-lg">
        {(() => {
          const artUrl = getArtworkUrl({
            artId: release.artId,
            artUrl: release.artUrl,
            size: ImageSizes.MEDIUM_700,
          });
          return artUrl ? (
          <img
              src={artUrl}
            alt={release.title}
              className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted">
            {release.itemType === 'album' ? <Disc3 size={48} /> : <Music size={48} />}
          </div>
          );
        })()}

        {/* Play button overlay */}
        <div className={cn(
          'absolute inset-0 flex items-center justify-center',
          'bg-base/60 opacity-0 group-hover:opacity-100',
          'transition-opacity duration-200'
        )}>
          <button
            onClick={handlePlayClick}
            className={cn(
              'w-14 h-14 rounded-full bg-rose text-base',
              'flex items-center justify-center',
              'transform scale-90 group-hover:scale-100',
              'transition-transform duration-200',
              'shadow-xl hover:bg-rose/90',
              'focus-ring'
            )}
            aria-label={`Play ${release.title}`}
          >
            <Play size={24} fill="currentColor" className="ml-1" />
          </button>
        </div>

        {/* Type badge */}
        <div className={cn(
          'absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs',
          'bg-base/80 backdrop-blur-sm',
          release.itemType === 'album' ? 'text-iris' : 'text-foam'
        )}>
          {release.itemType === 'album' ? 'Album' : 'Track'}
        </div>
      </div>

      {/* Text section - fixed height for consistent card sizes */}
      <div className="min-h-[3rem] text-left">
        <p className="font-medium text-text truncate group-hover:text-rose transition-colors leading-tight">
          {release.title}
        </p>
        <p className="text-sm text-muted truncate leading-tight mt-0.5">
          {release.artistOverride || <span className="invisible">-</span>}
        </p>
      </div>
    </div>
  );
}

// ============================================
// List Item Component
// ============================================

interface ReleaseListItemProps {
  release: DiscographyItem;
  onClick?: () => void;
  onPlay?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

function ReleaseListItem({ release, onClick, onPlay, onContextMenu }: ReleaseListItemProps) {
  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onPlay?.();
  };

  const artUrl = getArtworkUrl({
    artId: release.artId,
    artUrl: release.artUrl,
    size: ImageSizes.THUMB_100,
  });

  return (
    <div
      className={cn(
        'group flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer',
        'hover:bg-surface/80 transition-colors duration-200'
      )}
      onClick={onClick}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      {/* Cover Art with Play Button */}
      <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-highlight-med flex-shrink-0 shadow-lg">
        {artUrl ? (
          <img
            src={artUrl}
            alt={release.title}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted">
            {release.itemType === 'album' ? <Disc3 size={24} /> : <Music size={24} />}
          </div>
        )}

        {/* Play Button Overlay */}
        <div className={cn(
          'absolute inset-0 flex items-center justify-center',
          'bg-base/60 opacity-0 group-hover:opacity-100',
          'transition-opacity duration-200'
        )}>
          <button
            onClick={handlePlayClick}
            className={cn(
              'w-8 h-8 rounded-full bg-rose text-base',
              'flex items-center justify-center',
              'hover:bg-rose/90 transition-colors'
            )}
            aria-label={`Play ${release.title}`}
          >
            <Play size={14} fill="currentColor" className="ml-0.5" />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-text truncate group-hover:text-rose transition-colors">
          {release.title}
        </p>
        {release.artistOverride && (
          <p className="text-sm text-muted truncate">
            {release.artistOverride}
          </p>
        )}
      </div>

      {/* Type Badge */}
      <div className={cn(
        'hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs',
        'bg-surface border border-highlight-low',
        release.itemType === 'album' ? 'text-iris' : 'text-foam'
      )}>
        {release.itemType === 'album' ? <Disc3 size={12} /> : <Music size={12} />}
        {release.itemType === 'album' ? 'Album' : 'Track'}
      </div>

      {/* Track Count (for albums) */}
      {release.itemType === 'album' && release.trackCount && (
        <div className="hidden md:flex items-center gap-1.5 text-sm text-muted">
          <ListMusic size={14} />
          {release.trackCount}
        </div>
      )}

      {/* Release Date */}
      {release.releaseDate && (
        <div className="hidden lg:flex items-center gap-1.5 text-sm text-muted min-w-[100px]">
          <Calendar size={14} />
          {release.releaseDate}
        </div>
      )}
    </div>
  );
}

// ============================================
// Skeletons
// ============================================

export function ReleaseGridSkeleton({ count = 12, viewMode = 'grid' }: { count?: number; viewMode?: ViewMode }) {
  if (viewMode === 'list') {
    return (
      <div className="space-y-1">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="w-14 h-14 rounded-lg" />
            <div className="flex-1">
              <Skeleton className="h-4 w-48 mb-2" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-3">
          <Skeleton className="aspect-square rounded-lg mb-3" />
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
