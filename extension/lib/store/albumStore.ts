import { create } from 'zustand';
import type { Album } from '@/types';
import { fetchReleasePage } from '@/lib/api';

interface AlbumState {
  currentAlbum: Album | null;
  isLoading: boolean;
  error: string | null;

  // Cache of loaded albums
  cache: Map<string, Album>;

  // Actions
  loadAlbum: (url: string) => Promise<void>;
  clearAlbum: () => void;
  getCachedAlbum: (url: string) => Album | undefined;
}

export const useAlbumStore = create<AlbumState>((set, get) => ({
  currentAlbum: null,
  isLoading: false,
  error: null,
  cache: new Map(),

  loadAlbum: async (url) => {
    // Check cache first
    const cached = get().cache.get(url);
    if (cached) {
      set({ currentAlbum: cached, isLoading: false, error: null });
      return;
    }

    set({ isLoading: true, error: null, currentAlbum: null });

    try {
      const album = await fetchReleasePage(url);

      // Add to cache
      set((state) => {
        const newCache = new Map(state.cache);
        newCache.set(url, album);
        return {
          currentAlbum: album,
          isLoading: false,
          cache: newCache,
        };
      });
    } catch (error) {
      console.error('[AlbumStore] Failed to load album:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to load album',
        isLoading: false,
      });
    }
  },

  clearAlbum: () => {
    set({ currentAlbum: null, error: null });
  },

  getCachedAlbum: (url) => {
    return get().cache.get(url);
  },
}));

