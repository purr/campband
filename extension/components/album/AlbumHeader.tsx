import { useState, useEffect } from 'react';
import { Calendar, Clock, ExternalLink, Shuffle, Play, Heart, ListPlus, Check, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils';
import { Button, Skeleton, ImageBackdrop } from '@/components/ui';
import { useLibraryStore, useQueueStore, useRouterStore } from '@/lib/store';
import { buildArtUrl, ImageSizes, type Album } from '@/types';

interface AlbumHeaderProps {
  album: Album;
  onPlayAll?: () => void;
  onShuffleAll?: () => void;
}

export function AlbumHeader({ album, onPlayAll, onShuffleAll }: AlbumHeaderProps) {
  const { isFavoriteAlbum, addFavoriteAlbum, removeFavoriteAlbum } = useLibraryStore();
  const { addMultipleToQueue } = useQueueStore();
  const { navigate } = useRouterStore();
  const isFavorite = isFavoriteAlbum(album.id);
  const [showQueueCheck, setShowQueueCheck] = useState(false);

  const handleFavoriteClick = () => {
    if (isFavorite) {
      removeFavoriteAlbum(album.id);
    } else {
      addFavoriteAlbum(album);
    }
  };

  const handleAddToQueue = () => {
    const streamableTracks = album.tracks.filter(t => t.streamUrl);
    if (streamableTracks.length > 0) {
      addMultipleToQueue(streamableTracks);
      setShowQueueCheck(true);
    }
  };

  const handleArtistClick = () => {
    if (album.bandUrl) {
      navigate({ name: 'artist', url: album.bandUrl });
    }
  };

  useEffect(() => {
    if (showQueueCheck) {
      const timer = setTimeout(() => setShowQueueCheck(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [showQueueCheck]);

  const artUrl = buildArtUrl(album.artId, ImageSizes.LARGE_1200);
  const totalDuration = album.tracks.reduce((acc, t) => acc + t.duration, 0);

  // Format release date
  const releaseDate = album.releaseDate
    ? new Date(album.releaseDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : undefined;

  return (
    <div className="relative">
      {/* Backdrop - glassy blurred image with gradient fade */}
      <ImageBackdrop
        imageUrl={artUrl}
        blur="3xl"
        scale={1.4}
        opacity={0.5}
        accentGlow="rose"
      />

      {/* Content */}
      <div className="relative z-10 px-8 pt-12 pb-8">
        <div className="flex items-end gap-8">
          {/* Album art - crops, never stretches */}
          <div className="w-56 h-56 rounded-lg overflow-hidden bg-surface shadow-2xl flex-shrink-0 ring-1 ring-white/10 relative">
            <img
              src={artUrl}
              alt={album.title}
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
          </div>

          {/* Info */}
          <div className="flex-1 pb-2">
            <p className="text-sm font-medium text-subtle uppercase tracking-wider mb-2">
              {album.tracks.length === 1 ? 'Single' : 'Album'}
            </p>
            <h1 className="text-4xl font-bold text-text mb-2 leading-tight">
              {album.title}
            </h1>
            {/* Clickable artist name */}
            <button
              onClick={handleArtistClick}
              disabled={!album.bandUrl}
              className={cn(
                'text-xl text-subtle mb-4 text-left',
                'transition-colors duration-150',
                album.bandUrl && 'hover:text-text cursor-pointer'
              )}
            >
              {album.artist}
            </button>

            <div className="flex items-center gap-4 text-muted text-sm">
              {releaseDate && (
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} />
                  {releaseDate}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Clock size={14} />
                {album.tracks.length} {album.tracks.length === 1 ? 'track' : 'tracks'} • {formatTime(totalDuration)}
              </span>
              {album.hiddenTrackCount && album.hiddenTrackCount > 0 && (
                <span className="flex items-center gap-1.5 text-subtle/70" title={`${album.hiddenTrackCount} hidden track${album.hiddenTrackCount > 1 ? 's' : ''} not available for streaming`}>
                  <EyeOff size={14} />
                  {album.hiddenTrackCount} hidden
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-6">
          <Button onClick={onPlayAll} className="gap-2">
            <Play size={18} fill="currentColor" />
            Play
          </Button>

          {album.tracks.length > 1 && (
            <Button variant="secondary" onClick={onShuffleAll} className="gap-2">
              <Shuffle size={18} />
              Shuffle
            </Button>
          )}

          {/* Heart button */}
          <button
            onClick={handleFavoriteClick}
            className={cn(
              'p-3 rounded-full transition-all duration-200',
              'hover:bg-highlight-low active:scale-90',
              isFavorite ? 'text-love' : 'text-muted hover:text-love'
            )}
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart size={24} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>

          {/* Add to queue button */}
          <button
            onClick={handleAddToQueue}
            className={cn(
              'p-3 rounded-full transition-all duration-200',
              'hover:bg-highlight-low active:scale-90',
              showQueueCheck ? 'text-foam' : 'text-muted hover:text-text'
            )}
            aria-label="Add all tracks to queue"
          >
            {showQueueCheck ? (
              <Check size={24} className="animate-scale-in" />
            ) : (
              <ListPlus size={24} />
            )}
          </button>

          {/* External link - liquid glass styled */}
          <a
            href={album.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl',
              'text-xs font-medium',
              'bg-rose/15 text-rose border border-rose/20',
              'hover:bg-rose/25 hover:border-rose/30 hover:shadow-lg hover:shadow-rose/10',
              'transition-all duration-200'
            )}
          >
            <ExternalLink size={12} />
            Bandcamp
          </a>
        </div>
      </div>
    </div>
  );
}

export function AlbumHeaderSkeleton() {
  return (
    <div className="px-8 pt-12 pb-8">
      <div className="flex items-end gap-8">
        <Skeleton className="w-56 h-56 rounded-lg" />
        <div className="flex-1 pb-2 space-y-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-28" />
      </div>
    </div>
  );
}
