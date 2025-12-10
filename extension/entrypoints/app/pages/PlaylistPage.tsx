import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout';
import { CollectionHeader, PlaylistTrackList, PlaylistCover, type PlaylistTrackItem } from '@/components/shared';
import { usePlaylistStore, useLibraryStore, useRouterStore, useQueueStore, usePlayerStore } from '@/lib/store';
import type { FavoriteTrack, Playlist } from '@/lib/db';

interface PlaylistPageProps {
  playlistId: number;
}

export function PlaylistPage({ playlistId }: PlaylistPageProps) {
  const { getPlaylistWithTracks, updatePlaylist, deletePlaylist } = usePlaylistStore();
  const { favoriteTracks } = useLibraryStore();
  const { navigate } = useRouterStore();
  const { setQueue, addToQueue } = useQueueStore();
  const { play, currentTrack, isPlaying } = usePlayerStore();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<FavoriteTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadedPlaylistId, setLoadedPlaylistId] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Load playlist data
  useEffect(() => {
    let cancelled = false;

    async function loadPlaylist() {
      setIsLoading(true);
      try {
        const data = await getPlaylistWithTracks(playlistId);
        if (!cancelled && data) {
          setPlaylist(data);
          setTracks(data.tracks);
          setEditName(data.name);
          setEditDescription(data.description || '');
          setLoadedPlaylistId(playlistId);
        }
      } catch (error) {
        console.error('[PlaylistPage] Failed to load playlist:', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadPlaylist();

    return () => {
      cancelled = true;
    };
  }, [playlistId, getPlaylistWithTracks]);

  // Check if we have the correct playlist loaded
  const isReady = !isLoading && playlist && loadedPlaylistId === playlistId;

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
    const playableTracks = tracks.filter(t => t.streamUrl).map(toPlayableTrack);
    const trackIndex = playableTracks.findIndex(t => t.id === track.id);
    setQueue(playableTracks, trackIndex >= 0 ? trackIndex : 0);
    play();
  };

  const handlePlayAll = () => {
    const playableTracks = tracks.filter(t => t.streamUrl).map(toPlayableTrack);
    if (playableTracks.length > 0) {
      setQueue(playableTracks);
      play();
    }
  };

  const handleShuffleAll = () => {
    const playableTracks = tracks.filter(t => t.streamUrl).map(toPlayableTrack);
    if (playableTracks.length > 0) {
      const shuffled = [...playableTracks].sort(() => Math.random() - 0.5);
      setQueue(shuffled);
      play();
    }
  };

  const handleAddAllToQueue = () => {
    const playableTracks = tracks.filter(t => t.streamUrl).map(toPlayableTrack);
    playableTracks.forEach(track => addToQueue(track));
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!playlist?.id || !editName.trim()) return;

    try {
      await updatePlaylist(playlist.id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      setPlaylist(prev => prev ? { ...prev, name: editName.trim(), description: editDescription.trim() || undefined } : null);
      setIsEditing(false);
    } catch (error) {
      console.error('[PlaylistPage] Failed to update playlist:', error);
    }
  };

  const handleDelete = async () => {
    if (!playlist?.id) return;

    if (confirm(`Delete "${playlist.name}"? This cannot be undone.`)) {
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
          <PageHeader title="Playlist" />
          <div className="flex items-center justify-center pt-24">
            <div className="text-center">
              <Music size={48} className="mx-auto mb-4 text-muted opacity-50" />
              <h2 className="text-lg font-medium text-text mb-2">Playlist not found</h2>
              <p className="text-muted">This playlist may have been deleted.</p>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  // Editing mode
  if (isEditing) {
    return (
      <div className="min-h-full pb-8">
        <PageHeader title="Edit Playlist" />

        <div className="px-8 pt-8 pb-8">
          <div className="flex items-end gap-8">
            {/* Cover preview */}
            <div className="w-56 h-56 rounded-lg overflow-hidden bg-surface shadow-2xl flex-shrink-0 ring-1 ring-white/10">
              {typeof getCover() === 'string' ? (
                <img src={getCover() as string} alt="" className="w-full h-full object-cover" />
              ) : (
                getCover()
              )}
            </div>

            {/* Edit form */}
            <div className="flex-1 pb-2 space-y-4">
              <p className="text-sm font-medium text-subtle uppercase tracking-wider">
                Playlist
              </p>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Playlist name"
                className={cn(
                  'text-4xl font-bold bg-transparent w-full',
                  'border-b-2 border-rose focus:outline-none',
                  'text-text placeholder:text-muted/50'
                )}
                autoFocus
              />
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Add a description..."
                className={cn(
                  'text-sm bg-surface/50 rounded-lg p-3 w-full',
                  'border border-highlight-low focus:border-rose focus:outline-none',
                  'text-text placeholder:text-muted resize-none'
                )}
                rows={3}
              />
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={!editName.trim()}
                  className={cn(
                    'px-6 py-2.5 rounded-xl font-medium',
                    'bg-rose text-base hover:bg-rose/90',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'transition-colors'
                  )}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditName(playlist.name);
                    setEditDescription(playlist.description || '');
                  }}
                  className={cn(
                    'px-6 py-2.5 rounded-xl font-medium',
                    'bg-surface hover:bg-highlight-low',
                    'transition-colors'
                  )}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
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
      <PageHeader title={playlist.name} />

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
        <EmptyPlaylist />
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

function EmptyPlaylist() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-muted">
      <div className="w-24 h-24 rounded-2xl bg-surface flex items-center justify-center mb-6">
        <Plus size={48} className="opacity-50" />
      </div>
      <h2 className="text-lg font-medium text-text mb-2">This playlist is empty</h2>
      <p className="text-center max-w-md">
        Right-click on any track and select "Add to Playlist".
      </p>
    </div>
  );
}
