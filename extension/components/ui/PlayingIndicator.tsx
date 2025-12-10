import { cn } from '@/lib/utils';

interface PlayingIndicatorProps {
  /** Size variant - sm for thumbnails, md for track lists */
  size?: 'sm' | 'md';
  /** Additional class names */
  className?: string;
}

/**
 * Animated audio wave indicator shown when a track is playing.
 * Use over album art or in place of track numbers.
 */
export function PlayingIndicator({ size = 'md', className }: PlayingIndicatorProps) {
  const isSm = size === 'sm';

  return (
    <div
      className={cn(
        'flex items-end justify-center',
        isSm ? 'gap-[2px] h-3' : 'gap-0.5 h-4',
        className
      )}
    >
      <span
        className={cn(
          'bg-rose rounded-full animate-equalizer',
          isSm ? 'w-[3px]' : 'w-1'
        )}
        style={{ animationDelay: '0ms' }}
      />
      <span
        className={cn(
          'bg-rose rounded-full animate-equalizer',
          isSm ? 'w-[3px]' : 'w-1'
        )}
        style={{ animationDelay: '350ms' }}
      />
      <span
        className={cn(
          'bg-rose rounded-full animate-equalizer',
          isSm ? 'w-[3px]' : 'w-1'
        )}
        style={{ animationDelay: '700ms' }}
      />
    </div>
  );
}

