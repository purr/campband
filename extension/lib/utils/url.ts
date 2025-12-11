/**
 * URL Utilities for hash-based routing
 * Converts between app routes and URL hashes
 */

import type { Route } from '@/lib/store/routerStore';

/**
 * Extract subdomain and path from Bandcamp URL
 * e.g., "https://carcrashset.bandcamp.com/album/exhale"
 *    → { subdomain: "carcrashset", type: "album", slug: "exhale" }
 */
export function parseBandcampUrl(url: string): {
  subdomain: string;
  type: 'artist' | 'album' | 'track';
  slug?: string;
} | null {
  try {
    const parsed = new URL(url);
    const subdomain = parsed.hostname.replace('.bandcamp.com', '');

    if (!subdomain || subdomain === parsed.hostname) {
      return null;
    }

    const pathParts = parsed.pathname.split('/').filter(Boolean);

    if (pathParts.length === 0) {
      return { subdomain, type: 'artist' };
    }

    if (pathParts[0] === 'album' && pathParts[1]) {
      return { subdomain, type: 'album', slug: pathParts[1] };
    }

    if (pathParts[0] === 'track' && pathParts[1]) {
      return { subdomain, type: 'track', slug: pathParts[1] };
    }

    return { subdomain, type: 'artist' };
  } catch {
    return null;
  }
}

/**
 * Build Bandcamp URL from parts
 */
export function buildBandcampUrl(
  subdomain: string,
  type: 'artist' | 'album' | 'track',
  slug?: string
): string {
  const base = `https://${subdomain}.bandcamp.com`;
  if (type === 'artist' || !slug) {
    return base;
  }
  return `${base}/${type}/${slug}`;
}

/**
 * Convert a Route to a URL hash string
 *
 * URL Schema:
 * - #/                              → Home
 * - #/search?q=query                → Search
 * - #/artist/subdomain              → Artist page
 * - #/artist/subdomain/a/album-slug → Album page (/a/ = album)
 * - #/artist/subdomain/t/track-slug → Track page (/t/ = track)
 * - #/following                     → Following
 * - #/liked                         → Liked songs
 * - #/library                       → Library
 * - #/playlist/123                  → Playlist
 * - #/settings                      → Settings
 */
export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';

    case 'search':
      return route.query
        ? `#/search?q=${encodeURIComponent(route.query)}`
        : '#/search';

    case 'artist': {
      const parsed = parseBandcampUrl(route.url);
      if (!parsed) return '#/';
      return `#/artist/${parsed.subdomain}`;
    }

    case 'album': {
      const parsed = parseBandcampUrl(route.url);
      if (!parsed || !parsed.slug) return '#/';
      // /a/ for albums, /t/ for tracks
      const prefix = parsed.type === 'track' ? 't' : 'a';
      return `#/artist/${parsed.subdomain}/${prefix}/${parsed.slug}`;
    }

    case 'library':
      return '#/library';

    case 'following':
      return '#/following';

    case 'liked':
      return '#/liked';

    case 'playlist':
      return `#/playlist/${route.id}`;

    case 'settings':
      return '#/settings';

    default:
      return '#/';
  }
}

/**
 * Parse URL hash into a Route
 *
 * URL Schema:
 * - #/                              → Home
 * - #/search?q=query                → Search
 * - #/artist/subdomain              → Artist page
 * - #/artist/subdomain/a/album-slug → Album page (/a/ = album)
 * - #/artist/subdomain/t/track-slug → Track page (/t/ = track)
 * - #/following                     → Following
 * - #/liked                         → Liked songs
 * - #/library                       → Library
 * - #/playlist/123                  → Playlist
 * - #/settings                      → Settings
 */
export function hashToRoute(hash: string): Route {
  // Remove leading # if present
  const path = hash.startsWith('#') ? hash.slice(1) : hash;

  // Parse path and query string
  const [pathname, queryString] = path.split('?');
  const params = new URLSearchParams(queryString || '');
  const segments = pathname.split('/').filter(Boolean);

  // Match routes
  const routeName = segments[0] || '';

  switch (routeName) {
    case '':
      return { name: 'home' };

    case 'search':
      return { name: 'search', query: params.get('q') || undefined };

    case 'artist': {
      const subdomain = segments[1];
      if (!subdomain) return { name: 'home' };

      // /artist/subdomain/a/slug or /artist/subdomain/t/slug → Release page
      if (segments.length >= 4) {
        const typePrefix = segments[2];
        const slug = segments[3];

        if (typePrefix === 'a' || typePrefix === 't') {
          const type = typePrefix === 't' ? 'track' : 'album';
          return { name: 'album', url: buildBandcampUrl(subdomain, type, slug) };
        }
      }

      // /artist/subdomain → Artist page
      return { name: 'artist', url: buildBandcampUrl(subdomain, 'artist') };
    }

    case 'library':
      return { name: 'library' };

    case 'following':
      return { name: 'following' };

    case 'liked':
      return { name: 'liked' };

    case 'playlist': {
      const id = parseInt(segments[1], 10);
      if (!isNaN(id)) {
        return { name: 'playlist', id };
      }
      return { name: 'home' };
    }

    case 'settings':
      return { name: 'settings' };

    default:
      return { name: 'home' };
  }
}

/**
 * Get the current route from the URL hash
 */
export function getCurrentRouteFromHash(): Route {
  return hashToRoute(window.location.hash);
}

/**
 * Update the URL hash without triggering navigation
 */
export function updateHash(route: Route, replace = false): void {
  const hash = routeToHash(route);

  if (replace) {
    window.history.replaceState(null, '', hash);
  } else {
    window.history.pushState(null, '', hash);
  }
}

