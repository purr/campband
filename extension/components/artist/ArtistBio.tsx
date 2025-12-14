import { useEffect, useRef, useState } from 'react';

interface ArtistBioProps {
  bioHtml: string;
}

/**
 * ArtistBio component that handles Bandcamp's "more"/"less" toggle functionality
 *
 * Bandcamp uses a specific HTML structure:
 * - Hidden text wrapped in <span style="display: none;">
 * - "more" link with class "peekaboo-link"
 * - "less" link that appears when expanded
 */
export function ArtistBio({ bioHtml }: ArtistBioProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle click events on "more" and "less" links
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if clicked on "more" link
      if (target.tagName === 'A' && target.textContent?.trim() === 'more') {
        e.preventDefault();
        e.stopPropagation();
        setIsExpanded(true);
        return;
      }

      // Check if clicked on "less" link
      if (target.tagName === 'A' && target.textContent?.trim() === 'less') {
        e.preventDefault();
        e.stopPropagation();
        setIsExpanded(false);
        return;
      }
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, []);

  // Apply expanded/collapsed state to the DOM
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Find all hidden spans (the expandable content)
    const hiddenSpans = container.querySelectorAll('span[style*="display: none"]');
    const moreLinks = container.querySelectorAll('.peekaboo-link');

    // Find "less" links - they're in spans that contain an <a> with text "less"
    const allSpans = container.querySelectorAll('span');
    const lessLinkSpans: HTMLElement[] = [];
    allSpans.forEach((span) => {
      const link = span.querySelector('a');
      if (link && link.textContent?.trim() === 'less') {
        lessLinkSpans.push(span as HTMLElement);
      }
    });

    if (isExpanded) {
      // Show hidden content
      hiddenSpans.forEach((span) => {
        (span as HTMLElement).style.display = '';
      });
      // Hide "more" links
      moreLinks.forEach((link) => {
        (link as HTMLElement).style.display = 'none';
      });
      // Show "less" links
      lessLinkSpans.forEach((span) => {
        span.style.display = '';
      });
    } else {
      // Hide content
      hiddenSpans.forEach((span) => {
        (span as HTMLElement).style.display = 'none';
      });
      // Show "more" links
      moreLinks.forEach((link) => {
        (link as HTMLElement).style.display = '';
      });
      // Hide "less" links
      lessLinkSpans.forEach((span) => {
        span.style.display = 'none';
      });
    }
  }, [isExpanded]);

  // Process HTML to make links clickable and styled
  const processedHtml = bioHtml
    // Make existing links open in new tab and style them
    .replace(/<a\s+([^>]*?)>/gi, (match, attrs) => {
      // Don't modify "more"/"less" links
      if (attrs.includes('peekaboo') || attrs.includes('href="#')) {
        return match;
      }
      // Add target and styling to other links
      if (!attrs.includes('target=')) {
        attrs += ' target="_blank" rel="noopener noreferrer"';
      }
      if (!attrs.includes('class=')) {
        attrs += ' class="text-pine hover:text-foam transition-colors"';
      }
      return `<a ${attrs}>`;
    })
    // Make "more" and "less" links look clickable
    .replace(/<a(?![^>]*class=)([^>]*?)>(more|less)<\/a>/gi, '<a$1 class="text-pine hover:text-foam cursor-pointer underline">$2</a>');

  return (
    <div
      ref={containerRef}
      className="text-subtle leading-relaxed max-w-3xl"
      dangerouslySetInnerHTML={{ __html: processedHtml }}
    />
  );
}

