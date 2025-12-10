import { create } from 'zustand';
import type { ArtistPage, Album } from '@/types';
import { fetchArtistPage, fetchReleasePage, type FetchProgress } from '@/lib/api';

interface ArtistState {
  // Current artist
  currentArtist: ArtistPage | null;
  releases: Map<number, Album>; // albumId -> Album with tracks

  // Loading state
  isLoading: boolean;
  isLoadingReleases: boolean;
  loadProgress: FetchProgress | null;
  error: string | null;

  // Actions
  loadArtist: (url: string) => Promise<void>;
  loadRelease: (releaseUrl: string, releaseId: number) => Promise<Album | null>;
  loadAllReleases: () => Promise<void>;
  clearArtist: () => void;
  getRelease: (releaseId: number) => Album | undefined;
}

export const useArtistStore = create<ArtistState>((set, get) => ({
  currentArtist: null,
  releases: new Map(),
  isLoading: false,
  isLoadingReleases: false,
  loadProgress: null,
  error: null,

  loadArtist: async (url) => {
    set({ isLoading: true, error: null, currentArtist: null, releases: new Map() });

    try {
      const artist = await fetchArtistPage(url);
      set({ currentArtist: artist, isLoading: false });
    } catch (error) {
      console.error('[ArtistStore] Failed to load artist:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to load artist',
        isLoading: false,
      });
    }
  },

  loadRelease: async (releaseUrl, releaseId) => {
    const { releases } = get();

    // Check cache first
    if (releases.has(releaseId)) {
      return releases.get(releaseId)!;
    }

    try {
      const release = await fetchReleasePage(releaseUrl);

      set((state) => {
        const newReleases = new Map(state.releases);
        newReleases.set(releaseId, release);
        return { releases: newReleases };
      });

      return release;
    } catch (error) {
      console.error('[ArtistStore] Failed to load release:', error);
      return null;
    }
  },

  loadAllReleases: async () => {
    const { currentArtist, loadRelease } = get();
    if (!currentArtist) return;

    set({ isLoadingReleases: true });

    const total = currentArtist.releases.length;

    for (let i = 0; i < currentArtist.releases.length; i++) {
      const release = currentArtist.releases[i];

      set({
        loadProgress: {
          current: i + 1,
          total,
          currentItem: release.title,
        },
      });

      await loadRelease(release.url, release.itemId);

      // Small delay between requests
      await new Promise((r) => setTimeout(r, 200));
    }

    set({ isLoadingReleases: false, loadProgress: null });
  },

  clearArtist: () => {
    set({
      currentArtist: null,
      releases: new Map(),
      isLoading: false,
      isLoadingReleases: false,
      loadProgress: null,
      error: null,
    });
  },

  getRelease: (releaseId) => {
    return get().releases.get(releaseId);
  },
}));

