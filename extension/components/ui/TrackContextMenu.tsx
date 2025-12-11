import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ListPlus, ListEnd, Plus, ChevronRight, Heart, Link, Check, X } from 'lucide-react';
import { cn, toPlayableTrack, registerContextMenu, unregisterContextMenu, notifyMenuClosed, notifyMenuOpening, scheduleCloseFromMousedown } from '@/lib/utils';
import { usePlaylistStore, useQueueStore, useUIStore, useLibraryStore, useSettingsStore } from '@/lib/store';
import { PlaylistCover } from '@/components/shared';
import { useUnlikeConfirm } from './ConfirmProvider';
import type { Playlist } from '@/lib/db';

interface TrackContextMenuProps {
  position: { x: number; y: number };
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
  onClose: () => void;
}

export function TrackContextMenu({ position, track, onClose }: TrackContextMenuProps) {
  const { playlists, addTrackToPlaylist, removeTrackFromPlaylist, init: initPlaylists } = usePlaylistStore();
  const { addToQueue, insertNext } = useQueueStore();
  const { isFavoriteTrack, addFavoriteTrack, removeFavoriteTrack } = useLibraryStore();
  const confirmOnUnlike = useSettingsStore((state) => state.app.confirmOnUnlike);
  const { confirmUnlikeTrack } = useUnlikeConfirm();
  const [isVisible, setIsVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  const isLiked = isFavoriteTrack(track.id);

  useEffect(() => {
    initPlaylists();
  }, [initPlaylists]);

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
    registerContextMenu('track', handleClose);
    return () => {
      unregisterContextMenu('track');
      notifyMenuClosed('track');
    };
  }, [handleClose]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (menuRef.current && menuRef.current.contains(target)) {
        return;
      }
      if (target.closest('[data-playlist-picker]')) {
        return;
      }
      scheduleCloseFromMousedown('track');
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

  const handlePlayNext = () => {
    if (track.streamUrl) {
      insertNext(toPlayableTrack(track));
    }
    handleClose();
  };

  const handleAddToQueue = () => {
    if (track.streamUrl) {
      addToQueue(toPlayableTrack(track));
    }
    handleClose();
  };

  const handleAddToPlaylist = async (playlist: Playlist) => {
    if (playlist.id) {
      await addTrackToPlaylist(playlist.id, toPlayableTrack(track));
    }
  };

  const handleRemoveFromPlaylist = async (playlist: Playlist) => {
    if (playlist.id) {
      await removeTrackFromPlaylist(playlist.id, track.id);
    }
  };

  const handleCopyLink = async () => {
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

  const handleToggleLike = async () => {
    if (isLiked) {
      if (confirmOnUnlike) {
        const confirmed = await confirmUnlikeTrack(track.title);
        if (confirmed) {
          removeFavoriteTrack(track.id);
        }
      } else {
        removeFavoriteTrack(track.id);
      }
    } else {
      addFavoriteTrack(toPlayableTrack(track));
    }
    handleClose();
  };

  const isStreamable = !!track.streamUrl;
  const hasUrl = !!(track.albumUrl || track.bandUrl);

  return createPortal(
    <div
      ref={menuRef}
      className={cn(
        'fixed z-[9999]',
        'w-[260px]',
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
      <div className="px-3 pb-2 mb-1 border-b border-white/5 max-w-full overflow-hidden">
        <p className="text-sm font-medium text-text truncate max-w-[236px]">{track.title}</p>
        {track.artist && (
          <p className="text-xs text-text/60 truncate max-w-[236px]">{track.artist}</p>
        )}
      </div>

      <div className="px-1">
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

        <AddToPlaylistItem
          playlists={playlists}
          onSelect={handleAddToPlaylist}
          onRemove={handleRemoveFromPlaylist}
          track={track}
          onClose={handleClose}
        />

        <div className="my-1 border-t border-white/5" />

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
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    if (buttonRef.current) {
      setButtonRect(buttonRef.current.getBoundingClientRect());
    }
    setShowPicker(true);
  };

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setIsPickerVisible(false);
      setTimeout(() => setShowPicker(false), 150);
    }, 500);
  };

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

  const isTrackInPlaylist = (playlist: Playlist): boolean => {
    return playlist.trackIds.includes(track.id);
  };

  useEffect(() => {
    const pickerWidth = 220;
    let x = parentRect.right + 4;
    let side: 'right' | 'left' = 'right';

    if (x + pickerWidth > window.innerWidth - 16) {
      x = parentRect.left - pickerWidth - 4;
      side = 'left';
    }

    setPosition({ x, y: parentRect.top });
    setSubPosition(side);
  }, [parentRect]);

  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    });
    return () => cancelAnimationFrame(timer);
  }, [setIsVisible]);

  const handleCreatePlaylist = () => {
    onClose();
    openCreatePlaylistModal(track);
  };

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

  const openMenu = useCallback(async (
    e: React.MouseEvent,
    track: TrackContextMenuProps['track']
  ) => {
    e.preventDefault();
    e.stopPropagation();
    
    await notifyMenuOpening('track');
    
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
