import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  value: number;
  max?: number;
  min?: number;
  showFill?: boolean;
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value, max = 100, min = 0, showFill = true, ...props }, ref) => {
    const percentage = ((value - min) / (max - min)) * 100;

    return (
      <div className={cn('relative w-full h-1.5 group', className)}>
        {/* Track - glass style */}
        <div className="absolute inset-0 bg-white/10 rounded-full backdrop-blur-sm" />

        {/* Fill */}
        {showFill && (
          <div
            className="absolute left-0 top-0 h-full bg-rose rounded-full transition-all shadow-sm shadow-rose/30"
            style={{ width: `${percentage}%` }}
          />
        )}

        {/* Input */}
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          value={value}
          className={cn(
            'absolute inset-0 w-full h-full opacity-0 cursor-pointer',
            // Thumb styling (needs webkit prefixes)
            '[&::-webkit-slider-thumb]:appearance-none',
            '[&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5',
            '[&::-webkit-slider-thumb]:rounded-full',
            '[&::-webkit-slider-thumb]:bg-text',
            '[&::-webkit-slider-thumb]:cursor-pointer',
            '[&::-webkit-slider-thumb]:opacity-0',
            '[&::-webkit-slider-thumb]:group-hover:opacity-100',
            '[&::-webkit-slider-thumb]:transition-opacity',
          )}
          {...props}
        />

        {/* Visible thumb on hover - glass style */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-text rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-md"
          style={{ left: `calc(${percentage}% - 7px)` }}
        />
      </div>
    );
  }
);

Slider.displayName = 'Slider';

