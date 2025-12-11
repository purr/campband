import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeartButtonProps {
  isFavorite: boolean;
  onClick: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /**
   * Show only on parent group hover (for track rows)
   * When true, button is invisible until parent with 'group' class is hovered
   * Exception: always visible when isFavorite is true
   */
  showOnGroupHover?: boolean;
}

const sizes = {
  sm: 16,
  md: 20,
  lg: 24,
};

export function HeartButton({
  isFavorite,
  onClick,
  size = 'md',
  className,
  showOnGroupHover = false,
}: HeartButtonProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      className={cn(
        'p-1.5 rounded-full transition-all duration-200',
        'hover:bg-highlight-low active:scale-90',
        'focus-ring',
        isFavorite ? 'text-love' : 'text-muted hover:text-love',
        // Group hover visibility
        showOnGroupHover && 'opacity-0 group-hover:opacity-100',
        showOnGroupHover && isFavorite && 'opacity-100',
        className
      )}
    >
      <Heart
        size={sizes[size]}
        fill={isFavorite ? 'currentColor' : 'none'}
        className={cn(
          'transition-transform duration-200',
          isFavorite && 'scale-110'
        )}
      />
    </button>
  );
}

