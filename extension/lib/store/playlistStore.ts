import { create } from 'zustand';
import { db, type Playlist, type FavoriteTrack } from '@/lib/db';
import type { Track } from '@/types';

// ============================================
// Types
// ============================================

export interface PlaylistWithTracks extends Playlist {
  tracks: FavoriteTrack[];
}

interface PlaylistState {
  // Playlists data
  playlists: Playlist[];
  // Map of trackId -> artId for playlist covers (not the same as liked tracks)
  playlistTrackArtIds: Map<number, number>;
  isLoading: boolean;
  isInitialized: boolean;

  // Initialize - load from DB
  init: () => Promise<void>;

  // CRUD operations
  createPlaylist: (name: string, description?: string, coverImage?: string) => Promise<number>;
  updatePlaylist: (id: number, updates: Partial<Pick<Playlist, 'name' | 'description' | 'coverImage'>>) => Promise<void>;
  deletePlaylist: (id: number) => Promise<void>;

  // Track operations
  addTrackToPlaylist: (playlistId: number, track: Track | FavoriteTrack) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: number, trackId: number) => Promise<void>;
  reorderPlaylistTracks: (playlistId: number, trackIds: number[]) => Promise<void>;

  // Getters
  getPlaylist: (id: number) => Playlist | undefined;
  getPlaylistTracks: (id: number) => Promise<FavoriteTrack[]>;
  getPlaylistWithTracks: (id: number) => Promise<PlaylistWithTracks | undefined>;
  getPlaylistArtIds: (trackIds: number[]) => number[];
}

export const usePlaylistStore = create<PlaylistState>()((set, get) => ({
  playlists: [],
  playlistTrackArtIds: new Map(),
  isLoading: false,
  isInitialized: false,

  init: async () => {
    if (get().isInitialized) return;

    set({ isLoading: true });

    try {
      const playlists = await db.playlists.orderBy('createdAt').reverse().toArray();

      // Load all track artIds for playlist covers
      const allTrackIds = new Set<number>();
      playlists.forEach(p => p.trackIds.forEach(id => allTrackIds.add(id)));

      const trackArtMap = new Map<number, number>();
      if (allTrackIds.size > 0) {
        const tracks = await db.favoriteTracks.where('id').anyOf([...allTrackIds]).toArray();
        tracks.forEach(t => {
          if (t.artId) trackArtMap.set(t.id, t.artId);
        });
      }

      set({
        playlists,
        playlistTrackArtIds: trackArtMap,
        isLoading: false,
        isInitialized: true,
      });
    } catch (error) {
      console.error('[PlaylistStore] Failed to initialize:', error);
      set({ isLoading: false, isInitialized: true });
    }
  },

  createPlaylist: async (name, description, coverImage) => {
    const now = new Date();
    const playlist: Omit<Playlist, 'id'> = {
      name,
      description,
      coverImage,
      trackIds: [],
      createdAt: now,
      updatedAt: now,
    };

    try {
      const id = await db.playlists.add(playlist as Playlist);
      const newPlaylist = { ...playlist, id } as Playlist;

      set((state) => ({
        playlists: [newPlaylist, ...state.playlists],
      }));

      return id;
    } catch (error) {
      console.error('[PlaylistStore] Failed to create playlist:', error);
      throw error;
    }
  },

  updatePlaylist: async (id, updates) => {
    try {
      await db.playlists.update(id, {
        ...updates,
        updatedAt: new Date(),
      });

      set((state) => ({
        playlists: state.playlists.map((p) =>
          p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p
        ),
      }));
    } catch (error) {
      console.error('[PlaylistStore] Failed to update playlist:', error);
      throw error;
    }
  },

  deletePlaylist: async (id) => {
    try {
      await db.playlists.delete(id);
      // Also delete playlist tracks
      await db.playlistTracks.where('playlistId').equals(id).delete();

      set((state) => ({
        playlists: state.playlists.filter((p) => p.id !== id),
      }));
    } catch (error) {
      console.error('[PlaylistStore] Failed to delete playlist:', error);
      throw error;
    }
  },

  addTrackToPlaylist: async (playlistId, track) => {
    try {
      const playlist = await db.playlists.get(playlistId);
      if (!playlist) throw new Error('Playlist not found');

      // Check if track already exists
      if (playlist.trackIds.includes(track.id)) {
        return; // Already in playlist
      }

      // First, ensure the track is saved in favoriteTracks (so we have all metadata)
      const existingTrack = await db.favoriteTracks.get(track.id);
      const favoriteTrack: FavoriteTrack = existingTrack || {
        id: track.id,
        title: track.title,
        artist: 'artist' in track ? track.artist : (track.bandName || ''),
        albumTitle: track.albumTitle,
        albumId: track.albumId,
        albumUrl: track.albumUrl,
        artId: track.artId,
        bandId: 'bandId' in track ? track.bandId : 0,
        bandName: track.bandName,
        bandUrl: track.bandUrl,
        duration: track.duration,
        streamUrl: track.streamUrl,
        addedAt: new Date(),
      };

      if (!existingTrack) {
        // Save track metadata to DB (not to liked tracks state - this is just metadata storage)
        await db.favoriteTracks.put(favoriteTrack);
      }

      // Add to playlist
      const newTrackIds = [...playlist.trackIds, track.id];
      await db.playlists.update(playlistId, {
        trackIds: newTrackIds,
        updatedAt: new Date(),
      });

      // Also add to playlistTracks for position tracking
      await db.playlistTracks.add({
        playlistId,
        trackId: track.id,
        position: newTrackIds.length - 1,
        addedAt: new Date(),
      });

      set((state) => {
        // Update artIds map if track has artId
        const newArtIds = new Map(state.playlistTrackArtIds);
        if (track.artId) {
          newArtIds.set(track.id, track.artId);
        }

        return {
          playlists: state.playlists.map((p) =>
            p.id === playlistId
              ? { ...p, trackIds: newTrackIds, updatedAt: new Date() }
              : p
          ),
          playlistTrackArtIds: newArtIds,
        };
      });
    } catch (error) {
      console.error('[PlaylistStore] Failed to add track to playlist:', error);
      throw error;
    }
  },

  removeTrackFromPlaylist: async (playlistId, trackId) => {
    try {
      const playlist = await db.playlists.get(playlistId);
      if (!playlist) throw new Error('Playlist not found');

      const newTrackIds = playlist.trackIds.filter((id) => id !== trackId);
      await db.playlists.update(playlistId, {
        trackIds: newTrackIds,
        updatedAt: new Date(),
      });

      // Remove from playlistTracks
      await db.playlistTracks
        .where({ playlistId, trackId })
        .delete();

      set((state) => ({
        playlists: state.playlists.map((p) =>
          p.id === playlistId
            ? { ...p, trackIds: newTrackIds, updatedAt: new Date() }
            : p
        ),
      }));
    } catch (error) {
      console.error('[PlaylistStore] Failed to remove track from playlist:', error);
      throw error;
    }
  },

  reorderPlaylistTracks: async (playlistId, trackIds) => {
    try {
      await db.playlists.update(playlistId, {
        trackIds,
        updatedAt: new Date(),
      });

      // Update positions in playlistTracks
      await Promise.all(
        trackIds.map((trackId, index) =>
          db.playlistTracks
            .where({ playlistId, trackId })
            .modify({ position: index })
        )
      );

      set((state) => ({
        playlists: state.playlists.map((p) =>
          p.id === playlistId
            ? { ...p, trackIds, updatedAt: new Date() }
            : p
        ),
      }));
    } catch (error) {
      console.error('[PlaylistStore] Failed to reorder playlist tracks:', error);
      throw error;
    }
  },

  getPlaylist: (id) => {
    return get().playlists.find((p) => p.id === id);
  },

  getPlaylistTracks: async (id) => {
    const playlist = await db.playlists.get(id);
    if (!playlist) return [];

    // Get tracks in order
    const tracks = await Promise.all(
      playlist.trackIds.map((trackId) => db.favoriteTracks.get(trackId))
    );

    return tracks.filter((t): t is FavoriteTrack => t !== undefined);
  },

  getPlaylistWithTracks: async (id) => {
    const playlist = await db.playlists.get(id);
    if (!playlist) return undefined;

    const tracks = await Promise.all(
      playlist.trackIds.map((trackId) => db.favoriteTracks.get(trackId))
    );

    return {
      ...playlist,
      tracks: tracks.filter((t): t is FavoriteTrack => t !== undefined),
    };
  },

  getPlaylistArtIds: (trackIds) => {
    const artIds = get().playlistTrackArtIds;
    if (!artIds || !trackIds || trackIds.length === 0) return [];
    return trackIds
      .map(id => artIds.get(id))
      .filter((artId): artId is number => artId !== undefined);
  },
}));

