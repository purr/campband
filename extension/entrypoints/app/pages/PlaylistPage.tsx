import { useEffect, useState } from 'react';
import { Plus, Music } from 'lucide-react';
import { toPlayableTracks, shuffleTracks } from '@/lib/utils';
import { PageHeader } from '@/components/layout';
import { CollectionHeader, PlaylistTrackList, PlaylistCover, type PlaylistTrackItem } from '@/components/shared';
import { EmptyState, useUnlikeConfirm } from '@/components/ui';
import { usePlaylistStore, useRouterStore, useQueueStore, usePlayerStore, useUIStore } from '@/lib/store';
import type { FavoriteTrack, Playlist } from '@/lib/db';

interface PlaylistPageProps {
  playlistId: number;
}

export function PlaylistPage({ playlistId }: PlaylistPageProps) {
  const { getPlaylistWithTracks, deletePlaylist, playlists } = usePlaylistStore();
  const { navigate } = useRouterStore();
  const { setQueue, addToQueue } = useQueueStore();
  const { play, currentTrack, isPlaying } = usePlayerStore();
  const { openEditPlaylistModal, playlistModalOpen } = useUIStore();
  const { confirmDeletePlaylist } = useUnlikeConfirm();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<FavoriteTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadedPlaylistId, setLoadedPlaylistId] = useState<number | null>(null);

  // Load playlist data
  const loadPlaylist = async () => {
    setIsLoading(true);
    try {
      const data = await getPlaylistWithTracks(playlistId);
      if (data) {
        setPlaylist(data);
        setTracks(data.tracks);
        setLoadedPlaylistId(playlistId);
      }
    } catch (error) {
      console.error('[PlaylistPage] Failed to load playlist:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load on mount and when playlistId changes
  useEffect(() => {
    loadPlaylist();
  }, [playlistId]);

  // Reload when playlists change (after edit) or modal closes
  useEffect(() => {
    if (!playlistModalOpen && loadedPlaylistId === playlistId) {
      // Modal just closed - check if data changed
      const updatedPlaylist = playlists.find(p => p.id === playlistId);
      if (updatedPlaylist && playlist) {
        // Update local state if name/description changed
        if (
          updatedPlaylist.name !== playlist.name ||
          updatedPlaylist.description !== playlist.description ||
          updatedPlaylist.coverImage !== playlist.coverImage
        ) {
          setPlaylist(prev => prev ? {
            ...prev,
            name: updatedPlaylist.name,
            description: updatedPlaylist.description,
            coverImage: updatedPlaylist.coverImage,
          } : null);
        }
      }
    }
  }, [playlistModalOpen, playlists, playlistId]);

  // Check if we have the correct playlist loaded
  const isReady = !isLoading && playlist && loadedPlaylistId === playlistId;

  const handleTrackPlay = (track: PlaylistTrackItem, index: number) => {
    if (!track.streamUrl) return;
    const playable = toPlayableTracks(tracks);
    const trackIndex = playable.findIndex(t => t.id === track.id);
    setQueue(playable, trackIndex >= 0 ? trackIndex : 0);
    play();
  };

  const handlePlayAll = () => {
    const playable = toPlayableTracks(tracks);
    if (playable.length > 0) {
      setQueue(playable);
      play();
    }
  };

  const handleShuffleAll = () => {
    const playable = toPlayableTracks(tracks);
    if (playable.length > 0) {
      setQueue(shuffleTracks(playable));
      play();
    }
  };

  const handleAddAllToQueue = () => {
    toPlayableTracks(tracks).forEach(track => addToQueue(track));
  };

  const handleEdit = () => {
    if (playlist?.id) {
      openEditPlaylistModal({
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        coverImage: playlist.coverImage,
      });
    }
  };

  const handleDelete = async () => {
    if (!playlist?.id) return;

    const confirmed = await confirmDeletePlaylist(playlist.name);

    if (confirmed) {
      try {
        await deletePlaylist(playlist.id);
        navigate({ name: 'liked' });
      } catch (error) {
        console.error('[PlaylistPage] Failed to delete playlist:', error);
      }
    }
  };

  // Calculate total duration
  const totalDuration = tracks.reduce((sum, track) => sum + (track.duration || 0), 0);

  // Get cover art IDs from tracks
  const coverArtIds = tracks.map(t => t.artId).filter((id): id is number => id !== undefined);

  // Get cover art element
  const getCover = (): React.ReactNode => {
    return (
      <PlaylistCover
        coverImage={playlist?.coverImage}
        artIds={coverArtIds}
        size="lg"
        alt={playlist?.name}
      />
    );
  };

  // Don't render anything while loading - keeps previous page visible
  if (!isReady) {
    // But if we finished loading and still no playlist, show error
    if (!isLoading && !playlist) {
      return (
        <div className="min-h-full">
          <PageHeader />
          <EmptyState
            icon={<Music size={48} />}
            title="Playlist not found"
            description="This playlist may have been deleted."
          />
        </div>
      );
    }
    return null;
  }

  // Map tracks to PlaylistTrackItem format
  const playlistTracks: PlaylistTrackItem[] = tracks.map(track => ({
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

  return (
    <div className="min-h-full pb-8">
      <PageHeader />

      <CollectionHeader
        title={playlist.name}
        typeLabel="Playlist"
        cover={getCover()}
        description={playlist.description}
        createdAt={playlist.createdAt}
        trackCount={tracks.length}
        totalDuration={totalDuration}
        onPlayAll={handlePlayAll}
        onShuffleAll={handleShuffleAll}
        onAddToQueue={handleAddAllToQueue}
        isEditable={true}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {tracks.length === 0 ? (
        <EmptyState
          icon={<Plus size={48} />}
          title="This playlist is empty"
          description="Right-click on any track and select 'Add to Playlist'."
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
