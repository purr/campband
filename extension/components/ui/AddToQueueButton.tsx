import { ListPlus, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface AddToQueueButtonProps {
  onClick: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showLabel?: boolean;
}

const sizes = {
  sm: 14,
  md: 18,
  lg: 22,
};

export function AddToQueueButton({
  onClick,
  size = 'md',
  className,
  showLabel = false,
}: AddToQueueButtonProps) {
  const [showCheck, setShowCheck] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onClick();

    // Show checkmark briefly
    setShowCheck(true);
  };

  // Reset check after animation
  useEffect(() => {
    if (showCheck) {
      const timer = setTimeout(() => setShowCheck(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [showCheck]);

  return (
    <button
      onClick={handleClick}
      aria-label="Add to queue"
      className={cn(
        'p-1.5 rounded-full transition-all duration-200',
        'hover:bg-highlight-low active:scale-90',
        'focus-ring',
        showCheck ? 'text-foam' : 'text-muted hover:text-text',
        className
      )}
    >
      {showCheck ? (
        <Check size={sizes[size]} className="animate-scale-in" />
      ) : (
        <ListPlus size={sizes[size]} />
      )}
      {showLabel && (
        <span className="ml-1.5 text-sm">
          {showCheck ? 'Added!' : 'Add to Queue'}
        </span>
      )}
    </button>
  );
}

