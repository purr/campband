import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'solid';
  size?: 'sm' | 'md' | 'lg';
  'aria-label': string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = 'default', size = 'md', children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          // Base styles
          'inline-flex items-center justify-center rounded-full',
          'transition-all duration-200 ease-out',
          'focus-ring cursor-pointer',
          'disabled:opacity-40 disabled:cursor-not-allowed',

          // Size variants
          {
            'w-8 h-8': size === 'sm',
            'w-10 h-10': size === 'md',
            'w-12 h-12': size === 'lg',
          },

          // Variant styles - improved for liquid glass contrast
          {
            'text-text/70 hover:text-text hover:bg-white/10 active:bg-white/15': variant === 'default',
            'text-text/60 hover:text-text': variant === 'ghost',
            'bg-rose text-base hover:bg-rose/90 active:bg-rose/80 shadow-lg shadow-rose/20': variant === 'solid',
          },

          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';

