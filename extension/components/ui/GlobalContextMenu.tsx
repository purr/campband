/**
 * GlobalContextMenu - Unified context menu system for all right-click menus
 *
 * This provides consistent context menus across the entire app:
 * - Track context menu (add to queue, playlist, like, etc.)
 * - Album context menu (play all, add to queue, like, etc.)
 * - Artist context menu (follow, go to page, etc.)
 * - Playlist context menu (edit, delete, etc.)
 * - Liked songs context menu
 *
 * Architecture:
 * - State managed via contextMenuCoordinator (lib/utils/contextMenuCoordinator.ts)
 * - Rendered via React Portal to document.body (escapes parent stacking contexts)
 * - Position auto-adjusts to stay within viewport
 * - Submenus for "Add to Playlist" with smooth hover transitions
 *
 * Usage:
 * const { openTrackMenu, openAlbumMenu, openArtistMenu, openPlaylistMenu } = useContextMenu();
 * <div onContextMenu={(e) => openTrackMenu(e, track)} />
 *
 * State is global (no React context needed), so useContextMenu() can be called anywhere.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ListPlus, ListEnd, Plus, ChevronRight, Heart, Link, Check, X,
  ExternalLink, Play, Loader2, Pencil, Trash2
} from 'lucide-react';
import { cn, toPlayableTrack, getDisplayTitle, getMenuState, closeContextMenu, scheduleCloseFromMousedown, cancelPendingClose, subscribeToContextMenu } from '@/lib/utils';
import { usePlaylistStore, useQueueStore, useUIStore, useLibraryStore, useSettingsStore, usePlayerStore, useArtistStore, useAlbumStore } from '@/lib/store';
import { PlaylistCover } from '@/components/shared';
import { useUnlikeConfirm } from './ConfirmProvider';
import type { Playlist } from '@/lib/db';
import type { Album, Track } from '@/types';

// ============================================
// Main Global Context Menu Component
// ============================================

export function GlobalContextMenu() {
  const [menuState, setMenuState] = useState(getMenuState());

  useEffect(() => {
    return subscribeToContextMenu(() => {
      setMenuState({ ...getMenuState() });
    });
  }, []);

  if (!menuState.type) return null;

  return (
    <ContextMenuContainer
      key={menuState.key}
      type={menuState.type}
      position={menuState.position}
      data={menuState.data}
      isVisible={menuState.isVisible}
    />
  );
}

// ============================================
// Container that handles positioning & animation
// ============================================

interface ContainerProps {
  type: 'track' | 'album' | 'artist' | 'playlist' | 'likedSongs';
  position: { x: number; y: number };
  data: unknown;
  isVisible: boolean;
}

function ContextMenuContainer({ type, position, data, isVisible }: ContainerProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

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

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (menuRef.current && menuRef.current.contains(target)) {
        return;
      }
      if (target.closest('[data-playlist-picker]')) {
        return;
      }
      scheduleCloseFromMousedown();
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContextMenu();
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
  }, []);

  const renderContent = () => {
    switch (type) {
      case 'track':
        return <TrackMenuContent track={data as TrackData} />;
      case 'album':
        return <AlbumMenuContent album={data as AlbumData} />;
      case 'artist':
        return <ArtistMenuContent artist={data as ArtistData} />;
      case 'playlist':
        return <PlaylistMenuContent playlist={data as Playlist} />;
      case 'likedSongs':
        return <LikedSongsMenuContent />;
      default:
        return null;
    }
  };

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
      {renderContent()}
    </div>,
    document.body
  );
}

// ============================================
// Track Menu Content
// ============================================

interface TrackData {
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
}

function TrackMenuContent({ track }: { track: TrackData }) {
  const { playlists, addTrackToPlaylist, removeTrackFromPlaylist, init: initPlaylists } = usePlaylistStore();
  const { addToQueue, insertNext } = useQueueStore();
  const { isFavoriteTrack, addFavoriteTrack, removeFavoriteTrack } = useLibraryStore();
  const confirmOnUnlike = useSettingsStore((state) => state.app.confirmOnUnlike);
  const { confirmUnlikeTrack } = useUnlikeConfirm();
  const [copied, setCopied] = useState(false);

  const isLiked = isFavoriteTrack(track.id);

  useEffect(() => {
    initPlaylists();
  }, [initPlaylists]);

  const handlePlayNext = () => {
    if (track.streamUrl) {
      insertNext(toPlayableTrack(track));
    }
    closeContextMenu();
  };

  const handleAddToQueue = () => {
    if (track.streamUrl) {
      addToQueue(toPlayableTrack(track));
    }
    closeContextMenu();
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
        setTimeout(() => closeContextMenu(), 800);
      } catch (err) {
        console.error('Failed to copy:', err);
        closeContextMenu();
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
    closeContextMenu();
  };

  const isStreamable = !!track.streamUrl;
  const hasUrl = !!(track.albumUrl || track.bandUrl);

  return (
    <>
      <div className="px-3 pb-2 mb-1 border-b border-white/5 max-w-full overflow-hidden">
        <p className="text-sm font-medium text-text truncate max-w-[236px]">{getDisplayTitle(track)}</p>
        {track.artist && (
          <p className="text-xs text-text/60 truncate max-w-[236px]">{track.artist}</p>
        )}
      </div>

      <div className="px-1">
        <MenuButton onClick={handleToggleLike} variant={isLiked ? 'love' : 'default'}>
          <Heart size={16} className={isLiked ? 'text-love' : 'text-text/60'} fill={isLiked ? 'currentColor' : 'none'} />
          {isLiked ? 'Unlike' : 'Like'}
        </MenuButton>

        <MenuButton onClick={handlePlayNext} disabled={!isStreamable}>
          <ListPlus size={16} className="text-text/60" />
          Play Next
        </MenuButton>

        <MenuButton onClick={handleAddToQueue} disabled={!isStreamable}>
          <ListEnd size={16} className="text-text/60" />
          Add to Queue
        </MenuButton>

        <AddToPlaylistItem
          playlists={playlists}
          onSelect={handleAddToPlaylist}
          onRemove={handleRemoveFromPlaylist}
          track={track}
        />

        <div className="my-1 border-t border-white/5" />

        <MenuButton onClick={handleCopyLink} disabled={!hasUrl}>
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
        </MenuButton>
      </div>
    </>
  );
}

// ============================================
// Album Menu Content
// ============================================

interface AlbumData {
  id: number;
  title: string;
  artist: string;
  url: string;
  artId?: number;
  bandId?: number;
  bandUrl?: string;
  releaseDate?: string;
  tracks?: Array<{
    id: number;
    title: string;
    duration: number;
    streamUrl?: string;
    artId?: number;
  }>;
}

function AlbumMenuContent({ album }: { album: AlbumData }) {
  const { isFavoriteAlbum, addFavoriteAlbum, removeFavoriteAlbum } = useLibraryStore();
  const { setQueue, addMultipleToQueue, insertMultipleNext } = useQueueStore();
  const { play } = usePlayerStore();
  const { getAlbumWithCache } = useAlbumStore();
  const confirmOnUnlike = useSettingsStore((state) => state.app.confirmOnUnlike);
  const { confirmUnlikeAlbum } = useUnlikeConfirm();
  const [copied, setCopied] = useState(false);
  const [playingNext, setPlayingNext] = useState(false);
  const [addedToQueue, setAddedToQueue] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isLiked = isFavoriteAlbum(album.id);

  const getAlbumTracks = async (): Promise<Track[]> => {
    if (album.tracks && album.tracks.length > 0) {
      return album.tracks.filter(t => t.streamUrl) as Track[];
    }
    // Use cache instead of direct fetch
    const releaseData = await getAlbumWithCache(album.url);
    return releaseData.tracks.filter(t => t.streamUrl);
  };

  const handlePlay = async () => {
    setIsLoading(true);
    try {
      const tracks = await getAlbumTracks();
      if (tracks.length > 0) {
        setQueue(tracks);
        play();
      }
    } catch (e) {
      console.error('[AlbumContextMenu] Failed to play:', e);
    }
    closeContextMenu();
  };

  const handlePlayNext = async () => {
    setIsLoading(true);
    try {
      const tracks = await getAlbumTracks();
      if (tracks.length > 0) {
        insertMultipleNext(tracks);
        setPlayingNext(true);
        setTimeout(() => closeContextMenu(), 800);
        return;
      }
    } catch (e) {
      console.error('[AlbumContextMenu] Failed to play next:', e);
    }
    closeContextMenu();
  };

  const handleAddToQueue = async () => {
    setIsLoading(true);
    try {
      const tracks = await getAlbumTracks();
      if (tracks.length > 0) {
        addMultipleToQueue(tracks);
        setAddedToQueue(true);
        setTimeout(() => closeContextMenu(), 800);
        return;
      }
    } catch (e) {
      console.error('[AlbumContextMenu] Failed to add to queue:', e);
    }
    closeContextMenu();
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(album.url);
      setCopied(true);
      setTimeout(() => closeContextMenu(), 800);
    } catch (err) {
      console.error('Failed to copy:', err);
      closeContextMenu();
    }
  };

  const handleToggleLike = async () => {
    if (isLiked) {
      if (confirmOnUnlike) {
        const confirmed = await confirmUnlikeAlbum(album.title);
        if (confirmed) {
          removeFavoriteAlbum(album.id);
        }
      } else {
        removeFavoriteAlbum(album.id);
      }
    } else {
      addFavoriteAlbum({
        id: album.id,
        title: album.title,
        artist: album.artist,
        url: album.url,
        artId: album.artId,
        bandId: album.bandId,
        bandUrl: album.bandUrl,
        releaseDate: album.releaseDate,
      } as Album);
    }
    closeContextMenu();
  };

  const handleOpenInBandcamp = () => {
    window.open(album.url, '_blank', 'noopener,noreferrer');
    closeContextMenu();
  };

  return (
    <>
      <div className="px-3 pb-2 mb-1 border-b border-white/5">
        <p className="text-sm font-medium text-text truncate">{album.title}</p>
        <p className="text-xs text-text/60 truncate">{album.artist}</p>
      </div>

      <div className="px-1">
        <MenuButton onClick={handlePlay} disabled={isLoading}>
          {isLoading ? <Loader2 size={16} className="text-text/60 animate-spin" /> : <Play size={16} className="text-text/60" />}
          Play
        </MenuButton>

        <MenuButton onClick={handlePlayNext} disabled={isLoading}>
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
        </MenuButton>

        <MenuButton onClick={handleAddToQueue} disabled={isLoading}>
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
        </MenuButton>

        <div className="my-1 border-t border-white/5" />

        <MenuButton onClick={handleToggleLike} variant={isLiked ? 'love' : 'default'}>
          <Heart size={16} className={isLiked ? 'text-love' : 'text-text/60'} fill={isLiked ? 'currentColor' : 'none'} />
          {isLiked ? 'Unlike' : 'Like'}
        </MenuButton>

        <div className="my-1 border-t border-white/5" />

        <MenuButton onClick={handleCopyLink}>
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
        </MenuButton>

        <MenuButton onClick={handleOpenInBandcamp}>
          <ExternalLink size={16} className="text-text/60" />
          Open in Bandcamp
        </MenuButton>
      </div>
    </>
  );
}

// ============================================
// Artist Menu Content
// ============================================

interface ArtistData {
  id: number;
  name: string;
  url: string;
  imageUrl?: string;
}

function ArtistMenuContent({ artist }: { artist: ArtistData }) {
  const { isFavoriteArtist, addFavoriteArtist, removeFavoriteArtist } = useLibraryStore();
  const { setQueue, addMultipleToQueue, insertMultipleNext } = useQueueStore();
  const { play } = usePlayerStore();
  const { loadArtistReleasesForPlayback } = useArtistStore();
  const confirmOnUnlike = useSettingsStore((state) => state.app.confirmOnUnlike);
  const { confirmUnfollowArtist } = useUnlikeConfirm();
  const [copied, setCopied] = useState(false);
  const [isLoadingPlayback, setIsLoadingPlayback] = useState(false);
  const [playingNext, setPlayingNext] = useState(false);
  const [addedToQueue, setAddedToQueue] = useState(false);

  const isLiked = isFavoriteArtist(artist.id);

  const handlePlay = async () => {
    setIsLoadingPlayback(true);
    try {
      // Load ALL releases (no limit) - uses cache for speed
      const tracks = await loadArtistReleasesForPlayback(artist.url);
      if (tracks.length > 0) {
        setQueue(tracks);
        play();
      }
    } catch (e) {
      console.error('[ArtistContextMenu] Failed to play:', e);
    }
    closeContextMenu();
  };

  const handlePlayNext = async () => {
    setIsLoadingPlayback(true);
    try {
      // Load ALL releases (no limit) - uses cache for speed
      const tracks = await loadArtistReleasesForPlayback(artist.url);
      if (tracks.length > 0) {
        insertMultipleNext(tracks);
        setPlayingNext(true);
        setTimeout(() => closeContextMenu(), 800);
        return;
      }
    } catch (e) {
      console.error('[ArtistContextMenu] Failed to play next:', e);
    }
    closeContextMenu();
  };

  const handleAddToQueue = async () => {
    setIsLoadingPlayback(true);
    try {
      // Load ALL releases (no limit) - uses cache for speed
      const tracks = await loadArtistReleasesForPlayback(artist.url);
      if (tracks.length > 0) {
        addMultipleToQueue(tracks);
        setAddedToQueue(true);
        setTimeout(() => closeContextMenu(), 800);
        return;
      }
    } catch (e) {
      console.error('[ArtistContextMenu] Failed to add to queue:', e);
    }
    closeContextMenu();
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(artist.url);
      setCopied(true);
      setTimeout(() => closeContextMenu(), 800);
    } catch (err) {
      console.error('Failed to copy:', err);
      closeContextMenu();
    }
  };

  const handleToggleLike = async () => {
    if (isLiked) {
      if (confirmOnUnlike) {
        const confirmed = await confirmUnfollowArtist(artist.name);
        if (confirmed) {
          removeFavoriteArtist(artist.id);
        }
      } else {
        removeFavoriteArtist(artist.id);
      }
    } else {
      addFavoriteArtist({
        id: artist.id,
        name: artist.name,
        url: artist.url,
      });
    }
    closeContextMenu();
  };

  const handleOpenInBandcamp = () => {
    window.open(artist.url, '_blank', 'noopener,noreferrer');
    closeContextMenu();
  };

  return (
    <>
      <div className="px-3 pb-2 mb-1 border-b border-white/5">
        <p className="text-sm font-medium text-text truncate">{artist.name}</p>
        <p className="text-xs text-text/60">Artist</p>
      </div>

      <div className="px-1">
        <MenuButton onClick={handlePlay} disabled={isLoadingPlayback}>
          {isLoadingPlayback ? <Loader2 size={16} className="text-text/60 animate-spin" /> : <Play size={16} className="text-text/60" />}
          Play
        </MenuButton>

        <MenuButton onClick={handlePlayNext} disabled={isLoadingPlayback}>
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
        </MenuButton>

        <MenuButton onClick={handleAddToQueue} disabled={isLoadingPlayback}>
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
        </MenuButton>

        <div className="my-1 border-t border-white/5" />

        <MenuButton onClick={handleToggleLike} variant={isLiked ? 'love' : 'default'}>
          <Heart size={16} className={isLiked ? 'text-love' : 'text-text/60'} fill={isLiked ? 'currentColor' : 'none'} />
          {isLiked ? 'Unlike' : 'Like'}
        </MenuButton>

        <div className="my-1 border-t border-white/5" />

        <MenuButton onClick={handleCopyLink}>
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
        </MenuButton>

        <MenuButton onClick={handleOpenInBandcamp}>
          <ExternalLink size={16} className="text-text/60" />
          Open in Bandcamp
        </MenuButton>
      </div>
    </>
  );
}

// ============================================
// Playlist Menu Content
// ============================================

function PlaylistMenuContent({ playlist }: { playlist: Playlist }) {
  const { deletePlaylist, getPlaylistTracks } = usePlaylistStore();
  const { setQueue, addMultipleToQueue, insertMultipleNext } = useQueueStore();
  const { play } = usePlayerStore();
  const { openEditPlaylistModal } = useUIStore();
  const confirmOnUnlike = useSettingsStore((state) => state.app.confirmOnUnlike);
  const { confirmDeletePlaylist } = useUnlikeConfirm();
  const [isDeleting, setIsDeleting] = useState(false);
  const [playingNext, setPlayingNext] = useState(false);
  const [addedToQueue, setAddedToQueue] = useState(false);

  const handlePlay = async () => {
    const tracks = await getPlaylistTracks(playlist.trackIds);
    const streamable = tracks.filter(t => t.streamUrl && t.duration);
    if (streamable.length > 0) {
      setQueue(streamable.map(t => toPlayableTrack(t)));
      play();
    }
    closeContextMenu();
  };

  const handlePlayNext = async () => {
    const tracks = await getPlaylistTracks(playlist.trackIds);
    const streamable = tracks.filter(t => t.streamUrl && t.duration);
    if (streamable.length > 0) {
      insertMultipleNext(streamable.map(t => toPlayableTrack(t)));
      setPlayingNext(true);
      setTimeout(() => closeContextMenu(), 800);
      return;
    }
    closeContextMenu();
  };

  const handleAddToQueue = async () => {
    const tracks = await getPlaylistTracks(playlist.trackIds);
    const streamable = tracks.filter(t => t.streamUrl && t.duration);
    if (streamable.length > 0) {
      addMultipleToQueue(streamable.map(t => toPlayableTrack(t)));
      setAddedToQueue(true);
      setTimeout(() => closeContextMenu(), 800);
      return;
    }
    closeContextMenu();
  };

  const handleEdit = () => {
    closeContextMenu();
    if (playlist.id) {
      openEditPlaylistModal({
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        coverImage: playlist.coverImage,
      });
    }
  };

  const handleDelete = async () => {
    if (!playlist.id) return;

    const hasTracks = playlist.trackIds.length > 0;

    // Confirm deletion if setting is enabled and playlist has tracks
    if (confirmOnUnlike && hasTracks) {
      const confirmed = await confirmDeletePlaylist(playlist.name);
      if (!confirmed) {
        closeContextMenu();
        return;
      }
    }

    setIsDeleting(true);
    await deletePlaylist(playlist.id);
    closeContextMenu();
  };

  const hasTracks = playlist.trackIds.length > 0;

  return (
    <>
      <div className="px-3 pb-2 mb-1 border-b border-white/5">
        <p className="text-sm font-medium text-text truncate">{playlist.name}</p>
        <p className="text-xs text-text/60">{playlist.trackIds.length} tracks</p>
      </div>

      <div className="px-1">
        <MenuButton onClick={handlePlay} disabled={!hasTracks}>
          <Play size={16} className="text-text/60" />
          Play
        </MenuButton>

        <MenuButton onClick={handlePlayNext} disabled={!hasTracks}>
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
        </MenuButton>

        <MenuButton onClick={handleAddToQueue} disabled={!hasTracks}>
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
        </MenuButton>

        <div className="my-1 border-t border-white/5" />

        <MenuButton onClick={handleEdit}>
          <Pencil size={16} className="text-text/60" />
          Edit Playlist
        </MenuButton>

        <MenuButton onClick={handleDelete} variant="danger" disabled={isDeleting}>
          <Trash2 size={16} />
          {isDeleting ? 'Deleting...' : 'Delete Playlist'}
        </MenuButton>
      </div>
    </>
  );
}

// ============================================
// Liked Songs Menu Content
// ============================================

function LikedSongsMenuContent() {
  const { favoriteTracks } = useLibraryStore();
  const { setQueue, addMultipleToQueue, insertMultipleNext } = useQueueStore();
  const { play } = usePlayerStore();
  const [playingNext, setPlayingNext] = useState(false);
  const [addedToQueue, setAddedToQueue] = useState(false);

  const handlePlay = () => {
    const streamable = favoriteTracks.filter(t => t.streamUrl && t.duration);
    if (streamable.length > 0) {
      setQueue(streamable.map(t => toPlayableTrack(t)));
      play();
    }
    closeContextMenu();
  };

  const handlePlayNext = () => {
    const streamable = favoriteTracks.filter(t => t.streamUrl && t.duration);
    if (streamable.length > 0) {
      insertMultipleNext(streamable.map(t => toPlayableTrack(t)));
      setPlayingNext(true);
      setTimeout(() => closeContextMenu(), 800);
      return;
    }
    closeContextMenu();
  };

  const handleAddToQueue = () => {
    const streamable = favoriteTracks.filter(t => t.streamUrl && t.duration);
    if (streamable.length > 0) {
      addMultipleToQueue(streamable.map(t => toPlayableTrack(t)));
      setAddedToQueue(true);
      setTimeout(() => closeContextMenu(), 800);
      return;
    }
    closeContextMenu();
  };

  const hasTracks = favoriteTracks.length > 0;

  return (
    <>
      <div className="px-3 pb-2 mb-1 border-b border-white/5 flex items-center gap-2">
        <Heart size={14} className="text-love" fill="currentColor" />
        <div>
          <p className="text-sm font-medium text-text">Liked Songs</p>
          <p className="text-xs text-text/60">{favoriteTracks.length} songs</p>
        </div>
      </div>

      <div className="px-1">
        <MenuButton onClick={handlePlay} disabled={!hasTracks}>
          <Play size={16} className="text-text/60" />
          Play
        </MenuButton>

        <MenuButton onClick={handlePlayNext} disabled={!hasTracks}>
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
        </MenuButton>

        <MenuButton onClick={handleAddToQueue} disabled={!hasTracks}>
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
        </MenuButton>
      </div>
    </>
  );
}

// ============================================
// Reusable Menu Button
// ============================================

interface MenuButtonProps {
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'love' | 'danger';
  children: React.ReactNode;
}

function MenuButton({ onClick, disabled, variant = 'default', children }: MenuButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
        'text-sm text-left',
        'transition-colors duration-100',
        disabled && 'opacity-60 cursor-not-allowed',
        variant === 'default' && 'text-text hover:bg-white/10',
        variant === 'love' && 'text-love hover:bg-white/10',
        variant === 'danger' && 'text-love hover:bg-love/10'
      )}
    >
      {children}
    </button>
  );
}

// ============================================
// Add to Playlist Submenu
// ============================================

interface AddToPlaylistItemProps {
  playlists: Playlist[];
  onSelect: (playlist: Playlist) => void;
  onRemove: (playlist: Playlist) => void;
  track: TrackData;
}

function AddToPlaylistItem({ playlists, onSelect, onRemove, track }: AddToPlaylistItemProps) {
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
  track: TrackData;
  isVisible: boolean;
  setIsVisible: (visible: boolean) => void;
  parentRect: DOMRect;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function PlaylistPicker({ playlists, onSelect, onRemove, track, isVisible, setIsVisible, parentRect, onMouseEnter, onMouseLeave }: PlaylistPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [subPosition, setSubPosition] = useState<'right' | 'left'>('right');
  const { openCreatePlaylistModal } = useUIStore();
  const { getPlaylistArtIds } = usePlaylistStore();

  const isTrackInPlaylist = (playlist: Playlist): boolean => {
    return playlist.trackIds.includes(track.id);
  };

  // Position the picker - runs after render to measure actual height
  useEffect(() => {
    const updatePosition = () => {
      const pickerWidth = 220;
      const viewportWidth = window.innerWidth;

      // Horizontal positioning
      let x = parentRect.right + 4;
      let side: 'right' | 'left' = 'right';

      if (x + pickerWidth > viewportWidth - 8) {
        x = parentRect.left - pickerWidth - 4;
        side = 'left';
      }

      // Get actual picker height after render (or estimate)
      const pickerHeight = pickerRef.current?.offsetHeight || 300;
      const viewportHeight = window.innerHeight;

      // Vertical positioning - try to align TOP of picker with TOP of parent button
      // This keeps the picker close to the "Add to Playlist" item
      let y = parentRect.top;

      // Make sure it doesn't overflow below the viewport
      if (y + pickerHeight > viewportHeight - 16) {
        // Align bottom of picker with bottom of viewport (with padding)
        y = viewportHeight - pickerHeight - 16;
      }

      // Make sure it doesn't go above the viewport
      y = Math.max(8, y);

      setPosition({ x, y });
      setSubPosition(side);
    };

    // Initial position
    updatePosition();

    // Re-measure after render to get accurate height
    const timer = requestAnimationFrame(() => {
      updatePosition();
    });

    return () => cancelAnimationFrame(timer);
  }, [parentRect, playlists.length]);

  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    });
    return () => cancelAnimationFrame(timer);
  }, [setIsVisible]);

  const handleCreatePlaylist = () => {
    closeContextMenu();
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
      <div className="px-1 pb-1 border-b border-white/5 shrink-0">
        <button
          onClick={handleCreatePlaylist}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg',
            'text-sm text-left',
            'text-text hover:bg-white/10',
            'transition-colors duration-100'
          )}
        >
          <div className="w-8 h-8 rounded bg-highlight-med flex items-center justify-center shrink-0">
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
                  <div className="w-8 h-8 rounded bg-highlight-med overflow-hidden shrink-0">
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
                      <Check size={14} className="text-foam shrink-0 group-hover/item:hidden" />
                      <X size={14} className="text-love shrink-0 hidden group-hover/item:block" />
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
// Hooks for triggering context menus
// ============================================

import { openContextMenu as openContextMenuFn, cancelPendingClose as cancelPendingCloseFn } from '@/lib/utils';

export function useContextMenu() {
  const openTrackMenu = useCallback((e: React.MouseEvent, track: TrackData) => {
    e.preventDefault();
    e.stopPropagation();
    cancelPendingCloseFn();
    openContextMenuFn('track', { x: e.clientX, y: e.clientY }, track);
  }, []);

  const openAlbumMenu = useCallback((e: React.MouseEvent, album: AlbumData) => {
    e.preventDefault();
    e.stopPropagation();
    cancelPendingCloseFn();
    openContextMenuFn('album', { x: e.clientX, y: e.clientY }, album);
  }, []);

  const openArtistMenu = useCallback((e: React.MouseEvent, artist: ArtistData) => {
    e.preventDefault();
    e.stopPropagation();
    cancelPendingCloseFn();
    openContextMenuFn('artist', { x: e.clientX, y: e.clientY }, artist);
  }, []);

  const openPlaylistMenu = useCallback((e: React.MouseEvent, playlist: Playlist) => {
    e.preventDefault();
    e.stopPropagation();
    cancelPendingCloseFn();
    openContextMenuFn('playlist', { x: e.clientX, y: e.clientY }, playlist);
  }, []);

  const openLikedSongsMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cancelPendingCloseFn();
    openContextMenuFn('likedSongs', { x: e.clientX, y: e.clientY }, null);
  }, []);

  return {
    openTrackMenu,
    openAlbumMenu,
    openArtistMenu,
    openPlaylistMenu,
    openLikedSongsMenu,
  };
}

