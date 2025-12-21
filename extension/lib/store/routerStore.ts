import { create } from 'zustand';
import { hashToRoute, routeToHash } from '@/lib/utils';

export type Route =
  | { name: 'home' }
  | { name: 'search'; query?: string }
  | { name: 'artist'; url: string }
  | { name: 'album'; url: string }
  | { name: 'library' }
  | { name: 'following' }
  | { name: 'liked' }
  | { name: 'playlist'; id: number }
  | { name: 'settings' };

// Helper to check if two routes are the same
function isSameRoute(a: Route, b: Route): boolean {
  if (a.name !== b.name) return false;

  switch (a.name) {
    case 'artist':
      return (b as { name: 'artist'; url: string }).url === a.url;
    case 'album':
      return (b as { name: 'album'; url: string }).url === a.url;
    case 'search':
      return (b as { name: 'search'; query?: string }).query === a.query;
    case 'playlist':
      return (b as { name: 'playlist'; id: number }).id === a.id;
    default:
      return true;
  }
}

interface RouterState {
  currentRoute: Route;
  previousRoute: Route | null;
  isInitialized: boolean;

  // Page title (shown when no music is playing)
  pageTitle: string | null;
  setPageTitle: (title: string | null) => void;

  // Scroll position storage (keyed by route identifier)
  scrollPositions: Record<string, number>;
  saveScrollPosition: (routeKey: string, position: number) => void;
  getScrollPosition: (routeKey: string) => number | undefined;

  // Navigation
  navigate: (route: Route, options?: { replace?: boolean }) => void;

  // Browser history integration
  goBack: () => void;
  goForward: () => void;

  // Internal
  _setRouteFromHash: (route: Route) => void;
  _initialize: () => void;
}

// Helper to generate a unique key for a route (for scroll position storage)
function getRouteKey(route: Route): string {
  switch (route.name) {
    case 'artist':
      return `artist:${route.url}`;
    case 'album':
      return `album:${route.url}`;
    case 'search':
      return `search:${route.query || ''}`;
    case 'playlist':
      return `playlist:${route.id}`;
    case 'home':
      return 'home';
    case 'following':
      return 'following';
    case 'liked':
      return 'liked';
    case 'library':
      return 'library';
    case 'settings':
      return 'settings';
    default:
      // Exhaustive check - should never reach here
      const _exhaustive: never = route;
      return 'unknown';
  }
}

export const useRouterStore = create<RouterState>()((set, get) => ({
  currentRoute: { name: 'home' },
  previousRoute: null,
  isInitialized: false,
  pageTitle: null,
  scrollPositions: {},

  setPageTitle: (title) => set({ pageTitle: title }),

  saveScrollPosition: (routeKey, position) => {
    set((state) => ({
      scrollPositions: {
        ...state.scrollPositions,
        [routeKey]: position,
      },
    }));
  },

  getScrollPosition: (routeKey) => {
    return get().scrollPositions[routeKey];
  },

  navigate: (route, options) => {
    const { currentRoute, saveScrollPosition } = get();

    // Don't navigate if it's the same route
    if (isSameRoute(currentRoute, route)) {
      return;
    }

    // Save scroll position of current route before navigating away
    const currentRouteKey = getRouteKey(currentRoute);
    const scrollContainer = document.querySelector('main[class*="overflow-y-auto"]') as HTMLElement;
    if (scrollContainer) {
      const scrollPosition = scrollContainer.scrollTop;
      saveScrollPosition(currentRouteKey, scrollPosition);
    }

    // Update URL hash (this triggers browser history)
    const hash = routeToHash(route);

    if (options?.replace) {
      window.history.replaceState(null, '', hash);
    } else {
      window.history.pushState(null, '', hash);
    }

    // Update state - track previous route
    set({
      currentRoute: route,
      previousRoute: currentRoute,
    });
  },

  goBack: () => {
    const { previousRoute, currentRoute, saveScrollPosition } = get();

    // Save scroll position of current route before navigating away
    const currentRouteKey = getRouteKey(currentRoute);
    const scrollContainer = document.querySelector('main[class*="overflow-y-auto"]') as HTMLElement;
    if (scrollContainer) {
      const scrollPosition = scrollContainer.scrollTop;
      saveScrollPosition(currentRouteKey, scrollPosition);
    }

    if (previousRoute) {
      // Navigate to previous route without adding to history
      const hash = routeToHash(previousRoute);
      window.history.replaceState(null, '', hash);
      set({
        currentRoute: previousRoute,
        previousRoute: null, // Clear so we don't loop
      });
    } else {
      // Fallback to home
      const hash = routeToHash({ name: 'home' });
      window.history.replaceState(null, '', hash);
      set({
        currentRoute: { name: 'home' },
        previousRoute: null,
      });
    }
  },

  goForward: () => {
    window.history.forward();
  },

  _setRouteFromHash: (route) => {
    const { currentRoute, saveScrollPosition } = get();

    // Save scroll position of current route before navigating away
    const currentRouteKey = getRouteKey(currentRoute);
    const scrollContainer = document.querySelector('main[class*="overflow-y-auto"]') as HTMLElement;
    if (scrollContainer) {
      const scrollPosition = scrollContainer.scrollTop;
      saveScrollPosition(currentRouteKey, scrollPosition);
    }

    set({ currentRoute: route });
  },

  _initialize: () => {
    const { isInitialized } = get();
    if (isInitialized) return;

    // Read initial route from URL hash
    const hash = window.location.hash;
    const initialRoute = hash ? hashToRoute(hash) : { name: 'home' as const };

    // If no hash, set it to home
    if (!hash || hash === '#' || hash === '#/') {
      window.history.replaceState(null, '', '#/');
    }

    set({
      currentRoute: initialRoute,
      isInitialized: true,
    });

    // Listen for browser back/forward
    const handlePopState = () => {
      const route = hashToRoute(window.location.hash);
      get()._setRouteFromHash(route);
    };

    window.addEventListener('popstate', handlePopState);

    // Cleanup function (won't be called in practice, but good form)
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  },
}));

// Initialize on import
if (typeof window !== 'undefined') {
  // Defer initialization to ensure DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      useRouterStore.getState()._initialize();
    });
  } else {
    useRouterStore.getState()._initialize();
  }
}
