import Dexie, { type Table } from 'dexie';

// ============================================
// Types
// ============================================

// All timestamps are Unix timestamps in milliseconds (Date.now())

export interface FavoriteArtist {
  id: number;           // bandId
  name: string;
  url: string;
  imageId?: number;
  location?: string;
  addedAt: number;      // Unix timestamp (ms)
}

export interface FavoriteAlbum {
  id: number;           // albumId
  title: string;
  artist: string;
  url: string;
  artId: number;
  bandId: number;
  bandUrl?: string;
  releaseDate?: string;
  addedAt: number;      // Unix timestamp (ms)
}

export interface FavoriteTrack {
  id: number;           // trackId
  title: string;
  artist: string;
  albumTitle?: string;
  albumId?: number;
  albumUrl?: string;    // Full URL to album page
  artId?: number;
  bandId: number;
  bandName?: string;
  bandUrl?: string;     // Full URL to artist page
  duration: number;
  streamUrl?: string;
  addedAt: number;      // Unix timestamp (ms)
  playCount?: number;   // How many times this track was played
  lastPlayedAt?: number; // Unix timestamp (ms)
}

export interface Playlist {
  id?: number;          // Auto-increment
  name: string;
  description?: string;
  coverImage?: string;  // Base64 or URL to custom cover image
  trackIds: number[];   // Array of track IDs
  createdAt: number;    // Unix timestamp (ms)
  updatedAt: number;    // Unix timestamp (ms)
}

export interface PlaylistTrack {
  id?: number;          // Auto-increment
  playlistId: number;
  trackId: number;
  position: number;     // Order in playlist
  addedAt: number;      // Unix timestamp (ms)
}

export interface HistoryEntry {
  id?: number;          // Auto-increment
  type: 'track' | 'artist' | 'album';
  itemId: number;
  title: string;
  artist?: string;
  artId?: number;
  albumUrl?: string;    // For tracks: URL to album page
  bandUrl?: string;     // URL to artist page
  playedAt: number;     // Unix timestamp (ms)
  playCount?: number;   // How many times this specific item was played
}

// Track play statistics (separate from history for efficient queries)
export interface TrackStats {
  trackId: number;      // Primary key
  playCount: number;
  lastPlayedAt: number; // Unix timestamp (ms)
  totalListenTime: number; // In seconds
}

export interface CachedArtist {
  id: number;           // bandId
  url: string;          // Normalized artist URL for lookup
  data: string;         // JSON string of ArtistPage
  cachedAt: number;     // Unix timestamp (ms) - when first cached
  lastCheckedAt: number; // Unix timestamp (ms) - when last checked for new releases
  releaseCount: number; // Number of releases at last check (for detecting new releases)
}

export interface CachedAlbum {
  id: number;           // albumId
  url: string;          // Album URL for lookup
  data: string;         // JSON string of Album
  cachedAt: number;     // Unix timestamp (ms) - when cached (permanent)
}

export interface ScrobbledTrack {
  id?: number;          // Auto-increment
  trackId: number;      // Track ID
  artist: string;       // Artist name
  track: string;        // Track title (cleaned)
  album?: string;       // Album title
  timestamp: number;    // Unix timestamp (seconds) - when track started playing
  scrobbledAt: number;  // Unix timestamp (ms) - when scrobbled
  // Composite key: trackId + timestamp for uniqueness
}

// ============================================
// Database
// ============================================

export class CampBandDB extends Dexie {
  favoriteArtists!: Table<FavoriteArtist, number>;
  favoriteAlbums!: Table<FavoriteAlbum, number>;
  favoriteTracks!: Table<FavoriteTrack, number>;
  playlists!: Table<Playlist, number>;
  playlistTracks!: Table<PlaylistTrack, number>;
  history!: Table<HistoryEntry, number>;
  trackStats!: Table<TrackStats, number>;
  cachedArtists!: Table<CachedArtist, number>;
  cachedAlbums!: Table<CachedAlbum, number>;
  scrobbledTracks!: Table<ScrobbledTrack, number>;

  constructor() {
    super('CampBandDB');

    this.version(1).stores({
      // Favorites - indexed by id for quick lookup
      favoriteArtists: 'id, name, addedAt',
      favoriteAlbums: 'id, title, artist, bandId, addedAt',
      favoriteTracks: 'id, title, artist, bandId, albumId, addedAt',

      // Playlists
      playlists: '++id, name, createdAt, updatedAt',
      playlistTracks: '++id, playlistId, trackId, position',

      // History - indexed for quick recent lookups
      history: '++id, type, itemId, playedAt',

      // Cache
      cachedArtists: 'id, cachedAt, expiresAt',
      cachedAlbums: 'id, url, cachedAt, expiresAt',
    });

    // Version 2: Add track stats table and new fields
    this.version(2).stores({
      // Favorites - indexed by id for quick lookup
      favoriteArtists: 'id, name, addedAt',
      favoriteAlbums: 'id, title, artist, bandId, addedAt',
      favoriteTracks: 'id, title, artist, bandId, albumId, addedAt, playCount, lastPlayedAt',

      // Playlists
      playlists: '++id, name, createdAt, updatedAt',
      playlistTracks: '++id, playlistId, trackId, position',

      // History - indexed for quick recent lookups
      history: '++id, type, itemId, playedAt',

      // Track statistics
      trackStats: 'trackId, playCount, lastPlayedAt',

      // Cache
      cachedArtists: 'id, cachedAt, expiresAt',
      cachedAlbums: 'id, url, cachedAt, expiresAt',
    });

    // Version 3: Permanent caching with new release detection
    // Clear old cache data during upgrade (schema changed significantly)
    this.version(3).stores({
      // Favorites - indexed by id for quick lookup
      favoriteArtists: 'id, name, addedAt',
      favoriteAlbums: 'id, title, artist, bandId, addedAt',
      favoriteTracks: 'id, title, artist, bandId, albumId, addedAt, playCount, lastPlayedAt',

      // Playlists
      playlists: '++id, name, createdAt, updatedAt',
      playlistTracks: '++id, playlistId, trackId, position',

      // History - indexed for quick recent lookups
      history: '++id, type, itemId, playedAt',

      // Track statistics
      trackStats: 'trackId, playCount, lastPlayedAt',

      // Permanent cache - no expiry, just lastCheckedAt for new release detection
      cachedArtists: 'id, url, cachedAt, lastCheckedAt',
      cachedAlbums: 'id, url, cachedAt',
    }).upgrade(async tx => {
      // Clear old cache data that doesn't have the new schema fields
      // This ensures fresh data is fetched with the new caching system
      console.log('[DB] Migrating to v3: Clearing old cache data');
      await tx.table('cachedArtists').clear();
      await tx.table('cachedAlbums').clear();
    });

    // Version 4: Add scrobbled tracks table for duplicate prevention
    this.version(4).stores({
      // Favorites - indexed by id for quick lookup
      favoriteArtists: 'id, name, addedAt',
      favoriteAlbums: 'id, title, artist, bandId, addedAt',
      favoriteTracks: 'id, title, artist, bandId, albumId, addedAt, playCount, lastPlayedAt',

      // Playlists
      playlists: '++id, name, createdAt, updatedAt',
      playlistTracks: '++id, playlistId, trackId, position',

      // History - indexed for quick recent lookups
      history: '++id, type, itemId, playedAt',

      // Track statistics
      trackStats: 'trackId, playCount, lastPlayedAt',

      // Permanent cache - no expiry, just lastCheckedAt for new release detection
      cachedArtists: 'id, url, cachedAt, lastCheckedAt',
      cachedAlbums: 'id, url, cachedAt',

      // Scrobbled tracks - prevent duplicate scrobbles
      scrobbledTracks: '++id, trackId, timestamp, scrobbledAt',
    });
  }
}

// Singleton instance
export const db = new CampBandDB();
