import { Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildArtUrl, ImageSizes } from '@/types';

interface PlaylistCoverProps {
  /** User-provided cover image (base64 or URL) */
  coverImage?: string;
  /** Art IDs from tracks (will be deduplicated) */
  artIds?: number[];
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Alt text */
  alt?: string;
  /** Additional class names */
  className?: string;
}

/**
 * Renders a playlist cover with automatic collage generation
 * - 1 unique cover: full image
 * - 2 unique covers: split horizontally
 * - 3 unique covers: one large left, two stacked right
 * - 4+ unique covers: 2x2 grid
 */
export function PlaylistCover({
  coverImage,
  artIds = [],
  size = 'md',
  alt = 'Playlist cover',
  className,
}: PlaylistCoverProps) {
  // Get image size based on variant
  const imageSize = size === 'sm'
    ? ImageSizes.THUMB_100
    : size === 'md'
      ? ImageSizes.THUMB_250
      : ImageSizes.THUMB_350;

  const iconSize = size === 'sm' ? 14 : size === 'md' ? 24 : 80;

  // User-provided cover takes priority
  if (coverImage) {
    return (
      <img
        src={coverImage}
        alt={alt}
        className={cn('w-full h-full object-cover', className)}
      />
    );
  }

  // Deduplicate artIds (same album = same cover)
  const uniqueArtIds = [...new Set(artIds)].filter(Boolean);

  // 4+ unique covers: 2x2 grid
  if (uniqueArtIds.length >= 4) {
    return (
      <div className={cn('w-full h-full grid grid-cols-2 grid-rows-2', className)}>
        {uniqueArtIds.slice(0, 4).map((artId, i) => (
          <img
            key={`${artId}-${i}`}
            src={buildArtUrl(artId, imageSize)}
            alt=""
            className="w-full h-full object-cover"
          />
        ))}
      </div>
    );
  }

  // 3 unique covers: one large left, two stacked right
  if (uniqueArtIds.length === 3) {
    return (
      <div className={cn('w-full h-full grid grid-cols-2', className)}>
        <img
          src={buildArtUrl(uniqueArtIds[0], imageSize)}
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="grid grid-rows-2">
          <img
            src={buildArtUrl(uniqueArtIds[1], imageSize)}
            alt=""
            className="w-full h-full object-cover"
          />
          <img
            src={buildArtUrl(uniqueArtIds[2], imageSize)}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    );
  }

  // 2 unique covers: split horizontally
  if (uniqueArtIds.length === 2) {
    return (
      <div className={cn('w-full h-full grid grid-cols-2', className)}>
        <img
          src={buildArtUrl(uniqueArtIds[0], imageSize)}
          alt=""
          className="w-full h-full object-cover"
        />
        <img
          src={buildArtUrl(uniqueArtIds[1], imageSize)}
          alt=""
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // 1 cover: full image
  if (uniqueArtIds.length === 1) {
    return (
      <img
        src={buildArtUrl(uniqueArtIds[0], imageSize)}
        alt={alt}
        className={cn('w-full h-full object-cover', className)}
      />
    );
  }

  // Empty placeholder
  return (
    <div className={cn(
      'w-full h-full flex items-center justify-center',
      'bg-linear-to-br from-highlight-med to-surface text-muted',
      className
    )}>
      <Music size={iconSize} className="opacity-50" />
    </div>
  );
}

