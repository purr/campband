import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouterStore } from '@/lib/store';

interface NavigationButtonsProps {
  className?: string;
}

export function NavigationButtons({ className }: NavigationButtonsProps) {
  const { goBack, goForward, canGoBack, canGoForward } = useRouterStore();

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        onClick={goBack}
        disabled={!canGoBack()}
        aria-label="Go back"
        className={cn(
          'p-2 rounded-full transition-colors',
          'hover:bg-highlight-low active:bg-highlight-med',
          'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent'
        )}
      >
        <ChevronLeft size={20} />
      </button>

      <button
        onClick={goForward}
        disabled={!canGoForward()}
        aria-label="Go forward"
        className={cn(
          'p-2 rounded-full transition-colors',
          'hover:bg-highlight-low active:bg-highlight-med',
          'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent'
        )}
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}

