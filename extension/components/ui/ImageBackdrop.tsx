import { cn } from '@/lib/utils';

interface ImageBackdropProps {
  /** The image URL to use as backdrop */
  imageUrl?: string | null;
  /** How much to blur the image (default: 48px for that dreamy effect) */
  blur?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  /** How much to zoom/scale the image (default: 1.2) */
  scale?: number;
  /** Opacity of the image (0-1, default: 0.4) */
  opacity?: number;
  /** Height of the backdrop - can be absolute or percentage (default: 100%) */
  height?: string;
  /** Whether to include the bottom shadow/fade gradient (default: true) */
  showGradient?: boolean;
  /** Custom gradient - defaults to fade to base color */
  gradient?: string;
  /** Additional className for the container */
  className?: string;
  /** Accent color glow (optional - adds subtle colored glow) */
  accentGlow?: 'rose' | 'iris' | 'foam' | 'pine' | 'gold' | 'none';
}

const blurMap = {
  sm: 'blur-sm',      // 4px
  md: 'blur-md',      // 12px
  lg: 'blur-lg',      // 16px
  xl: 'blur-xl',      // 24px
  '2xl': 'blur-2xl',  // 40px
  '3xl': 'blur-3xl',  // 64px
};

const accentGlowMap = {
  rose: 'shadow-[0_0_120px_40px_rgba(235,188,186,0.15)]',
  iris: 'shadow-[0_0_120px_40px_rgba(196,167,231,0.15)]',
  foam: 'shadow-[0_0_120px_40px_rgba(156,207,216,0.15)]',
  pine: 'shadow-[0_0_120px_40px_rgba(49,116,143,0.15)]',
  gold: 'shadow-[0_0_120px_40px_rgba(246,193,119,0.15)]',
  none: '',
};

/**
 * ImageBackdrop - Creates a beautiful, blurred image background with gradient fade
 *
 * Perfect for hero sections, headers, and anywhere you want that
 * Apple-style frosted glass aesthetic with image backgrounds.
 *
 * @example
 * ```tsx
 * <div className="relative">
 *   <ImageBackdrop imageUrl={albumArt} accentGlow="rose" />
 *   <div className="relative z-10">
 *     {/* Your content here *\/}
 *   </div>
 * </div>
 * ```
 */
export function ImageBackdrop({
  imageUrl,
  blur = '3xl',
  scale = 1.2,
  opacity = 0.4,
  height = '100%',
  showGradient = true,
  gradient,
  className,
  accentGlow = 'none',
}: ImageBackdropProps) {
  if (!imageUrl) return null;

  // More transparent gradient - glassier look while keeping the fade
  const defaultGradient = 'bg-linear-to-b from-transparent via-base/50 to-base';

  return (
    <div
      className={cn(
        'absolute inset-x-0 top-0 bottom-0 overflow-hidden pointer-events-none',
        className
      )}
      aria-hidden="true"
    >
      {/* The blurred image */}
      <div
        className={cn(
          'absolute inset-0',
          accentGlow !== 'none' && accentGlowMap[accentGlow]
        )}
      >
        <img
          src={imageUrl}
          alt=""
          className={cn(
            'w-full h-full object-cover object-center',
            blurMap[blur],
            'transition-opacity duration-500'
          )}
          style={{
            transform: `scale(${scale})`,
            opacity,
          }}
        />
      </div>

      {/* Gradient overlay for smooth fade to background */}
      {showGradient && (
        <div
          className={cn(
            'absolute inset-0',
            gradient || defaultGradient
          )}
        />
      )}

      {/* Subtle vignette for depth - lighter for glassier look */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, rgba(25, 23, 36, 0.25) 100%)',
        }}
      />
    </div>
  );
}

