import { cn } from '@/lib/utils';

interface ClickableTextProps {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  variant?: 'default' | 'muted';
}

/**
 * Clickable text with consistent hover styling.
 * Use for artist names, track titles, etc. that navigate somewhere.
 */
export function ClickableText({
  children,
  onClick,
  className,
  variant = 'default',
}: ClickableTextProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'text-left truncate',
        'transition-colors duration-150',
        variant === 'default' && 'text-text hover:text-rose',
        variant === 'muted' && 'text-muted hover:text-text',
        className
      )}
    >
      {children}
    </button>
  );
}

