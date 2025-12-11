import { ListPlus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConfirmationState } from '@/lib/utils';

interface AddToQueueButtonProps {
  onClick: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showLabel?: boolean;
  /**
   * Disable the button (e.g., track not streamable)
   */
  disabled?: boolean;
  /**
   * Show only on parent group hover (for track rows)
   * When true, button is invisible until parent with 'group' class is hovered
   * Exception: always visible when showing check animation
   */
  showOnGroupHover?: boolean;
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
  disabled = false,
  showOnGroupHover = false,
}: AddToQueueButtonProps) {
  const [showCheck, triggerCheck] = useConfirmationState();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (disabled) return;
    onClick();
    triggerCheck();
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      aria-label="Add to queue"
      className={cn(
        'p-1.5 rounded-full transition-all duration-200',
        'hover:bg-highlight-low active:scale-90',
        'focus-ring',
        showCheck ? 'text-foam' : 'text-muted hover:text-text',
        disabled && 'cursor-not-allowed opacity-50',
        // Group hover visibility
        showOnGroupHover && 'opacity-0 group-hover:opacity-100',
        showOnGroupHover && showCheck && 'opacity-100',
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

