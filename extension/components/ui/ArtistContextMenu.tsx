import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Heart, Link, Check, ExternalLink, Play, ListPlus, ListEnd, Loader2 } from 'lucide-react';
import { cn, registerContextMenu, unregisterContextMenu, notifyMenuClosed, notifyMenuOpening, scheduleCloseFromMousedown } from '@/lib/utils';
import { useLibraryStore, useSettingsStore, useQueueStore, usePlayerStore, useArtistStore } from '@/lib/store';
import { useUnlikeConfirm } from './ConfirmProvider';
import type { Band, Track } from '@/types';

interface ArtistContextMenuProps {
  /** Position of the menu */
  position: { x: number; y: number };
  /** Artist data to act on */
  artist: {
    id: number;
    name: string;
    url: string;
    imageId?: number;
    location?: string;
  };
  /** Callback when menu should close */
  onClose: () => void;
}

export function ArtistContextMenu({ position, artist, onClose }: ArtistContextMenuProps) {
  const { isFavoriteArtist, addFavoriteArtist, removeFavoriteArtist } = useLibraryStore();
  const { setQueue, addMultipleToQueue, insertMultipleNext } = useQueueStore();
  const { play } = usePlayerStore();
  const confirmOnUnlike = useSettingsStore((state) => state.app.confirmOnUnlike);
  const { confirmUnfollowArtist } = useUnlikeConfirm();
  const [isVisible, setIsVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [playingNext, setPlayingNext] = useState(false);
  const [addedToQueue, setAddedToQueue] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Check if artist is followed
  const isFollowing = isFavoriteArtist(artist.id);

  // Enter animation - small delay to trigger CSS transition
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
    registerContextMenu('artist', handleClose);
    return () => {
      unregisterContextMenu('artist');
      notifyMenuClosed('artist');
    };
  }, [handleClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Use scheduled close so it can be cancelled if another menu opens
        scheduleCloseFromMousedown('artist');
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    // Small delay to prevent immediate close
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

      // Adjust horizontal position
      if (x + rect.width > viewportWidth - 16) {
        x = viewportWidth - rect.width - 16;
      }

      // Adjust vertical position
      if (y + rect.height > viewportHeight - 16) {
        y = viewportHeight - rect.height - 16;
      }

      setAdjustedPosition({ x: Math.max(16, x), y: Math.max(16, y) });
    }
  }, [position]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(artist.url);
      setCopied(true);
      setTimeout(() => {
        handleClose();
      }, 800);
    } catch (err) {
      console.error('Failed to copy:', err);
      handleClose();
    }
  };

  const handleToggleFollow = async () => {
    if (isFollowing) {
      if (confirmOnUnlike) {
        const confirmed = await confirmUnfollowArtist(artist.name);
        if (confirmed) {
          removeFavoriteArtist(artist.id);
        }
      } else {
        removeFavoriteArtist(artist.id);
      }
    } else {
      addFavoriteArtist(artist as Band);
    }
    handleClose();
  };

  const handleOpenInBandcamp = () => {
    window.open(artist.url, '_blank', 'noopener,noreferrer');
    handleClose();
  };

  // Use the store's cached loader for all releases
  const { loadArtistReleasesForPlayback } = useArtistStore();

  const handlePlay = async () => {
    setIsLoading(true);
    try {
      // Load ALL releases (uses cache for speed)
      const tracks = await loadArtistReleasesForPlayback(artist.url);
      if (tracks.length > 0) {
        setQueue(tracks);
        play();
      }
    } catch (e) {
      console.error('[ArtistContextMenu] Failed to play:', e);
    }
    handleClose();
  };

  const handlePlayNext = async () => {
    setIsLoading(true);
    try {
      // Load ALL releases (uses cache for speed)
      const tracks = await loadArtistReleasesForPlayback(artist.url);
      if (tracks.length > 0) {
        insertMultipleNext(tracks);
        setPlayingNext(true);
        setTimeout(() => {
          handleClose();
        }, 800);
        return;
      }
    } catch (e) {
      console.error('[ArtistContextMenu] Failed to play next:', e);
    }
    handleClose();
  };

  const handleAddToQueue = async () => {
    setIsLoading(true);
    try {
      // Load ALL releases (uses cache for speed)
      const tracks = await loadArtistReleasesForPlayback(artist.url);
      if (tracks.length > 0) {
        addMultipleToQueue(tracks);
        setAddedToQueue(true);
        setTimeout(() => {
          handleClose();
        }, 800);
        return;
      }
    } catch (e) {
      console.error('[ArtistContextMenu] Failed to add to queue:', e);
    }
    handleClose();
  };

  // Render via portal to escape any parent overflow/z-index issues
  return createPortal(
    <div
      ref={menuRef}
      className={cn(
        'fixed z-[9999]',
        'min-w-[200px]',
        'py-2 rounded-2xl',
        'liquid-glass-glow',
        // Simple fade + scale transition
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
      {/* Artist Info Header */}
      <div className="px-3 pb-2 mb-1 border-b border-white/5">
        <p className="text-sm font-medium text-text truncate">{artist.name}</p>
        {artist.location && (
          <p className="text-xs text-text/60 truncate">{artist.location}</p>
        )}
      </div>

      {/* Menu Items */}
      <div className="px-1">
        {/* Play */}
        <button
          onClick={handlePlay}
          disabled={isLoading}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
            'text-sm text-left',
            'text-text hover:bg-white/10',
            'transition-colors duration-100',
            isLoading && 'opacity-60'
          )}
        >
          {isLoading ? (
            <Loader2 size={16} className="text-text/60 animate-spin" />
          ) : (
            <Play size={16} className="text-text/60" />
          )}
          Play
        </button>

        {/* Play Next */}
        <button
          onClick={handlePlayNext}
          disabled={isLoading}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
            'text-sm text-left',
            'text-text hover:bg-white/10',
            'transition-colors duration-100',
            isLoading && 'opacity-60'
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
          disabled={isLoading}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
            'text-sm text-left',
            'text-text hover:bg-white/10',
            'transition-colors duration-100',
            isLoading && 'opacity-60'
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

        {/* Follow / Unfollow */}
        <button
          onClick={handleToggleFollow}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
            'text-sm text-left',
            'transition-colors duration-100',
            isFollowing
              ? 'text-love hover:bg-white/10'
              : 'text-text hover:bg-white/10'
          )}
        >
          <Heart size={16} className={isFollowing ? 'text-love' : 'text-text/60'} fill={isFollowing ? 'currentColor' : 'none'} />
          {isFollowing ? 'Unfollow' : 'Follow'}
        </button>

        {/* Divider */}
        <div className="my-1 border-t border-white/5" />

        {/* Copy Link */}
        <button
          onClick={handleCopyLink}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
            'text-sm text-left',
            'text-text hover:bg-white/10',
            'transition-colors duration-100'
          )}
        >
          {copied ? (
            <>
              <Check size={16} className="text-foam" />
              <span className="text-foam">Copied!</span>
            </>
          ) : (
            <>
              <Link size={16} className="text-text/60" />
              Copy Bandcamp Link
            </>
          )}
        </button>

        {/* Open in Bandcamp */}
        <button
          onClick={handleOpenInBandcamp}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
            'text-sm text-left',
            'text-text hover:bg-white/10',
            'transition-colors duration-100'
          )}
        >
          <ExternalLink size={16} className="text-text/60" />
          Open in Bandcamp
        </button>
      </div>

    </div>,
    document.body
  );
}

// ============================================
// Hook for managing artist context menu state
// ============================================

export interface ArtistContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  artist: ArtistContextMenuProps['artist'] | null;
}

export function useArtistContextMenu() {
  const [state, setState] = useState<ArtistContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    artist: null,
  });

  const openMenu = useCallback(async (
    e: React.MouseEvent,
    artist: ArtistContextMenuProps['artist']
  ) => {
    e.preventDefault();
    e.stopPropagation();

    // Notify coordinator - this will close any other open menu first
    await notifyMenuOpening('artist');

    setState({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      artist,
    });
  }, []);

  const closeMenu = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false, artist: null }));
  }, []);

  return {
    state,
    openMenu,
    closeMenu,
  };
}

