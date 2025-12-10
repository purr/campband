import { useEffect } from 'react';
import { Music } from 'lucide-react';
import { PageHeader } from '@/components/layout';
import { CollectionHeader, PlaylistTrackList, LikedCover, type PlaylistTrackItem } from '@/components/shared';
import { useLibraryStore, useQueueStore, usePlayerStore } from '@/lib/store';
import type { FavoriteTrack } from '@/lib/db';

export function LikedPage() {
  const {
    favoriteTracks,
    isInitialized,
    init,
  } = useLibraryStore();
  const { setQueue, addToQueue } = useQueueStore();
  const { play, currentTrack, isPlaying } = usePlayerStore();

  useEffect(() => {
    init();
  }, [init]);

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

  const handleTrackPlay = (track: PlaylistTrackItem, index: number) => {
    if (!track.streamUrl) return;
    const playableTracks = favoriteTracks.filter(t => t.streamUrl).map(toPlayableTrack);
    const trackIndex = playableTracks.findIndex(t => t.id === track.id);
    setQueue(playableTracks, trackIndex >= 0 ? trackIndex : 0);
    play();
  };

  const handlePlayAll = () => {
    const playableTracks = favoriteTracks.filter(t => t.streamUrl).map(toPlayableTrack);
    if (playableTracks.length > 0) {
      setQueue(playableTracks);
      play();
    }
  };

  const handleShuffleAll = () => {
    const playableTracks = favoriteTracks.filter(t => t.streamUrl).map(toPlayableTrack);
    if (playableTracks.length > 0) {
      const shuffled = [...playableTracks].sort(() => Math.random() - 0.5);
      setQueue(shuffled);
      play();
    }
  };

  const handleAddAllToQueue = () => {
    const playableTracks = favoriteTracks.filter(t => t.streamUrl).map(toPlayableTrack);
    playableTracks.forEach(track => addToQueue(track));
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
      <PageHeader title="Liked Songs" />

      <CollectionHeader
        title="Liked Songs"
        typeLabel="Playlist"
        cover={<LikedCover size="large" />}
        trackCount={favoriteTracks.length}
        totalDuration={totalDuration}
        onPlayAll={handlePlayAll}
        onShuffleAll={handleShuffleAll}
        onAddToQueue={handleAddAllToQueue}
        accentColor="love"
      />

      {favoriteTracks.length === 0 ? (
        <EmptyState />
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-muted">
      <div className="w-24 h-24 rounded-2xl bg-surface flex items-center justify-center mb-6">
        <Music size={48} className="opacity-50" />
      </div>
      <h2 className="text-lg font-medium text-text mb-2">No liked songs yet</h2>
      <p className="text-center max-w-md">
        Songs you like will appear here. Start exploring and heart the songs you love!
      </p>
    </div>
  );
}
