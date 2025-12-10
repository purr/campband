import { useState, useCallback, useEffect } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { useDebouncedCallback } from 'use-debounce';
import { cn } from '@/lib/utils';
import { useSearchStore } from '@/lib/store';

interface SearchInputProps {
  className?: string;
  autoFocus?: boolean;
  onSearch?: (query: string) => void;
}

export function SearchInput({ className, autoFocus, onSearch }: SearchInputProps) {
  const { query, setQuery, search, isLoading, clearResults } = useSearchStore();
  const [localQuery, setLocalQuery] = useState(query);

  // Sync local state with store when store changes externally
  useEffect(() => {
    setLocalQuery(query);
  }, [query]);

  const debouncedSearch = useDebouncedCallback((value: string) => {
    search(value);
    onSearch?.(value);
  }, 400);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalQuery(value);
    setQuery(value);
    debouncedSearch(value);
  }, [setQuery, debouncedSearch]);

  const handleClear = useCallback(() => {
    setLocalQuery('');
    setQuery('');
    clearResults();
  }, [setQuery, clearResults]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClear();
    }
  }, [handleClear]);

  return (
    <div className={cn('relative', className)}>
      {/* Icon */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
        {isLoading ? (
          <Loader2 size={20} className="animate-spin" />
        ) : (
          <Search size={20} />
        )}
      </div>

      {/* Input */}
      <input
        type="text"
        value={localQuery}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Search artists, albums, tracks..."
        autoFocus={autoFocus}
        className={cn(
          'w-full rounded-full bg-surface border border-highlight-med',
          'text-text placeholder:text-muted',
          'pl-12 pr-12 py-3',
          'transition-all duration-200',
          'focus:outline-none focus:border-iris focus:ring-2 focus:ring-iris/20',
        )}
      />

      {/* Clear button */}
      {localQuery && (
        <button
          onClick={handleClear}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}
