import { useState, useEffect, useRef, useMemo } from 'react';
import { Home, Search, Plus, Music, Disc3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore, useRouterStore, useSearchStore, usePlaylistStore, useLibraryStore } from '@/lib/store';
import { buildArtUrl, ImageSizes } from '@/types';
import { LikedCover, FollowingCover, PlaylistCover } from '@/components/shared';
import { useContextMenu } from '@/components/ui';
import { LAYOUT_CLASSES, SIDEBAR_SIZES } from '@/lib/constants/layout';

// Hosted icon URL for when running in website context (content script injection)
const HOSTED_ICON_URL = 'https://purr.github.io/campband/icon.svg';

interface NavItem {
  icon: React.ReactNode;
  label: string;
  route: 'home' | 'search' | 'following' | 'liked';
  count?: number;
}

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { currentRoute, navigate } = useRouterStore();
  const { clearResults } = useSearchStore();
  const { playlists, init: initPlaylists, getPlaylistArtIds } = usePlaylistStore();
  const { favoriteArtists, favoriteAlbums, favoriteTracks, init: initLibrary } = useLibraryStore();

  // Get icon URL - use extension URL if available, otherwise use hosted URL
  const iconUrl = useMemo(() => {
    // Check if we're in an extension context (not content script on website)
    const isExtensionContext = typeof browser !== 'undefined' &&
      browser.runtime?.getURL &&
      typeof browser.runtime.getURL === 'function' &&
      !window.location.hostname.includes('github.io');

    if (isExtensionContext) {
      try {
        return browser.runtime.getURL('/icon/icon.svg');
      } catch {
        // Fall back to hosted URL
      }
    }
    return HOSTED_ICON_URL;
  }, []);

  const [showTopShadow, setShowTopShadow] = useState(false);
  const [showBottomShadow, setShowBottomShadow] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Context menu hook
  const { openAlbumMenu, openPlaylistMenu, openLikedSongsMenu } = useContextMenu();

  // Initialize stores
  useEffect(() => {
    initPlaylists();
    initLibrary();
  }, [initPlaylists, initLibrary]);

// Track if the LAST collapse was automatic (for auto-expand on widen)
  const lastCollapseWasAuto = useRef(false);
  const { setSidebarCollapsed } = useUIStore();

  // Handle responsive sidebar - auto-collapse/expand based on screen width
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1400px)');

    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        // Screen became narrow - always collapse if expanded
        if (!sidebarCollapsed) {
          lastCollapseWasAuto.current = true;
          setSidebarCollapsed(true);
        }
      } else {
        // Screen became wide - only auto-expand if last collapse was automatic
        if (sidebarCollapsed && lastCollapseWasAuto.current) {
          lastCollapseWasAuto.current = false;
          setSidebarCollapsed(false);
        }
      }
    };

    // Check initial state
    if (mediaQuery.matches && !sidebarCollapsed) {
      lastCollapseWasAuto.current = true;
      setSidebarCollapsed(true);
    }

    // Listen for changes
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [sidebarCollapsed, setSidebarCollapsed]);

  // Handle scroll shadows
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateShadows = () => {
      setShowTopShadow(el.scrollTop > 0);
      setShowBottomShadow(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
    };

    updateShadows();
    el.addEventListener('scroll', updateShadows);

    const resizeObserver = new ResizeObserver(updateShadows);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', updateShadows);
      resizeObserver.disconnect();
    };
  }, [playlists, favoriteAlbums]);

  const mainNavItems: NavItem[] = [
    { icon: <Home size={SIDEBAR_SIZES.ICON} />, label: 'Home', route: 'home' },
    { icon: <Search size={SIDEBAR_SIZES.ICON} />, label: 'Search', route: 'search' },
  ];

  const handleNavigation = (route: NavItem['route']) => {
    if (route !== 'search') {
      clearResults();
    }
    navigate({ name: route });
  };

  const handlePlaylistClick = (playlistId: number) => {
    clearResults();
    navigate({ name: 'playlist', id: playlistId });
  };

  const handleAlbumClick = (albumUrl: string) => {
    clearResults();
    navigate({ name: 'album', url: albumUrl });
  };

  const handleCreatePlaylist = () => {
    useUIStore.getState().openCreatePlaylistModal();
  };

  const isRouteActive = (route: NavItem['route']) => {
    return currentRoute.name === route;
  };

  const isPlaylistActive = (playlistId: number) => {
    return currentRoute.name === 'playlist' && 'id' in currentRoute && currentRoute.id === playlistId;
  };

  const isAlbumActive = (albumUrl: string) => {
    return currentRoute.name === 'album' && 'url' in currentRoute && currentRoute.url === albumUrl;
  };

  const isCollapsed = sidebarCollapsed;

  return (
    <aside
      className={cn(
        'flex flex-col h-full overflow-hidden',
        'liquid-glass-sidebar border-r border-white/5',
        'transition-[width] duration-300 ease-out',
        sidebarCollapsed ? LAYOUT_CLASSES.SIDEBAR_WIDTH_COLLAPSED : LAYOUT_CLASSES.SIDEBAR_WIDTH
      )}
    >
      {/* Logo - Same height as header bar */}
      <div className={cn(
        'flex items-center gap-3 px-4 border-b border-white/5 shrink-0',
        LAYOUT_CLASSES.BAR_HEIGHT
      )}>
        <button
          onClick={() => {
            // User manually toggled - mark as manual action
            lastCollapseWasAuto.current = false;
            toggleSidebar();
          }}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'rounded-xl overflow-hidden shrink-0 hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-love/20',
            SIDEBAR_SIZES.LOGO
          )}
        >
          <img src={iconUrl} alt="CampBand" className="w-full h-full" />
        </button>
        <span
          className={cn(
            'font-bold text-lg text-text whitespace-nowrap',
            'transition-opacity duration-200',
            sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
          )}
        >
          CampBand
        </span>
      </div>

      {/* Main Navigation */}
      <nav className="px-2 py-3 space-y-1 shrink-0">
        {mainNavItems.map((item) => (
          <NavButton
            key={item.route}
            item={item}
            isActive={isRouteActive(item.route)}
            isCollapsed={sidebarCollapsed}
            onClick={() => handleNavigation(item.route)}
          />
        ))}
      </nav>

      {/* Divider */}
      <div className="mx-3 border-t border-white/5" />

      {/* Sticky Library Section - Following & Liked Songs */}
      <nav className="px-2 py-2 space-y-0.5 shrink-0">
          {/* Following - Artists */}
          <CollectionItem
            name="Following"
            type="following"
            cover={<FollowingCover size="small" />}
            trackCount={favoriteArtists.length}
            isActive={isRouteActive('following')}
            isCollapsed={sidebarCollapsed}
            onClick={() => handleNavigation('following')}
          />

          {/* Liked Songs - Special item */}
          <CollectionItem
            name="Liked Songs"
            type="liked"
            cover={<LikedCover size="small" />}
            trackCount={favoriteTracks.length}
            isActive={isRouteActive('liked')}
            isCollapsed={sidebarCollapsed}
            onClick={() => handleNavigation('liked')}
          onContextMenu={openLikedSongsMenu}
          />
      </nav>

          {/* Divider */}
      <div className="mx-3 border-t border-white/5" />

      {/* Scrollable Collections - Playlists and Liked Albums */}
      <div className="relative flex-1 min-h-0">
        {/* Top Shadow */}
        <div
          className={cn(
            'absolute top-0 left-0 right-0 h-6 z-10 pointer-events-none',
            'bg-linear-to-b from-surface/80 to-transparent',
            'transition-opacity duration-200',
            showTopShadow ? 'opacity-100' : 'opacity-0'
          )}
        />

        {/* Scrollable List */}
        <div
          ref={scrollRef}
          className={cn('h-full overflow-y-auto px-2 py-1 scrollbar-thin scroll-smooth', LAYOUT_CLASSES.MAIN_CONTENT_PADDING)}
        >
          {/* Create Playlist Button */}
          <button
            onClick={handleCreatePlaylist}
            className={cn(
              'w-full flex items-center gap-3 px-2 py-1.5 rounded-lg',
              'text-text/70 hover:text-text hover:bg-white/5',
              'transition-all duration-200',
              'focus-ring'
            )}
          >
            <div className={cn(
              'shrink-0 rounded-md overflow-hidden flex items-center justify-center bg-muted/20',
              SIDEBAR_SIZES.COVER
            )}>
              <Plus size={SIDEBAR_SIZES.ICON} className="text-text/60" />
            </div>
            <span
              className={cn(
                'font-medium text-sm whitespace-nowrap',
                'transition-opacity duration-200',
                sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
              )}
            >
              Create Playlist
            </span>
          </button>

          {/* User Playlists */}
          {playlists.map((playlist) => (
            <CollectionItem
              key={`playlist-${playlist.id}`}
              name={playlist.name}
              type="playlist"
              coverArtIds={getPlaylistArtIds(playlist.trackIds || [])}
              coverImage={playlist.coverImage}
              isActive={isPlaylistActive(playlist.id!)}
              isCollapsed={sidebarCollapsed}
              onClick={() => handlePlaylistClick(playlist.id!)}
              onContextMenu={(e) => openPlaylistMenu(e, playlist)}
            />
          ))}

          {/* Divider between playlists and liked albums */}
          {playlists.length > 0 && favoriteAlbums.length > 0 && (
            <div className="mx-2 my-2 border-t border-white/5" />
          )}

          {/* Liked Albums */}
          {favoriteAlbums.map((album) => (
            <CollectionItem
              key={`album-${album.id}`}
              name={album.title}
              type="album"
              artist={album.artist}
              artId={album.artId}
              isActive={isAlbumActive(album.url)}
              isCollapsed={sidebarCollapsed}
              onClick={() => handleAlbumClick(album.url)}
              onContextMenu={(e) => openAlbumMenu(e, {
                id: album.id,
                title: album.title,
                artist: album.artist,
                url: album.url,
                artId: album.artId,
                bandId: album.bandId,
                bandUrl: album.bandUrl,
              })}
            />
          ))}
        </div>

        {/* Bottom Shadow */}
        <div
          className={cn(
            'absolute bottom-0 left-0 right-0 h-6 z-10 pointer-events-none',
            'bg-linear-to-t from-surface/80 to-transparent',
            'transition-opacity duration-200',
            showBottomShadow ? 'opacity-100' : 'opacity-0'
          )}
        />
      </div>

    </aside>
  );
}

// ============================================
// Sub-components
// ============================================

interface NavButtonProps {
  item: NavItem;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: () => void;
}

function NavButton({ item, isActive, isCollapsed, onClick }: NavButtonProps) {
          return (
            <button
      onClick={onClick}
              className={cn(
        'w-full flex items-center gap-3 px-2 py-1.5 rounded-lg',
                'text-text/70 hover:text-text hover:bg-white/5',
                'transition-all duration-200',
                'focus-ring',
                isActive && 'text-text bg-white/8'
              )}
            >
      {/* Icon container - fixed size */}
      <div className={cn('shrink-0 flex items-center justify-center', SIDEBAR_SIZES.COVER)}>
        {item.icon}
      </div>
      {/* Text - only toggle visibility */}
              <span
                className={cn(
          'font-medium text-sm whitespace-nowrap flex-1 text-left',
                  'transition-opacity duration-200',
          isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                )}
              >
                {item.label}
              </span>
      {item.count !== undefined && !isCollapsed && (
        <span className="text-xs text-text/60 tabular-nums">{item.count}</span>
      )}
            </button>
          );
}

interface CollectionItemProps {
  name: string;
  type: 'following' | 'liked' | 'playlist' | 'album';
  cover?: React.ReactNode;
  coverImage?: string;
  coverArtIds?: number[];
  artId?: number;
  artist?: string;
  trackCount?: number;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

function CollectionItem({
  name,
  type,
  cover,
  coverImage,
  coverArtIds = [],
  artId,
  artist,
  trackCount,
  isActive,
  isCollapsed,
  onClick,
  onContextMenu,
}: CollectionItemProps) {
  const renderCover = () => {
    // Custom cover (like Liked Songs)
    if (cover) {
      return cover;
    }

    // Album art (single artId)
    if (artId) {
      return (
        <img
          src={buildArtUrl(artId, ImageSizes.THUMB_100)}
          alt={name}
          className="w-full h-full object-cover"
        />
      );
    }

    // Playlist cover (user image or auto-collage)
    return (
      <PlaylistCover
        coverImage={coverImage}
        artIds={coverArtIds}
        size="sm"
        alt={name}
      />
    );
  };

  // Get the type badge icon - fixed size
  const TypeBadge = () => {
    // Following and Liked have their own special covers - no badge needed
    if (type === 'liked' || type === 'following') return null;

    const Icon = type === 'album' ? Disc3 : Music;

    return (
      <div className={cn(
        'absolute -bottom-0.5 -right-0.5',
        'flex items-center justify-center',
        'rounded-full',
        'bg-base/70 backdrop-blur-md',
        'ring-1 ring-white/10',
        'shadow-sm shadow-base/50',
        SIDEBAR_SIZES.BADGE
      )}>
        <Icon size={SIDEBAR_SIZES.BADGE_ICON} className="text-text/70" />
      </div>
    );
  };

  return (
        <button
      onClick={onClick}
      onContextMenu={onContextMenu}
          className={cn(
        'w-full flex items-center gap-3 px-2 py-1.5 rounded-lg',
            'text-text/70 hover:text-text hover:bg-white/5',
            'transition-all duration-200',
            'focus-ring',
        isActive && 'text-text bg-white/8'
          )}
        >
      {/* Cover Art with Type Badge - fixed size */}
      <div className="relative shrink-0">
        <div className={cn(
          'overflow-hidden',
          SIDEBAR_SIZES.COVER,
          // Rounded for playlists/liked, square for albums
          type === 'album' ? 'rounded' : 'rounded-md'
        )}>
          {renderCover()}
        </div>
        <TypeBadge />
      </div>

      {/* Name and metadata - only toggle visibility */}
      <div
        className={cn(
          'flex-1 min-w-0 text-left',
          'transition-opacity duration-200',
          isCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
        )}
      >
        <span className="font-medium text-sm truncate block whitespace-nowrap">{name}</span>
          {/* Subtitle */}
          {type === 'following' && trackCount !== undefined && (
          <p className="text-xs text-text/60 whitespace-nowrap">{trackCount} artists</p>
          )}
          {type === 'liked' && trackCount !== undefined && (
          <p className="text-xs text-text/60 whitespace-nowrap">{trackCount} songs</p>
          )}
          {type === 'album' && artist && (
          <p className="text-xs text-text/60 truncate whitespace-nowrap">{artist}</p>
          )}
          {type === 'playlist' && (
          <p className="text-xs text-text/60 whitespace-nowrap">Playlist</p>
          )}
        </div>
    </button>
  );
}
