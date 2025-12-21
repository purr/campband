import { useEffect, useRef } from 'react';
import { PageHeader } from '@/components/layout';
import { SearchResults } from '@/components/search';
import { useRouterStore, useSearchStore } from '@/lib/store';
import type { SearchResult } from '@/types';

interface SearchPageProps {
  initialQuery?: string;
}

export function SearchPage({ initialQuery }: SearchPageProps) {
  const { navigate, setPageTitle } = useRouterStore();
  const { search, setQuery } = useSearchStore();
  const searchedRef = useRef(false);

  // Set page title
  useEffect(() => {
    setPageTitle(initialQuery ? `Search: ${initialQuery}` : 'Search');
    return () => setPageTitle(null);
  }, [initialQuery, setPageTitle]);

  // Search on mount if we have an initial query
  useEffect(() => {
    if (initialQuery && !searchedRef.current) {
      searchedRef.current = true;
      setQuery(initialQuery);
      search(initialQuery);
    }
  }, [initialQuery, search, setQuery]);

  // Reset ref when initialQuery changes
  useEffect(() => {
    searchedRef.current = false;
  }, [initialQuery]);

  const handleArtistClick = (result: SearchResult) => {
    navigate({ name: 'artist', url: result.url });
  };

  const handleAlbumClick = (result: SearchResult) => {
    navigate({ name: 'album', url: result.url });
  };

  const handleTrackClick = (result: SearchResult) => {
    // Navigate to album/track page
    navigate({ name: 'album', url: result.url });
  };

  return (
    <div className="min-h-full">
      {/* Header */}
      <PageHeader />

      {/* Results */}
      <div className="px-6 py-6">
        <SearchResults
          onArtistClick={handleArtistClick}
          onAlbumClick={handleAlbumClick}
          onTrackClick={handleTrackClick}
        />
      </div>
    </div>
  );
}
