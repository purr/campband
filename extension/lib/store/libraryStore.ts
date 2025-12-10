import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { db, type FavoriteArtist, type FavoriteAlbum, type FavoriteTrack, type HistoryEntry, type TrackStats } from '@/lib/db';
import type { Band, Album, Track } from '@/types';
import { getTimePeriod, type TimePeriod } from '@/lib/utils/format';

// ============================================
// Types
// ============================================

export type SortOption = 'recent' | 'oldest' | 'title' | 'artist' | 'mostPlayed';
export type HistoryGrouping = 'none' | 'period';

interface LibraryState {
  // Favorites (loaded from DB)
  favoriteArtists: FavoriteArtist[];
  favoriteAlbums: FavoriteAlbum[];
  favoriteTracks: FavoriteTrack[];

  // History
  history: HistoryEntry[];

  // Track stats (play counts)
  trackStats: Map<number, TrackStats>;

  // Sorting & Grouping preferences (persisted)
  trackSortBy: SortOption;
  albumSortBy: SortOption;
  artistSortBy: SortOption;
  historyGrouping: HistoryGrouping;

  // Loading states
  isLoading: boolean;
  isInitialized: boolean;

  // Initialize - load from DB
  init: () => Promise<void>;

  // Sorting & Grouping setters
  setTrackSortBy: (sort: SortOption) => void;
  setAlbumSortBy: (sort: SortOption) => void;
  setArtistSortBy: (sort: SortOption) => void;
  setHistoryGrouping: (grouping: HistoryGrouping) => void;

  // Favorite Artists
  addFavoriteArtist: (artist: Band) => Promise<void>;
  removeFavoriteArtist: (id: number) => Promise<void>;
  isFavoriteArtist: (id: number) => boolean;

  // Favorite Albums
  addFavoriteAlbum: (album: Album) => Promise<void>;
  removeFavoriteAlbum: (id: number) => Promise<void>;
  isFavoriteAlbum: (id: number) => boolean;

  // Favorite Tracks
  addFavoriteTrack: (track: Track) => Promise<void>;
  removeFavoriteTrack: (id: number) => Promise<void>;
  isFavoriteTrack: (id: number) => boolean;

  // History & Play Count
  addToHistory: (entry: Omit<HistoryEntry, 'id' | 'playedAt' | 'playCount'>) => Promise<void>;
  clearHistory: () => Promise<void>;
  getRecentHistory: (limit?: number) => HistoryEntry[];
  getTrackPlayCount: (trackId: number) => number;
  incrementPlayCount: (trackId: number) => Promise<void>;

  // Sorted getters
  getSortedTracks: () => FavoriteTrack[];
  getSortedAlbums: () => FavoriteAlbum[];
  getSortedArtists: () => FavoriteArtist[];
  getGroupedHistory: () => Map<TimePeriod, HistoryEntry[]>;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      favoriteArtists: [],
      favoriteAlbums: [],
      favoriteTracks: [],
      history: [],
      trackStats: new Map(),
      trackSortBy: 'recent',
      albumSortBy: 'recent',
      artistSortBy: 'recent',
      historyGrouping: 'period',
      isLoading: false,
      isInitialized: false,

      init: async () => {
        if (get().isInitialized) return;

        set({ isLoading: true });

        try {
          const [artists, albums, tracks, history, stats] = await Promise.all([
            db.favoriteArtists.orderBy('addedAt').reverse().toArray(),
            db.favoriteAlbums.orderBy('addedAt').reverse().toArray(),
            db.favoriteTracks.orderBy('addedAt').reverse().toArray(),
            db.history.orderBy('playedAt').reverse().limit(100).toArray(),
            db.trackStats.toArray(),
          ]);

          // Convert stats array to map
          const statsMap = new Map<number, TrackStats>();
          stats.forEach(s => statsMap.set(s.trackId, s));

          set({
            favoriteArtists: artists,
            favoriteAlbums: albums,
            favoriteTracks: tracks,
            history,
            trackStats: statsMap,
            isLoading: false,
            isInitialized: true,
          });
        } catch (error) {
          console.error('[LibraryStore] Failed to initialize:', error);
          set({ isLoading: false, isInitialized: true });
        }
      },

      // ==========================================
      // Sorting & Grouping
      // ==========================================

      setTrackSortBy: (sort) => set({ trackSortBy: sort }),
      setAlbumSortBy: (sort) => set({ albumSortBy: sort }),
      setArtistSortBy: (sort) => set({ artistSortBy: sort }),
      setHistoryGrouping: (grouping) => set({ historyGrouping: grouping }),

      getSortedTracks: () => {
        const { favoriteTracks, trackSortBy, trackStats } = get();
        const tracks = [...favoriteTracks];

        switch (trackSortBy) {
          case 'recent':
            return tracks.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
          case 'oldest':
            return tracks.sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());
          case 'title':
            return tracks.sort((a, b) => a.title.localeCompare(b.title));
          case 'artist':
            return tracks.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
          case 'mostPlayed':
            return tracks.sort((a, b) => {
              const countA = trackStats.get(a.id)?.playCount || 0;
              const countB = trackStats.get(b.id)?.playCount || 0;
              return countB - countA;
            });
          default:
            return tracks;
        }
      },

      getSortedAlbums: () => {
        const { favoriteAlbums, albumSortBy } = get();
        const albums = [...favoriteAlbums];

        switch (albumSortBy) {
          case 'recent':
            return albums.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
          case 'oldest':
            return albums.sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());
          case 'title':
            return albums.sort((a, b) => a.title.localeCompare(b.title));
          case 'artist':
            return albums.sort((a, b) => a.artist.localeCompare(b.artist));
          default:
            return albums;
        }
      },

      getSortedArtists: () => {
        const { favoriteArtists, artistSortBy } = get();
        const artists = [...favoriteArtists];

        switch (artistSortBy) {
          case 'recent':
            return artists.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());
          case 'oldest':
            return artists.sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime());
          case 'title':
          case 'artist':
            return artists.sort((a, b) => a.name.localeCompare(b.name));
          default:
            return artists;
        }
      },

      getGroupedHistory: () => {
        const { history, historyGrouping } = get();
        const grouped = new Map<TimePeriod, HistoryEntry[]>();

        if (historyGrouping === 'none') {
          // Return all in one group
          grouped.set('today', history);
          return grouped;
        }

        // Initialize groups in order
        const periods: TimePeriod[] = ['today', 'yesterday', 'thisWeek', 'thisMonth', 'older'];
        periods.forEach(p => grouped.set(p, []));

        // Group by period
        history.forEach(entry => {
          const period = getTimePeriod(entry.playedAt);
          grouped.get(period)?.push(entry);
        });

        // Remove empty groups
        periods.forEach(p => {
          if (grouped.get(p)?.length === 0) {
            grouped.delete(p);
          }
        });

        return grouped;
      },

      // ==========================================
      // Play Count
      // ==========================================

      getTrackPlayCount: (trackId) => {
        return get().trackStats.get(trackId)?.playCount || 0;
      },

      incrementPlayCount: async (trackId) => {
        try {
          const existing = await db.trackStats.get(trackId);
          const newStats: TrackStats = {
            trackId,
            playCount: (existing?.playCount || 0) + 1,
            lastPlayedAt: new Date(),
            totalListenTime: existing?.totalListenTime || 0,
          };

          await db.trackStats.put(newStats);

          // Also update favorite track if it exists
          const favoriteTrack = await db.favoriteTracks.get(trackId);
          if (favoriteTrack) {
            await db.favoriteTracks.update(trackId, {
              playCount: newStats.playCount,
              lastPlayedAt: newStats.lastPlayedAt,
            });
          }

          set((state) => {
            const newMap = new Map(state.trackStats);
            newMap.set(trackId, newStats);

            // Update favorite track in memory if it exists
            const updatedTracks = state.favoriteTracks.map(t =>
              t.id === trackId
                ? { ...t, playCount: newStats.playCount, lastPlayedAt: newStats.lastPlayedAt }
                : t
            );

            return { trackStats: newMap, favoriteTracks: updatedTracks };
          });
        } catch (error) {
          console.error('[LibraryStore] Failed to increment play count:', error);
        }
      },

      // ==========================================
      // Favorite Artists
      // ==========================================

      addFavoriteArtist: async (artist) => {
        const favorite: FavoriteArtist = {
          id: artist.id,
          name: artist.name,
          url: artist.url,
          imageId: artist.imageId,
          location: artist.location,
          addedAt: new Date(),
        };

        try {
          await db.favoriteArtists.put(favorite);
          set((state) => ({
            favoriteArtists: [favorite, ...state.favoriteArtists.filter(a => a.id !== artist.id)],
          }));
        } catch (error) {
          console.error('[LibraryStore] Failed to add favorite artist:', error);
        }
      },

      removeFavoriteArtist: async (id) => {
        try {
          await db.favoriteArtists.delete(id);
          set((state) => ({
            favoriteArtists: state.favoriteArtists.filter(a => a.id !== id),
          }));
        } catch (error) {
          console.error('[LibraryStore] Failed to remove favorite artist:', error);
        }
      },

      isFavoriteArtist: (id) => {
        return get().favoriteArtists.some(a => a.id === id);
      },

      // ==========================================
      // Favorite Albums
      // ==========================================

      addFavoriteAlbum: async (album) => {
        const favorite: FavoriteAlbum = {
          id: album.id,
          title: album.title,
          artist: album.artist,
          url: album.url,
          artId: album.artId,
          bandId: album.bandId,
          bandUrl: album.bandUrl,
          releaseDate: album.releaseDate,
          addedAt: new Date(),
        };

        try {
          await db.favoriteAlbums.put(favorite);
          set((state) => ({
            favoriteAlbums: [favorite, ...state.favoriteAlbums.filter(a => a.id !== album.id)],
          }));
        } catch (error) {
          console.error('[LibraryStore] Failed to add favorite album:', error);
        }
      },

      removeFavoriteAlbum: async (id) => {
        try {
          await db.favoriteAlbums.delete(id);
          set((state) => ({
            favoriteAlbums: state.favoriteAlbums.filter(a => a.id !== id),
          }));
        } catch (error) {
          console.error('[LibraryStore] Failed to remove favorite album:', error);
        }
      },

      isFavoriteAlbum: (id) => {
        return get().favoriteAlbums.some(a => a.id === id);
      },

      // ==========================================
      // Favorite Tracks
      // ==========================================

      addFavoriteTrack: async (track) => {
        // Get existing play count
        const stats = get().trackStats.get(track.id);

        const favorite: FavoriteTrack = {
          id: track.id,
          title: track.title,
          artist: track.artist || track.bandName || '',
          albumTitle: track.albumTitle,
          albumId: track.albumId,
          albumUrl: track.albumUrl,
          artId: track.artId,
          bandId: track.bandId || 0,
          bandName: track.bandName,
          bandUrl: track.bandUrl,
          duration: track.duration,
          streamUrl: track.streamUrl,
          addedAt: new Date(),
          playCount: stats?.playCount || 0,
          lastPlayedAt: stats?.lastPlayedAt,
        };

        try {
          await db.favoriteTracks.put(favorite);
          set((state) => ({
            favoriteTracks: [favorite, ...state.favoriteTracks.filter(t => t.id !== track.id)],
          }));
        } catch (error) {
          console.error('[LibraryStore] Failed to add favorite track:', error);
        }
      },

      removeFavoriteTrack: async (id) => {
        try {
          await db.favoriteTracks.delete(id);
          set((state) => ({
            favoriteTracks: state.favoriteTracks.filter(t => t.id !== id),
          }));
        } catch (error) {
          console.error('[LibraryStore] Failed to remove favorite track:', error);
        }
      },

      isFavoriteTrack: (id) => {
        return get().favoriteTracks.some(t => t.id === id);
      },

      // ==========================================
      // History
      // ==========================================

      addToHistory: async (entry) => {
        // Get existing entry to preserve play count
        const existing = await db.history
          .where({ type: entry.type, itemId: entry.itemId })
          .first();

        const historyEntry: HistoryEntry = {
          ...entry,
          playedAt: new Date(),
          playCount: (existing?.playCount || 0) + 1,
        };

        try {
          // Remove duplicate if exists (same item played again)
          await db.history
            .where({ type: entry.type, itemId: entry.itemId })
            .delete();

          // Add new entry
          const id = await db.history.add(historyEntry);
          historyEntry.id = id;

          // Also update track stats if it's a track
          if (entry.type === 'track') {
            await get().incrementPlayCount(entry.itemId);
          }

          set((state) => ({
            history: [historyEntry, ...state.history.filter(
              h => !(h.type === entry.type && h.itemId === entry.itemId)
            )].slice(0, 100), // Keep last 100
          }));
        } catch (error) {
          console.error('[LibraryStore] Failed to add to history:', error);
        }
      },

      clearHistory: async () => {
        try {
          await db.history.clear();
          set({ history: [] });
        } catch (error) {
          console.error('[LibraryStore] Failed to clear history:', error);
        }
      },

      getRecentHistory: (limit = 20) => {
        return get().history.slice(0, limit);
      },
    }),
    {
      name: 'campband-library-prefs',
      partialize: (state) => ({
        trackSortBy: state.trackSortBy,
        albumSortBy: state.albumSortBy,
        artistSortBy: state.artistSortBy,
        historyGrouping: state.historyGrouping,
      }),
    }
  )
);
