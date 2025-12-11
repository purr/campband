/**
 * Track Utility Functions
 * Centralized helpers for track conversion and manipulation
 */

import type { Track } from '@/types';
import type { FavoriteTrack, HistoryEntry } from '@/lib/db';

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
 */
export function toPlayableTrack(track: TrackLike): Track {
  return {
    id: track.id,
    trackId: track.id,
    title: track.title,
    artist: 'artist' in track ? track.artist : track.bandName,
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

