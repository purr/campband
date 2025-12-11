import { Sidebar } from './Sidebar';
import { PlayerBar } from './PlayerBar';
import { QueuePanel } from '@/components/player';
import { PlaylistModal, ContextMenuProvider, ConfirmProvider, GlobalContextMenu } from '@/components/ui';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { LAYOUT_CLASSES } from '@/lib/constants/layout';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  // Initialize audio player and get seek function
  const { seek } = useAudioPlayer();

  return (
    <ConfirmProvider>
    <ContextMenuProvider>
    <div className="flex h-screen bg-base overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area - relative for player bar positioning */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Scrollable content - isolate creates stacking context */}
        {/* Bottom padding makes room for player bar overlay */}
        <main className={cn('flex-1 overflow-y-auto isolate', LAYOUT_CLASSES.MAIN_CONTENT_PADDING)}>
          {children}
        </main>

        {/* Player bar - fixed at bottom, content scrolls behind it */}
        <div className="absolute bottom-0 left-0 right-0 z-50">
        <PlayerBar onSeek={seek} />
        </div>
      </div>

      {/* Queue panel (slides in from right) */}
      <QueuePanel />

        {/* Global Modals */}
        <PlaylistModal />
        
        {/* Global Context Menu */}
        <GlobalContextMenu />
    </div>
    </ContextMenuProvider>
    </ConfirmProvider>
  );
}
