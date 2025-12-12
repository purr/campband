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

  // Helpers
  isPlaylistNameTaken: (name: string, excludeId?: number) => boolean;
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
    // Check for unique name
    const existingPlaylists = get().playlists;
    const normalizedName = name.trim().toLowerCase();
    const nameExists = existingPlaylists.some(
      p => p.name.trim().toLowerCase() === normalizedName
    );

    if (nameExists) {
      throw new Error(`A playlist named "${name}" already exists`);
    }

    const now = Date.now();
    const playlist: Omit<Playlist, 'id'> = {
      name: name.trim(),
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
    // Check for unique name if name is being updated
    if (updates.name) {
      const existingPlaylists = get().playlists;
      const normalizedName = updates.name.trim().toLowerCase();
      const nameExists = existingPlaylists.some(
        p => p.id !== id && p.name.trim().toLowerCase() === normalizedName
      );

      if (nameExists) {
        throw new Error(`A playlist named "${updates.name}" already exists`);
      }

      updates.name = updates.name.trim();
    }

    try {
      const now = Date.now();
      await db.playlists.update(id, {
        ...updates,
        updatedAt: now,
      });

      set((state) => ({
        playlists: state.playlists.map((p) =>
          p.id === id ? { ...p, ...updates, updatedAt: now } : p
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
      const now = Date.now();
      const favoriteTrack: FavoriteTrack = existingTrack || {
        id: track.id,
        title: track.title,
        artist: ('artist' in track ? track.artist : track.bandName) || 'Unknown Artist',
        albumTitle: track.albumTitle,
        albumId: track.albumId,
        albumUrl: track.albumUrl,
        artId: track.artId,
        bandId: ('bandId' in track ? track.bandId : 0) || 0,
        bandName: track.bandName,
        bandUrl: track.bandUrl,
        duration: track.duration,
        streamUrl: track.streamUrl,
        addedAt: now,
      };

      if (!existingTrack) {
        // Save track metadata to DB (not to liked tracks state - this is just metadata storage)
        await db.favoriteTracks.put(favoriteTrack);
      }

      // Add to playlist
      const newTrackIds = [...playlist.trackIds, track.id];
      await db.playlists.update(playlistId, {
        trackIds: newTrackIds,
        updatedAt: now,
      });

      // Also add to playlistTracks for position tracking
      await db.playlistTracks.add({
        playlistId,
        trackId: track.id,
        position: newTrackIds.length - 1,
        addedAt: now,
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
              ? { ...p, trackIds: newTrackIds, updatedAt: now }
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
      const now = Date.now();
      await db.playlists.update(playlistId, {
        trackIds: newTrackIds,
        updatedAt: now,
      });

      // Remove from playlistTracks
      await db.playlistTracks
        .where({ playlistId, trackId })
        .delete();

      set((state) => ({
        playlists: state.playlists.map((p) =>
          p.id === playlistId
            ? { ...p, trackIds: newTrackIds, updatedAt: now }
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
      const now = Date.now();
      await db.playlists.update(playlistId, {
        trackIds,
        updatedAt: now,
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
            ? { ...p, trackIds, updatedAt: now }
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

    // Get playlist track entries to get the addedAt dates
    const playlistTrackEntries = await db.playlistTracks
      .where('playlistId')
      .equals(id)
      .toArray();

    // Create a map of trackId -> addedAt (playlist-specific date)
    const playlistAddedAtMap = new Map<number, number>();
    playlistTrackEntries.forEach(pt => {
      playlistAddedAtMap.set(pt.trackId, pt.addedAt);
    });

    // Fetch track metadata from favoriteTracks
    const tracks = await Promise.all(
      playlist.trackIds.map((trackId) => db.favoriteTracks.get(trackId))
    );

    // Override addedAt with the playlist-specific date
    const tracksWithPlaylistDate = tracks
      .filter((t): t is FavoriteTrack => t !== undefined)
      .map(track => ({
        ...track,
        // Use playlist addedAt if available, otherwise fall back to track's addedAt
        addedAt: playlistAddedAtMap.get(track.id) ?? track.addedAt,
      }));

    return {
      ...playlist,
      tracks: tracksWithPlaylistDate,
    };
  },

  getPlaylistArtIds: (trackIds) => {
    const artIds = get().playlistTrackArtIds;
    if (!artIds || !trackIds || trackIds.length === 0) return [];
    return trackIds
      .map(id => artIds.get(id))
      .filter((artId): artId is number => artId !== undefined);
  },

  isPlaylistNameTaken: (name, excludeId) => {
    const normalizedName = name.trim().toLowerCase();
    return get().playlists.some(
      p => p.name.trim().toLowerCase() === normalizedName && p.id !== excludeId
    );
  },
}));

