# 🔧 CampBand Technical Documentation

## Tech Stack

- **Framework:** [WXT](https://wxt.dev/) (Web Extension Framework for Firefox)
- **UI:** React + TypeScript (strict mode)
- **Styling:** Tailwind CSS + Rosé Pine theme
- **State:** Zustand (persisted stores)
- **Storage:** IndexedDB via Dexie.js
- **Icons:** Lucide React

## Project Structure

```
/
├── .github/workflows/    # CI/CD (auto-release, signing)
├── docs/                 # Documentation
│   ├── TODO.md           # Task tracking
│   ├── TECHNICAL.md      # Architecture docs (this file)
│   ├── DESIGN_SYSTEM.md  # Visual design guide
│   └── ROADMAP.md        # Feature roadmap
├── extension/            # Extension source code
│   ├── entrypoints/      # WXT entry points
│   │   ├── background.ts         # Service worker (icon click, messaging)
│   │   ├── bandcamp.content.ts   # Content script for Bandcamp pages
│   │   └── app/                  # Main app (React SPA)
│   │       ├── App.tsx           # Root component with routing
│   │       ├── main.tsx          # Entry point
│   │       └── pages/            # Page components
│   │           ├── HomePage.tsx
│   │           ├── SearchPage.tsx
│   │           ├── ArtistPage.tsx
│   │           ├── AlbumPage.tsx
│   │           ├── FollowingPage.tsx
│   │           ├── LikedPage.tsx
│   │           ├── LibraryPage.tsx
│   │           ├── PlaylistPage.tsx
│   │           └── SettingsPage.tsx
│   ├── components/       # React components
│   │   ├── ui/           # Base components (Button, Slider, etc.)
│   │   ├── layout/       # Layout (AppLayout, Sidebar, PlayerBar, etc.)
│   │   ├── player/       # Player components (QueuePanel)
│   │   ├── search/       # Search (SearchInput, SearchResults)
│   │   ├── artist/       # Artist page (ArtistHeader, ReleaseGrid)
│   │   ├── album/        # Album page (AlbumAbout)
│   │   └── shared/       # Shared (CollectionHeader, TrackList, PlaylistCover, etc.)
│   ├── lib/              # Core logic
│   │   ├── api/          # Bandcamp scraper
│   │   ├── audio/        # AudioEngine (crossfade, blob playback)
│   │   ├── store/        # Zustand stores
│   │   ├── db/           # IndexedDB (Dexie schema)
│   │   ├── constants/    # Layout constants
│   │   └── utils/        # Helpers (cn, format, linkify, track, hooks)
│   ├── hooks/            # Custom React hooks
│   ├── types/            # TypeScript types
│   ├── styles/           # Global CSS (globals.css)
│   └── public/           # Static assets (icons)
├── package.json
├── wxt.config.ts
└── README.md
```

## Development Commands

```bash
pnpm dev          # Start dev server with hot reload (Firefox)
pnpm dev:chrome   # Start dev server for Chrome
pnpm build        # Production build (Firefox)
pnpm build:chrome # Production build (Chrome)
pnpm zip          # Package as .xpi (Firefox)
pnpm zip:chrome   # Package as .crx (Chrome)
pnpm compile      # Run TypeScript checks
```

## Known Limitations

### Mouse Navigation
Firefox intercepts mouse4/mouse5 (back/forward) buttons at the browser level, so hardware navigation buttons cannot be used within the extension. Use the **← →** buttons in the app header instead.

### Streaming
- Audio streams are time-limited by Bandcamp (~24 hours)
- Some tracks may not have streaming enabled
- Refresh the page if streams expire

### CORS
The extension requires host permissions for `*.bandcamp.com` and `*.bcbits.com` to fetch data and audio. This only works in the extension context, not in a regular web page.

### Backdrop-Filter Nesting
CSS `backdrop-filter` doesn't work when nested inside another element with `backdrop-filter`. All popups and modals render via React Portal to `document.body` to escape this limitation.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FIREFOX EXTENSION                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────────────────────┐  │
│  │  Background      │    │  App Page (Main UI)              │  │
│  │  Service Worker  │◄──►│                                  │  │
│  │                  │    │  React + Tailwind                │  │
│  │  - Icon click    │    │  - Search                        │  │
│  │  - Message hub   │    │  - Artist pages                  │  │
│  │  - Storage sync  │    │  - Album pages                   │  │
│  └──────────────────┘    │  - Library                       │  │
│          │               │  - Player UI                     │  │
│          │               └──────────────────────────────────┘  │
│          │                              │                       │
│          ▼                              ▼                       │
│  ┌──────────────────┐    ┌──────────────────────────────────┐  │
│  │  Content Script  │    │  Zustand Stores                  │  │
│  │  (Bandcamp)      │    │                                  │  │
│  │                  │    │  - playerStore                   │  │
│  │  - "Open in      │    │  - queueStore                    │  │
│  │    CampBand"     │    │  - libraryStore                  │  │
│  │    button        │    │  - playlistStore                 │  │
│  └──────────────────┘    │  - searchStore                   │  │
│                          │  - routerStore                   │  │
│                          │  - uiStore                       │  │
│  ┌──────────────────┐    │  - settingsStore                 │  │
│  │  IndexedDB       │    │  - artistStore                   │  │
│  │  (Dexie.js)      │    │  - albumStore                    │  │
│  │                  │    └──────────────────────────────────┘  │
│  │  - favorites     │                                          │
│  │  - playlists     │    ┌──────────────────────────────────┐  │
│  │  - history       │    │  AudioEngine                     │  │
│  │  - cache         │    │                                  │  │
│  │  - trackStats    │    │  - Blob playback (CORS bypass)   │  │
│  └──────────────────┘    │  - Crossfade support             │  │
│                          │  - Dual audio elements           │  │
│                          └──────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │  Bandcamp (bandcamp.com)      │
              │                               │
              │  Scraping targets:            │
              │  - /search?q=...              │
              │  - /{artist}.bandcamp.com     │
              │  - /album/{slug}              │
              │  - /track/{slug}              │
              └───────────────────────────────┘
```

## Key Data Flows

### 1. Search Flow
```
User types query
       │
       ▼
SearchInput (debounced 300ms)
       │
       ▼
searchStore.search(query)
       │
       ▼
api.searchBandcamp(query)
       │
       ▼
fetch("https://bandcamp.com/search?q=...")
       │
       ▼
Parse HTML → Extract results
       │
       ▼
Return { artists, albums, tracks }
       │
       ▼
searchStore.setResults()
       │
       ▼
UI re-renders with results
```

### 2. Play Track Flow
```
User clicks play on track
       │
       ▼
queueStore.playTrack(track)
       │
       ▼
playerStore.loadTrack(track)
       │
       ▼
Check if streaming URL expired
       │
       ├─► If expired: re-fetch page, get new URL
       │
       ▼
audioEngine.load(streamingUrl)  → fetch as blob (CORS bypass)
       │
       ▼
audioElement.src = blobUrl
audioElement.play()
       │
       ▼
playerStore.setPlaying(true)
       │
       ▼
navigator.mediaSession.setMetadata() // OS controls
```

### 3. Artist Page Load Flow
```
User navigates to artist
       │
       ▼
Check cache (IndexedDB)
       │
       ├─► Cache hit & fresh: Use cached data
       │
       ├─► Cache miss or stale:
       │         │
       │         ▼
       │   Show skeleton + loading bar
       │         │
       │         ▼
       │   api.fetchArtist(url/music)
       │         │
       │         ├─► 303 redirect to /track or /album?
       │         │   (Single-release artist detected!)
       │         │         │
       │         │         ▼
       │         │   Fetch that single release
       │         │         │
       │         │         ▼
       │         │   Convert to ArtistPage with 1 release
       │         │
       │         ├─► No redirect (normal artist):
       │         │         │
       │         │         ▼
       │         │   Parse band_data, music_grid, data-client-items
       │         │
       │         ▼
       │   For each release (with delay):
       │     - Fetch release page
       │     - Extract trackinfo, streaming URLs
       │     - Update loading progress
       │         │
       │         ▼
       │   Save to IndexedDB cache
       │
       ▼
Display artist page with all data
```

**Note:** Bandcamp redirects `/music` to the only release if an artist has just one track or album. The scraper detects this 303 redirect and handles single-release artists properly.

### 4. "Open in CampBand" Flow
```
User on bandcamp.com page
       │
       ▼
Content script adds "Open in CampBand" button
       │
       ▼
User clicks button
       │
       ▼
Content script sends message to background
       │
       ▼
Background stores pendingNavigation in storage.local
       │
       ▼
Background opens/focuses CampBand tab
       │
       ▼
App reads pendingNavigation on load
       │
       ▼
App navigates to artist/album page
       │
       ▼
pendingNavigation cleared
```

## Bandcamp Scraping Reference

### Data Sources (Priority Order)

| Source | Location | Contains |
|--------|----------|----------|
| `data-tralbum` | `<script>` attribute | Tracks, streaming URLs, pricing |
| `application/ld+json` | `<script>` tag | Metadata, lyrics, structured data |
| `data-band` | `<script>` attribute | Artist info, design colors |
| `#music-grid` | HTML element | Visible releases |
| `data-client-items` | Grid attribute | Hidden/lazy-loaded releases |
| `#pagedata` | `<div>` attribute | Additional config |

### Streaming URL Format
```
https://t4.bcbits.com/stream/{hash}/mp3-128/{track_id}?p=0&ts={timestamp}&t={signature}&token={token}
```
- URLs expire after ~24 hours
- Check `ts` parameter for expiry

### Automatic Stream URL Refresh

When a cached track's stream URL expires (HTTP 410 Gone), CampBand automatically:

1. **Detects the 410 error** during audio load
2. **Re-fetches the album page** to get fresh stream URLs
3. **Updates the cache** (both memory and IndexedDB) with fresh album data
4. **Updates the queue** with the fresh stream URL
5. **Retries playback** automatically

```typescript
// In useAudioPlayer hook
if (result.expired && currentTrack.albumUrl) {
  const freshUrl = await refreshStreamUrl(
    { id: currentTrack.id, albumUrl: currentTrack.albumUrl },
    updateCachedAlbum  // Updates cache with fresh album data
  );
  // Update queue and retry...
}
```

**Retry Protection**: Max 2 load attempts per track to prevent infinite loops.

### Image URL Format
```
Album art:  https://f4.bcbits.com/img/a{art_id}_{size}.jpg
Bio image:  https://f4.bcbits.com/img/{image_id:010d}_{size}.jpg

Sizes: 2 (100px thumb), 5 (350px), 10 (700px), 16 (1200px)
```

### Image Helper Functions (types/bandcamp.ts)
```typescript
// Centralized image URL generation - handles artId, artUrl, imageId, imageUrl
getArtworkUrl(item, size: ImageSize): string | undefined

// Extract IDs from various Bandcamp image URL formats
extractArtIdFromUrl(url: string): string | undefined
extractImageIdFromUrl(url: string): string | undefined

// Build specific URL types
buildArtUrl(artId: string | number, size: number): string
buildBioUrl(imageId: string | number, size: number): string
```

**Note:** Bandcamp uses lazy-loading on some pages. The scraper prioritizes `data-original` attribute over `src` when `src` is a placeholder (`/img/0.gif`).

### Rate Limiting Strategy
```typescript
const DELAYS = {
  betweenRequests: 300,  // ms between fetching releases
};
```

## Permanent Caching System

CampBand uses a permanent caching system for artist and album data to enable instant loading after the first visit.

### How It Works

1. **First Visit**: Fetch artist/album data and cache permanently in IndexedDB
2. **Subsequent Visits**: Load from cache instantly, no network request
3. **New Release Detection**: Background check for new releases (rate-limited)

### Cache Flow for Artist Pages

```
User visits artist page
       │
       ▼
Check memory cache (instant)
       │
       ├─► Cache hit: Display immediately
       │         │
       │         ▼
       │   Check lastCheckedAt > 10 min?
       │         │
       │         ├─► Yes: Background check for new releases
       │         │         (fetch /music page only)
       │         │
       │         └─► No: Done
       │
       └─► Cache miss: Check IndexedDB
                 │
                 ├─► DB hit: Load & display
                 │         │
                 │         ▼
                 │   Same new release check
                 │
                 └─► DB miss: Fetch fresh
                           │
                           ▼
                     Cache in IndexedDB
                           │
                           ▼
                     Pre-cache all releases (background)
```

### New Release Detection

When an artist page is loaded from cache:
- If `lastCheckedAt` > 10 minutes ago, fetch just the `/music` page
- Compare release count with cached count
- If new releases found:
  - Update the cached artist data
  - Fetch and cache new release track data in background

This ensures:
- Instant page loads from cache
- Users eventually see new releases
- No spamming Bandcamp with requests

### IndexedDB Schema

```typescript
interface CachedArtist {
  id: number;            // bandId
  url: string;           // Normalized artist URL
  data: string;          // JSON string of ArtistPage
  cachedAt: number;      // When first cached (Unix ms)
  lastCheckedAt: number; // When last checked for new releases
  releaseCount: number;  // For detecting new releases
}

interface CachedAlbum {
  id: number;            // albumId
  url: string;           // Album URL
  data: string;          // JSON string of Album (with tracks)
  cachedAt: number;      // When cached (Unix ms)
}
```

### Benefits

- **Instant loading**: Artist pages load instantly after first visit
- **Play All works fast**: All release track data is pre-cached
- **Offline-ish**: Browse cached artists without network
- **New releases detected**: Background checks keep data fresh
- **Rate-limited**: Only one check per artist per 10 minutes

### Cache Management

```typescript
// In artistStore
clearCache()        // Clear all cached data
getCacheStats()     // Get count of cached artists/albums

// In albumStore
updateCachedAlbum(album)  // Update cache with fresh album data (used after stream URL refresh)
clearCache()              // Clear all album cache

// In Settings page
// Users can clear cache manually
```

## State Management

### Zustand Stores

```typescript
// playerStore - Audio playback state
interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  error: string | null;
  volume: number;      // 0-1
  isMuted: boolean;
  shuffle: boolean;
  repeat: 'off' | 'track' | 'all';
}

// queueStore - Queue management
interface QueueState {
  queue: Track[];
  currentIndex: number;
  shuffle: boolean;
  history: Track[];              // for previous button
  originalQueue: Track[];        // for unshuffle
  playbackSourceRoute: Route;    // where playback started (for album art click navigation)
}

// libraryStore - User's saved content
interface LibraryState {
  favoriteArtists: FavoriteArtist[];
  favoriteAlbums: FavoriteAlbum[];
  favoriteTracks: FavoriteTrack[];
  // Synced with IndexedDB
  // Note: All components use these same functions for consistency:
  // - addFavoriteTrack(toPlayableTrack(track))
  // - addFavoriteAlbum(album) with complete bandId/bandUrl
  // - addFavoriteArtist(band)
}

// playlistStore - Playlist management
interface PlaylistState {
  playlists: Playlist[];
  // CRUD operations synced with IndexedDB
}

// searchStore - Search state
interface SearchState {
  query: string;
  results: SearchResults | null;
  isLoading: boolean;
  recentSearches: string[];
}

// uiStore - UI preferences
interface UIState {
  sidebarCollapsed: boolean;
  sidebarHidden: boolean; // For responsive hiding on narrow screens
  queuePanelOpen: boolean;
  playlistModalOpen: boolean;
  playlistModalMode: 'create' | 'edit';
  pendingTrackForPlaylist: PendingTrackForPlaylist | null;
  editingPlaylist: EditingPlaylist | null;
  viewMode: ViewMode; // 'grid' | 'list' | 'detailed'
  sortBy: SortBy; // 'newest' | 'oldest' | 'name'
  filterType: FilterType; // 'all' | 'album' | 'track'
  // Per-section view mode preferences
  likedAlbumsViewMode: ViewMode;
  followingViewMode: ViewMode;
  artistDiscographyViewMode: ViewMode;
}

// settingsStore - User settings (persisted)
interface SettingsState {
  audio: {
    crossfadeEnabled: boolean;
    crossfadeDuration: number;  // 1-12 seconds
    volumeNormalization: boolean;
    gaplessPlayback: boolean;
  };
  app: {
    theme: 'dark' | 'light' | 'system';
    showNotifications: boolean;
    confirmBeforeClearQueue: boolean;
  };
}

// routerStore - SPA navigation (URL hash-based)
interface RouterState {
  currentRoute: Route;
  navigate: (route: Route, options?: { replace?: boolean }) => void;
  goBack: () => void;   // Uses browser history
  goForward: () => void; // Uses browser history
  // Routes are synced with URL hash:
  //   #/                              → Home
  //   #/search?q=query                → Search
  //   #/artist/subdomain              → Artist page
  //   #/artist/subdomain/a/album-slug → Album page (/a/ = album)
  //   #/artist/subdomain/t/track-slug → Track page (/t/ = track)
  //   #/following                     → Following
  //   #/liked                         → Liked songs
  //   #/library                       → Library (redirects to liked)
  //   #/playlist/123                  → Playlist
  //   #/settings                      → Settings
}
```

## IndexedDB Schema (Dexie.js)

```typescript
// db/schema.ts
class CampBandDB extends Dexie {
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

    this.version(2).stores({
      favoriteArtists: 'id, name, addedAt',
      favoriteAlbums: 'id, title, artist, bandId, addedAt',
      favoriteTracks: 'id, title, artist, bandId, albumId, addedAt, playCount, lastPlayedAt',
      playlists: '++id, name, createdAt, updatedAt',
      playlistTracks: '++id, playlistId, trackId, position',
      history: '++id, type, itemId, playedAt',
      trackStats: 'trackId, playCount, lastPlayedAt',
      cachedArtists: 'id, cachedAt, expiresAt',
      cachedAlbums: 'id, url, cachedAt, expiresAt',
    });
  }
}
```

### Table Schemas

| Table | Key | Indexes | Purpose |
|-------|-----|---------|---------|
| `favoriteArtists` | `id` (bandId) | name, addedAt | Following artists |
| `favoriteAlbums` | `id` (albumId) | title, artist, bandId, addedAt | Liked albums |
| `favoriteTracks` | `id` (trackId) | title, artist, bandId, albumId, addedAt | Liked songs |
| `playlists` | `++id` (auto) | name, createdAt, updatedAt | User playlists |
| `playlistTracks` | `++id` (auto) | playlistId, trackId, position | Playlist membership |
| `history` | `++id` (auto) | type, itemId, playedAt | Play history |
| `trackStats` | `trackId` | playCount, lastPlayedAt | Play statistics |
| `cachedArtists` | `id` (bandId) | cachedAt, expiresAt | Artist cache |
| `cachedAlbums` | `id` (albumId) | url, cachedAt, expiresAt | Album cache |

## Data Export/Import

CampBand supports exporting and importing user data for backup and sharing.

### Export Options
Users can select what to include in the export:
- **Likes**: Liked tracks and albums with metadata
- **Playlists**: All playlists with track data
- **Following**: Followed artists
- **Settings**: Audio and app preferences
- **Last.fm Login**: Last.fm credentials and scrobbling settings (optional, disabled by default for security)
- **Include Cover Images**: Optional base64-encoded cover art (makes file larger but allows offline viewing)

**Note**: Last.fm credentials are stored in plaintext in the backup file. Only export this option if you trust the backup file location and understand the security implications.

### Export Format
```typescript
interface ExportedData {
  version: number;           // Schema version (currently 1)
  exportedAt: string;        // ISO timestamp
  app: 'CampBand';           // App identifier
  likedTracks?: Track[];     // With optional coverBase64
  likedAlbums?: Album[];     // With optional coverBase64
  following?: Artist[];      // With optional imageBase64
  playlists?: Playlist[];    // With embedded track data
  settings?: {
    audio: AudioSettings;
    app: AppSettings;
  };
  lastfm?: Record<string, unknown>;  // Last.fm credentials and settings
}
```

### Import Behavior
- **Additive**: Import adds to existing data, never replaces
- **Duplicate Detection**: Items are skipped if already exist (by ID for tracks/albums/artists, by name for playlists)
- **Track Metadata**: Playlist tracks are stored in favoriteTracks table
- **Progress Feedback**: Real-time progress messages during import

### Implementation
- Export: `lib/utils/dataExport.ts` - `exportData()`, `downloadExport()`
- Import: `lib/utils/dataExport.ts` - `importData()`, `readFileAsString()`
- UI: `components/settings/DataManagement.tsx`

## Component Structure

```
components/
├── ui/                    # Base/reusable components
│   ├── Button.tsx
│   ├── IconButton.tsx
│   ├── Input.tsx
│   ├── Slider.tsx
│   ├── Skeleton.tsx
│   ├── Dropdown.tsx
│   ├── ClickableText.tsx
│   ├── HeartButton.tsx         # Favorite toggle (supports showOnGroupHover)
│   ├── AddToQueueButton.tsx    # Queue button with check animation
│   ├── PlayingIndicator.tsx    # Animated equalizer bars
│   ├── EmptyState.tsx          # Empty list/grid state
│   ├── ImageBackdrop.tsx
│   ├── GlobalContextMenu.tsx   # Unified context menu system (tracks, albums, artists, playlists)
│   ├── PlaylistModal.tsx      # Unified create/edit playlist modal
│   └── TrackRow.tsx            # Generic track row (library, history)
│
├── layout/                # Layout components
│   ├── AppLayout.tsx      # Main shell
│   ├── Sidebar.tsx        # Navigation sidebar
│   ├── PageHeader.tsx     # Page headers
│   ├── NavigationButtons.tsx
│   └── PlayerBar.tsx      # Now playing bar
│
├── player/                # Player components
│   └── QueuePanel.tsx     # Slide-out queue (separate track item design)
│
├── search/                # Search components
│   ├── SearchInput.tsx
│   └── SearchResults.tsx
│
├── artist/                # Artist page components
│   ├── ArtistHeader.tsx
│   └── ReleaseGrid.tsx
│
├── album/                 # Album page components
│   └── AlbumAbout.tsx     # About/credits/tags section
│
└── shared/                # Shared components
    ├── TrackCollectionLayout.tsx  # CollectionHeader, TrackList, PlaylistTrackList
    ├── PlaylistCover.tsx          # Auto-collage cover for playlists
    ├── LikedCover.tsx
    └── FollowingCover.tsx
```

## Utilities (`lib/utils/`)

```
utils/
├── cn.ts           # Tailwind class merger (clsx + tailwind-merge)
├── format.ts       # formatTime, formatSmartDate, formatPlayCount, etc.
├── linkify.ts      # Convert URLs in text to clickable links
├── track.ts        # Track conversion utilities
│   ├── cleanTrackTitle()       # Remove artist prefix from title (see below)
│   ├── getDisplayTitle()       # Get cleaned title from track object
│   ├── toPlayableTrack()       # Convert any track-like object to playable
│   ├── toPlayableTracks()      # Batch convert with streamability filter
│   ├── historyEntryToTrack()   # Convert history entries
│   ├── isStreamable()          # Check if track has stream URL
│   ├── getTrackArtist()        # Get display artist name
│   └── shuffleTracks()         # Fisher-Yates shuffle
├── url.ts          # URL/routing utilities
│   ├── parseBandcampUrl()      # Parse artist/album/track from URL
│   ├── buildBandcampUrl()      # Build URL from subdomain + type + slug
│   ├── routeToHash()           # Convert Route to URL hash
│   │   # Albums: #/artist/subdomain/a/slug
│   │   # Tracks: #/artist/subdomain/t/slug
│   ├── hashToRoute()           # Parse URL hash to Route
│   ├── getArtistSlugFromUrl()  # Extract subdomain from artist URL
│   └── getAlbumSlugsFromUrl()  # Extract artist + album slugs
└── hooks.ts        # Shared React hooks
    ├── useConfirmationState()  # Temporary check/success state
    └── useClickOutside()       # Close on click outside
```

## Styling System

> **Full design system documentation:** See [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) for comprehensive glass effects, animations, component patterns, and the `ImageBackdrop` component.

### Rosé Pine Theme
```css
:root {
  /* Base */
  --base: #191724;
  --surface: #1f1d2e;
  --overlay: #26233a;
  --muted: #6e6a86;
  --subtle: #908caa;
  --text: #e0def4;

  /* Accent */
  --love: #eb6f92;
  --gold: #f6c177;
  --rose: #ebbcba;
  --pine: #31748f;
  --foam: #9ccfd8;
  --iris: #c4a7e7;

  /* Highlight */
  --highlight-low: #21202e;
  --highlight-med: #403d52;
  --highlight-high: #524f67;
}
```

### Rose Pine UI Elements
- **Custom Cursors**: SVG cursors themed to Rose Pine (default, pointer, text, grab)
- **Selection Colors**: Text selection uses rose accent (`rgba(235, 188, 186, 0.35)`)
- **Focus Rings**: Iris color (`--color-iris`) for input focus states
- **Accents**: Checkboxes, radios, and sliders use rose color
- **Highlights**: Search/match highlights use gold background

Based on [rose-pine/cursor](https://github.com/rose-pine/cursor).

### Glassmorphism Utilities
```css
.glass              /* Standard glass - 80% opacity, 12px blur */
.glass-subtle       /* Lighter glass - 50% opacity, 8px blur */
.glass-strong       /* Heavy glass - 95% opacity, 20px blur */

/* Apple-style Liquid Glass */
.liquid-glass       /* Gradient bg, 24px blur, subtle glow */
.liquid-glass-strong /* Heavy gradient, 32px blur, prominent glow */
.liquid-glass-glow  /* Rose-tinted border glow, perfect for popups */
.liquid-glass-bar   /* Player bar specific styling */

.frosted-glass      /* Light frosted effect */
```

## Track Title Cleaning

Bandcamp tracks often include the artist name as a prefix in the title (e.g., "Sadness - Song Title" when the artist is "Sadness"). CampBand automatically cleans these titles for display.

### How It Works

The `cleanTrackTitle()` utility removes redundant artist prefixes:

```typescript
cleanTrackTitle("Sadness - Song Title", "Sadness")  // → "Song Title"
cleanTrackTitle("SADNESS - Song Title", "Sadness")  // → "Song Title" (case-insensitive)
cleanTrackTitle("Sadness—Song Title", "Sadness")    // → "Song Title" (em dash)
cleanTrackTitle("Other Artist - Song", "Sadness")   // → "Other Artist - Song" (no match)
cleanTrackTitle("Sadness & Joy - Song", "Sadness")  // → "Sadness & Joy - Song" (partial, no change)
```

### Supported Separators
- Hyphen: `-`
- En dash: `–`
- Em dash: `—`
- Minus sign: `−`

### Track.displayTitle Field

The `Track` interface includes a `displayTitle` field:
- Set automatically by `toPlayableTrack()` when tracks are loaded
- Falls back to original `title` if no artist prefix found
- Used in all display locations: PlayerBar, QueuePanel, TrackLists, Media Session API, document title

### Where Applied
- Player bar track title
- Queue panel track titles
- Track lists (album page, library, playlists)
- Context menus
- Browser tab title (`Artist - Song | CampBand`)
- Media Session API (OS media controls)
- Extensions like auto-stop that read the document title

### Usage Pattern
Always use `getDisplayTitle(track)` instead of `track.title` or `track.displayTitle || track.title`:

```tsx
// ❌ Wrong - displayTitle may be undefined for tracks from API
{track.displayTitle || track.title}

// ✅ Correct - computes cleaned title on-the-fly
import { getDisplayTitle } from '@/lib/utils';
{getDisplayTitle(track)}
```

The `displayTitle` field on Track objects is only set when tracks pass through `toPlayableTrack()` (e.g., when added to queue). Tracks displayed directly from the API (album pages, search results) won't have it set, so always use `getDisplayTitle()` for display.

---

## AudioEngine

The `AudioEngine` class (`extension/lib/audio/AudioEngine.ts`) handles all audio playback. It's a singleton stored on `window.__campband_audio_engine__` to persist across hot reloads.

### Features

- **Blob Playback**: Fetches audio as blob to bypass CORS restrictions
- **Dual Audio Elements**: Primary + crossfade audio for seamless transitions
- **Crossfade Support**: Configurable 1-12 second crossfade between tracks
- **Gapless Playback**: Pre-fetches next track for seamless transitions
- **Volume Normalization**: Optional compressor for consistent loudness
- **Event Callbacks**: Play, pause, ended, timeupdate, error, loadstart, canplay
- **Abort Handling**: Cancels pending fetches when loading new tracks
- **Hot Reload Persistence**: Audio continues playing during development reloads

### API

```typescript
// Loading & Playback
audioEngine.load(streamUrl);       // Load track (won't interrupt if audio playing)
audioEngine.load(streamUrl, true); // Force load (for user track changes)
audioEngine.play();                // Start playback
audioEngine.pause();               // Pause
audioEngine.stop();                // Stop and reset
audioEngine.seek(30);              // Seek to 30 seconds
audioEngine.seekPercent(50);       // Seek to 50%

// Volume
audioEngine.setVolume(0.8);        // Set volume (0-1)
audioEngine.getVolume();           // Get current volume
audioEngine.setMuted(true);        // Mute/unmute
audioEngine.isMuted();             // Check mute state

// Crossfade & Gapless
audioEngine.crossfadeTo(nextUrl);  // Crossfade to next track
audioEngine.preloadNext(nextUrl);  // Pre-fetch next track for gapless
audioEngine.cancelCrossfade();     // Cancel ongoing crossfade

// State
audioEngine.isPlaying();           // Check if playing
audioEngine.getCurrentTime();      // Get current position
audioEngine.getDuration();         // Get track duration
audioEngine.getCurrentSrc();       // Get current source URL
audioEngine.getState();            // Get full state object

// Settings
audioEngine.updateSettings({
  crossfadeEnabled: true,
  crossfadeDuration: 4,            // 1-12 seconds
  volumeNormalization: false,
  gaplessPlayback: true,
});

// Hot Reload
audioEngine.resyncWithDOM(true);   // Re-sync with DOM audio elements
audioEngine.setCallbacks({...});   // Set event callbacks (reconnects audio graph)
```

### Audio Signal Chain

```
┌─────────────────┐     ┌──────────────┐     ┌────────────────┐     ┌──────────┐     ┌─────────────┐
│ Audio Element   │────►│ 10-Band EQ   │────►│ Compressor     │────►│ GainNode │────►│ Destination │
│ (MediaElement   │     │ (if enabled) │     │ (if volume     │     │ (volume  │     │ (speakers)  │
│  SourceNode)    │     │              │     │  normalization)│     │  control)│     │             │
└─────────────────┘     └──────────────┘     └────────────────┘     └──────────┘     └─────────────┘
```

Two identical chains exist (primary + crossfade) for seamless transitions.

### 10-Band Equalizer

The AudioEngine includes a 10-band parametric equalizer:

| Frequency | Type | Notes |
|-----------|------|-------|
| 32 Hz | Low Shelf | Sub-bass |
| 64 Hz | Peaking | Bass |
| 125 Hz | Peaking | Low-mid bass |
| 250 Hz | Peaking | Mid-bass |
| 500 Hz | Peaking | Low-mids |
| 1 kHz | Peaking | Mids |
| 2 kHz | Peaking | High-mids |
| 4 kHz | Peaking | Presence |
| 8 kHz | Peaking | Brilliance |
| 16 kHz | High Shelf | Air |

**Gain Range**: -12 dB to +12 dB per band

**Presets**: Flat, Bass Boost, Treble Boost, Vocal, Rock, Electronic, Acoustic

```typescript
// EQ API
audioEngine.setEqEnabled(true);              // Enable/disable EQ
audioEngine.setEqBand(1000, 3);              // Set 1kHz to +3dB
audioEngine.applyEqPreset('bass');           // Apply preset
audioEngine.getEqSettings();                 // Get current settings
```

### File Structure

```
extension/lib/audio/
├── index.ts            # Exports
├── AudioEngine.ts      # Main orchestrator (uses modules below)
├── AudioGraph.ts       # Web Audio API graph with EQ, compressor, gain
├── AudioElement.ts     # HTMLAudioElement wrapper with blob handling
├── AudioCrossfade.ts   # Crossfade/gapless logic (standalone)
├── AudioInterceptor.ts # Captures ALL page audio (for future use)
└── types.ts            # TypeScript interfaces
```

#### Module Responsibilities

| Module | Purpose |
|--------|---------|
| **AudioEngine** | Main API - orchestrates modules, handles callbacks, singleton pattern |
| **AudioGraph** | Web Audio API chain (source → EQ → compressor → gain → destination). ALL audio goes through this. |
| **AudioElement** | Wraps HTMLAudioElement with blob URL management, event binding, hot reload support |
| **AudioCrossfade** | Standalone crossfade logic with equal-power fade (sine/cosine) |
| **AudioInterceptor** | Intercepts ALL audio on page via constructor override, MutationObserver, periodic scan |
| **types** | TypeScript interfaces for callbacks, settings, state |

#### AudioInterceptor (Future)

The `AudioInterceptor` module can capture ALL audio sources on the page, ensuring they go through our processing pipeline:

```typescript
import { initAudioInterceptor, onAudioCaptured } from '@/lib/audio';

// Initialize - intercepts all Audio() calls and play() calls
initAudioInterceptor({ eq: { enabled: true, gains: {...} } });

// Get notified when audio is captured
onAudioCaptured((element, graph) => {
  console.log('Captured audio:', element.src);
});
```

Methods used:
1. Override `Audio` constructor
2. Override `HTMLMediaElement.prototype.play`
3. MutationObserver for dynamically added elements
4. Periodic DOM scan for elements that slip through

### Edge Cases & Fixes

| Edge Case | Solution |
|-----------|----------|
| **Skip during crossfade** | `completeCrossfadeSwap()` - immediately swaps audio elements, keeps playback position, syncs UI with multiple setTimeout callbacks |
| **Hot reload breaks playback** | Audio elements persist in DOM with IDs, `resyncWithDOM()` finds and adopts them, singleton pattern prevents duplicate engines |
| **Duplicate audio elements** | `cleanupDuplicateAudio()` removes rogue elements on init and callback setup |
| **MediaElementSourceNode reuse** | Can only create one per audio element - check `sourceNode.mediaElement === audio` before creating new |
| **AudioContext suspended** | `ensureAudioContext()` resumes on user gesture, handles suspended state gracefully |
| **Crossfade gain not applied** | Check `crossfadeGainNode` exists before fade, set to 0 before playing crossfade audio |
| **Store resets on hot reload** | Effects check actual DOM state before pausing, sync store to DOM reality |
| **Seeking during track change stops playback** | Deferred seek handling: if track is loading (duration = 0), store seek position and apply when track is ready. Resume playback after seek if it was playing before. Prevents audio from pausing when seeking on loading tracks or during track transitions. |

### Hot Reload Audio Persistence

During development, WXT hot reloads cause React to remount. CampBand ensures audio continues playing uninterrupted:

```
Hot reload happens
       │
       ▼
Audio element persists in DOM (keeps playing!)
       │
       ▼
React remounts, Zustand stores reset (isPlaying: false)
       │
       ▼
useAudioPlayer mounts:
       │
       ├─► Load effect: isNewTrack = false (same track)
       │       │
       │       ▼
       │   audioEngine.load(url, force=false)
       │       │
       │       ▼
       │   Check DOM: audio playing? → Skip load, don't interrupt!
       │
       ├─► Play/pause effect: isPlaying = false (from store)
       │       │
       │       ▼
       │   Initial mount: Check DOM for playing audio
       │       │
       │       ▼
       │   Found playing audio? → setIsPlaying(true), sync store!
       │
       └─► Sync effect: resyncWithDOM(true)
               │
               ▼
           Find & adopt playing audio element
               │
               ▼
           Sync time, duration to store
```

#### Key Protection Mechanisms

1. **`audioEngine.load(src, force)`**:
   - `force = false` (default): Checks DOM for any playing audio first
   - If audio is playing → skip load, don't interrupt
   - `force = true`: Proceed with load (user intentionally changed track)

2. **`audioEngine.resyncWithDOM(force)`**:
   - Searches DOM for audio elements by priority:
     - Playing audio (`!paused`) = highest priority
     - Audio with progress (`currentTime > 0`)
     - Audio with our ID (`#campband-audio-primary`)
     - Audio with blob source
   - Adopts the best candidate and re-attaches listeners

3. **Play/pause effect protection**:
   - On initial mount, checks DOM before pausing
   - If audio is playing → sync store to `true` instead of pausing

4. **Singleton persistence**:
   - AudioEngine stored on `window.__campband_audio_engine__`
   - Survives module re-evaluation during hot reload

#### Why This Matters

Without these protections:
- Store resets to `isPlaying: false` on remount
- Play/pause effect sees `false` → calls `pause()`
- Music stops unexpectedly!

With protections:
- Audio keeps playing in DOM
- Effects check actual DOM state before acting
- Store syncs to reality, not vice versa

## Browser Extension APIs Used

| API | Purpose |
|-----|---------|
| `browser.storage.local` | Persist settings, pending navigation |
| `browser.tabs` | Tab management |
| `browser.runtime` | Message passing between contexts |
| `browser.browserAction` | Extension icon click handler |
| `fetch` | HTTP requests (CORS bypass via blob) |
| `navigator.mediaSession` | OS media controls (play/pause/skip/metadata) |
| `IndexedDB` | Large data storage (Dexie.js) |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Toggle play/pause (when not in input field) |

*More shortcuts planned - see TODO.md for roadmap*

## Testing Strategy

- **Unit tests:** Vitest for utils, stores
- **Component tests:** React Testing Library
- **E2E tests:** Playwright (future)
- **Manual testing:** Firefox Developer Edition

## Performance Considerations

1. **RequestAnimationFrame** for smooth progress bar animation
2. **Image lazy loading** with placeholder
3. **Debounced search** (300ms)
4. **Virtual scrolling** for large lists (future)
5. **Memoized components** where needed
6. **Portal rendering** for popups (avoids re-renders)
7. **Web Workers** for heavy parsing (future)

---
