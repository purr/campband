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
  isInitialized: boolean;
  
  // Navigation
  navigate: (route: Route, options?: { replace?: boolean }) => void;
  
  // Browser history integration
  goBack: () => void;
  goForward: () => void;
  
  // Internal
  _setRouteFromHash: (route: Route) => void;
  _initialize: () => void;
}

export const useRouterStore = create<RouterState>()((set, get) => ({
  currentRoute: { name: 'home' },
  isInitialized: false,

  navigate: (route, options) => {
    const { currentRoute } = get();

    // Don't navigate if it's the same route
    if (isSameRoute(currentRoute, route)) {
      return;
    }

    // Update URL hash (this triggers browser history)
    const hash = routeToHash(route);
    
    if (options?.replace) {
      window.history.replaceState(null, '', hash);
    } else {
      window.history.pushState(null, '', hash);
    }

    // Update state
    set({ currentRoute: route });
  },

  goBack: () => {
    window.history.back();
  },

  goForward: () => {
    window.history.forward();
  },

  _setRouteFromHash: (route) => {
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
