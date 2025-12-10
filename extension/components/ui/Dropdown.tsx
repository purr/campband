import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface DropdownProps<T extends string = string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function Dropdown<T extends string = string>({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  icon,
  className,
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm',
          'liquid-glass-bar',
          'border border-white/10 hover:border-white/20',
          'text-text transition-all duration-200',
          isOpen && 'border-rose/50'
        )}
      >
        {icon && <span className="text-text/60">{icon}</span>}
        <span>{selectedOption?.label || placeholder}</span>
        <ChevronDown
          size={14}
          className={cn(
            'text-text/60 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={cn(
            'absolute right-0 top-full mt-2 z-50',
            'py-1.5 rounded-2xl min-w-[180px]',
            'liquid-glass-glow',
            'animate-in fade-in slide-in-from-top-2 duration-150'
          )}
        >
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={cn(
                'w-full px-3 py-2 text-sm text-left flex items-center gap-3',
                'transition-colors duration-150',
                value === option.value
                  ? 'text-rose bg-rose/10'
                  : 'text-text hover:bg-highlight-low'
              )}
            >
              {option.icon && (
                <span className="text-text/60">{option.icon}</span>
              )}
              <span className="flex-1">{option.label}</span>
              {value === option.value && (
                <Check size={14} className="text-rose" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

