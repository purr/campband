import { create } from 'zustand';
import type { ArtistPage, Album, Track } from '@/types';
import { fetchArtistPage, fetchReleasePage, fetchArtistReleaseList, type FetchProgress } from '@/lib/api';
import { db, type CachedArtist, type CachedAlbum } from '@/lib/db';

// How often to check for new releases (10 minutes)
const NEW_RELEASE_CHECK_INTERVAL = 10 * 60 * 1000;

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
  isCheckingNewReleases: boolean;
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
  getCacheStats: () => Promise<{ artists: number; albums: number }>;
}

export const useArtistStore = create<ArtistState>((set, get) => ({
  artistCache: new Map(),
  releaseCache: new Map(),
  currentArtist: null,
  currentArtistUrl: null,
  isLoading: false,
  isLoadingReleases: false,
  isCheckingNewReleases: false,
  loadProgress: null,
  error: null,

  loadArtist: async (url, forceRefresh = false) => {
    const { artistCache, loadRelease } = get();
    const now = Date.now();

    // Normalize URL for consistent caching
    const normalizedUrl = url.replace(/\/?$/, '');

    // Check in-memory cache first (fastest)
    const memoryCached = artistCache.get(normalizedUrl);
    if (memoryCached && !forceRefresh) {
        console.log('[ArtistStore] Using memory cache for:', normalizedUrl);
      set({ currentArtist: memoryCached.artist, currentArtistUrl: normalizedUrl, isLoading: false, error: null });

      // Check for new releases in background if needed
      checkForNewReleasesInBackground(normalizedUrl, memoryCached.artist, now);

      return memoryCached.artist;
    }

    // Check IndexedDB cache (permanent storage)
    if (!forceRefresh) {
      try {
        const dbEntry = await db.cachedArtists.where('url').equals(normalizedUrl).first();

        if (dbEntry) {
          console.log('[ArtistStore] Using IndexedDB cache for:', normalizedUrl);
          const artist = JSON.parse(dbEntry.data) as ArtistPage;

          // Update memory cache
          set(state => {
            const newCache = new Map(state.artistCache);
            newCache.set(normalizedUrl, { artist, fetchedAt: dbEntry.cachedAt });
            return {
              artistCache: newCache,
              currentArtist: artist,
              currentArtistUrl: normalizedUrl,
              isLoading: false,
              error: null
            };
          });

          // Check for new releases in background if lastCheckedAt > 10 min ago
          if (now - dbEntry.lastCheckedAt > NEW_RELEASE_CHECK_INTERVAL) {
            checkForNewReleasesInBackground(normalizedUrl, artist, now, dbEntry);
          }

          return artist;
        }
      } catch (e) {
        console.warn('[ArtistStore] IndexedDB cache lookup failed:', e);
      }
    }

    // No cache found - fetch fresh data
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

      // Save to IndexedDB (permanent cache)
      const cacheEntry: CachedArtist = {
        id: artist.band.id,
        url: normalizedUrl,
        data: JSON.stringify(artist),
        cachedAt: now,
        lastCheckedAt: now,
        releaseCount: artist.releases.length,
      };
      db.cachedArtists.put(cacheEntry).catch(e =>
        console.warn('[ArtistStore] Failed to save to IndexedDB:', e)
      );

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
    const normalizedUrl = releaseUrl.replace(/\/?$/, '');

    // Check memory cache first
    const memoryCached = releaseCache.get(releaseId);
    if (memoryCached) {
      console.log('[ArtistStore] Using memory cache for release:', releaseId);
      return memoryCached.album;
    }

    // Check IndexedDB cache (permanent) - check both by ID and by URL for cross-store compatibility
    try {
      let dbCached = await db.cachedAlbums.get(releaseId);
      if (!dbCached) {
        // Also try URL lookup (in case albumStore cached it)
        dbCached = await db.cachedAlbums.where('url').equals(normalizedUrl).first();
      }
      if (dbCached) {
        console.log('[ArtistStore] Using IndexedDB cache for release:', releaseId);
        const album = JSON.parse(dbCached.data) as Album;

        // Update memory cache
        set(state => {
          const newCache = new Map(state.releaseCache);
          newCache.set(releaseId, { album, fetchedAt: dbCached.cachedAt });
          return { releaseCache: newCache };
        });
        return album;
      }
    } catch (e) {
      console.warn('[ArtistStore] IndexedDB release cache lookup failed:', e);
    }

    // Fetch fresh data
    try {
      console.log('[ArtistStore] Fetching release:', releaseId);
      const release = await fetchReleasePage(releaseUrl);

      // Update memory cache
      set(state => {
        const newCache = new Map(state.releaseCache);
        newCache.set(releaseId, { album: release, fetchedAt: now });
        return { releaseCache: newCache };
      });

      // Save to IndexedDB (permanent cache) - use normalized URL for cross-store compatibility
      const cacheEntry: CachedAlbum = {
        id: releaseId,
        url: normalizedUrl,
        data: JSON.stringify(release),
        cachedAt: now,
      };
      db.cachedAlbums.put(cacheEntry).catch(e =>
        console.warn('[ArtistStore] Failed to save release to IndexedDB:', e)
      );

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
   * Uses permanent cache - should be instant if previously visited!
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
    const BATCH_SIZE = 5; // Increased batch size since most should be cached
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

      // Small delay between batches only if fetching (not from cache)
      if (i + BATCH_SIZE < releasesToLoad.length) {
        await new Promise(r => setTimeout(r, 50));
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

  getCacheStats: async () => {
    const artistCount = await db.cachedArtists.count();
    const albumCount = await db.cachedAlbums.count();
    return {
      artists: artistCount,
      albums: albumCount,
    };
  },
}));

/**
 * Check for new releases in background (doesn't block UI)
 * Only fetches the release list, not full album data
 */
async function checkForNewReleasesInBackground(
  normalizedUrl: string,
  cachedArtist: ArtistPage,
  now: number,
  dbEntry?: CachedArtist
) {
  const store = useArtistStore.getState();

  // Don't check if already checking
  if (store.isCheckingNewReleases) return;

  useArtistStore.setState({ isCheckingNewReleases: true });

  try {
    console.log('[ArtistStore] Checking for new releases:', normalizedUrl);

    // Fetch just the release list (quick request to /music page)
    const releaseList = await fetchArtistReleaseList(normalizedUrl);

    if (!releaseList) {
      console.log('[ArtistStore] Could not fetch release list');
      return;
    }

    const cachedReleaseCount = dbEntry?.releaseCount ?? cachedArtist.releases.length;
    const newReleaseCount = releaseList.length;

    // Update lastCheckedAt in DB
    if (dbEntry) {
      await db.cachedArtists.update(dbEntry.id, {
        lastCheckedAt: now,
        releaseCount: newReleaseCount,
      });
    }

    // Check if there are new releases
    if (newReleaseCount > cachedReleaseCount) {
      console.log(`[ArtistStore] Found ${newReleaseCount - cachedReleaseCount} new release(s)!`);

      // Find the new releases (ones not in cache)
      const cachedIds = new Set(cachedArtist.releases.map(r => r.itemId));
      const newReleases = releaseList.filter(r => !cachedIds.has(r.itemId));

      if (newReleases.length > 0) {
        // Update the cached artist with new releases
        const updatedArtist: ArtistPage = {
          ...cachedArtist,
          releases: releaseList,
          totalReleases: newReleaseCount,
        };

        // Update memory cache
        useArtistStore.setState(state => {
          const newCache = new Map(state.artistCache);
          newCache.set(normalizedUrl, { artist: updatedArtist, fetchedAt: now });

          // Update current artist if it's the same
          const shouldUpdateCurrent = state.currentArtistUrl === normalizedUrl;

          return {
            artistCache: newCache,
            currentArtist: shouldUpdateCurrent ? updatedArtist : state.currentArtist,
          };
        });

        // Update IndexedDB
        if (dbEntry) {
          await db.cachedArtists.update(dbEntry.id, {
            data: JSON.stringify(updatedArtist),
            releaseCount: newReleaseCount,
          });
        }

        // Fetch and cache the new releases in background
        for (const release of newReleases) {
          try {
            await store.loadRelease(release.url, release.itemId);
            await new Promise(r => setTimeout(r, 200)); // Rate limit
          } catch (e) {
            console.warn('[ArtistStore] Failed to cache new release:', release.title);
          }
        }
      }
    } else {
      console.log('[ArtistStore] No new releases found');
    }
  } catch (error) {
    console.warn('[ArtistStore] Failed to check for new releases:', error);
  } finally {
    useArtistStore.setState({ isCheckingNewReleases: false });
  }
}

