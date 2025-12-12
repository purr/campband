import { useEffect } from 'react';
import { Music } from 'lucide-react';
import { PageHeader } from '@/components/layout';
import { CollectionHeader, TrackList } from '@/components/shared';
import { AlbumAbout } from '@/components/album';
import { useUnlikeConfirm } from '@/components/ui';
import { useAlbumStore, useLibraryStore, useQueueStore, usePlayerStore, useRouterStore, useSettingsStore } from '@/lib/store';
import { buildArtUrl, ImageSizes } from '@/types';
import type { Track } from '@/types';

interface AlbumPageProps {
  albumUrl: string;
}

export function AlbumPage({ albumUrl }: AlbumPageProps) {
  const { currentAlbum, isLoading, error, loadAlbum } = useAlbumStore();
  const { isFavoriteAlbum, addFavoriteAlbum, removeFavoriteAlbum } = useLibraryStore();
  const { setQueue, setShuffle, addMultipleToQueue } = useQueueStore();
  const { play, currentTrack, isPlaying } = usePlayerStore();
  const confirmOnUnlike = useSettingsStore((state) => state.app.confirmOnUnlike);
  const { confirmUnlikeAlbum } = useUnlikeConfirm();

  useEffect(() => {
    loadAlbum(albumUrl);
  }, [albumUrl, loadAlbum]);

  // Check if we have the correct album loaded (not stale data from previous navigation)
  const isReady = !isLoading && currentAlbum && currentAlbum.url === albumUrl;

  const handlePlayAll = () => {
    if (!currentAlbum) return;
    const streamableTracks = currentAlbum.tracks.filter(t => t.streamUrl);
    if (streamableTracks.length > 0) {
      setQueue(streamableTracks);
      play();
    }
  };

  const handleShuffleAll = () => {
    if (!currentAlbum) return;
    const streamableTracks = currentAlbum.tracks.filter(t => t.streamUrl);
    if (streamableTracks.length > 0) {
      setShuffle(true);
      setQueue(streamableTracks);
      play();
    }
  };

  const handleAddAllToQueue = () => {
    if (!currentAlbum) return;
    const streamableTracks = currentAlbum.tracks.filter(t => t.streamUrl);
    if (streamableTracks.length > 0) {
      addMultipleToQueue(streamableTracks);
    }
  };

  const handleTrackPlay = (track: Track, index: number) => {
    if (!currentAlbum) return;
    const streamableTracks = currentAlbum.tracks.filter(t => t.streamUrl);
    const trackIndex = streamableTracks.findIndex(t => t.id === track.id);
    if (trackIndex !== -1) {
      setQueue(streamableTracks, trackIndex);
      play();
    }
  };

  const handleFavoriteToggle = async () => {
    if (!currentAlbum) return;
    if (isFavoriteAlbum(currentAlbum.id)) {
      if (confirmOnUnlike) {
        const confirmed = await confirmUnlikeAlbum(currentAlbum.title);
        if (confirmed) {
          removeFavoriteAlbum(currentAlbum.id);
        }
      } else {
        removeFavoriteAlbum(currentAlbum.id);
      }
    } else {
      addFavoriteAlbum(currentAlbum);
    }
  };

  // Show error only if we have an error AND no valid data to display
  if (error && !isReady) {
    return (
      <div className="min-h-full">
        <PageHeader />
        <div className="flex flex-col items-center justify-center p-8 pt-24">
          <Music size={48} className="mb-4 text-muted opacity-50" />
        <p className="text-love text-lg mb-2">Failed to load album</p>
        <p className="text-muted mb-6">{error}</p>
        <button
          onClick={() => loadAlbum(albumUrl)}
          className="px-4 py-2 rounded-lg bg-surface hover:bg-highlight-low text-text transition-colors"
        >
          Try Again
        </button>
        </div>
      </div>
    );
  }

  // Don't render anything while loading - keeps previous page visible
  if (!isReady) {
    return null;
  }

  const artUrl = buildArtUrl(currentAlbum.artId, ImageSizes.LARGE_1200);
  const totalDuration = currentAlbum.tracks.reduce((acc, t) => acc + t.duration, 0);
  const isFavorite = isFavoriteAlbum(currentAlbum.id);

  return (
    <div className="min-h-full pb-8">
      <PageHeader />

      <CollectionHeader
        title={currentAlbum.title}
        typeLabel={currentAlbum.tracks.length === 1 ? 'Single' : 'Album'}
        cover={artUrl}
        subtitle={currentAlbum.artist}
        onSubtitleClick={currentAlbum.bandUrl ? () => {
          useRouterStore.getState().navigate({ name: 'artist', url: currentAlbum.bandUrl! });
        } : undefined}
        releaseDate={currentAlbum.releaseDate}
        trackCount={currentAlbum.tracks.length}
        hiddenTrackCount={currentAlbum.hiddenTrackCount}
        totalDuration={totalDuration}
        isFavorite={isFavorite}
        onFavoriteToggle={handleFavoriteToggle}
          onPlayAll={handlePlayAll}
          onShuffleAll={handleShuffleAll}
        onAddToQueue={handleAddAllToQueue}
        externalUrl={currentAlbum.url}
        />

        <TrackList
          tracks={currentAlbum.tracks}
          onTrackPlay={handleTrackPlay}
        currentTrackId={currentTrack?.id}
        isPlaying={isPlaying}
        />

        <AlbumAbout
          about={currentAlbum.about}
          credits={currentAlbum.credits}
        tags={currentAlbum.tags}
        />
    </div>
  );
}
