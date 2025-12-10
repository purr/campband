import { useEffect, useState } from 'react';
import { User, Disc3, Music, Clock, Heart, Trash2, ChevronDown, ArrowUpDown, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatSmartDate, timePeriodLabels, type TimePeriod } from '@/lib/utils/format';
import { PageHeader } from '@/components/layout';
import { Skeleton, TrackRow } from '@/components/ui';
import { useLibraryStore, useRouterStore, useQueueStore, usePlayerStore, type SortOption, type HistoryGrouping } from '@/lib/store';
import { buildArtUrl, buildBioUrl, ImageSizes } from '@/types';
import type { FavoriteArtist, FavoriteAlbum, FavoriteTrack, HistoryEntry } from '@/lib/db';

type LibraryTab = 'artists' | 'albums' | 'tracks' | 'history';

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'recent', label: 'Recently Added' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'title', label: 'Title A-Z' },
  { value: 'artist', label: 'Artist A-Z' },
  { value: 'mostPlayed', label: 'Most Played' },
];

const historyGroupOptions: { value: HistoryGrouping; label: string }[] = [
  { value: 'period', label: 'By Period' },
  { value: 'none', label: 'All' },
];

export function LibraryPage() {
  const [activeTab, setActiveTab] = useState<LibraryTab>('artists');
  const {
    favoriteArtists,
    favoriteAlbums,
    favoriteTracks,
    history,
    isInitialized,
    init,
    removeFavoriteArtist,
    removeFavoriteAlbum,
    removeFavoriteTrack,
    addFavoriteTrack,
    isFavoriteTrack,
    clearHistory,
    // Sorting & Grouping
    trackSortBy,
    albumSortBy,
    artistSortBy,
    historyGrouping,
    setTrackSortBy,
    setAlbumSortBy,
    setArtistSortBy,
    setHistoryGrouping,
    getSortedTracks,
    getSortedAlbums,
    getSortedArtists,
    getGroupedHistory,
    getTrackPlayCount,
  } = useLibraryStore();
  const { navigate } = useRouterStore();
  const { setQueue, addToQueue } = useQueueStore();
  const { play } = usePlayerStore();

  // Initialize library on mount
  useEffect(() => {
    init();
  }, [init]);

  const tabs: { id: LibraryTab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'artists', label: 'Artists', icon: <User size={18} />, count: favoriteArtists.length },
    { id: 'albums', label: 'Albums', icon: <Disc3 size={18} />, count: favoriteAlbums.length },
    { id: 'tracks', label: 'Tracks', icon: <Music size={18} />, count: favoriteTracks.length },
    { id: 'history', label: 'History', icon: <Clock size={18} />, count: history.length },
  ];

  const handleArtistClick = (url: string) => {
    navigate({ name: 'artist', url });
  };

  const handleAlbumClick = (url: string) => {
    navigate({ name: 'album', url });
  };

  // Convert FavoriteTrack to playable Track format
  const toPlayableTrack = (track: FavoriteTrack) => ({
    id: track.id,
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    albumTitle: track.albumTitle,
    albumId: track.albumId,
    albumUrl: track.albumUrl,
    artId: track.artId,
    bandId: track.bandId,
    bandName: track.bandName,
    bandUrl: track.bandUrl,
    duration: track.duration,
    streamUrl: track.streamUrl,
    trackNum: 1,
    hasLyrics: false,
    streaming: true,
    isDownloadable: false,
  });

  // Convert HistoryEntry to track-like format for display
  const historyToTrack = (entry: HistoryEntry) => ({
    id: entry.itemId,
    title: entry.title,
    artist: entry.artist,
    artId: entry.artId,
    albumUrl: entry.albumUrl,
    bandUrl: entry.bandUrl,
    duration: 0, // History doesn't store duration
    streamUrl: undefined, // Can't play directly from history
  });

  const handleTrackPlay = (track: FavoriteTrack) => {
    if (track.streamUrl) {
      setQueue([toPlayableTrack(track)]);
      play();
    }
  };

  const handleAddToQueue = (track: FavoriteTrack) => {
    if (track.streamUrl) {
      addToQueue(toPlayableTrack(track));
    }
  };

  const handleToggleFavorite = (track: FavoriteTrack) => {
    if (isFavoriteTrack(track.id)) {
      removeFavoriteTrack(track.id);
    } else {
      addFavoriteTrack(toPlayableTrack(track));
    }
  };

  if (!isInitialized) {
    return (
      <div className="min-h-full">
        <PageHeader
          title={
            <>
              <Heart size={20} className="text-love" />
              Library
            </>
          }
        />
        <div className="p-8">
          <LibrarySkeleton />
        </div>
      </div>
    );
  }

  // Get current sort option for display
  const getCurrentSortLabel = () => {
    const sortBy = activeTab === 'tracks' ? trackSortBy : activeTab === 'albums' ? albumSortBy : artistSortBy;
    return sortOptions.find(o => o.value === sortBy)?.label || 'Sort';
  };

  return (
    <div className="min-h-full">
      {/* Header */}
      <PageHeader
        title={
          <>
            <Heart size={20} className="text-love" />
            Library
          </>
        }
        center={
          <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                  'flex items-center justify-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium',
                'transition-colors duration-200',
                activeTab === tab.id
                  ? 'bg-rose text-base'
                  : 'text-muted hover:text-text hover:bg-highlight-low'
              )}
            >
              {tab.icon}
              {tab.label}
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded-full min-w-[1.75rem] text-center tabular-nums',
                activeTab === tab.id ? 'bg-base/20' : 'bg-highlight-med'
              )}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
        }
      />

      {/* Content */}
      <div className="p-6">
        {/* Sorting/Grouping controls for each tab */}
        {activeTab !== 'history' && (
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm text-muted">
              {activeTab === 'artists' && `${favoriteArtists.length} artists`}
              {activeTab === 'albums' && `${favoriteAlbums.length} albums`}
              {activeTab === 'tracks' && `${favoriteTracks.length} tracks`}
            </span>
            <SortDropdown
              value={activeTab === 'tracks' ? trackSortBy : activeTab === 'albums' ? albumSortBy : artistSortBy}
              onChange={(value) => {
                if (activeTab === 'tracks') setTrackSortBy(value);
                else if (activeTab === 'albums') setAlbumSortBy(value);
                else setArtistSortBy(value);
              }}
              options={sortOptions.filter(o =>
                // mostPlayed only for tracks
                activeTab === 'tracks' || o.value !== 'mostPlayed'
              )}
            />
          </div>
        )}

        {activeTab === 'artists' && (
          <ArtistsGrid
            artists={getSortedArtists()}
            onArtistClick={handleArtistClick}
            onRemove={removeFavoriteArtist}
          />
        )}

        {activeTab === 'albums' && (
          <AlbumsGrid
            albums={getSortedAlbums()}
            onAlbumClick={handleAlbumClick}
            onArtistClick={handleArtistClick}
            onRemove={removeFavoriteAlbum}
          />
        )}

        {activeTab === 'tracks' && (
          favoriteTracks.length === 0 ? (
            <EmptyState message="No favorite tracks yet" icon={<Music size={48} />} />
          ) : (
            <div className="space-y-0.5">
              {getSortedTracks().map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  onPlay={() => handleTrackPlay(track)}
                  onTitleClick={() => track.albumUrl && handleAlbumClick(track.albumUrl)}
                  onArtistClick={() => track.bandUrl && handleArtistClick(track.bandUrl)}
                  onLike={() => handleToggleFavorite(track)}
                  onAddToQueue={() => handleAddToQueue(track)}
                  isLiked={true}
                  showLikeButton={true}
                  showQueueButton={true}
                  addedAt={track.addedAt}
                  playCount={getTrackPlayCount(track.id)}
                  showMeta={trackSortBy === 'mostPlayed' ? 'playCount' : 'addedAt'}
                />
              ))}
            </div>
          )
        )}

        {activeTab === 'history' && (
          <HistorySection
            history={history}
            groupedHistory={getGroupedHistory()}
            grouping={historyGrouping}
            onGroupingChange={setHistoryGrouping}
            onClear={clearHistory}
            onAlbumClick={handleAlbumClick}
            onArtistClick={handleArtistClick}
            isFavoriteTrack={isFavoriteTrack}
            removeFavoriteTrack={removeFavoriteTrack}
            getTrackPlayCount={getTrackPlayCount}
          />
        )}
      </div>
    </div>
  );
}

// ============================================
// Sort Dropdown
// ============================================

function SortDropdown({
  value,
  onChange,
  options,
}: {
  value: SortOption;
  onChange: (value: SortOption) => void;
  options: { value: SortOption; label: string }[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm',
          'bg-surface/80 hover:bg-highlight-low',
          'border border-highlight-low hover:border-highlight-med',
          'transition-all duration-200',
          isOpen && 'bg-highlight-low border-highlight-med'
        )}
      >
        <ArrowUpDown size={14} className="text-muted" />
        <span className="text-text">{options.find(o => o.value === value)?.label}</span>
        <ChevronDown size={14} className={cn('text-muted transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className={cn(
            'absolute right-0 top-full mt-1 z-20',
            'py-1 rounded-lg min-w-[160px]',
            'bg-surface/95 backdrop-blur-xl',
            'border border-highlight-low',
            'shadow-xl shadow-base/50',
            'animate-in fade-in slide-in-from-bottom-2 duration-150'
          )}>
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full px-3 py-2 text-sm text-left',
                  'hover:bg-highlight-low transition-colors',
                  value === option.value && 'text-rose bg-highlight-low/50'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// History Section with Grouping
// ============================================

function HistorySection({
  history,
  groupedHistory,
  grouping,
  onGroupingChange,
  onClear,
  onAlbumClick,
  onArtistClick,
  isFavoriteTrack,
  removeFavoriteTrack,
  getTrackPlayCount,
}: {
  history: HistoryEntry[];
  groupedHistory: Map<TimePeriod, HistoryEntry[]>;
  grouping: HistoryGrouping;
  onGroupingChange: (grouping: HistoryGrouping) => void;
  onClear: () => void;
  onAlbumClick: (url: string) => void;
  onArtistClick: (url: string) => void;
  isFavoriteTrack: (id: number) => boolean;
  removeFavoriteTrack: (id: number) => void;
  getTrackPlayCount: (id: number) => number;
}) {
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);

  if (history.length === 0) {
    return <EmptyState message="No listening history yet" icon={<Clock size={48} />} />;
  }

  const historyToTrack = (entry: HistoryEntry) => ({
    id: entry.itemId,
    title: entry.title,
    artist: entry.artist,
    artId: entry.artId,
    albumUrl: entry.albumUrl,
    bandUrl: entry.bandUrl,
    duration: 0,
    streamUrl: undefined,
  });

  const trackEntries = history.filter(e => e.type === 'track');

  return (
    <div>
      {/* Controls */}
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-muted">{trackEntries.length} plays</span>

        <div className="flex items-center gap-2">
          {/* Grouping dropdown */}
          <div className="relative">
            <button
              onClick={() => setGroupDropdownOpen(!groupDropdownOpen)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm',
                'bg-surface/80 hover:bg-highlight-low',
                'border border-highlight-low hover:border-highlight-med',
                'transition-all duration-200',
                groupDropdownOpen && 'bg-highlight-low border-highlight-med'
              )}
            >
              <Layers size={14} className="text-muted" />
              <span className="text-text">
                {historyGroupOptions.find(o => o.value === grouping)?.label}
              </span>
              <ChevronDown size={14} className={cn('text-muted transition-transform', groupDropdownOpen && 'rotate-180')} />
            </button>

            {groupDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setGroupDropdownOpen(false)} />
                <div className={cn(
                  'absolute right-0 top-full mt-1 z-20',
                  'py-1 rounded-lg min-w-[120px]',
                  'bg-surface/95 backdrop-blur-xl',
                  'border border-highlight-low',
                  'shadow-xl shadow-base/50',
                  'animate-in fade-in slide-in-from-bottom-2 duration-150'
                )}>
                  {historyGroupOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        onGroupingChange(option.value);
                        setGroupDropdownOpen(false);
                      }}
                      className={cn(
                        'w-full px-3 py-2 text-sm text-left',
                        'hover:bg-highlight-low transition-colors',
                        grouping === option.value && 'text-rose bg-highlight-low/50'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Clear button */}
          <button
            onClick={onClear}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted hover:text-love hover:bg-highlight-low transition-colors"
          >
            <Trash2 size={14} />
            Clear
          </button>
        </div>
      </div>

      {/* Grouped or flat list */}
      {grouping === 'period' ? (
        <div className="space-y-6">
          {Array.from(groupedHistory.entries()).map(([period, entries]) => {
            const trackEntriesInPeriod = entries.filter(e => e.type === 'track');
            if (trackEntriesInPeriod.length === 0) return null;

            return (
              <div key={period}>
                <h3 className="text-sm font-medium text-subtle mb-2 px-2">
                  {timePeriodLabels[period]}
                </h3>
                <div className="space-y-0.5">
                  {trackEntriesInPeriod.map((entry) => (
                    <TrackRow
                      key={entry.id}
                      track={historyToTrack(entry)}
                      onPlay={() => {}}
                      onTitleClick={() => entry.albumUrl && onAlbumClick(entry.albumUrl)}
                      onArtistClick={() => entry.bandUrl && onArtistClick(entry.bandUrl)}
                      onLike={() => {
                        if (isFavoriteTrack(entry.itemId)) {
                          removeFavoriteTrack(entry.itemId);
                        }
                      }}
                      isLiked={isFavoriteTrack(entry.itemId)}
                      showLikeButton={true}
                      showQueueButton={false}
                      timestamp={formatSmartDate(entry.playedAt)}
                      playCount={entry.playCount || getTrackPlayCount(entry.itemId)}
                      showMeta="playCount"
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-0.5">
          {trackEntries.map((entry) => (
            <TrackRow
              key={entry.id}
              track={historyToTrack(entry)}
              onPlay={() => {}}
              onTitleClick={() => entry.albumUrl && onAlbumClick(entry.albumUrl)}
              onArtistClick={() => entry.bandUrl && onArtistClick(entry.bandUrl)}
              onLike={() => {
                if (isFavoriteTrack(entry.itemId)) {
                  removeFavoriteTrack(entry.itemId);
                }
              }}
              isLiked={isFavoriteTrack(entry.itemId)}
              showLikeButton={true}
              showQueueButton={false}
              timestamp={formatSmartDate(entry.playedAt)}
              playCount={entry.playCount || getTrackPlayCount(entry.itemId)}
              showMeta="playCount"
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

function ArtistsGrid({
  artists,
  onArtistClick,
  onRemove
}: {
  artists: FavoriteArtist[];
  onArtistClick: (url: string) => void;
  onRemove: (id: number) => void;
}) {
  if (artists.length === 0) {
    return <EmptyState message="No favorite artists yet" icon={<User size={48} />} />;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
      {artists.map((artist) => (
        <div
          key={artist.id}
          className="group relative p-3 rounded-xl bg-surface/50 hover:bg-surface transition-all duration-200"
        >
          <button
            onClick={() => onArtistClick(artist.url)}
            className="w-full text-left"
          >
            <div className="aspect-square rounded-full overflow-hidden bg-highlight-med mb-3">
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
            <p className="text-xs text-muted/70 mt-1">{formatSmartDate(artist.addedAt)}</p>
          </button>

          <button
            onClick={() => onRemove(artist.id)}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-base/80 text-love opacity-0 group-hover:opacity-100 transition-all duration-200"
          >
            <Heart size={16} fill="currentColor" />
          </button>
        </div>
      ))}
    </div>
  );
}

function AlbumsGrid({
  albums,
  onAlbumClick,
  onArtistClick,
  onRemove,
}: {
  albums: FavoriteAlbum[];
  onAlbumClick: (url: string) => void;
  onArtistClick: (url: string) => void;
  onRemove: (id: number) => void;
}) {
  if (albums.length === 0) {
    return <EmptyState message="No favorite albums yet" icon={<Disc3 size={48} />} />;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
      {albums.map((album) => (
        <div
          key={album.id}
          className="group relative p-3 rounded-xl bg-surface/50 hover:bg-surface transition-all duration-200"
        >
          <button
            onClick={() => onAlbumClick(album.url)}
            className="w-full text-left"
          >
            <div className="aspect-square rounded-lg overflow-hidden bg-highlight-med mb-3 shadow-lg">
              <img
                src={buildArtUrl(album.artId, ImageSizes.MEDIUM_700)}
                alt={album.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>
            <p className="font-medium text-text truncate group-hover:text-rose transition-colors">
              {album.title}
            </p>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (album.bandUrl) onArtistClick(album.bandUrl);
            }}
            disabled={!album.bandUrl}
            className={cn(
              'text-sm text-muted truncate text-left w-full',
              'transition-colors duration-150',
              album.bandUrl && 'hover:text-text hover:underline underline-offset-2 cursor-pointer'
            )}
          >
            {album.artist}
          </button>
          <p className="text-xs text-muted/70 mt-1">{formatSmartDate(album.addedAt)}</p>

          <button
            onClick={() => onRemove(album.id)}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-base/80 text-love opacity-0 group-hover:opacity-100 transition-all duration-200"
          >
            <Heart size={16} fill="currentColor" />
          </button>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message, icon }: { message: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted">
      <div className="mb-4 opacity-50">{icon}</div>
      <p>{message}</p>
      <p className="text-sm mt-2">Start exploring to add favorites!</p>
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="p-3">
          <Skeleton className="aspect-square rounded-lg mb-3" />
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
