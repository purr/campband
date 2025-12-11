import { create } from 'zustand';
import type { ArtistPage, Album, Track } from '@/types';
import { fetchArtistPage, fetchReleasePage, type FetchProgress } from '@/lib/api';
import { db } from '@/lib/db';

// Cache duration: 1 hour for artist pages, 24 hours for album metadata
const ARTIST_CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const ALBUM_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface ArtistState {
  // In-memory cache for quick access during session
  artistCache: Map<string, { artist: ArtistPage; fetchedAt: number }>;
  releaseCache: Map<number, { album: Album; fetchedAt: number }>;

  // Current artist being viewed
  currentArtist: ArtistPage | null;
  currentArtistUrl: string | null;

  // Loading state
  isLoading: boolean;
  isLoadingReleases: boolean;
  loadProgress: FetchProgress | null;
  error: string | null;

  // Actions
  loadArtist: (url: string, forceRefresh?: boolean) => Promise<ArtistPage | null>;
  loadRelease: (releaseUrl: string, releaseId: number) => Promise<Album | null>;
  loadAllReleases: (onProgress?: (progress: FetchProgress) => void) => Promise<void>;
  loadArtistReleasesForPlayback: (artistUrl: string, maxReleases?: number) => Promise<Track[]>;
  clearCurrentArtist: () => void;
  getRelease: (releaseId: number) => Album | undefined;
  getCachedArtist: (url: string) => ArtistPage | undefined;

  // Cache management
  clearCache: () => void;
  getCacheStats: () => { artists: number; albums: number };
}

export const useArtistStore = create<ArtistState>((set, get) => ({
  artistCache: new Map(),
  releaseCache: new Map(),
  currentArtist: null,
  currentArtistUrl: null,
  isLoading: false,
  isLoadingReleases: false,
  loadProgress: null,
  error: null,

  loadArtist: async (url, forceRefresh = false) => {
    const { artistCache } = get();
    const now = Date.now();

    // Normalize URL for consistent caching
    const normalizedUrl = url.replace(/\/?$/, '');

    // Check in-memory cache first (fastest)
    if (!forceRefresh) {
      const cached = artistCache.get(normalizedUrl);
      if (cached && (now - cached.fetchedAt) < ARTIST_CACHE_DURATION) {
        console.log('[ArtistStore] Using memory cache for:', normalizedUrl);
        set({ currentArtist: cached.artist, currentArtistUrl: normalizedUrl, isLoading: false, error: null });
        return cached.artist;
      }
    }

    // Check IndexedDB cache
    if (!forceRefresh) {
      try {
        // Extract band ID from URL for lookup (we'll use URL as key instead)
        const dbCached = await db.cachedArtists.where('id').above(0).first();
        // Actually we need a different approach - let's check by iterating
        const allCached = await db.cachedArtists.toArray();
        const dbEntry = allCached.find(entry => {
          try {
            const data = JSON.parse(entry.data) as ArtistPage;
            return data.band.url.replace(/\/?$/, '') === normalizedUrl;
          } catch {
            return false;
          }
        });

        if (dbEntry && dbEntry.expiresAt > new Date()) {
          console.log('[ArtistStore] Using IndexedDB cache for:', normalizedUrl);
          const artist = JSON.parse(dbEntry.data) as ArtistPage;

          // Also update memory cache
          set(state => {
            const newCache = new Map(state.artistCache);
            newCache.set(normalizedUrl, { artist, fetchedAt: dbEntry.cachedAt.getTime() });
            return {
              artistCache: newCache,
              currentArtist: artist,
              currentArtistUrl: normalizedUrl,
              isLoading: false,
              error: null
            };
          });
          return artist;
        }
      } catch (e) {
        console.warn('[ArtistStore] IndexedDB cache lookup failed:', e);
      }
    }

    // Fetch fresh data
    set({ isLoading: true, error: null });

    try {
      console.log('[ArtistStore] Fetching fresh data for:', normalizedUrl);
      const artist = await fetchArtistPage(url);

      // Update memory cache
      set(state => {
        const newCache = new Map(state.artistCache);
        newCache.set(normalizedUrl, { artist, fetchedAt: now });
        return {
          artistCache: newCache,
          currentArtist: artist,
          currentArtistUrl: normalizedUrl,
          isLoading: false
        };
      });

      // Save to IndexedDB (async, don't await)
      db.cachedArtists.put({
        id: artist.band.id,
        data: JSON.stringify(artist),
        cachedAt: new Date(),
        expiresAt: new Date(now + ARTIST_CACHE_DURATION),
      }).catch(e => console.warn('[ArtistStore] Failed to save to IndexedDB:', e));

      return artist;
    } catch (error) {
      console.error('[ArtistStore] Failed to load artist:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to load artist',
        isLoading: false,
      });
      return null;
    }
  },

  loadRelease: async (releaseUrl, releaseId) => {
    const { releaseCache } = get();
    const now = Date.now();

    // Check memory cache first
    const cached = releaseCache.get(releaseId);
    if (cached && (now - cached.fetchedAt) < ALBUM_CACHE_DURATION) {
      console.log('[ArtistStore] Using memory cache for release:', releaseId);
      return cached.album;
    }

    // Check IndexedDB cache
    try {
      const dbCached = await db.cachedAlbums.get(releaseId);
      if (dbCached && dbCached.expiresAt > new Date()) {
        console.log('[ArtistStore] Using IndexedDB cache for release:', releaseId);
        const album = JSON.parse(dbCached.data) as Album;

        // Update memory cache
        set(state => {
          const newCache = new Map(state.releaseCache);
          newCache.set(releaseId, { album, fetchedAt: dbCached.cachedAt.getTime() });
          return { releaseCache: newCache };
        });
        return album;
      }
    } catch (e) {
      console.warn('[ArtistStore] IndexedDB release cache lookup failed:', e);
    }

    // Fetch fresh data
    try {
      console.log('[ArtistStore] Fetching fresh release:', releaseId);
      const release = await fetchReleasePage(releaseUrl);

      // Update memory cache
      set(state => {
        const newCache = new Map(state.releaseCache);
        newCache.set(releaseId, { album: release, fetchedAt: now });
        return { releaseCache: newCache };
      });

      // Save to IndexedDB (async, don't await)
      db.cachedAlbums.put({
        id: releaseId,
        url: releaseUrl,
        data: JSON.stringify(release),
        cachedAt: new Date(),
        expiresAt: new Date(now + ALBUM_CACHE_DURATION),
      }).catch(e => console.warn('[ArtistStore] Failed to save release to IndexedDB:', e));

      return release;
    } catch (error) {
      console.error('[ArtistStore] Failed to load release:', error);
      return null;
    }
  },

  loadAllReleases: async (onProgress) => {
    const { currentArtist, loadRelease } = get();
    if (!currentArtist) return;

    set({ isLoadingReleases: true });

    const total = currentArtist.releases.length;

    for (let i = 0; i < currentArtist.releases.length; i++) {
      const release = currentArtist.releases[i];

      const progress: FetchProgress = {
        current: i + 1,
        total,
        currentItem: release.title,
      };

      set({ loadProgress: progress });
      onProgress?.(progress);

      await loadRelease(release.url, release.itemId);

      // Small delay between requests to avoid rate limiting
      if (i < currentArtist.releases.length - 1) {
        await new Promise(r => setTimeout(r, 150));
      }
    }

    set({ isLoadingReleases: false, loadProgress: null });
  },

  /**
   * Load an artist's releases for playback (Play All, Add to Queue, etc.)
   * This loads all releases (or up to maxReleases) and returns streamable tracks.
   * Uses caching to avoid re-fetching.
   */
  loadArtistReleasesForPlayback: async (artistUrl, maxReleases) => {
    const { loadArtist, loadRelease } = get();

    // Load artist (uses cache if available)
    const artist = await loadArtist(artistUrl);
    if (!artist) return [];

    const allTracks: Track[] = [];
    const releasesToLoad = maxReleases
      ? artist.releases.slice(0, maxReleases)
      : artist.releases;

    console.log(`[ArtistStore] Loading ${releasesToLoad.length} releases for playback`);

    // Load releases in parallel batches for speed
    const BATCH_SIZE = 3;
    for (let i = 0; i < releasesToLoad.length; i += BATCH_SIZE) {
      const batch = releasesToLoad.slice(i, i + BATCH_SIZE);

      const results = await Promise.all(
        batch.map(release => loadRelease(release.url, release.itemId))
      );

      for (const album of results) {
        if (album) {
          const streamable = album.tracks.filter(t => t.streamUrl);
          allTracks.push(...streamable);
        }
      }

      // Small delay between batches
      if (i + BATCH_SIZE < releasesToLoad.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    console.log(`[ArtistStore] Loaded ${allTracks.length} tracks for playback`);
    return allTracks;
  },

  clearCurrentArtist: () => {
    set({
      currentArtist: null,
      currentArtistUrl: null,
      isLoading: false,
      isLoadingReleases: false,
      loadProgress: null,
      error: null,
    });
  },

  getRelease: (releaseId) => {
    const cached = get().releaseCache.get(releaseId);
    return cached?.album;
  },

  getCachedArtist: (url) => {
    const normalizedUrl = url.replace(/\/?$/, '');
    const cached = get().artistCache.get(normalizedUrl);
    return cached?.artist;
  },

  clearCache: () => {
    set({
      artistCache: new Map(),
      releaseCache: new Map(),
    });
    // Also clear IndexedDB cache
    db.cachedArtists.clear().catch(console.error);
    db.cachedAlbums.clear().catch(console.error);
  },

  getCacheStats: () => {
    const { artistCache, releaseCache } = get();
    return {
      artists: artistCache.size,
      albums: releaseCache.size,
    };
  },
}));
