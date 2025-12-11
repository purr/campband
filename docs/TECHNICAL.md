# 🔧 CampBand Technical Documentation

## Tech Stack

- **Framework:** [WXT](https://wxt.dev/) (Web Extension Framework for Firefox)
- **UI:** React 19 + TypeScript (strict mode)
- **Styling:** Tailwind CSS v4 + Rosé Pine theme
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
- Must re-fetch page to get fresh URLs
- Check `ts` parameter for expiry

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
  betweenReleases: 300,  // ms between fetching releases
  betweenSearches: 500,  // ms between search requests
  afterError: 2000,      // ms after a failed request
};
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
  queuePanelOpen: boolean;
  playlistModalOpen: boolean;
  playlistModalMode: 'create' | 'edit';
  pendingTrackForPlaylist: Track | null;
  editingPlaylist: { id, name, description?, coverImage? } | null;
}

// settingsStore - User settings (persisted)
interface SettingsState {
  audio: {
    crossfadeEnabled: boolean;
    crossfadeDuration: number;  // 1-12 seconds
    volumeNormalization: boolean;
    gaplessPlayback: boolean;
    monoAudio: boolean;
    equalizerEnabled: boolean;
    equalizerPreset: EqualizerPreset;
    customEqGains: number[];  // 10 bands, -12 to +12 dB
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
  //   #/library                       → Library
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
│   ├── ContextMenu.tsx         # Context menu provider (legacy)
│   ├── TrackContextMenu.tsx    # Right-click menu for tracks
│   ├── AlbumContextMenu.tsx    # Right-click menu for albums
│   ├── ArtistContextMenu.tsx   # Right-click menu for artists
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

## AudioEngine

The `AudioEngine` class handles all audio playback with these features:

- **Blob Playback**: Fetches audio as blob to bypass CORS restrictions
- **Dual Audio Elements**: Primary + crossfade audio for seamless transitions
- **Crossfade Support**: Configurable 1-12 second crossfade between tracks
- **Event Callbacks**: Play, pause, ended, timeupdate, error, loadstart, canplay
- **Abort Handling**: Cancels pending fetches when loading new tracks

```typescript
// Usage
audioEngine.load(streamUrl);      // Load track
audioEngine.play();               // Start playback
audioEngine.pause();              // Pause
audioEngine.seek(30);             // Seek to 30 seconds
audioEngine.setVolume(0.8);       // Set volume (0-1)
audioEngine.crossfadeTo(nextUrl); // Crossfade to next track
```

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

*Last updated: December 2024*
