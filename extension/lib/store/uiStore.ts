import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ViewMode = 'grid' | 'list' | 'detailed';
export type SortBy = 'newest' | 'oldest' | 'name';
export type FilterType = 'all' | 'album' | 'track';

// Track to auto-add when creating a new playlist from context menu
export interface PendingTrackForPlaylist {
  id: number;
  title: string;
  artist?: string;
  duration?: number;
  streamUrl?: string;
  artId?: number;
  albumId?: number;
  albumTitle?: string;
  albumUrl?: string;
  bandId?: number;
  bandName?: string;
  bandUrl?: string;
}

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean;
  sidebarHidden: boolean; // For responsive hiding on narrow screens
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarHidden: (hidden: boolean) => void;
  toggleSidebar: () => void;

  // View preferences
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  sortBy: SortBy;
  setSortBy: (sort: SortBy) => void;

  filterType: FilterType;
  setFilterType: (filter: FilterType) => void;

  // Queue panel
  queuePanelOpen: boolean;
  setQueuePanelOpen: (open: boolean) => void;
  toggleQueuePanel: () => void;

  // Modals
  createPlaylistModalOpen: boolean;
  pendingTrackForPlaylist: PendingTrackForPlaylist | null;
  openCreatePlaylistModal: (track?: PendingTrackForPlaylist) => void;
  closeCreatePlaylistModal: () => void;

  // View mode preferences per section
  likedAlbumsViewMode: ViewMode;
  setLikedAlbumsViewMode: (mode: ViewMode) => void;
  followingViewMode: ViewMode;
  setFollowingViewMode: (mode: ViewMode) => void;
  artistDiscographyViewMode: ViewMode;
  setArtistDiscographyViewMode: (mode: ViewMode) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Sidebar
      sidebarCollapsed: false,
      sidebarHidden: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setSidebarHidden: (hidden) => set({ sidebarHidden: hidden }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      // View preferences
      viewMode: 'grid',
      setViewMode: (viewMode) => set({ viewMode }),

      sortBy: 'newest',
      setSortBy: (sortBy) => set({ sortBy }),

      filterType: 'all',
      setFilterType: (filterType) => set({ filterType }),

      // Queue panel
      queuePanelOpen: false,
      setQueuePanelOpen: (open) => set({ queuePanelOpen: open }),
      toggleQueuePanel: () => set((state) => ({ queuePanelOpen: !state.queuePanelOpen })),

      // Modals
      createPlaylistModalOpen: false,
      pendingTrackForPlaylist: null,
      openCreatePlaylistModal: (track) => set({
        createPlaylistModalOpen: true,
        pendingTrackForPlaylist: track || null
      }),
      closeCreatePlaylistModal: () => set({
        createPlaylistModalOpen: false,
        pendingTrackForPlaylist: null
      }),

      // View mode preferences per section
      likedAlbumsViewMode: 'grid',
      setLikedAlbumsViewMode: (mode) => set({ likedAlbumsViewMode: mode }),
      followingViewMode: 'grid',
      setFollowingViewMode: (mode) => set({ followingViewMode: mode }),
      artistDiscographyViewMode: 'grid',
      setArtistDiscographyViewMode: (mode) => set({ artistDiscographyViewMode: mode }),
    }),
    {
      name: 'campband-ui',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        viewMode: state.viewMode,
        sortBy: state.sortBy,
        filterType: state.filterType,
        likedAlbumsViewMode: state.likedAlbumsViewMode,
        followingViewMode: state.followingViewMode,
        artistDiscographyViewMode: state.artistDiscographyViewMode,
      }),
    }
  )
);

