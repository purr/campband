import React from 'react';

/**
 * Regex to match URLs in text
 * Matches http://, https://, and www. URLs
 */
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"{}|\\^`[\]]+/gi;

/**
 * Convert plain text with URLs into React elements with clickable links
 * Always uses https:// in the href for security
 */
export function linkifyText(text: string): React.ReactNode {
  if (!text) return null;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const url = match[0];
    // Ensure URL uses https
    let href = url;
    if (href.startsWith('www.')) {
      href = 'https://' + href;
    } else if (href.startsWith('http://')) {
      href = href.replace('http://', 'https://');
    }

    // Clean up trailing punctuation that's likely not part of the URL
    const trailingMatch = href.match(/[.,;:!?)]+$/);
    let displayUrl = url;
    if (trailingMatch) {
      href = href.slice(0, -trailingMatch[0].length);
      displayUrl = url.slice(0, -trailingMatch[0].length);
      // Add the trailing punctuation after the link
      parts.push(
        <a
          key={match.index}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-pine hover:text-foam transition-colors break-all"
        >
          {displayUrl}
        </a>
      );
      parts.push(trailingMatch[0]);
    } else {
      parts.push(
        <a
          key={match.index}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-pine hover:text-foam transition-colors break-all"
        >
          {displayUrl}
        </a>
      );
    }

    lastIndex = match.index + url.length;
  }

  // Add remaining text after the last URL
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // If no URLs found, return original text
  if (parts.length === 0) {
    return text;
  }

  return <>{parts}</>;
}

