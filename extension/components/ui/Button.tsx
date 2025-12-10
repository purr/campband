import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          // Base styles
          'inline-flex items-center justify-center gap-2 font-medium rounded-lg',
          'transition-all duration-200 ease-out',
          'focus-ring',
          'disabled:opacity-50 disabled:cursor-not-allowed',

          // Size variants
          {
            'px-3 py-1.5 text-sm': size === 'sm',
            'px-4 py-2 text-sm': size === 'md',
            'px-6 py-3 text-base': size === 'lg',
          },

          // Color variants
          {
            // Primary - Rose accent
            'bg-rose text-base hover:bg-rose/90 active:bg-rose/80': variant === 'primary',

            // Secondary - Subtle
            'bg-highlight-med text-text hover:bg-highlight-high active:bg-overlay': variant === 'secondary',

            // Ghost - No background
            'bg-transparent text-text hover:bg-highlight-low active:bg-highlight-med': variant === 'ghost',

            // Danger - Love/red
            'bg-love text-base hover:bg-love/90 active:bg-love/80': variant === 'danger',
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

Button.displayName = 'Button';

