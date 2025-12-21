import { useRef, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { PlayerBar } from './PlayerBar';
import { QueuePanel } from '@/components/player';
import { PlaylistModal, ConfirmProvider, GlobalContextMenu } from '@/components/ui';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useRouterStore, type Route } from '@/lib/store';
import { LAYOUT_CLASSES } from '@/lib/constants/layout';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: React.ReactNode;
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

export function AppLayout({ children }: AppLayoutProps) {
  // Initialize audio player and get seek function
  const { seek } = useAudioPlayer();
  const { currentRoute, getScrollPosition, saveScrollPosition } = useRouterStore();

  // Ref for main content scrollable area
  const mainContentRef = useRef<HTMLElement>(null);
  const isRestoringScroll = useRef(false);

  // Restore scroll position when route changes
  useEffect(() => {
    const scrollContainer = mainContentRef.current;
    if (!scrollContainer) return;

    const routeKey = getRouteKey(currentRoute);
    const savedPosition = getScrollPosition(routeKey);

    if (savedPosition !== undefined) {
      isRestoringScroll.current = true;
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = savedPosition;
        // Clear the flag after a short delay to allow scroll events
        setTimeout(() => {
          isRestoringScroll.current = false;
        }, 100);
      });
    } else {
      // No saved position - scroll to top
      scrollContainer.scrollTop = 0;
    }
  }, [currentRoute, getScrollPosition]);

  // Save scroll position on scroll (debounced)
  useEffect(() => {
    const scrollContainer = mainContentRef.current;
    if (!scrollContainer) return;

    let scrollTimeout: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      // Don't save scroll position if we're currently restoring it
      if (isRestoringScroll.current) return;

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const routeKey = getRouteKey(currentRoute);
        const scrollPosition = scrollContainer.scrollTop;
        saveScrollPosition(routeKey, scrollPosition);
      }, 150); // Debounce scroll position saves
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [currentRoute, saveScrollPosition]);

  return (
    <ConfirmProvider>
    <div className="relative h-screen bg-base overflow-hidden">
      {/* Main layout: Sidebar + Content */}
      <div className="flex h-full">
      {/* Sidebar */}
      <Sidebar />

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Scrollable content with bottom padding for player bar */}
        <main
          ref={mainContentRef}
          className={cn('flex-1 overflow-y-auto isolate', LAYOUT_CLASSES.MAIN_CONTENT_PADDING)}
        >
          {children}
        </main>
        </div>

        {/* Queue panel (slides in from right) */}
        <QueuePanel />
      </div>

      {/* Player bar - fixed at bottom, full width, overlays content for glass effect */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <PlayerBar onSeek={seek} />
      </div>

        {/* Global Modals */}
        <PlaylistModal />

        {/* Global Context Menu */}
        <GlobalContextMenu />
    </div>
    </ConfirmProvider>
  );
}
