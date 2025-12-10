import { MapPin, ExternalLink, Shuffle, Play, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Skeleton, ImageBackdrop } from '@/components/ui';
import { useLibraryStore } from '@/lib/store';
import type { Band, DiscographyItem } from '@/types';
import { buildBioUrl, getArtworkUrl, ImageSizes } from '@/types';

interface ArtistHeaderProps {
  band: Band;
  releases: DiscographyItem[];
  isLoading?: boolean;
  onPlayAll?: () => void;
  onShuffleAll?: () => void;
}

export function ArtistHeader({ band, releases, isLoading, onPlayAll, onShuffleAll }: ArtistHeaderProps) {
  const { isFavoriteArtist, addFavoriteArtist, removeFavoriteArtist } = useLibraryStore();
  const isFavorite = isFavoriteArtist(band.id);

  const handleFavoriteClick = () => {
    if (isFavorite) {
      removeFavoriteArtist(band.id);
    } else {
      addFavoriteArtist(band);
    }
  };

  // Get first release art as backdrop (use highest quality)
  const backdropUrl = releases[0]
    ? getArtworkUrl({ artId: releases[0].artId, artUrl: releases[0].artUrl, size: ImageSizes.LARGE_1200 })
    : null;

  // Build avatar URL from band image or fallback to first release art
  const avatarUrl = band.imageId
    ? buildBioUrl(band.imageId, ImageSizes.MEDIUM_700)
    : releases[0]
      ? getArtworkUrl({ artId: releases[0].artId, artUrl: releases[0].artUrl, size: ImageSizes.MEDIUM_700 })
      : null;

  return (
    <div className="relative">
      {/* Backdrop - glassy blurred image with gradient fade */}
      <ImageBackdrop
        imageUrl={backdropUrl}
        blur="3xl"
        scale={1.4}
        opacity={0.5}
        accentGlow="iris"
      />

      {/* Content */}
      <div className="relative z-10 px-8 pt-12 pb-8">
        <div className="flex items-end gap-6">
          {/* Avatar - crops vertical images, never stretches */}
          <div className="w-48 h-48 rounded-full overflow-hidden bg-surface shadow-2xl flex-shrink-0 ring-4 ring-highlight-low relative">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={band.name}
                className="absolute inset-0 w-full h-full object-cover object-center"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-rose/30 to-iris/30 flex items-center justify-center text-6xl font-bold text-text">
                {band.name.charAt(0)}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 pb-2">
            <p className="text-sm font-medium text-subtle uppercase tracking-wider mb-2">
              Artist
            </p>
            <h1 className="text-5xl font-bold text-text mb-4">
              {band.name}
            </h1>

            <div className="flex items-center gap-4 text-muted text-sm">
              {band.location && (
                <span className="flex items-center gap-1">
                  <MapPin size={14} />
                  {band.location}
                </span>
              )}
              <span>{releases.length} releases</span>
            </div>

            {/* External Links - liquid glass styled */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {/* Bandcamp link - always shown */}
              <a
                href={band.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl',
                  'text-xs font-medium',
                  'bg-rose/15 text-rose border border-rose/20',
                  'hover:bg-rose/25 hover:border-rose/30 hover:shadow-lg hover:shadow-rose/10',
                  'transition-all duration-200'
                )}
              >
                <ExternalLink size={12} />
                Bandcamp
              </a>

              {/* Other links */}
              {band.links && band.links.slice(0, 4).map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl',
                    'text-xs font-medium',
                    'bg-white/5 text-text/70 border border-white/10',
                    'hover:bg-white/10 hover:text-text hover:border-white/20 hover:shadow-lg hover:shadow-white/5',
                    'transition-all duration-200'
                  )}
                >
                  <ExternalLink size={12} />
                  {link.text}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-6">
          <Button
            onClick={onPlayAll}
            disabled={isLoading}
            className="gap-2"
          >
            <Play size={18} fill="currentColor" />
            Play All
          </Button>

          <Button
            variant="secondary"
            onClick={onShuffleAll}
            disabled={isLoading}
            className="gap-2"
          >
            <Shuffle size={18} />
            Shuffle
          </Button>

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
        </div>
      </div>
    </div>
  );
}

export function ArtistHeaderSkeleton() {
  return (
    <div className="px-8 pt-12 pb-8">
      <div className="flex items-end gap-6">
        <Skeleton className="w-48 h-48 rounded-full" />
        <div className="flex-1 pb-2 space-y-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-28" />
      </div>
    </div>
  );
}

