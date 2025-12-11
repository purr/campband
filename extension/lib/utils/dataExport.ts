/**
 * Data Export/Import utilities for CampBand
 * Supports exporting and importing user data with cover images
 */

import { db, type FavoriteArtist, type FavoriteAlbum, type FavoriteTrack, type Playlist } from '@/lib/db';

// ============================================
// Types
// ============================================

export interface ExportOptions {
  likes: boolean;      // Liked tracks + albums
  playlists: boolean;  // User playlists
  following: boolean;  // Followed artists
  settings: boolean;   // App settings
}

// No base64 images for these - covers are fetched from Bandcamp
export type ExportedArtist = FavoriteArtist;
export type ExportedAlbum = FavoriteAlbum;
export type ExportedTrack = FavoriteTrack;

export interface ExportedPlaylist extends Omit<Playlist, 'id'> {
  tracks: ExportedTrack[];
  // coverImage is already included from Playlist type (base64 for custom covers)
}

export interface ExportedData {
  version: number;
  exportedAt: string;
  app: 'CampBand';

  // Optional sections based on what user chose to export
  likedTracks?: ExportedTrack[];
  likedAlbums?: ExportedAlbum[];
  following?: ExportedArtist[];
  playlists?: ExportedPlaylist[];
  settings?: {
    audio: Record<string, unknown>;
    app: Record<string, unknown>;
  };
}

export interface ImportResult {
  success: boolean;
  imported: {
    tracks: number;
    albums: number;
    artists: number;
    playlists: number;
    settings: boolean;
  };
  errors: string[];
}

// Note: Album/track/artist covers are NOT exported as base64 - they're fetched from Bandcamp.
// Only custom playlist covers (already base64 in DB) are included in exports.

// ============================================
// Export Functions
// ============================================

/**
 * Export user data based on selected options
 */
export async function exportData(
  options: ExportOptions,
  settingsData?: { audio: Record<string, unknown>; app: Record<string, unknown> },
  onProgress?: (message: string) => void
): Promise<ExportedData> {
  const data: ExportedData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'CampBand',
  };

  // Export liked tracks and albums
  if (options.likes) {
    onProgress?.('Exporting liked tracks...');
    const tracks = await db.favoriteTracks.toArray();
    data.likedTracks = tracks;

    onProgress?.('Exporting liked albums...');
    const albums = await db.favoriteAlbums.toArray();
    data.likedAlbums = albums;
  }

  // Export following (artists)
  if (options.following) {
    onProgress?.('Exporting followed artists...');
    const artists = await db.favoriteArtists.toArray();
    data.following = artists;
  }

  // Export playlists (includes custom coverImage which is already base64)
  if (options.playlists) {
    onProgress?.('Exporting playlists...');
    const playlists = await db.playlists.toArray();

    data.playlists = await Promise.all(
      playlists.map(async (playlist): Promise<ExportedPlaylist> => {
        // Get tracks for this playlist
        const tracks = await Promise.all(
          playlist.trackIds.map((trackId) => db.favoriteTracks.get(trackId))
        );

        return {
          name: playlist.name,
          description: playlist.description,
          coverImage: playlist.coverImage, // Custom cover (already base64) is included
          trackIds: playlist.trackIds,
          tracks: tracks.filter((t): t is ExportedTrack => t !== undefined),
          createdAt: playlist.createdAt,
          updatedAt: playlist.updatedAt,
        };
      })
    );
  }

  // Export settings
  if (options.settings && settingsData) {
    onProgress?.('Exporting settings...');
    data.settings = settingsData;
  }

  onProgress?.('Export complete!');
  return data;
}

/**
 * Download exported data as JSON file
 */
export function downloadExport(data: ExportedData, filename?: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `campband-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================
// Import Functions
// ============================================

/**
 * Validate imported data structure
 */
function validateImportData(data: unknown): data is ExportedData {
  if (!data || typeof data !== 'object') return false;

  const d = data as Record<string, unknown>;
  if (d.app !== 'CampBand') return false;
  if (typeof d.version !== 'number') return false;

  return true;
}

/**
 * Import data from JSON file (ADD to existing data, not replace)
 */
export async function importData(
  jsonString: string,
  onProgress?: (message: string) => void
): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    imported: {
      tracks: 0,
      albums: 0,
      artists: 0,
      playlists: 0,
      settings: false,
    },
    errors: [],
  };

  try {
    const data = JSON.parse(jsonString);

    if (!validateImportData(data)) {
      result.errors.push('Invalid backup file format');
      return result;
    }

    // Import liked tracks (ADD, not replace)
    if (data.likedTracks && data.likedTracks.length > 0) {
      onProgress?.(`Importing ${data.likedTracks.length} liked tracks...`);

      for (const track of data.likedTracks) {
        try {
          const existing = await db.favoriteTracks.get(track.id);
          if (!existing) {
            await db.favoriteTracks.add(track);
            result.imported.tracks++;
          }
        } catch (e) {
          result.errors.push(`Failed to import track: ${track.title}`);
        }
      }
    }

    // Import liked albums (ADD, not replace)
    if (data.likedAlbums && data.likedAlbums.length > 0) {
      onProgress?.(`Importing ${data.likedAlbums.length} liked albums...`);

      for (const album of data.likedAlbums) {
        try {
          const existing = await db.favoriteAlbums.get(album.id);
          if (!existing) {
            await db.favoriteAlbums.add(album);
            result.imported.albums++;
          }
        } catch (e) {
          result.errors.push(`Failed to import album: ${album.title}`);
        }
      }
    }

    // Import following (artists) (ADD, not replace)
    if (data.following && data.following.length > 0) {
      onProgress?.(`Importing ${data.following.length} followed artists...`);

      for (const artist of data.following) {
        try {
          const existing = await db.favoriteArtists.get(artist.id);
          if (!existing) {
            await db.favoriteArtists.add(artist);
            result.imported.artists++;
          }
        } catch (e) {
          result.errors.push(`Failed to import artist: ${artist.name}`);
        }
      }
    }

    // Import playlists (ADD, rename if different content, skip if identical)
    // Custom playlist covers (coverImage) are preserved as base64
    if (data.playlists && data.playlists.length > 0) {
      onProgress?.(`Importing ${data.playlists.length} playlists...`);
      
      for (const playlist of data.playlists) {
        try {
          // First, ensure all tracks exist in favoriteTracks
          for (const track of playlist.tracks) {
            const existingTrack = await db.favoriteTracks.get(track.id);
            if (!existingTrack) {
              await db.favoriteTracks.add(track);
            }
          }
          
          // Check if playlist with same name exists
          const existingWithName = await db.playlists.where('name').equals(playlist.name).first();
          
          if (existingWithName) {
            // Check if it's the same content (same tracks in same order)
            const isSameContent = 
              existingWithName.trackIds.length === playlist.trackIds.length &&
              existingWithName.trackIds.every((id, idx) => id === playlist.trackIds[idx]);
            
            if (isSameContent) {
              // Skip - identical playlist already exists
              continue;
            }
            
            // Different content - find unique name
            let finalName = playlist.name;
            let counter = 1;
            while (true) {
              const existing = await db.playlists.where('name').equals(finalName).first();
              if (!existing) break;
              counter++;
              finalName = `${playlist.name} (${counter})`;
            }
            
            // Create playlist with new name
            const playlistId = await db.playlists.add({
              name: finalName,
              description: playlist.description,
              coverImage: playlist.coverImage,
              trackIds: playlist.trackIds,
              createdAt: new Date(playlist.createdAt),
              updatedAt: new Date(playlist.updatedAt),
            });
            
            // Add to playlistTracks
            for (let i = 0; i < playlist.trackIds.length; i++) {
              await db.playlistTracks.add({
                playlistId,
                trackId: playlist.trackIds[i],
                position: i,
                addedAt: new Date(),
              });
            }
            
            result.imported.playlists++;
          } else {
            // No existing playlist with this name - create it
            const playlistId = await db.playlists.add({
              name: playlist.name,
              description: playlist.description,
              coverImage: playlist.coverImage,
              trackIds: playlist.trackIds,
              createdAt: new Date(playlist.createdAt),
              updatedAt: new Date(playlist.updatedAt),
            });
            
            // Add to playlistTracks
            for (let i = 0; i < playlist.trackIds.length; i++) {
              await db.playlistTracks.add({
                playlistId,
                trackId: playlist.trackIds[i],
                position: i,
                addedAt: new Date(),
              });
            }
            
            result.imported.playlists++;
          }
        } catch (e) {
          result.errors.push(`Failed to import playlist: ${playlist.name}`);
        }
      }
    }

    onProgress?.('Import complete!');
    result.success = true;

  } catch (e) {
    result.errors.push(`Failed to parse backup file: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }

  return result;
}

/**
 * Read file and return its contents as string
 */
export function readFileAsString(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

