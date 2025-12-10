import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ListPlus, ListEnd, Plus, ChevronRight, Heart, Link, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlaylistStore, useQueueStore, useUIStore, useLibraryStore } from '@/lib/store';
import { PlaylistCover } from '@/components/shared';
import type { Playlist } from '@/lib/db';

interface TrackContextMenuProps {
  /** Position of the menu */
  position: { x: number; y: number };
  /** Track data to act on */
  track: {
    id: number;
    title: string;
    artist?: string;
    duration?: number;
    streamUrl?: string;
    artId?: number;
    albumId?: number;
    albumTitle?: string;
    albumUrl?: string;
    bandId?: number;
    bandName?: string;
    bandUrl?: string;
  };
  /** Callback when menu should close */
  onClose: () => void;
}

export function TrackContextMenu({ position, track, onClose }: TrackContextMenuProps) {
  const { playlists, addTrackToPlaylist, removeTrackFromPlaylist, init: initPlaylists } = usePlaylistStore();
  const { addToQueue, insertNext } = useQueueStore();
  const { isFavoriteTrack, addFavoriteTrack, removeFavoriteTrack } = useLibraryStore();
  const [isVisible, setIsVisible] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Check if track is liked
  const isLiked = isFavoriteTrack(track.id);

  // Initialize playlists
  useEffect(() => {
    initPlaylists();
  }, [initPlaylists]);

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
      const target = e.target as HTMLElement;
      // Check if click is inside the menu
      if (menuRef.current && menuRef.current.contains(target)) {
        return;
      }
      // Check if click is inside a playlist picker portal (has data-playlist-picker attribute)
      if (target.closest('[data-playlist-picker]')) {
        return;
      }
      handleClose();
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

  const handlePlayNext = () => {
    if (track.streamUrl) {
      insertNext(track as any);
    }
    handleClose();
  };

  const handleAddToQueue = () => {
    if (track.streamUrl) {
      addToQueue(track as any);
    }
    handleClose();
  };

  const handleAddToPlaylist = async (playlist: Playlist) => {
    if (playlist.id) {
      await addTrackToPlaylist(playlist.id, track as any);
    }
    // Don't close - allow adding to multiple playlists
  };

  const handleRemoveFromPlaylist = async (playlist: Playlist) => {
    if (playlist.id) {
      await removeTrackFromPlaylist(playlist.id, track.id);
    }
    // Don't close - allow managing multiple playlists
  };

  const handleCopyLink = async () => {
    // Prefer album URL, fallback to band URL
    const url = track.albumUrl || track.bandUrl;
    if (url) {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => {
          handleClose();
        }, 800);
      } catch (err) {
        console.error('Failed to copy:', err);
        handleClose();
      }
    }
  };

  const handleToggleLike = () => {
    if (isLiked) {
      removeFavoriteTrack(track.id);
    } else {
      addFavoriteTrack(track as any);
    }
    handleClose();
  };

  const isStreamable = !!track.streamUrl;
  const hasUrl = !!(track.albumUrl || track.bandUrl);

  // Render via portal to escape any parent overflow/z-index issues
  return createPortal(
    <div
      ref={menuRef}
      className={cn(
        'fixed z-[9999]',
        'w-[260px]',
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
      {/* Track Info Header */}
      <div className="px-3 pb-2 mb-1 border-b border-white/5 max-w-full overflow-hidden">
        <p className="text-sm font-medium text-text truncate max-w-[236px]">{track.title}</p>
        {track.artist && (
          <p className="text-xs text-text/60 truncate max-w-[236px]">{track.artist}</p>
        )}
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
        <button
          onClick={handlePlayNext}
          disabled={!isStreamable}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
            'text-sm text-left',
            'transition-colors duration-100',
            isStreamable
              ? 'text-text hover:bg-white/10'
              : 'text-text/60 cursor-not-allowed'
          )}
        >
          <ListPlus size={16} className="text-text/60" />
          Play Next
        </button>

        {/* Add to Queue */}
        <button
          onClick={handleAddToQueue}
          disabled={!isStreamable}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
            'text-sm text-left',
            'transition-colors duration-100',
            isStreamable
              ? 'text-text hover:bg-white/10'
              : 'text-text/60 cursor-not-allowed'
          )}
        >
          <ListEnd size={16} className="text-text/60" />
          Add to Queue
        </button>

        {/* Add to Playlist - with hover submenu */}
        <AddToPlaylistItem
          playlists={playlists}
          onSelect={handleAddToPlaylist}
          onRemove={handleRemoveFromPlaylist}
          track={track}
          onClose={handleClose}
        />

        {/* Divider */}
        <div className="my-1 border-t border-white/5" />

        {/* Copy Link */}
        <button
          onClick={handleCopyLink}
          disabled={!hasUrl}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
            'text-sm text-left',
            'transition-colors duration-100',
            hasUrl
              ? 'text-text hover:bg-white/10'
              : 'text-text/60 cursor-not-allowed'
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
      </div>
    </div>,
    document.body
  );
}

// ============================================
// Add to Playlist Menu Item (with hover delay)
// ============================================

interface AddToPlaylistItemProps {
  playlists: Playlist[];
  onSelect: (playlist: Playlist) => void;
  onRemove: (playlist: Playlist) => void;
  track: TrackContextMenuProps['track'];
  onClose: () => void;
}

function AddToPlaylistItem({ playlists, onSelect, onRemove, track, onClose }: AddToPlaylistItemProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    // Clear any pending hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    // Get button position for portal
    if (buttonRef.current) {
      setButtonRect(buttonRef.current.getBoundingClientRect());
    }
    setShowPicker(true);
  };

  const handleMouseLeave = () => {
    // Delay hiding by 500ms to allow moving to submenu
    hideTimeoutRef.current = setTimeout(() => {
      setIsPickerVisible(false);
      // Wait for exit animation before unmounting
      setTimeout(() => setShowPicker(false), 150);
    }, 500);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={buttonRef}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
          'text-sm text-left',
          'text-text hover:bg-white/10',
          'transition-colors duration-100',
          showPicker && 'bg-white/10'
        )}
      >
        <Plus size={16} className="text-text/60" />
        <span className="flex-1">Add to Playlist</span>
        <ChevronRight size={14} className={cn(
          'text-text/60 transition-transform duration-150',
          showPicker && 'translate-x-0.5'
        )} />
      </button>

      {/* Playlist Submenu - shows on hover with animation */}
      {showPicker && buttonRect && (
        <PlaylistPicker
          playlists={playlists}
          onSelect={onSelect}
          onRemove={onRemove}
          track={track}
          onClose={onClose}
          isVisible={isPickerVisible}
          setIsVisible={setIsPickerVisible}
          parentRect={buttonRect}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
      )}
    </div>
  );
}

// ============================================
// Playlist Picker Submenu
// ============================================

interface PlaylistPickerProps {
  playlists: Playlist[];
  onSelect: (playlist: Playlist) => void;
  onRemove: (playlist: Playlist) => void;
  track: TrackContextMenuProps['track'];
  onClose: () => void;
  isVisible: boolean;
  setIsVisible: (visible: boolean) => void;
  parentRect: DOMRect;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function PlaylistPicker({ playlists, onSelect, onRemove, track, onClose, isVisible, setIsVisible, parentRect, onMouseEnter, onMouseLeave }: PlaylistPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [subPosition, setSubPosition] = useState<'right' | 'left'>('right');
  const { openCreatePlaylistModal } = useUIStore();
  const { getPlaylistArtIds } = usePlaylistStore();

  // Check if track is already in playlist
  const isTrackInPlaylist = (playlist: Playlist): boolean => {
    return playlist.trackIds.includes(track.id);
  };

  // Calculate position on mount
  useEffect(() => {
    const pickerWidth = 220;
    let x = parentRect.right + 4;
    let side: 'right' | 'left' = 'right';

    // Check if it would go off screen to the right
    if (x + pickerWidth > window.innerWidth - 16) {
      x = parentRect.left - pickerWidth - 4;
      side = 'left';
    }

    setPosition({ x, y: parentRect.top });
    setSubPosition(side);
  }, [parentRect]);

  // Enter animation - trigger on mount with small delay for CSS transition
  useEffect(() => {
    // Double RAF ensures browser has painted the initial state
    const timer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    });
    return () => cancelAnimationFrame(timer);
  }, [setIsVisible]);

  const handleCreatePlaylist = () => {
    // Close context menu and open create playlist modal with the track
    onClose();
    openCreatePlaylistModal(track);
  };

  // Render via portal to escape backdrop-filter nesting
  return createPortal(
    <div
      ref={pickerRef}
      data-playlist-picker
      className={cn(
        'fixed z-[9999]',
        'w-[220px] max-h-[300px]',
        'py-2 rounded-2xl',
        'liquid-glass-glow',
        'overflow-hidden flex flex-col',
        // Smooth fade + scale transition for enter/exit
        'transition-[opacity,transform] duration-200 ease-out',
        isVisible
          ? 'opacity-100 scale-100'
          : 'opacity-0 scale-90'
      )}
      style={{
        left: position.x,
        top: position.y,
        transformOrigin: subPosition === 'right' ? 'top left' : 'top right',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Create New Playlist - always at top */}
      <div className="px-1 pb-1 border-b border-white/5 flex-shrink-0">
        <button
          onClick={handleCreatePlaylist}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg',
            'text-sm text-left',
            'text-text hover:bg-white/10',
            'transition-colors duration-100'
          )}
        >
          <div className="w-8 h-8 rounded bg-highlight-med flex items-center justify-center flex-shrink-0">
            <Plus size={14} className="text-text/60" />
          </div>
          <span className="truncate">New Playlist</span>
        </button>
      </div>

      {/* Existing Playlists */}
      <div className="overflow-y-auto scrollbar-thin flex-1">
        {playlists.length === 0 ? (
          <div className="px-3 py-3 text-center">
            <p className="text-xs text-text/60">No playlists yet</p>
          </div>
        ) : (
          <div className="px-1 pt-1">
            {playlists.map((playlist) => {
              const alreadyInPlaylist = isTrackInPlaylist(playlist);
              return (
                <button
                  key={playlist.id}
                  onClick={() => alreadyInPlaylist ? onRemove(playlist) : onSelect(playlist)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg group/item',
                    'text-sm text-left',
                    'transition-colors duration-100',
                    alreadyInPlaylist
                      ? 'text-foam bg-foam/10 hover:bg-love/10 hover:text-love'
                      : 'text-text hover:bg-white/10'
                  )}
                >
                  <div className="w-8 h-8 rounded bg-highlight-med overflow-hidden flex-shrink-0">
                    <PlaylistCover
                      coverImage={playlist.coverImage}
                      artIds={getPlaylistArtIds(playlist.trackIds)}
                      size="sm"
                      alt={playlist.name}
                    />
                  </div>
                  <span className="truncate flex-1">{playlist.name}</span>
                  {alreadyInPlaylist && (
                    <>
                      <Check size={14} className="text-foam flex-shrink-0 group-hover/item:hidden" />
                      <X size={14} className="text-love flex-shrink-0 hidden group-hover/item:block" />
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ============================================
// Hook for managing context menu state
// ============================================

export interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  track: TrackContextMenuProps['track'] | null;
}

export function useTrackContextMenu() {
  const [state, setState] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    track: null,
  });

  const openMenu = useCallback((
    e: React.MouseEvent,
    track: TrackContextMenuProps['track']
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setState({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      track,
    });
  }, []);

  const closeMenu = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false, track: null }));
  }, []);

  return {
    state,
    openMenu,
    closeMenu,
  };
}
