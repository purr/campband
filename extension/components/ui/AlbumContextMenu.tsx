import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Heart, Link, Check, ExternalLink, ListPlus, ListEnd } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLibraryStore, useQueueStore } from '@/lib/store';
import type { Album } from '@/types';

interface AlbumContextMenuProps {
  /** Position of the menu */
  position: { x: number; y: number };
  /** Album data to act on */
  album: {
    id: number;
    title: string;
    artist: string;
    url: string;
    artId?: number;
    tracks?: Array<{
      id: number;
      title: string;
      duration: number;
      streamUrl?: string;
      artId?: number;
    }>;
  };
  /** Callback when menu should close */
  onClose: () => void;
}

export function AlbumContextMenu({ position, album, onClose }: AlbumContextMenuProps) {
  const { isFavoriteAlbum, addFavoriteAlbum, removeFavoriteAlbum } = useLibraryStore();
  const { addMultipleToQueue, insertMultipleNext } = useQueueStore();
  const [isVisible, setIsVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playingNext, setPlayingNext] = useState(false);
  const [addedToQueue, setAddedToQueue] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Check if album is liked
  const isLiked = isFavoriteAlbum(album.id);

  // Enter animation - small delay to trigger CSS transition
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  // Animated close
  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, 150);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
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
      document.addEventListener('contextmenu', handleClickOutside);
    }, 10);
    document.addEventListener('keydown', handleEscape);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('contextmenu', handleClickOutside);
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
      await navigator.clipboard.writeText(album.url);
      setCopied(true);
      setTimeout(() => {
        handleClose();
      }, 800);
    } catch (err) {
      console.error('Failed to copy:', err);
      handleClose();
    }
  };

  const handleToggleLike = () => {
    if (isLiked) {
      removeFavoriteAlbum(album.id);
    } else {
      addFavoriteAlbum(album as Album);
    }
    handleClose();
  };

  const handlePlayNext = () => {
    if (album.tracks && album.tracks.length > 0) {
      const streamableTracks = album.tracks.filter(t => t.streamUrl);
      if (streamableTracks.length > 0) {
        insertMultipleNext(streamableTracks as any);
        setPlayingNext(true);
        setTimeout(() => {
          handleClose();
        }, 800);
        return;
      }
    }
    handleClose();
  };

  const handleAddToQueue = () => {
    if (album.tracks && album.tracks.length > 0) {
      const streamableTracks = album.tracks.filter(t => t.streamUrl);
      if (streamableTracks.length > 0) {
        addMultipleToQueue(streamableTracks as any);
        setAddedToQueue(true);
        setTimeout(() => {
          handleClose();
        }, 800);
        return;
      }
    }
    handleClose();
  };

  const handleOpenInBandcamp = () => {
    window.open(album.url, '_blank', 'noopener,noreferrer');
    handleClose();
  };

  const hasStreamableTracks = album.tracks?.some(t => t.streamUrl);

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
      {/* Album Info Header */}
      <div className="px-3 pb-2 mb-1 border-b border-white/5">
        <p className="text-sm font-medium text-text truncate">{album.title}</p>
        <p className="text-xs text-text/60 truncate">{album.artist}</p>
      </div>

      {/* Menu Items */}
      <div className="px-1">
        {/* Like / Unlike */}
        <button
          onClick={handleToggleLike}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
            'text-sm text-left',
            'transition-colors duration-100',
            isLiked
              ? 'text-love hover:bg-white/10'
              : 'text-text hover:bg-white/10'
          )}
        >
          <Heart size={16} className={isLiked ? 'text-love' : 'text-text/60'} fill={isLiked ? 'currentColor' : 'none'} />
          {isLiked ? 'Unlike' : 'Like'}
        </button>

        {/* Play Next */}
        {album.tracks && album.tracks.length > 0 && (
          <button
            onClick={handlePlayNext}
            disabled={!hasStreamableTracks}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
              'text-sm text-left',
              'transition-colors duration-100',
              hasStreamableTracks
                ? 'text-text hover:bg-white/10'
                : 'text-text/60 cursor-not-allowed'
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
        )}

        {/* Add to Queue */}
        {album.tracks && album.tracks.length > 0 && (
          <button
            onClick={handleAddToQueue}
            disabled={!hasStreamableTracks}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
              'text-sm text-left',
              'transition-colors duration-100',
              hasStreamableTracks
                ? 'text-text hover:bg-white/10'
                : 'text-text/60 cursor-not-allowed'
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
        )}

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
// Hook for managing album context menu state
// ============================================

export interface AlbumContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  album: AlbumContextMenuProps['album'] | null;
}

export function useAlbumContextMenu() {
  const [state, setState] = useState<AlbumContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    album: null,
  });

  const openMenu = useCallback((
    e: React.MouseEvent,
    album: AlbumContextMenuProps['album']
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setState({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      album,
    });
  }, []);

  const closeMenu = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false, album: null }));
  }, []);

  return {
    state,
    openMenu,
    closeMenu,
  };
}

