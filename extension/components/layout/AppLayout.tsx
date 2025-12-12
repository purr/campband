import { useRef } from 'react';
import { Sidebar } from './Sidebar';
import { PlayerBar } from './PlayerBar';
import { QueuePanel } from '@/components/player';
import { PlaylistModal, ConfirmProvider, GlobalContextMenu } from '@/components/ui';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { LAYOUT_CLASSES } from '@/lib/constants/layout';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  // Initialize audio player and get seek function
  const { seek } = useAudioPlayer();

  // Ref for main content scrollable area
  const mainContentRef = useRef<HTMLElement>(null);

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
