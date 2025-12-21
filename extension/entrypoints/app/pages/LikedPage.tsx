import { useEffect } from 'react';
import { Music } from 'lucide-react';
import { PageHeader } from '@/components/layout';
import { CollectionHeader, PlaylistTrackList, LikedCover, type PlaylistTrackItem } from '@/components/shared';
import { EmptyState } from '@/components/ui';
import { useLibraryStore, useQueueStore, usePlayerStore, useRouterStore } from '@/lib/store';
import { toPlayableTrack, toPlayableTracks, shuffleTracks } from '@/lib/utils';

export function LikedPage() {
  const {
    favoriteTracks,
    isInitialized,
    init,
  } = useLibraryStore();
  const { setQueue, addToQueue } = useQueueStore();
  const { play, currentTrack, isPlaying } = usePlayerStore();
  const { setPageTitle } = useRouterStore();

  useEffect(() => {
    init();
  }, [init]);

  // Set page title
  useEffect(() => {
    setPageTitle('Liked Songs');
    return () => setPageTitle(null);
  }, [setPageTitle]);

  const handleTrackPlay = (track: PlaylistTrackItem, index: number) => {
    if (!track.streamUrl) return;

    // clearManual=true means we're starting fresh
    const playable = toPlayableTracks(favoriteTracks);
    const trackIndex = playable.findIndex(t => t.id === track.id);
    setQueue(playable, trackIndex >= 0 ? trackIndex : 0, undefined, true);
    play();
  };

  const handlePlayAll = () => {
    const playable = toPlayableTracks(favoriteTracks);
    if (playable.length > 0) {
      setQueue(playable);
      play();
    }
  };

  const handleShuffleAll = () => {
    const playable = toPlayableTracks(favoriteTracks);
    if (playable.length > 0) {
      setQueue(shuffleTracks(playable));
      play();
    }
  };

  const handleAddAllToQueue = () => {
    toPlayableTracks(favoriteTracks).forEach(track => addToQueue(track));
  };

  const totalDuration = favoriteTracks.reduce((sum, track) => sum + (track.duration || 0), 0);

  // Map tracks to PlaylistTrackItem format
  const playlistTracks: PlaylistTrackItem[] = favoriteTracks.map(track => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    bandName: track.bandName,
    duration: track.duration || 0,
    streamUrl: track.streamUrl,
    artId: track.artId,
    albumTitle: track.albumTitle,
    albumUrl: track.albumUrl,
    bandUrl: track.bandUrl,
    addedAt: track.addedAt,
  }));

  // Don't render anything while loading - keeps previous page visible
  if (!isInitialized) {
    return null;
  }

  return (
    <div className="min-h-full pb-8">
      <PageHeader />

      <CollectionHeader
        title="Liked Songs"
        typeLabel="Playlist"
        cover={<LikedCover size="large" />}
        trackCount={favoriteTracks.length}
        totalDuration={totalDuration}
        onPlayAll={handlePlayAll}
        onShuffleAll={handleShuffleAll}
        onAddToQueue={handleAddAllToQueue}
          accentColor="rose"
      />

      {favoriteTracks.length === 0 ? (
        <EmptyState
          icon={<Music size={48} />}
          title="No liked songs yet"
          description="Songs you like will appear here. Start exploring and heart the songs you love!"
        />
      ) : (
        <PlaylistTrackList
          tracks={playlistTracks}
          onTrackPlay={handleTrackPlay}
          currentTrackId={currentTrack?.id}
          isPlaying={isPlaying}
        />
      )}
    </div>
  );
}
