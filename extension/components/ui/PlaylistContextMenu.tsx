import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Trash2, ListPlus, ListEnd, Check, Play } from 'lucide-react';
import { cn, registerContextMenu, unregisterContextMenu, notifyMenuClosed, notifyMenuOpening, scheduleCloseFromMousedown } from '@/lib/utils';
import { usePlaylistStore, useQueueStore, usePlayerStore, useUIStore, useSettingsStore } from '@/lib/store';
import { useUnlikeConfirm } from './ConfirmProvider';
import type { Playlist } from '@/lib/db';

interface PlaylistContextMenuProps {
  /** Position of the menu */
  position: { x: number; y: number };
  /** Playlist data to act on */
  playlist: Playlist;
  /** Callback when menu should close */
  onClose: () => void;
}

export function PlaylistContextMenu({ position, playlist, onClose }: PlaylistContextMenuProps) {
  const { getPlaylistTracks, deletePlaylist } = usePlaylistStore();
  const { setQueue, addMultipleToQueue, insertMultipleNext } = useQueueStore();
  const { play } = usePlayerStore();
  const { openEditPlaylistModal } = useUIStore();
  const confirmOnUnlike = useSettingsStore((state) => state.app.confirmOnUnlike);
  const { confirmDeletePlaylist } = useUnlikeConfirm();
  const [isVisible, setIsVisible] = useState(false);
  const [playingNext, setPlayingNext] = useState(false);
  const [addedToQueue, setAddedToQueue] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Enter animation
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  // Animated close - does NOT call notifyMenuClosed
  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, 150);
  }, [onClose]);

  // Register with coordinator and notify on unmount
  useEffect(() => {
    registerContextMenu('playlist', handleClose);
    return () => {
      unregisterContextMenu('playlist');
      notifyMenuClosed('playlist');
    };
  }, [handleClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Use scheduled close so it can be cancelled if another menu opens
        scheduleCloseFromMousedown('playlist');
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 10);
    document.addEventListener('keydown', handleEscape);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [handleClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = position.x;
      let y = position.y;

      if (x + rect.width > viewportWidth - 16) {
        x = viewportWidth - rect.width - 16;
      }

      if (y + rect.height > viewportHeight - 16) {
        y = viewportHeight - rect.height - 16;
      }

      setAdjustedPosition({ x: Math.max(16, x), y: Math.max(16, y) });
    }
  }, [position]);

  const handlePlay = async () => {
    if (!playlist.id) return;
    const tracks = await getPlaylistTracks(playlist.id);
    const streamable = tracks.filter(t => t.streamUrl);
    if (streamable.length > 0) {
      setQueue(streamable as any);
      play();
    }
    handleClose();
  };

  const handlePlayNext = async () => {
    if (!playlist.id) return;
    const tracks = await getPlaylistTracks(playlist.id);
    const streamable = tracks.filter(t => t.streamUrl);
    if (streamable.length > 0) {
      insertMultipleNext(streamable as any);
      setPlayingNext(true);
      setTimeout(() => {
        handleClose();
      }, 800);
    } else {
      handleClose();
    }
  };

  const handleAddToQueue = async () => {
    if (!playlist.id) return;
    const tracks = await getPlaylistTracks(playlist.id);
    const streamable = tracks.filter(t => t.streamUrl);
    if (streamable.length > 0) {
      addMultipleToQueue(streamable as any);
      setAddedToQueue(true);
      setTimeout(() => {
        handleClose();
      }, 800);
    } else {
      handleClose();
    }
  };

  const handleEdit = () => {
    openEditPlaylistModal({
      id: playlist.id!,
      name: playlist.name,
      description: playlist.description,
      coverImage: playlist.coverImage,
    });
    handleClose();
  };

  const handleDelete = async () => {
    if (!playlist.id) return;

    const hasTracks = (playlist.trackIds?.length || 0) > 0;

    // Confirm deletion if setting is enabled and playlist has tracks
    if (confirmOnUnlike && hasTracks) {
      const confirmed = await confirmDeletePlaylist(playlist.name);
      if (!confirmed) {
        handleClose();
        return;
      }
    }

    setIsDeleting(true);
    try {
      await deletePlaylist(playlist.id);
    } catch (error) {
      console.error('Failed to delete playlist:', error);
    }
    handleClose();
  };

  const trackCount = playlist.trackIds?.length || 0;

  return createPortal(
    <div
      ref={menuRef}
      className={cn(
        'fixed z-[9999]',
        'min-w-[200px]',
        'py-2 rounded-2xl',
        'liquid-glass-glow',
        'transition-[opacity,transform] duration-150 ease-out',
        isVisible
          ? 'opacity-100 scale-100'
          : 'opacity-0 scale-95'
      )}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        transformOrigin: 'top left',
      }}
    >
      {/* Playlist Info Header */}
      <div className="px-3 pb-2 mb-1 border-b border-white/5">
        <p className="text-sm font-medium text-text truncate">{playlist.name}</p>
        <p className="text-xs text-text/60">{trackCount} {trackCount === 1 ? 'song' : 'songs'}</p>
      </div>

      {/* Menu Items */}
      <div className="px-1">
        {/* Play */}
        <button
          onClick={handlePlay}
          disabled={trackCount === 0}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
            'text-sm text-left',
            'transition-colors duration-100',
            trackCount > 0
              ? 'text-text hover:bg-white/10'
              : 'text-text/40 cursor-not-allowed'
          )}
        >
          <Play size={16} className="text-text/60" />
          Play
        </button>

        {/* Play Next */}
        <button
          onClick={handlePlayNext}
          disabled={trackCount === 0}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
            'text-sm text-left',
            'transition-colors duration-100',
            trackCount > 0
              ? 'text-text hover:bg-white/10'
              : 'text-text/40 cursor-not-allowed'
          )}
        >
          {playingNext ? (
            <>
              <Check size={16} className="text-foam" />
              <span className="text-foam">Playing next!</span>
            </>
          ) : (
            <>
              <ListPlus size={16} className="text-text/60" />
              Play Next
            </>
          )}
        </button>

        {/* Add to Queue */}
        <button
          onClick={handleAddToQueue}
          disabled={trackCount === 0}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
            'text-sm text-left',
            'transition-colors duration-100',
            trackCount > 0
              ? 'text-text hover:bg-white/10'
              : 'text-text/40 cursor-not-allowed'
          )}
        >
          {addedToQueue ? (
            <>
              <Check size={16} className="text-foam" />
              <span className="text-foam">Added!</span>
            </>
          ) : (
            <>
              <ListEnd size={16} className="text-text/60" />
              Add to Queue
            </>
          )}
        </button>

        {/* Divider */}
        <div className="my-1 border-t border-white/5" />

        {/* Edit */}
        <button
          onClick={handleEdit}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
            'text-sm text-left',
            'text-text hover:bg-white/10',
            'transition-colors duration-100'
          )}
        >
          <Pencil size={16} className="text-text/60" />
          Edit Playlist
        </button>

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
            'text-sm text-left',
            'text-love hover:bg-love/10',
            'transition-colors duration-100'
          )}
        >
          <Trash2 size={16} />
          {isDeleting ? 'Deleting...' : 'Delete Playlist'}
        </button>
      </div>
    </div>,
    document.body
  );
}

// ============================================
// Hook for managing playlist context menu state
// ============================================

export interface PlaylistContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  playlist: Playlist | null;
}

export function usePlaylistContextMenu() {
  const [state, setState] = useState<PlaylistContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    playlist: null,
  });

  const openMenu = useCallback(async (
    e: React.MouseEvent,
    playlist: Playlist
  ) => {
    e.preventDefault();
    e.stopPropagation();

    // Notify coordinator - this will close any other open menu first
    await notifyMenuOpening('playlist');

    setState({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      playlist,
    });
  }, []);

  const closeMenu = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false, playlist: null }));
  }, []);

  return {
    state,
    openMenu,
    closeMenu,
  };
}

