import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Settings, Search, X, Clock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NavigationButtons } from './NavigationButtons';
import { LAYOUT_CLASSES } from '@/lib/constants/layout';
import { useRouterStore, useSearchStore } from '@/lib/store';

interface PageHeaderProps {
  /** Right section: Controls like sort, view toggle, etc */
  right?: React.ReactNode;
  /** Additional class names */
  className?: string;
}

/**
 * Consistent page header component used across all pages.
 * Features: Navigation buttons, global search bar, settings.
 */
export function PageHeader({
  right,
  className,
}: PageHeaderProps) {
  const { currentRoute, navigate, goBack } = useRouterStore();
  const {
    query,
    setQuery,
    search,
    recentSearches,
    removeFromRecentSearches,
    clearRecentSearches,
  } = useSearchStore();

  const isSettingsPage = currentRoute.name === 'settings';
  const isSearchPage = currentRoute.name === 'search';

  const [inputValue, setInputValue] = useState(query);
  const [isFocused, setIsFocused] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync input with store query when navigating
  useEffect(() => {
    if (isSearchPage && query) {
      setInputValue(query);
    }
  }, [isSearchPage, query]);

  // Update dropdown position when showing
  useEffect(() => {
    if (showDropdown && searchContainerRef.current) {
      const rect = searchContainerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [showDropdown]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    search(searchQuery);
    navigate({ name: 'search', query: searchQuery });
    setShowDropdown(false);
    inputRef.current?.blur();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(inputValue);
  };

  const handleHistoryClick = (historyQuery: string) => {
    setInputValue(historyQuery);
    handleSearch(historyQuery);
  };

  const handleClear = () => {
    setInputValue('');
    setQuery('');
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    setIsFocused(true);
    setShowDropdown(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Delay hiding to allow click on dropdown items
    setTimeout(() => {
      if (!dropdownRef.current?.contains(document.activeElement)) {
        setShowDropdown(false);
      }
    }, 100);
  };

  return (
    <header
      className={cn(
        // Sticky positioning with high z-index
        'sticky top-0 z-[100]',
        // Consistent height
        LAYOUT_CLASSES.BAR_HEIGHT,
        // Clean liquid glass - no borders
        'px-4 liquid-glass-bar',
        'flex items-center',
        // Subtle bottom border only
        'border-b border-white/5',
        className
      )}
    >
      <div className="flex items-center gap-4 w-full">
        {/* Left: Navigation */}
        <div className="shrink-0">
          <NavigationButtons />
        </div>

        {/* Center: Search Bar - expands to fill space */}
        <div ref={searchContainerRef} className="flex-1">
          <form onSubmit={handleSubmit}>
            <div
              className={cn(
                'relative flex items-center',
                'bg-surface/60 backdrop-blur-sm',
                'border rounded-full',
                'transition-all duration-200',
                isFocused
                  ? 'border-rose/50 bg-surface/80 shadow-lg shadow-rose/5'
                  : 'border-white/10 hover:border-white/20'
              )}
            >
              <Search
                size={18}
                className={cn(
                  'absolute left-4 transition-colors',
                  isFocused ? 'text-rose' : 'text-muted'
                )}
              />
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder="Search artists, albums, tracks..."
                className={cn(
                  'w-full py-2.5 pl-11 pr-10',
                  'bg-transparent text-text placeholder:text-muted/60',
                  'text-sm font-medium',
                  'focus:outline-none',
                  'rounded-full'
                )}
              />
              {inputValue && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-3 p-1 text-muted hover:text-text transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </form>

          {/* Search History Dropdown - rendered via portal */}
          {recentSearches.length > 0 && createPortal(
            <div
              ref={dropdownRef}
              className={cn(
                'fixed z-[9999]',
                'rounded-2xl',
                'liquid-glass-glow',
                'overflow-hidden',
                'transition-opacity duration-150 ease-out',
                showDropdown
                  ? 'opacity-100 pointer-events-auto'
                  : 'opacity-0 pointer-events-none'
              )}
              style={{
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <span className="text-xs font-semibold text-text/70 uppercase tracking-wider">
                  Recent Searches
                </span>
                <button
                  onClick={clearRecentSearches}
                  className="text-xs text-muted hover:text-rose transition-colors"
                >
                  Clear all
                </button>
              </div>

              {/* History Items */}
              <div className="py-1.5 max-h-72 overflow-y-auto scrollbar-thin">
                {recentSearches.map((historyQuery, index) => (
                  <div
                    key={index}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 mx-1.5 rounded-lg',
                      'hover:bg-white/5 cursor-pointer group',
                      'transition-colors'
                    )}
                    onClick={() => handleHistoryClick(historyQuery)}
                  >
                    <Clock size={14} className="text-muted/60 shrink-0" />
                    <span className="flex-1 text-sm text-text truncate">
                      {historyQuery}
                    </span>
                    <ArrowRight
                      size={14}
                      className="text-rose opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromRecentSearches(historyQuery);
                      }}
                      className="p-1 text-muted hover:text-love opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>,
            document.body
          )}
        </div>

        {/* Right: Page controls + Settings */}
        <div className="flex items-center gap-2 shrink-0">
          {right}
          <button
            onClick={() => {
              if (isSettingsPage) {
                goBack();
              } else {
                navigate({ name: 'settings' });
              }
            }}
            className={cn(
              'p-2.5 rounded-full transition-all duration-200',
              isSettingsPage
                ? 'text-rose bg-rose/15 shadow-lg shadow-rose/10'
                : 'text-muted hover:text-text hover:bg-white/5'
            )}
            aria-label={isSettingsPage ? 'Close settings' : 'Settings'}
          >
            <Settings size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}

