import { ChevronDown, ChevronUp, Tag } from 'lucide-react';
import { useState } from 'react';
import { cn, linkifyText } from '@/lib/utils';

interface AlbumAboutProps {
  about?: string;
  credits?: string;
  tags?: string[];
}

export function AlbumAbout({ about, credits, tags }: AlbumAboutProps) {
  const [expanded, setExpanded] = useState(false);

  // Show section if we have any content
  if (!about && !credits && (!tags || tags.length === 0)) return null;

  const hasLongText = (about?.length || 0) + (credits?.length || 0) > 300;
  const hasTextContent = about || credits;

  return (
    <div className="px-8 py-6 border-t border-highlight-low">
      {/* About & Credits Section */}
      {hasTextContent && (
        <>
      <h3 className="text-lg font-semibold text-text mb-4">About</h3>

      <div className={cn(
        'relative',
        !expanded && hasLongText && 'max-h-32 overflow-hidden'
      )}>
        {about && (
          <p className="text-subtle leading-relaxed whitespace-pre-line">
                {linkifyText(about)}
          </p>
        )}

        {credits && (
          <div className="mt-4">
                <h4 className="text-sm font-medium text-text/60 uppercase tracking-wider mb-2">
              Credits
            </h4>
            <p className="text-subtle leading-relaxed whitespace-pre-line">
                  {linkifyText(credits)}
            </p>
          </div>
        )}

        {/* Gradient fade */}
        {!expanded && hasLongText && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-linear-to-t from-base to-transparent" />
        )}
      </div>

      {/* Show more/less button */}
      {hasLongText && (
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            'flex items-center gap-1 mt-2',
            'text-sm text-pine hover:text-text',
            'transition-colors'
          )}
        >
          {expanded ? (
            <>
              Show less <ChevronUp size={16} />
            </>
          ) : (
            <>
              Show more <ChevronDown size={16} />
            </>
          )}
        </button>
          )}
        </>
      )}

      {/* Tags Section - below about/credits */}
      {tags && tags.length > 0 && (
        <div className={cn(hasTextContent && 'mt-6 pt-6 border-t border-highlight-low')}>
          <div className="flex items-center gap-2 mb-3">
            <Tag size={14} className="text-text/60" />
            <h4 className="text-sm font-medium text-text/60 uppercase tracking-wider">Tags</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className={cn(
                  'inline-flex items-center px-3 py-1.5 rounded-xl',
                  'text-xs font-medium',
                  'bg-white/5 text-text/70 border border-white/10',
                  'hover:bg-white/10 hover:text-text hover:border-white/20',
                  'transition-all duration-200 cursor-default'
                )}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

