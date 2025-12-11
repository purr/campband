import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouterStore } from '@/lib/store';

interface NavigationButtonsProps {
  className?: string;
}

export function NavigationButtons({ className }: NavigationButtonsProps) {
  const { goBack, goForward } = useRouterStore();

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        onClick={goBack}
        aria-label="Go back (uses browser history)"
        className={cn(
          'p-2 rounded-full transition-colors',
          'hover:bg-highlight-low active:bg-highlight-med'
        )}
      >
        <ChevronLeft size={20} />
      </button>

      <button
        onClick={goForward}
        aria-label="Go forward (uses browser history)"
        className={cn(
          'p-2 rounded-full transition-colors',
          'hover:bg-highlight-low active:bg-highlight-med'
        )}
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}

