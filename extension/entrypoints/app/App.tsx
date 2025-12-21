import { useEffect } from 'react';
import { AppLayout } from '@/components/layout';
import { useRouterStore, usePlayerStore } from '@/lib/store';
import { audioEngine } from '@/lib/audio';
import { HomePage } from './pages/HomePage';
import { SearchPage } from './pages/SearchPage';
import { ArtistPage } from './pages/ArtistPage';
import { AlbumPage } from './pages/AlbumPage';
import { LibraryPage } from './pages/LibraryPage';
import { FollowingPage } from './pages/FollowingPage';
import { LikedPage } from './pages/LikedPage';
import { PlaylistPage } from './pages/PlaylistPage';
import { SettingsPage } from './pages/SettingsPage';

// Use local storage for Firefox MV2 compatibility
const storageArea = browser.storage.local;

export function App() {
  const { currentRoute, navigate, isInitialized } = useRouterStore();
  const toggle = usePlayerStore((s) => s.toggle);
  const hasTrack = usePlayerStore((s) => !!s.currentTrack);
  const { isPlaying } = usePlayerStore();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input, textarea, or contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Spacebar: toggle play/pause
      if (e.code === 'Space' && hasTrack) {
        e.preventDefault(); // Prevent page scroll
        toggle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle, hasTrack]);

  // Check for pending navigation from content script ("Open in CampBand")
  useEffect(() => {
    if (!isInitialized) return;

    async function checkPendingNavigation() {
      try {
        const result = await storageArea.get('pendingNavigation');
        const pending = result.pendingNavigation as {
          url: string;
          pageType: 'artist' | 'album' | 'track';
          timestamp: number;
        } | undefined;

        if (pending) {
          // Only process if it's recent (within last 10 seconds)
          if (Date.now() - pending.timestamp < 10000) {
            console.log('[CampBand] Processing pending navigation:', pending);

            // Navigate based on page type
            if (pending.pageType === 'artist') {
              navigate({ name: 'artist', url: pending.url });
            } else {
              // Both album and track pages use the album route
              navigate({ name: 'album', url: pending.url });
            }
          }

          // Clear the pending navigation
          await storageArea.remove('pendingNavigation');
        }
      } catch (error) {
        console.log('[CampBand] Could not check pending navigation:', error);
      }
    }

    checkPendingNavigation();

    // Also listen for storage changes (if CampBand is already open)
    const handleStorageChange = (changes: { [key: string]: browser.storage.StorageChange }) => {
      if (changes.pendingNavigation?.newValue) {
        checkPendingNavigation();
      }
    };

    storageArea.onChanged.addListener(handleStorageChange);

    return () => {
      storageArea.onChanged.removeListener(handleStorageChange);
    };
  }, [navigate, isInitialized]);

  // Handle tab visibility changes - resume AudioContext when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible - check if we need to resume AudioContext
        const shouldBePlaying = isPlaying && hasTrack;

        // If audio should be playing, ensure AudioContext is resumed
        if (shouldBePlaying) {
          // Small delay to ensure everything is ready
          setTimeout(() => {
            const audioState = audioEngine.getState();
            const isActuallyPlaying = audioEngine.isPlaying();

            // If store says playing but audio isn't actually playing, try to resume
            if (!isActuallyPlaying) {
              // Try to resume AudioContext first
              const primaryGraph = (audioEngine as any).primaryGraph;
              const context = primaryGraph?.getContextIfExists?.();
              if (context && context.state === 'suspended') {
                context.resume().then(() => {
                  console.log('[App] AudioContext resumed after tab became visible');
                  // Try to resume playback
                  audioEngine.play().catch((err: unknown) => {
                    console.warn('[App] Failed to resume playback after tab became visible:', err);
                  });
                }).catch((err: unknown) => {
                  console.warn('[App] Failed to resume AudioContext after tab became visible:', err);
                });
              } else {
                // Context is running but audio isn't playing - try to resume
                audioEngine.play().catch((err) => {
                  console.warn('[App] Failed to resume playback after tab became visible:', err);
                });
              }
            }
          }, 100);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying, hasTrack]);

  const renderPage = () => {
    switch (currentRoute.name) {
      case 'home':
        return <HomePage />;
      case 'search':
        return <SearchPage initialQuery={currentRoute.query} />;
      case 'artist':
        return <ArtistPage artistUrl={currentRoute.url} />;
      case 'album':
        return <AlbumPage albumUrl={currentRoute.url} />;
      case 'library':
        // Legacy route - redirect to liked
        return <LikedPage />;
      case 'following':
        return <FollowingPage />;
      case 'liked':
        return <LikedPage />;
      case 'playlist':
        return <PlaylistPage playlistId={currentRoute.id} />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <AppLayout>
      {renderPage()}
    </AppLayout>
  );
}
