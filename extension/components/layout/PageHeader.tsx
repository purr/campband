import { cn } from '@/lib/utils';
import { NavigationButtons } from './NavigationButtons';
import { LAYOUT_CLASSES } from '@/lib/constants/layout';

// Re-export for backwards compatibility
export const PAGE_HEADER_HEIGHT = LAYOUT_CLASSES.BAR_HEIGHT;

interface PageHeaderProps {
  /** Left section: Usually title with icon */
  title?: React.ReactNode;
  /** Subtitle below title */
  subtitle?: string;
  /** Center section: Usually tabs */
  center?: React.ReactNode;
  /** Right section: Controls like sort, view toggle, etc */
  right?: React.ReactNode;
  /** Additional class names */
  className?: string;
  /** Children to render (alternative to title prop) */
  children?: React.ReactNode;
}

/**
 * Consistent page header component used across all pages.
 * Ensures navigation buttons are always in the same position.
 */
export function PageHeader({
  title,
  subtitle,
  center,
  right,
  className,
  children,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        // Sticky positioning with high z-index
        'sticky top-0 z-[100]',
        // Consistent height
        LAYOUT_CLASSES.BAR_HEIGHT,
        // Clean liquid glass - no borders
        'px-6 liquid-glass-bar',
        'flex items-center',
        // Subtle bottom border only
        'border-b border-white/5',
        className
      )}
    >
      <div className="flex items-center justify-between w-full">
        {/* Left: Navigation + Title */}
        <div className="flex items-center gap-4 min-w-0">
          <NavigationButtons />

          {children ? (
            children
          ) : title ? (
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-text truncate flex items-center gap-2">
                {title}
              </h1>
              {subtitle && (
                <p className="text-sm text-muted truncate">{subtitle}</p>
              )}
            </div>
          ) : null}
        </div>

        {/* Center: Tabs or other content */}
        {center && (
          <div className="flex items-center">{center}</div>
        )}

        {/* Right: Controls */}
        {right && (
          <div className="flex items-center gap-3">{right}</div>
        )}
      </div>
    </header>
  );
}

