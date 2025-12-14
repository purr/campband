import { create } from 'zustand';
import type { Album } from '@/types';
import { fetchReleasePage } from '@/lib/api';
import { db, type CachedAlbum } from '@/lib/db';

interface AlbumState {
  currentAlbum: Album | null;
  isLoading: boolean;
  error: string | null;

  // In-memory cache for quick access during session
  cache: Map<string, Album>;

  // Actions
  loadAlbum: (url: string, forceRefresh?: boolean) => Promise<void>;
  clearAlbum: () => void;
  getCachedAlbum: (url: string) => Album | undefined;
  getAlbumWithCache: (url: string) => Promise<Album>;
  updateCachedAlbum: (album: Album) => void;
  clearCache: () => void;
}

export const useAlbumStore = create<AlbumState>((set, get) => ({
  currentAlbum: null,
  isLoading: false,
  error: null,
  cache: new Map(),

  loadAlbum: async (url, forceRefresh = false) => {
    const normalizedUrl = url.replace(/\/?$/, '');

    // Check in-memory cache first (fastest)
    if (!forceRefresh) {
      const memoryCached = get().cache.get(normalizedUrl);
      if (memoryCached) {
        console.log('[AlbumStore] Using memory cache for:', normalizedUrl);
        set({ currentAlbum: memoryCached, isLoading: false, error: null });
        return;
      }
    }

    // Check IndexedDB cache (permanent storage)
    if (!forceRefresh) {
      try {
        const dbCached = await db.cachedAlbums.where('url').equals(normalizedUrl).first();
        if (dbCached) {
          console.log('[AlbumStore] Using IndexedDB cache for:', normalizedUrl);
          const album = JSON.parse(dbCached.data) as Album;

          // Update memory cache
          set((state) => {
            const newCache = new Map(state.cache);
            newCache.set(normalizedUrl, album);
            return {
              currentAlbum: album,
              isLoading: false,
              error: null,
              cache: newCache,
            };
          });
      return;
        }
      } catch (e) {
        console.warn('[AlbumStore] IndexedDB cache lookup failed:', e);
      }
    }

    // No cache found - fetch fresh data
    set({ isLoading: true, error: null, currentAlbum: null });

    try {
      console.log('[AlbumStore] Fetching album:', normalizedUrl);
      const album = await fetchReleasePage(url);
      const now = Date.now();

      // Add to memory cache
      set((state) => {
        const newCache = new Map(state.cache);
        newCache.set(normalizedUrl, album);
        return {
          currentAlbum: album,
          isLoading: false,
          cache: newCache,
        };
      });

      // Save to IndexedDB (permanent cache)
      const cacheEntry: CachedAlbum = {
        id: album.id,
        url: normalizedUrl,
        data: JSON.stringify(album),
        cachedAt: now,
      };
      db.cachedAlbums.put(cacheEntry).catch(e =>
        console.warn('[AlbumStore] Failed to save to IndexedDB:', e)
      );
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
    const normalizedUrl = url.replace(/\/?$/, '');
    return get().cache.get(normalizedUrl);
  },

  getAlbumWithCache: async (url) => {
    const normalizedUrl = url.replace(/\/?$/, '');

    // Check memory cache first (fastest)
    const memoryCached = get().cache.get(normalizedUrl);
    if (memoryCached) {
      console.log('[AlbumStore] getAlbumWithCache: using memory cache');
      return memoryCached;
    }

    // Check IndexedDB cache
    try {
      const dbCached = await db.cachedAlbums.where('url').equals(normalizedUrl).first();
      if (dbCached) {
        console.log('[AlbumStore] getAlbumWithCache: using IndexedDB cache');
        const album = JSON.parse(dbCached.data) as Album;
        // Update memory cache for future lookups
        set((state) => {
          const newCache = new Map(state.cache);
          newCache.set(normalizedUrl, album);
          return { cache: newCache };
        });
        return album;
      }
    } catch (e) {
      console.warn('[AlbumStore] IndexedDB cache lookup failed:', e);
    }

    // No cache - fetch fresh data
    console.log('[AlbumStore] getAlbumWithCache: fetching fresh data');
    const album = await fetchReleasePage(url);
    const now = Date.now();

    // Add to memory cache
    set((state) => {
      const newCache = new Map(state.cache);
      newCache.set(normalizedUrl, album);
      return { cache: newCache };
    });

    // Save to IndexedDB
    const cacheEntry: CachedAlbum = {
      id: album.id,
      url: normalizedUrl,
      data: JSON.stringify(album),
      cachedAt: now,
    };
    db.cachedAlbums.put(cacheEntry).catch(e =>
      console.warn('[AlbumStore] Failed to save to IndexedDB:', e)
    );

    return album;
  },

  updateCachedAlbum: (album) => {
    if (!album.url) return;

    const normalizedUrl = album.url.replace(/\/?$/, '');
    const now = Date.now();

    console.log('[AlbumStore] Updating cache with fresh album data:', normalizedUrl);

    // Update memory cache
    set((state) => {
      const newCache = new Map(state.cache);
      newCache.set(normalizedUrl, album);

      // Also update currentAlbum if it's the same album
      const shouldUpdateCurrent = state.currentAlbum?.url?.replace(/\/?$/, '') === normalizedUrl;

      return {
        cache: newCache,
        currentAlbum: shouldUpdateCurrent ? album : state.currentAlbum,
      };
    });

    // Update IndexedDB cache
    const cacheEntry: CachedAlbum = {
      id: album.id,
      url: normalizedUrl,
      data: JSON.stringify(album),
      cachedAt: now,
    };
    db.cachedAlbums.put(cacheEntry).catch(e =>
      console.warn('[AlbumStore] Failed to update cache in IndexedDB:', e)
    );
  },

  clearCache: () => {
    set({ cache: new Map() });
    db.cachedAlbums.clear().catch(console.error);
  },
}));
