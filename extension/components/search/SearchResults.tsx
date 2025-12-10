import { User, Disc3, Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSearchStore } from '@/lib/store';
import { Skeleton } from '@/components/ui';
import type { SearchResult } from '@/types';
import { getArtworkUrl, ImageSizes } from '@/types';

interface SearchResultsProps {
  onArtistClick?: (result: SearchResult) => void;
  onAlbumClick?: (result: SearchResult) => void;
  onTrackClick?: (result: SearchResult) => void;
}

export function SearchResults({ onArtistClick, onAlbumClick, onTrackClick }: SearchResultsProps) {
  const { results, isLoading, error, query } = useSearchStore();

  if (isLoading) {
    return <SearchResultsSkeleton />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-love mb-2">Search failed</p>
        <p className="text-muted text-sm">{error}</p>
      </div>
    );
  }

  if (!results) {
    return null;
  }

  const hasResults =
    results.artists.length > 0 ||
    results.albums.length > 0 ||
    results.tracks.length > 0;

  if (!hasResults) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">No results found for "{query}"</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Artists */}
      {results.artists.length > 0 && (
        <ResultSection
          title="Artists"
          icon={<User size={18} />}
          results={results.artists}
          onClick={onArtistClick}
          renderItem={(result) => (
            <ResultCard
              key={result.url}
              result={result}
              onClick={() => onArtistClick?.(result)}
              imageRounded
            />
          )}
        />
      )}

      {/* Albums */}
      {results.albums.length > 0 && (
        <ResultSection
          title="Albums"
          icon={<Disc3 size={18} />}
          results={results.albums}
          onClick={onAlbumClick}
          renderItem={(result) => (
            <ResultCard
              key={result.url}
              result={result}
              onClick={() => onAlbumClick?.(result)}
              subtitle={result.artist}
            />
          )}
        />
      )}

      {/* Tracks */}
      {results.tracks.length > 0 && (
        <ResultSection
          title="Tracks"
          icon={<Music size={18} />}
          results={results.tracks}
          onClick={onTrackClick}
          renderItem={(result) => (
            <ResultCard
              key={result.url}
              result={result}
              onClick={() => onTrackClick?.(result)}
              subtitle={result.artist}
            />
          )}
        />
      )}
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

interface ResultSectionProps {
  title: string;
  icon: React.ReactNode;
  results: SearchResult[];
  onClick?: (result: SearchResult) => void;
  renderItem: (result: SearchResult) => React.ReactNode;
}

function ResultSection({ title, icon, results, renderItem }: ResultSectionProps) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-muted">{icon}</span>
        <h2 className="text-lg font-semibold text-text">{title}</h2>
        <span className="text-sm text-muted">({results.length})</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {results.slice(0, 12).map(renderItem)}
      </div>
    </section>
  );
}

interface ResultCardProps {
  result: SearchResult;
  onClick?: () => void;
  subtitle?: string;
  imageRounded?: boolean;
}

function ResultCard({ result, onClick, subtitle, imageRounded }: ResultCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group text-left p-3 rounded-xl',
        'bg-surface hover:bg-highlight-low',
        'transition-all duration-200',
        'focus-ring'
      )}
    >
      {/* Image */}
      <div className={cn(
        'aspect-square mb-3 overflow-hidden bg-highlight-med',
        imageRounded ? 'rounded-full' : 'rounded-lg'
      )}>
        {(() => {
          const artUrl = getArtworkUrl({
            imageUrl: result.imageUrl,
            size: ImageSizes.MEDIUM_700,
          });
          return artUrl ? (
          <img
              src={artUrl}
            alt={result.name}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted">
            {result.type === 'artist' ? <User size={32} /> : <Disc3 size={32} />}
          </div>
          );
        })()}
      </div>

      {/* Text */}
      <p className="font-medium text-text truncate group-hover:text-rose transition-colors">
        {result.name}
      </p>
      {subtitle && (
        <p className="text-sm text-muted truncate">{subtitle}</p>
      )}
      {result.genre && (
        <p className="text-xs text-subtle truncate mt-1">{result.genre}</p>
      )}
    </button>
  );
}

function SearchResultsSkeleton() {
  return (
    <div className="space-y-8">
      {[1, 2].map((section) => (
        <div key={section}>
          <Skeleton className="h-6 w-32 mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="p-3">
                <Skeleton className="aspect-square rounded-lg mb-3" />
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

