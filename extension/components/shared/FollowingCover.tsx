import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FollowingCoverProps {
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

/**
 * Special cover art for the "Following" (artists) section.
 * Features a Users icon with our Rose Pine theme.
 */
export function FollowingCover({ size = 'large', className }: FollowingCoverProps) {
  const sizeClasses = {
    small: 'w-full h-full',
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
      {/* Background gradient - pine to foam */}
      <div className="absolute inset-0 bg-gradient-to-br from-pine via-foam/80 to-iris" />

      {/* Animated glow orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/4 -left-1/4 w-3/4 h-3/4 bg-pine/40 rounded-full blur-2xl animate-breathe" />
        <div className="absolute -bottom-1/4 -right-1/4 w-3/4 h-3/4 bg-foam/40 rounded-full blur-2xl animate-breathe animation-delay-2000" />
      </div>

      {/* Subtle pattern overlay */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
          backgroundSize: '16px 16px',
        }}
      />

      {/* Users icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative">
          {/* Icon shadow/glow */}
          <Users
            size={iconSizes[size]}
            className="absolute text-base/30 blur-md transform scale-110"
          />
          {/* Main icon */}
          <Users
            size={iconSizes[size]}
            className="relative text-base drop-shadow-lg"
          />
        </div>
      </div>

      {/* Shine effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent" />
    </div>
  );
}

