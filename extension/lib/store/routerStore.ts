import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Route =
  | { name: 'home' }
  | { name: 'search'; query?: string }
  | { name: 'artist'; url: string }
  | { name: 'album'; url: string }
  | { name: 'library' }  // Legacy - kept for backwards compatibility
  | { name: 'following' }
  | { name: 'liked' }  // Special playlist for liked tracks
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
      return true; // home, library, following, liked, settings - just compare name
  }
}

interface RouterState {
  currentRoute: Route;
  history: Route[];
  forwardStack: Route[];

  navigate: (route: Route) => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
}

export const useRouterStore = create<RouterState>()(
  persist(
    (set, get) => ({
      currentRoute: { name: 'home' },
      history: [],
      forwardStack: [],

      navigate: (route) => {
        const { currentRoute } = get();

        // Don't navigate if it's the same route
        if (isSameRoute(currentRoute, route)) {
          return;
        }

        set((state) => ({
          currentRoute: route,
          history: [...state.history, state.currentRoute],
          forwardStack: [], // Clear forward stack on new navigation
        }));
      },

      goBack: () => {
        const { history, currentRoute } = get();
        if (history.length === 0) return;

        const previousRoute = history[history.length - 1];
        set({
          currentRoute: previousRoute,
          history: history.slice(0, -1),
          forwardStack: [currentRoute, ...get().forwardStack],
        });
      },

      goForward: () => {
        const { forwardStack, currentRoute, history } = get();
        if (forwardStack.length === 0) return;

        const nextRoute = forwardStack[0];
        set({
          currentRoute: nextRoute,
          history: [...history, currentRoute],
          forwardStack: forwardStack.slice(1),
        });
      },

      canGoBack: () => get().history.length > 0,
      canGoForward: () => get().forwardStack.length > 0,
    }),
    {
      name: 'campband-router',
      partialize: (state) => ({
        currentRoute: state.currentRoute,
        history: state.history,
        forwardStack: state.forwardStack,
      }),
    }
  )
);
