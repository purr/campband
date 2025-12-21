import { useEffect, useState } from 'react';
import { Grid3X3, List, ChevronDown, ChevronUp } from 'lucide-react';
import { cn, linkifyText, shuffleTracks } from '@/lib/utils';
import { PageHeader } from '@/components/layout';
import { ArtistHeader, ArtistHeaderSkeleton, ReleaseGrid, ReleaseGridSkeleton } from '@/components/artist';
import { useRouterStore, useArtistStore, useQueueStore, usePlayerStore, useUIStore } from '@/lib/store';
import type { DiscographyItem } from '@/types';

interface ArtistPageProps {
  artistUrl: string;
}

export function ArtistPage({ artistUrl }: ArtistPageProps) {
  const { navigate, setPageTitle } = useRouterStore();
  const {
    currentArtist,
    isLoading,
    error,
    loadArtist,
    loadRelease,
    loadArtistReleasesForPlayback,
  } = useArtistStore();
  const { setQueue, setShuffle } = useQueueStore();
  const { play } = usePlayerStore();
  const { setQueuePanelOpen, artistDiscographyViewMode, setArtistDiscographyViewMode } = useUIStore();
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);

  // Load artist on mount (uses cache if available)
  useEffect(() => {
    loadArtist(artistUrl);
  }, [artistUrl, loadArtist]);

  // Set page title when artist loads
  useEffect(() => {
    if (currentArtist?.band?.name) {
      setPageTitle(currentArtist.band.name);
    }
    return () => setPageTitle(null);
  }, [currentArtist?.band?.name, setPageTitle]);

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
   * Play All - loads ALL releases and queues all tracks
   * Uses caching for speed - subsequent plays are instant
   */
  const handlePlayAll = async (shouldShuffle = false) => {
    if (!currentArtist || isLoadingAll) return;

    setIsLoadingAll(true);

    try {
      // Load ALL releases using cached function (no limit)
      const allTracks = await loadArtistReleasesForPlayback(artistUrl);

      if (allTracks.length > 0) {
        // Shuffle if requested
        const tracksToPlay = shouldShuffle ? shuffleTracks(allTracks) : allTracks;

        setQueue(tracksToPlay);
        setShuffle(shouldShuffle);
        play();
        setQueuePanelOpen(true);
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
      <PageHeader />

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
      {currentArtist?.band.bio && (() => {
        // Clean bio text - remove Bandcamp's "...more" and "...less" patterns
        const cleanBio = currentArtist.band.bio
          // Strip any HTML tags as a fallback safety (should be plain text already)
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/\u2026\s*more\s*/gi, ' ')
          .replace(/\s*\.\.\.\s*more\s*/gi, ' ')
          .replace(/\s*\.\.\.\s*less\s*/gi, ' ')
          .replace(/\s*\.\s*more\s*/gi, ' ')
          .replace(/\s*\.\s*less\s*/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        // Require enough overflow (≈ two lines) before showing "Show more"
        const SHOW_MORE_THRESHOLD = 520; // heuristic to avoid hiding just one line
        const hasLongBio = cleanBio.length > SHOW_MORE_THRESHOLD;

        return (
          <div className="px-8 py-6">
            <h3 className="text-lg font-semibold text-text mb-3">About</h3>
            <div className={cn(
              'relative',
              !bioExpanded && hasLongBio && 'max-h-32 overflow-hidden'
            )}>
              <p className="text-subtle leading-relaxed max-w-3xl whitespace-pre-line">
                {linkifyText(cleanBio)}
              </p>

              {/* Gradient fade */}
              {!bioExpanded && hasLongBio && (
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-linear-to-t from-base to-transparent" />
              )}
            </div>

            {/* Show more/less button */}
            {hasLongBio && (
              <button
                onClick={() => setBioExpanded(!bioExpanded)}
                className={cn(
                  'flex items-center gap-1 mt-2',
                  'text-sm text-pine hover:text-text',
                  'transition-colors'
                )}
              >
                {bioExpanded ? (
                  <>
                    Show less <ChevronUp size={16} />
                  </>
                ) : (
                  <>
                    Show more <ChevronDown size={16} />
                  </>
                )}
              </button>
            )}
          </div>
        );
      })()}

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
          <ReleaseGridSkeleton count={12} viewMode={artistDiscographyViewMode === 'detailed' ? 'list' : artistDiscographyViewMode} />
        ) : (
          <ReleaseGrid
            releases={currentArtist.releases}
            viewMode={artistDiscographyViewMode === 'detailed' ? 'list' : artistDiscographyViewMode}
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
