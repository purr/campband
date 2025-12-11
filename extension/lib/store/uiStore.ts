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

// Playlist data for editing
export interface EditingPlaylist {
  id: number;
  name: string;
  description?: string;
  coverImage?: string;
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

  // Playlist Modal (create or edit)
  playlistModalOpen: boolean;
  playlistModalMode: 'create' | 'edit';
  pendingTrackForPlaylist: PendingTrackForPlaylist | null;
  editingPlaylist: EditingPlaylist | null;
  openCreatePlaylistModal: (track?: PendingTrackForPlaylist) => void;
  openEditPlaylistModal: (playlist: EditingPlaylist) => void;
  closePlaylistModal: () => void;

  // Legacy alias
  createPlaylistModalOpen: boolean;
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

      // Playlist Modal (create or edit)
      playlistModalOpen: false,
      playlistModalMode: 'create',
      pendingTrackForPlaylist: null,
      editingPlaylist: null,
      openCreatePlaylistModal: (track) => set({
        playlistModalOpen: true,
        playlistModalMode: 'create',
        pendingTrackForPlaylist: track || null,
        editingPlaylist: null,
      }),
      openEditPlaylistModal: (playlist) => set({
        playlistModalOpen: true,
        playlistModalMode: 'edit',
        editingPlaylist: playlist,
        pendingTrackForPlaylist: null,
      }),
      closePlaylistModal: () => set({
        playlistModalOpen: false,
        pendingTrackForPlaylist: null,
        editingPlaylist: null,
      }),

      // Legacy alias (points to same state)
      createPlaylistModalOpen: false,
      closeCreatePlaylistModal: () => set({
        playlistModalOpen: false,
        pendingTrackForPlaylist: null,
        editingPlaylist: null,
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

