import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SearchResults } from '@/types';
import { searchBandcamp } from '@/lib/api';

interface SearchState {
  // Current search
  query: string;
  results: SearchResults | null;
  isLoading: boolean;
  error: string | null;

  // History
  recentSearches: string[];

  // Actions
  setQuery: (query: string) => void;
  search: (query: string) => Promise<void>;
  clearResults: () => void;
  clearError: () => void;
  addToRecentSearches: (query: string) => void;
  removeFromRecentSearches: (query: string) => void;
  clearRecentSearches: () => void;
}

const MAX_RECENT_SEARCHES = 10;

export const useSearchStore = create<SearchState>()(
  persist(
    (set, get) => ({
      query: '',
      results: null,
      isLoading: false,
      error: null,
      recentSearches: [],

      setQuery: (query) => set({ query }),

      search: async (query) => {
        if (!query.trim()) {
          set({ results: null, error: null });
          return;
        }

        set({ isLoading: true, error: null, query });

        try {
          const results = await searchBandcamp(query);
          set({ results, isLoading: false });

          // Add to recent searches
          get().addToRecentSearches(query);
        } catch (error) {
          console.error('[Search] Error:', error);
          set({
            error: error instanceof Error ? error.message : 'Search failed',
            isLoading: false,
          });
        }
      },

      clearResults: () => set({ results: null, query: '' }),
      clearError: () => set({ error: null }),

      addToRecentSearches: (query) => {
        const trimmed = query.trim();
        if (!trimmed) return;

        set((state) => {
          const filtered = state.recentSearches.filter(
            (s) => s.toLowerCase() !== trimmed.toLowerCase()
          );
          return {
            recentSearches: [trimmed, ...filtered].slice(0, MAX_RECENT_SEARCHES),
          };
        });
      },

      removeFromRecentSearches: (query) => {
        set((state) => ({
          recentSearches: state.recentSearches.filter(
            (s) => s.toLowerCase() !== query.toLowerCase()
          ),
        }));
      },

      clearRecentSearches: () => set({ recentSearches: [] }),
    }),
    {
      name: 'campband-search',
      partialize: (state) => ({
        recentSearches: state.recentSearches,
      }),
    }
  )
);

