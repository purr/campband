import Dexie, { type Table } from 'dexie';

// ============================================
// Types
// ============================================

export interface FavoriteArtist {
  id: number;           // bandId
  name: string;
  url: string;
  imageId?: number;
  location?: string;
  addedAt: Date;
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
  addedAt: Date;
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
  addedAt: Date;
  playCount?: number;   // How many times this track was played
  lastPlayedAt?: Date;  // When was this track last played
}

export interface Playlist {
  id?: number;          // Auto-increment
  name: string;
  description?: string;
  coverImage?: string;  // Base64 or URL to custom cover image
  trackIds: number[];   // Array of track IDs
  createdAt: Date;
  updatedAt: Date;
}

export interface PlaylistTrack {
  id?: number;          // Auto-increment
  playlistId: number;
  trackId: number;
  position: number;     // Order in playlist
  addedAt: Date;
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
  playedAt: Date;
  playCount?: number;   // How many times this specific item was played
}

// Track play statistics (separate from history for efficient queries)
export interface TrackStats {
  trackId: number;      // Primary key
  playCount: number;
  lastPlayedAt: Date;
  totalListenTime: number; // In seconds
}

export interface CachedArtist {
  id: number;           // bandId
  data: string;         // JSON string of ArtistPage
  cachedAt: Date;
  expiresAt: Date;
}

export interface CachedAlbum {
  id: number;           // albumId
  url: string;
  data: string;         // JSON string of Album
  cachedAt: Date;
  expiresAt: Date;
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
  }
}

// Singleton instance
export const db = new CampBandDB();
