import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui';
import { useRouterStore, useSearchStore } from '@/lib/store';

export function HomePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const { navigate } = useRouterStore();
  const { setQuery } = useSearchStore();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setQuery(searchQuery);
      navigate({ name: 'search', query: searchQuery });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      setQuery(searchQuery);
      navigate({ name: 'search', query: searchQuery });
    }
  };

  return (
    <div className="min-h-full flex flex-col">
      {/* Hero section */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 text-center">
        {/* Animated gradient background effect - breathing animation */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-rose/8 rounded-full blur-3xl animate-breathe" />
          <div className="absolute top-1/3 right-1/3 w-80 h-80 bg-pine/8 rounded-full blur-3xl animate-breathe animation-delay-2000" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-iris/8 rounded-full blur-3xl animate-breathe animation-delay-4000" />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-2xl mx-auto space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl font-bold text-gradient">
              Welcome to CampBand
            </h1>
            <p className="text-xl text-subtle">
              A modern way to explore and listen to music on Bandcamp
            </p>
          </div>

          {/* Search box - only navigates on Enter */}
          <form onSubmit={handleSearchSubmit} className="w-full max-w-md mx-auto">
            <Input
              icon={<Search size={20} />}
              placeholder="Search for artists, albums, or tracks..."
              className="text-base py-3"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </form>

          {/* Tips */}
          <div className="pt-8 space-y-4">
            <p className="text-muted text-sm uppercase tracking-wider">
              Getting Started
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <TipCard
                number="1"
                title="Search"
                description="Find your favorite artists on Bandcamp"
              />
              <TipCard
                number="2"
                title="Explore"
                description="Browse full discographies with ease"
              />
              <TipCard
                number="3"
                title="Listen"
                description="Play, queue, and shuffle entire catalogs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-8 py-4 text-center text-muted text-sm border-t border-highlight-low">
        <p>
          CampBand • Support artists by purchasing their music on{' '}
          <a
            href="https://bandcamp.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-pine hover:underline"
          >
            Bandcamp
          </a>
        </p>
      </footer>
    </div>
  );
}

interface TipCardProps {
  number: string;
  title: string;
  description: string;
}

function TipCard({ number, title, description }: TipCardProps) {
  return (
    <div className="glass rounded-xl p-5 text-left hover:bg-highlight-low/50 transition-colors">
      <div className="w-8 h-8 rounded-full bg-rose/20 text-rose flex items-center justify-center text-sm font-bold mb-3">
        {number}
      </div>
      <h3 className="font-semibold text-text mb-1">{title}</h3>
      <p className="text-sm text-muted">{description}</p>
    </div>
  );
}
