import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeartButtonProps {
  isFavorite: boolean;
  onClick: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 16,
  md: 20,
  lg: 24,
};

export function HeartButton({ isFavorite, onClick, size = 'md', className }: HeartButtonProps) {
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

