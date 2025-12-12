/**
 * Track Utility Functions
 * Centralized helpers for track conversion and manipulation
 */

import type { Track } from '@/types';
import type { FavoriteTrack, HistoryEntry } from '@/lib/db';

// ============================================
// Title Cleaning - Remove redundant artist prefix
// ============================================

/**
 * Various dash characters that might be used as separators
 * Includes: hyphen (-), en dash (–), em dash (—), minus sign (−)
 */
const DASH_CHARS = ['-', '–', '—', '−'];

/**
 * Regex pattern to match artist prefix at the start of a title
 * Matches: "Artist - Title", "Artist- Title", "Artist -Title", "Artist-Title"
 * Case-insensitive, handles various dash types
 */
function createArtistPrefixPattern(artist: string): RegExp {
  // Escape special regex characters in artist name
  const escapedArtist = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Create pattern: artist name + optional space + any dash + optional space
  const dashPattern = DASH_CHARS.map(d => `\\${d}`).join('|');
  return new RegExp(`^${escapedArtist}\\s*(?:${dashPattern})\\s*`, 'i');
}

/**
 * Clean a track title by removing redundant artist prefix
 *
 * Examples:
 *   cleanTrackTitle("Sadness - Song Title", "Sadness") → "Song Title"
 *   cleanTrackTitle("SADNESS - Song Title", "Sadness") → "Song Title" (case-insensitive)
 *   cleanTrackTitle("Sadness—Song Title", "Sadness") → "Song Title" (em dash)
 *   cleanTrackTitle("Other Artist - Song", "Sadness") → "Other Artist - Song" (no match)
 *   cleanTrackTitle("Sadness & Joy - Song", "Sadness") → "Sadness & Joy - Song" (partial match, no change)
 *
 * @param title - The original track title
 * @param artist - The artist name to check for
 * @returns The cleaned title, or original if no artist prefix found
 */
export function cleanTrackTitle(title: string, artist: string | undefined): string {
  // No artist to check against
  if (!artist || !title) {
    return title;
  }

  // Create pattern for this specific artist
  const pattern = createArtistPrefixPattern(artist);

  // Check if title starts with artist prefix
  const match = title.match(pattern);
  if (match) {
    // Remove the matched prefix
    const cleaned = title.slice(match[0].length).trim();
    // Only use cleaned version if there's something left
    if (cleaned.length > 0) {
      return cleaned;
    }
  }

  return title;
}

/**
 * Get the display title for a track (cleaned of artist prefix)
 * This is the canonical way to get a title for display purposes
 */
export function getDisplayTitle(track: { title: string; artist?: string; bandName?: string }): string {
  const artist = track.artist || track.bandName;
  return cleanTrackTitle(track.title, artist);
}

/**
 * Any track-like object that can be converted to a playable Track
 */
export type TrackLike = Track | FavoriteTrack | PartialTrack;

/**
 * Partial track data (from history, search results, etc.)
 */
export interface PartialTrack {
  id: number;
  title: string;
  artist?: string;
  bandName?: string;
  albumTitle?: string;
  albumId?: number;
  albumUrl?: string;
  artId?: number;
  bandId?: number;
  bandUrl?: string;
  duration?: number;
  streamUrl?: string;
}

/**
 * Convert any track-like object to a full playable Track format
 * This is the canonical way to prepare tracks for the queue/player
 * Automatically computes displayTitle by removing artist prefix if present
 */
export function toPlayableTrack(track: TrackLike): Track {
  const artist = 'artist' in track ? track.artist : track.bandName;
  const displayTitle = cleanTrackTitle(track.title, artist || track.bandName);

  return {
    id: track.id,
    trackId: track.id,
    title: track.title,
    displayTitle,
    artist,
    albumTitle: track.albumTitle,
    albumId: track.albumId,
    albumUrl: track.albumUrl,
    artId: track.artId,
    bandId: 'bandId' in track ? (track.bandId ?? 0) : 0,
    bandName: track.bandName,
    bandUrl: track.bandUrl,
    duration: track.duration ?? 0,
    streamUrl: track.streamUrl,
    trackNum: 'trackNum' in track ? (track.trackNum ?? 1) : 1,
    hasLyrics: 'hasLyrics' in track ? track.hasLyrics : false,
    streaming: 'streaming' in track ? track.streaming : true,
    isDownloadable: 'isDownloadable' in track ? track.isDownloadable : false,
  };
}

/**
 * Convert multiple tracks to playable format, filtering out non-streamable tracks
 */
export function toPlayableTracks(tracks: TrackLike[]): Track[] {
  return tracks
    .filter((t) => t.streamUrl)
    .map(toPlayableTrack);
}

/**
 * Convert a HistoryEntry to a display-only track format
 * Note: These may not be playable (no streamUrl stored in history)
 */
export function historyEntryToTrack(entry: HistoryEntry): PartialTrack {
  return {
    id: entry.itemId,
    title: entry.title,
    artist: entry.artist,
    artId: entry.artId,
    albumUrl: entry.albumUrl,
    bandUrl: entry.bandUrl,
    duration: 0, // History doesn't store duration
    streamUrl: undefined, // Can't play directly from history
  };
}

/**
 * Check if a track-like object is streamable
 */
export function isStreamable(track: TrackLike): boolean {
  return !!track.streamUrl;
}

/**
 * Get display artist name from track
 */
export function getTrackArtist(track: TrackLike): string {
  return ('artist' in track ? track.artist : undefined) || track.bandName || 'Unknown Artist';
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
export function shuffleTracks<T>(tracks: T[]): T[] {
  const shuffled = [...tracks];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

