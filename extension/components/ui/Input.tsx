import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, type = 'text', ...props }, ref) => {
    return (
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          type={type}
          className={cn(
            // Base styles
            'w-full rounded-lg bg-surface border border-highlight-med',
            'text-text placeholder:text-muted',
            'transition-all duration-200',
            'focus:outline-none focus:border-iris focus:ring-1 focus:ring-iris/30',
            'disabled:opacity-50 disabled:cursor-not-allowed',

            // Padding
            icon ? 'pl-10 pr-4 py-2.5' : 'px-4 py-2.5',

            className
          )}
          {...props}
        />
      </div>
    );
  }
);

Input.displayName = 'Input';

