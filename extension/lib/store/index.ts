export { usePlayerStore } from './playerStore';
export { useQueueStore, setRouterStoreGetter } from './queueStore';
export { useUIStore, type ViewMode, type SortBy, type FilterType } from './uiStore';
export { useSearchStore } from './searchStore';
export { useRouterStore, type Route } from './routerStore';
export { useArtistStore } from './artistStore';
export { useAlbumStore } from './albumStore';
export { useLibraryStore, type SortOption, type HistoryGrouping } from './libraryStore';
export { usePlaylistStore, type PlaylistWithTracks } from './playlistStore';
export { useSettingsStore, EQ_FREQUENCIES, EQ_PRESETS, type EqualizerPreset } from './settingsStore';

// Initialize cross-store dependencies (avoids circular imports)
import { useRouterStore } from './routerStore';
import { setRouterStoreGetter } from './queueStore';
setRouterStoreGetter(() => useRouterStore.getState());
