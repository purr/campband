import { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';
import { Heart, ListPlus, Play, Plus, ChevronRight, Music } from 'lucide-react';
import { cn, toPlayableTrack } from '@/lib/utils';
import { usePlaylistStore, useQueueStore, useLibraryStore } from '@/lib/store';
import { buildArtUrl, ImageSizes, type Track } from '@/types';
import type { FavoriteTrack } from '@/lib/db';

// ============================================
// Context Menu Types
// ============================================

interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuState {
  isOpen: boolean;
  position: ContextMenuPosition;
  track: Track | FavoriteTrack | null;
}

interface ContextMenuContextType {
  openMenu: (track: Track | FavoriteTrack, e: React.MouseEvent) => void;
  closeMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextType | null>(null);

export function useContextMenu() {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error('useContextMenu must be used within ContextMenuProvider');
  }
  return context;
}

// ============================================
// Context Menu Provider
// ============================================

interface ContextMenuProviderProps {
  children: React.ReactNode;
}

export function ContextMenuProvider({ children }: ContextMenuProviderProps) {
  const [menuState, setMenuState] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    track: null,
  });

  const openMenu = useCallback((track: Track | FavoriteTrack, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Calculate position, ensuring menu stays within viewport
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 300);

    setMenuState({
      isOpen: true,
      position: { x, y },
      track,
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuState(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeMenu]);

  return (
    <ContextMenuContext.Provider value={{ openMenu, closeMenu }}>
      {children}
      {menuState.isOpen && menuState.track && (
        <TrackContextMenu
          track={menuState.track}
          position={menuState.position}
          onClose={closeMenu}
        />
      )}
    </ContextMenuContext.Provider>
  );
}

// ============================================
// Track Context Menu
// ============================================

interface TrackContextMenuProps {
  track: Track | FavoriteTrack;
  position: ContextMenuPosition;
  onClose: () => void;
}

function TrackContextMenu({ track, position, onClose }: TrackContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showPlaylistSubmenu, setShowPlaylistSubmenu] = useState(false);
  const [submenuPosition, setSubmenuPosition] = useState<'left' | 'right'>('right');

  const { playlists, addTrackToPlaylist, init: initPlaylists } = usePlaylistStore();
  const { addToQueue, insertNext } = useQueueStore();
  const { isFavoriteTrack, addFavoriteTrack, removeFavoriteTrack } = useLibraryStore();

  // Initialize playlists
  useEffect(() => {
    initPlaylists();
  }, [initPlaylists]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Small delay to prevent immediate close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Determine submenu position based on available space
  useEffect(() => {
    if (position.x > window.innerWidth - 450) {
      setSubmenuPosition('left');
    } else {
      setSubmenuPosition('right');
    }
  }, [position.x]);

  const isLiked = isFavoriteTrack(track.id);

  const handlePlayNext = () => {
    if (track.streamUrl) {
      insertNext(toPlayableTrack(track));
    }
    onClose();
  };

  const handleAddToQueue = () => {
    if (track.streamUrl) {
      addToQueue(toPlayableTrack(track));
    }
    onClose();
  };

  const handleToggleLike = () => {
    if (isLiked) {
      removeFavoriteTrack(track.id);
    } else {
      addFavoriteTrack(toPlayableTrack(track));
    }
    onClose();
  };

  const handleAddToPlaylist = async (playlistId: number) => {
    try {
      await addTrackToPlaylist(playlistId, track);
    } catch (error) {
      console.error('[ContextMenu] Failed to add to playlist:', error);
    }
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" />

      {/* Menu */}
      <div
        ref={menuRef}
        className={cn(
          'fixed z-50 py-1.5 rounded-2xl min-w-[200px]',
          'liquid-glass-glow',
          'animate-in fade-in zoom-in-95 duration-150'
        )}
        style={{ left: position.x, top: position.y }}
      >
        {/* Track Info Header */}
        <div className="px-3 py-2 border-b border-white/5 mb-1">
          <div className="flex items-center gap-3">
            {track.artId && (
              <img
                src={buildArtUrl(track.artId, ImageSizes.THUMB_100)}
                alt=""
                className="w-10 h-10 rounded-md object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text truncate">{track.title}</p>
              <p className="text-xs text-text/60 truncate">
                {'artist' in track ? track.artist : track.bandName}
              </p>
            </div>
          </div>
        </div>

        {/* Play Next */}
        {track.streamUrl && (
          <MenuItem
            icon={<Play size={16} />}
            label="Play Next"
            onClick={handlePlayNext}
          />
        )}

        {/* Add to Queue */}
        {track.streamUrl && (
          <MenuItem
            icon={<ListPlus size={16} />}
            label="Add to Queue"
            onClick={handleAddToQueue}
          />
        )}

        {/* Divider */}
        <div className="my-1.5 mx-2 border-t border-white/5" />

        {/* Add to Playlist - with submenu */}
        <div
          className="relative"
          onMouseEnter={() => setShowPlaylistSubmenu(true)}
          onMouseLeave={() => setShowPlaylistSubmenu(false)}
        >
          <MenuItem
            icon={<Plus size={16} />}
            label="Add to Playlist"
            hasSubmenu
          />

          {/* Playlist Submenu */}
          {showPlaylistSubmenu && (
            <div
              className={cn(
                'absolute top-0 py-1.5 rounded-2xl min-w-[180px]',
                'liquid-glass-glow',
                'animate-in fade-in slide-in-from-left-2 duration-100',
                submenuPosition === 'right' ? 'left-full ml-1' : 'right-full mr-1'
              )}
            >
              {playlists.length === 0 ? (
                <div className="px-3 py-2 text-sm text-text/60">
                  No playlists yet
                </div>
              ) : (
                playlists.map((playlist) => (
                  <PlaylistMenuItem
                    key={playlist.id}
                    playlist={playlist}
                    onClick={() => handleAddToPlaylist(playlist.id!)}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="my-1.5 mx-2 border-t border-white/5" />

        {/* Like/Unlike */}
        <MenuItem
          icon={<Heart size={16} fill={isLiked ? 'currentColor' : 'none'} />}
          label={isLiked ? 'Remove from Liked' : 'Add to Liked'}
          onClick={handleToggleLike}
          className={isLiked ? 'text-love' : undefined}
        />
      </div>
    </>
  );
}

// ============================================
// Menu Item Components
// ============================================

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  hasSubmenu?: boolean;
  className?: string;
}

function MenuItem({ icon, label, onClick, hasSubmenu, className }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-3 py-2 text-sm text-left flex items-center gap-3',
        'text-text hover:bg-highlight-low transition-colors',
        className
      )}
    >
      <span className="text-text/60">{icon}</span>
      <span className="flex-1">{label}</span>
      {hasSubmenu && <ChevronRight size={14} className="text-text/60" />}
    </button>
  );
}

interface PlaylistMenuItemProps {
  playlist: {
    id?: number;
    name: string;
    coverImage?: string;
    trackIds: number[];
  };
  onClick: () => void;
}

function PlaylistMenuItem({ playlist, onClick }: PlaylistMenuItemProps) {
  const { favoriteTracks } = useLibraryStore();

  // Get first cover art for preview
  const firstArtId = playlist.trackIds
    .map(id => favoriteTracks.find(t => t.id === id)?.artId)
    .find(id => id !== undefined);

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-3 py-2 text-sm text-left flex items-center gap-3',
        'text-text hover:bg-highlight-low transition-colors'
      )}
    >
      <div className="w-8 h-8 rounded-md overflow-hidden bg-highlight-med flex-shrink-0">
        {playlist.coverImage ? (
          <img src={playlist.coverImage} alt="" className="w-full h-full object-cover" />
        ) : firstArtId ? (
          <img src={buildArtUrl(firstArtId, ImageSizes.THUMB_100)} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text/60">
            <Music size={14} />
          </div>
        )}
      </div>
      <span className="truncate">{playlist.name}</span>
    </button>
  );
}

