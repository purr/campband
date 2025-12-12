import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LikedCoverProps {
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

/**
 * Special cover art for the "Liked" playlist.
 * Features a beautiful animated heart design with our Rosé Pine theme.
 */
export function LikedCover({ size = 'large', className }: LikedCoverProps) {
  const sizeClasses = {
    small: 'w-full h-full', // Let parent container control size
    medium: 'w-14 h-14',
    large: 'w-full h-full',
  };

  const iconSizes = {
    small: 18,
    medium: 24,
    large: 80,
  };

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        sizeClasses[size],
        className
      )}
    >
      {/* Background gradient - love to iris */}
      <div className="absolute inset-0 bg-linear-to-br from-love via-rose to-iris" />

      {/* Animated glow orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/4 -left-1/4 w-3/4 h-3/4 bg-love/40 rounded-full blur-2xl animate-breathe" />
        <div className="absolute -bottom-1/4 -right-1/4 w-3/4 h-3/4 bg-iris/40 rounded-full blur-2xl animate-breathe animation-delay-2000" />
      </div>

      {/* Subtle pattern overlay */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
          backgroundSize: '16px 16px',
        }}
      />

      {/* Heart icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative">
          {/* Heart shadow/glow */}
          <Heart
            size={iconSizes[size]}
            fill="currentColor"
            className="absolute text-base/30 blur-md transform scale-110"
          />
          {/* Main heart */}
          <Heart
            size={iconSizes[size]}
            fill="currentColor"
            className="relative text-base drop-shadow-lg"
          />
        </div>
      </div>

      {/* Shine effect */}
      <div className="absolute inset-0 bg-linear-to-br from-white/20 via-transparent to-transparent" />
    </div>
  );
}

