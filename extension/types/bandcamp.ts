/**
 * Bandcamp Data Types
 * Ported from Python models in _research/models/bandcamp_models.py
 */

// ============================================
// Core Types
// ============================================

export type PageType = 'album' | 'song' | 'band';
export type ItemType = 'album' | 'track';
export type RepeatMode = 'off' | 'track' | 'all';

// ============================================
// Band / Artist
// ============================================

export interface Band {
  id: number;
  name: string;
  subdomain: string;
  url: string;
  accountId?: number;
  imageId?: number;
  backgroundImageId?: number;  // Custom background image ID (for artist page)
  location?: string;
  bio?: string;
  links?: BandLink[];
}

export interface BandLink {
  text: string;
  url: string;
}

// ============================================
// Track
// ============================================

export interface Track {
  id: number;
  trackId: number;
  title: string;
  trackNum: number;
  duration: number;

  // URLs
  titleLink?: string;
  streamUrl?: string;
  albumUrl?: string;  // Full URL to album page for navigation

  // Metadata
  artist?: string;
  albumTitle?: string;
  albumId?: number;
  artId?: number;
  bandId?: number;
  bandName?: string;
  bandUrl?: string;

  /**
   * Display title with artist prefix removed (if present)
   * Computed field - set by cleanTrackTitle() when track is processed
   * Example: "Sadness - Song" with artist "Sadness" → displayTitle = "Song"
   * If no prefix found, equals the original title
   */
  displayTitle?: string;

  // Flags
  hasLyrics: boolean;
  lyrics?: string;
  streaming: boolean;
  isDownloadable: boolean;
}

// ============================================
// Album
// ============================================

export interface Album {
  id: number;
  url: string;
  title: string;
  artist: string;
  artId: number;
  bandId: number;
  bandUrl?: string;

  // Metadata
  about?: string;
  credits?: string;
  releaseDate?: string;
  tags: string[];

  // Tracks
  tracks: Track[];
  /** Number of hidden/unlisted tracks (detected from og:description vs visible tracks) */
  hiddenTrackCount?: number;

  // Flags
  hasAudio: boolean;
  isPreorder: boolean;
}

// ============================================
// Discography Item (from artist page grid)
// ============================================

export interface DiscographyItem {
  itemType: ItemType;
  itemId: number;
  bandId: number;
  url: string;
  relativeUrl: string;
  title: string;
  artistOverride?: string;
  artUrl?: string;         // Full URL (legacy, for backwards compat)
  artId?: number | string; // Art ID for building URLs (string preserves leading zeros)
}

// ============================================
// Artist Page (full data)
// ============================================

export interface ArtistPage {
  band: Band;
  releases: DiscographyItem[];
  totalReleases: number;
  discographyRealSize?: number;
}

// ============================================
// Search Results
// ============================================

export interface SearchResult {
  type: 'artist' | 'album' | 'track';
  id: number;
  name: string;
  url: string;
  imageUrl?: string;
  artist?: string;
  genre?: string;
}

export interface SearchResults {
  query: string;
  artists: SearchResult[];
  albums: SearchResult[];
  tracks: SearchResult[];
}

// ============================================
// Image Helpers
// ============================================

export const ImageSizes = {
  THUMB_100: 3,    // ~100px
  THUMB_350: 2,    // ~350px (was mistakenly called MEDIUM_350 in some places)
  MEDIUM_700: 5,   // ~700px
  LARGE_1200: 10,  // ~1200px
} as const;

export type ImageSize = typeof ImageSizes[keyof typeof ImageSizes];

/**
 * Build album/track artwork URL from artId
 * Note: artId can be string or number - strings preserve leading zeros
 */
export function buildArtUrl(artId: number | string, size: ImageSize = ImageSizes.LARGE_1200): string {
  return `https://f4.bcbits.com/img/a${artId}_${size}.jpg`;
}

/**
 * Build artist/band bio image URL from imageId
 */
export function buildBioUrl(imageId: number, size: ImageSize = ImageSizes.LARGE_1200): string {
  return `https://f4.bcbits.com/img/${imageId.toString().padStart(10, '0')}_${size}.jpg`;
}

/**
 * Extract artId from a Bandcamp artwork URL
 * Returns as STRING to preserve leading zeros (e.g., "0510498139")
 * Handles URLs like:
 * - https://f4.bcbits.com/img/a1234567890_5.jpg
 * - https://f4.bcbits.com/img/a0510498139_2.jpg (leading zero!)
 * Returns null if not a valid artwork URL
 */
export function extractArtIdFromUrl(url: string): string | null {
  if (!url) return null;

  // Match pattern: /img/a{artId}_{size}.jpg
  // Return as string to preserve leading zeros
  const match = url.match(/\/img\/a(\d+)_\d+\.jpg/);
  if (match) {
    return match[1]; // Keep as string!
  }
  return null;
}

/**
 * Extract imageId (bio/artist) from a Bandcamp image URL
 * Handles URLs like:
 * - https://f4.bcbits.com/img/0001234567_5.jpg (padded)
 * Returns null if not a valid bio image URL
 */
export function extractImageIdFromUrl(url: string): number | null {
  if (!url) return null;

  // Match pattern: /img/{10-digit padded number}_{size}.jpg (not starting with 'a')
  const match = url.match(/\/img\/(\d{10})_\d+\.jpg/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Get the best artwork URL - normalizes from artId, artUrl, or imageUrl
 * Allows changing the size of any artwork URL
 */
export function getArtworkUrl(options: {
  artId?: number | string;
  artUrl?: string;
  imageId?: number;
  imageUrl?: string;
  size?: ImageSize;
}): string | null {
  const { artId, artUrl, imageId, imageUrl, size = ImageSizes.MEDIUM_700 } = options;

  // Priority 1: Direct artId (can be number or string)
  if (artId && (typeof artId === 'string' ? artId.length > 0 : artId > 0)) {
    return buildArtUrl(artId, size);
  }

  // Priority 2: Extract from artUrl (preserves leading zeros)
  if (artUrl) {
    const extractedArtId = extractArtIdFromUrl(artUrl);
    if (extractedArtId) {
      return buildArtUrl(extractedArtId, size);
    }
    // If we can't extract, try to change the size in the URL directly
    const resized = artUrl.replace(/_\d+\.jpg$/, `_${size}.jpg`);
    if (resized !== artUrl && !artUrl.includes('/img/0.gif')) {
      return resized;
    }
  }

  // Priority 3: Direct imageId (for artist/bio images)
  if (imageId && imageId > 0) {
    return buildBioUrl(imageId, size);
  }

  // Priority 4: imageUrl as-is (search results)
  if (imageUrl) {
    // Try to extract and resize
    const extractedArtId = extractArtIdFromUrl(imageUrl);
    if (extractedArtId) {
      return buildArtUrl(extractedArtId, size);
    }
    const extractedImageId = extractImageIdFromUrl(imageUrl);
    if (extractedImageId) {
      return buildBioUrl(extractedImageId, size);
    }
    // Return as-is if valid
    if (!imageUrl.includes('/img/0.gif')) {
      return imageUrl;
    }
  }

  return null;
}

