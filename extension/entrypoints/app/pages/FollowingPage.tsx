import { useEffect, useState } from 'react';
import { User, Grid3X3, List, Heart, MapPin, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatSmartDate } from '@/lib/utils/format';
import { PageHeader } from '@/components/layout';
import { Skeleton, Dropdown, type DropdownOption, EmptyState, useUnlikeConfirm, useContextMenu } from '@/components/ui';
import { useLibraryStore, useRouterStore, useUIStore, useSettingsStore } from '@/lib/store';
import { buildBioUrl, ImageSizes } from '@/types';
import type { FavoriteArtist } from '@/lib/db';

type SortOption = 'recent' | 'oldest' | 'name';

const sortOptions: DropdownOption<SortOption>[] = [
  { value: 'recent', label: 'Recently Added' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name', label: 'Name A-Z' },
];

export function FollowingPage() {
  const {
    favoriteArtists,
    isInitialized,
    init,
    removeFavoriteArtist,
  } = useLibraryStore();
  const { navigate } = useRouterStore();
  const { followingViewMode, setFollowingViewMode } = useUIStore();
  const confirmOnUnlike = useSettingsStore((state) => state.app.confirmOnUnlike);
  const { confirmUnfollowArtist } = useUnlikeConfirm();
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const { openArtistMenu } = useContextMenu();

  const handleUnfollow = async (artistId: number) => {
    const artist = favoriteArtists.find(a => a.id === artistId);
    if (!artist) return;

    if (confirmOnUnlike) {
      const confirmed = await confirmUnfollowArtist(artist.name);
      if (confirmed) {
        removeFavoriteArtist(artistId);
      }
    } else {
      removeFavoriteArtist(artistId);
    }
  };

  useEffect(() => {
    init();
  }, [init]);

  const handleArtistClick = (url: string) => {
    navigate({ name: 'artist', url });
  };

  const getSortedArtists = (): FavoriteArtist[] => {
    const artists = [...favoriteArtists];
    switch (sortBy) {
      case 'recent':
        return artists.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
      case 'oldest':
        return artists.sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());
      case 'name':
        return artists.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return artists;
    }
  };

  if (!isInitialized) {
    return (
      <div className="min-h-full">
        <Header
          count={0}
          viewMode={followingViewMode}
          onViewModeChange={setFollowingViewMode}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />
        <div className="p-6">
          <LoadingSkeleton viewMode={followingViewMode} />
        </div>
      </div>
    );
  }

  const sortedArtists = getSortedArtists();

  return (
    <div className="min-h-full">
      <Header
        count={favoriteArtists.length}
        viewMode={followingViewMode}
        onViewModeChange={setFollowingViewMode}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      <div className="p-6">
        {favoriteArtists.length === 0 ? (
          <EmptyState
            icon={<User size={48} />}
            title="No artists followed yet"
            description="When you follow artists, they'll appear here. Start by searching for your favorite artists!"
          />
        ) : followingViewMode === 'grid' ? (
          <ArtistsGrid
            artists={sortedArtists}
            onArtistClick={handleArtistClick}
            onRemove={handleUnfollow}
            onContextMenu={openArtistMenu}
          />
        ) : (
          <ArtistsList
            artists={sortedArtists}
            onArtistClick={handleArtistClick}
            onRemove={handleUnfollow}
            onContextMenu={openArtistMenu}
          />
        )}
      </div>
    </div>
  );
}

// ============================================
// Header Component
// ============================================

interface HeaderProps {
  count: number;
  viewMode: 'grid' | 'list' | 'detailed';
  onViewModeChange: (mode: 'grid' | 'list' | 'detailed') => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
}

function Header({ count, viewMode, onViewModeChange, sortBy, onSortChange }: HeaderProps) {
  return (
    <PageHeader
      title={
        <>
          <User size={20} className="text-foam" />
          Following
        </>
      }
      subtitle={`${count} artists`}
      right={
        <>
          <Dropdown
            value={sortBy}
            options={sortOptions}
            onChange={onSortChange}
            icon={<ArrowUpDown size={14} />}
          />
          <div className="flex items-center bg-surface/60 backdrop-blur-sm rounded-lg border border-highlight-low p-0.5">
            <button
              onClick={() => onViewModeChange('grid')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                viewMode === 'grid'
                  ? 'bg-rose text-base'
                  : 'text-muted hover:text-text'
              )}
              aria-label="Grid view"
            >
              <Grid3X3 size={16} />
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                viewMode === 'list'
                  ? 'bg-rose text-base'
                  : 'text-muted hover:text-text'
              )}
              aria-label="List view"
            >
              <List size={16} />
            </button>
          </div>
        </>
      }
    />
  );
}

// ============================================
// Grid View
// ============================================

interface ArtistsGridProps {
  artists: FavoriteArtist[];
  onArtistClick: (url: string) => void;
  onRemove: (id: number) => void;
  onContextMenu: (e: React.MouseEvent, artist: { id: number; name: string; url: string; imageId?: number; location?: string }) => void;
}

function ArtistsGrid({ artists, onArtistClick, onRemove, onContextMenu }: ArtistsGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
      {artists.map((artist) => (
        <div
          key={artist.id}
          className="group relative p-3 rounded-xl bg-surface/50 hover:bg-surface transition-all duration-200"
          onContextMenu={(e) => onContextMenu(e, {
            id: artist.id,
            name: artist.name,
            url: artist.url,
            imageId: artist.imageId,
            location: artist.location,
          })}
        >
          <button
            onClick={() => onArtistClick(artist.url)}
            className="w-full text-left"
          >
            <div className="aspect-square rounded-full overflow-hidden bg-highlight-med mb-3 shadow-lg">
              {artist.imageId ? (
                <img
                  src={buildBioUrl(artist.imageId, ImageSizes.MEDIUM_700)}
                  alt={artist.name}
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted">
                  <User size={48} />
                </div>
              )}
            </div>
            <p className="font-medium text-text truncate group-hover:text-rose transition-colors">
              {artist.name}
            </p>
            {artist.location && (
              <p className="text-sm text-muted truncate">{artist.location}</p>
            )}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(artist.id);
            }}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-base/80 text-love opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-base"
            aria-label="Unfollow"
          >
            <Heart size={16} fill="currentColor" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ============================================
// List View
// ============================================

interface ArtistsListProps {
  artists: FavoriteArtist[];
  onArtistClick: (url: string) => void;
  onRemove: (id: number) => void;
  onContextMenu: (e: React.MouseEvent, artist: { id: number; name: string; url: string; imageId?: number; location?: string }) => void;
}

function ArtistsList({ artists, onArtistClick, onRemove, onContextMenu }: ArtistsListProps) {
  return (
    <div className="space-y-1">
      {artists.map((artist) => (
        <div
          key={artist.id}
          className={cn(
            'group flex items-center gap-4 px-4 py-3 rounded-xl',
            'hover:bg-surface/80 transition-colors duration-200'
          )}
          onContextMenu={(e) => onContextMenu(e, {
            id: artist.id,
            name: artist.name,
            url: artist.url,
            imageId: artist.imageId,
            location: artist.location,
          })}
        >
          {/* Avatar */}
          <button
            onClick={() => onArtistClick(artist.url)}
            className="flex-shrink-0"
          >
            <div className="w-14 h-14 rounded-full overflow-hidden bg-highlight-med shadow-lg">
              {artist.imageId ? (
                <img
                  src={buildBioUrl(artist.imageId, ImageSizes.MEDIUM_700)}
                  alt={artist.name}
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted">
                  <User size={24} />
                </div>
              )}
            </div>
          </button>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <button
              onClick={() => onArtistClick(artist.url)}
              className="text-left w-full"
            >
              <p className="font-medium text-text truncate group-hover:text-rose transition-colors">
                {artist.name}
              </p>
              {artist.location && (
                <p className="text-sm text-muted truncate flex items-center gap-1">
                  <MapPin size={12} />
                  {artist.location}
                </p>
              )}
            </button>
          </div>

          {/* Added Date */}
          <div className="hidden sm:block text-sm text-muted whitespace-nowrap">
            {formatSmartDate(artist.addedAt)}
          </div>

          {/* Unfollow Button */}
          <button
            onClick={() => onRemove(artist.id)}
            className={cn(
              'p-2 rounded-full text-love',
              'opacity-0 group-hover:opacity-100',
              'hover:bg-love/10 transition-all duration-200'
            )}
            aria-label="Unfollow"
          >
            <Heart size={18} fill="currentColor" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ============================================
// Loading State
// ============================================

function LoadingSkeleton({ viewMode }: { viewMode: 'grid' | 'list' | 'detailed' }) {
  if (viewMode === 'list') {
    return (
      <div className="space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="w-14 h-14 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-40 mb-2" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="p-3">
          <Skeleton className="aspect-square rounded-full mb-3" />
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

