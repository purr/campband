import { useEffect, useState } from 'react';
import { Loader2, Grid3X3, List } from 'lucide-react';
import { cn, linkifyText } from '@/lib/utils';
import { PageHeader } from '@/components/layout';
import { ArtistHeader, ArtistHeaderSkeleton, ReleaseGrid, ReleaseGridSkeleton } from '@/components/artist';
import { useRouterStore, useArtistStore, useQueueStore, usePlayerStore, useUIStore } from '@/lib/store';
import type { DiscographyItem, Track } from '@/types';

interface ArtistPageProps {
  artistUrl: string;
}

export function ArtistPage({ artistUrl }: ArtistPageProps) {
  const { navigate } = useRouterStore();
  const {
    currentArtist,
    isLoading,
    error,
    loadArtist,
    loadRelease,
  } = useArtistStore();
  const { setQueue, setShuffle } = useQueueStore();
  const { play } = usePlayerStore();
  const { setQueuePanelOpen, artistDiscographyViewMode, setArtistDiscographyViewMode } = useUIStore();
  const [isLoadingAll, setIsLoadingAll] = useState(false);

  // Load artist on mount
  useEffect(() => {
    loadArtist(artistUrl);
  }, [artistUrl, loadArtist]);

  const handleReleaseClick = (release: DiscographyItem) => {
    navigate({ name: 'album', url: release.url });
  };

  const handleReleasePlay = async (release: DiscographyItem) => {
    // Load the release to get tracks
    const loaded = await loadRelease(release.url, release.itemId);
    if (loaded && loaded.tracks.length > 0) {
      // Set queue and play
      const streamableTracks = loaded.tracks.filter(t => t.streamUrl);
      if (streamableTracks.length > 0) {
        setQueue(streamableTracks);
        play();
      }
    }
  };

  /**
   * Play All - loads multiple releases and queues all tracks
   * Like Spotify, we load a batch of releases to avoid long waits
   */
  const handlePlayAll = async (shouldShuffle = false) => {
    if (!currentArtist || isLoadingAll) return;

    setIsLoadingAll(true);

    try {
      const allTracks: Track[] = [];
      const releasesToLoad = currentArtist.releases.slice(0, 10); // Load first 10 releases

      // Load releases in parallel (but with some batching to not overwhelm)
      const batchSize = 3;
      for (let i = 0; i < releasesToLoad.length; i += batchSize) {
        const batch = releasesToLoad.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(release => loadRelease(release.url, release.itemId))
        );

        for (const album of results) {
          if (album) {
            const streamable = album.tracks.filter(t => t.streamUrl);
            allTracks.push(...streamable);
          }
        }

        // Start playing as soon as we have some tracks
        if (i === 0 && allTracks.length > 0) {
          // If shuffle requested, shuffle the tracks before setting queue
          if (shouldShuffle) {
            shuffleArray(allTracks);
          }
          setQueue(allTracks);
          play();
          // Open queue panel to show what's playing
          setQueuePanelOpen(true);
        }
      }

      // Update queue with all loaded tracks
      if (allTracks.length > 0) {
        if (shouldShuffle) {
          // Keep first track (now playing), shuffle the rest
          const [first, ...rest] = allTracks;
          shuffleArray(rest);
          setQueue([first, ...rest]);
        } else {
          setQueue(allTracks);
        }

        // Update shuffle state in queue store
        setShuffle(shouldShuffle);
      }
    } catch (err) {
      console.error('[ArtistPage] Failed to load all tracks:', err);
    } finally {
      setIsLoadingAll(false);
    }
  };

  /**
   * Shuffle All - plays all tracks in shuffled order
   */
  const handleShuffleAll = () => {
    handlePlayAll(true);
  };

  if (error) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-8">
        <p className="text-love text-lg mb-2">Failed to load artist</p>
        <p className="text-muted mb-6">{error}</p>
        <button
          onClick={() => loadArtist(artistUrl)}
          className="px-4 py-2 rounded-lg bg-surface hover:bg-highlight-low text-text transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full pb-8">
      {/* Navigation */}
      <PageHeader
        title={currentArtist?.band.name}
        right={
          isLoadingAll ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" />
              Loading tracks...
            </div>
          ) : undefined
        }
      />

      {/* Header */}
      {isLoading || !currentArtist ? (
        <ArtistHeaderSkeleton />
      ) : (
        <ArtistHeader
          band={currentArtist.band}
          releases={currentArtist.releases}
          isLoading={isLoadingAll}
          onPlayAll={() => handlePlayAll(false)}
          onShuffleAll={handleShuffleAll}
        />
      )}

      {/* Bio */}
      {currentArtist?.band.bio && (
        <div className="px-8 py-6">
          <h3 className="text-lg font-semibold text-text mb-3">About</h3>
          <p className="text-subtle leading-relaxed max-w-3xl whitespace-pre-line">
            {linkifyText(currentArtist.band.bio)}
          </p>
        </div>
      )}

      {/* Releases */}
      <div className="px-8 py-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-text">
            Discography
            {currentArtist && (
              <span className="text-muted font-normal ml-2">
                ({currentArtist.releases.length})
              </span>
            )}
          </h3>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-surface/80 rounded-lg border border-highlight-low p-0.5">
            <button
              onClick={() => setArtistDiscographyViewMode('grid')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                artistDiscographyViewMode === 'grid'
                  ? 'bg-rose text-base'
                  : 'text-muted hover:text-text'
              )}
              aria-label="Grid view"
            >
              <Grid3X3 size={16} />
            </button>
            <button
              onClick={() => setArtistDiscographyViewMode('list')}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                artistDiscographyViewMode === 'list'
                  ? 'bg-rose text-base'
                  : 'text-muted hover:text-text'
              )}
              aria-label="List view"
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {isLoading || !currentArtist ? (
          <ReleaseGridSkeleton count={12} viewMode={artistDiscographyViewMode} />
        ) : (
          <ReleaseGrid
            releases={currentArtist.releases}
            viewMode={artistDiscographyViewMode}
            bandInfo={{
              id: currentArtist.band.id,
              name: currentArtist.band.name,
              url: currentArtist.band.url,
            }}
            onReleaseClick={handleReleaseClick}
            onReleasePlay={handleReleasePlay}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Fisher-Yates shuffle (in-place)
 */
function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
