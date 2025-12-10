# 🔧 CampBand Technical Documentation

## Tech Stack

- **Framework:** [WXT](https://wxt.dev/) (Web Extension Framework for Firefox)
- **UI:** React 18 + TypeScript (strict mode)
- **Styling:** Tailwind CSS v4 + Rose Pine theme
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
│   │   ├── background.ts # Service worker
│   │   └── app/          # Main app (React SPA)
│   ├── components/       # React components
│   │   ├── ui/           # Base components
│   │   ├── layout/       # App layout
│   │   ├── player/       # Player components
│   │   └── ...
│   ├── lib/              # Core logic
│   │   ├── api/          # Bandcamp scraper
│   │   ├── store/        # Zustand stores
│   │   ├── audio/        # Audio engine
│   │   └── ...
│   ├── hooks/            # Custom React hooks
│   ├── types/            # TypeScript types
│   └── styles/           # Global CSS
├── package.json
├── wxt.config.ts
└── README.md
```

## Development Commands

```bash
pnpm dev          # Start dev server with hot reload
pnpm build        # Production build
pnpm zip          # Package as .xpi
pnpm typecheck    # Run TypeScript checks
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
│  │  - Playback      │    │  - Search                        │  │
│  │  - Tab sync      │    │  - Artist pages                  │  │
│  │  - Fetch/Cache   │    │  - Library                       │  │
│  └──────────────────┘    │  - Player UI                     │  │
│          │               └──────────────────────────────────┘  │
│          │                              │                       │
│          ▼                              ▼                       │
│  ┌──────────────────┐    ┌──────────────────────────────────┐  │
│  │  IndexedDB       │    │  Zustand Stores                  │  │
│  │  (Dexie.js)      │    │                                  │  │
│  │                  │    │  - playerStore                   │  │
│  │  - artists       │    │  - queueStore                    │  │
│  │  - albums        │    │  - libraryStore                  │  │
│  │  - tracks        │    │  - searchStore                   │  │
│  │  - playlists     │    │  - uiStore                       │  │
│  │  - history       │    └──────────────────────────────────┘  │
│  │  - cache         │                                          │
│  └──────────────────┘                                          │
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
audioElement.src = streamingUrl
audioElement.play()
       │
       ▼
playerStore.setPlaying(true)
       │
       ▼
background.notifyOtherTabs() // pause them
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
       │   api.fetchArtist(url)
       │         │
       │         ▼
       │   Parse band_data, music_grid, data-client-items
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
  volume: number;
  muted: boolean;
  progress: number;
  duration: number;
  repeat: 'off' | 'track' | 'all';
  shuffle: boolean;
}

// queueStore - Queue management
interface QueueState {
  queue: Track[];
  history: Track[];  // for previous button
  originalQueue: Track[];  // for unshuffle
}

// libraryStore - User's saved content
interface LibraryState {
  favoriteArtists: string[];  // artist URLs
  favoriteAlbums: string[];
  favoriteTracks: string[];
  playlists: Playlist[];
  recentlyPlayed: Track[];
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
  viewMode: 'grid' | 'list' | 'detailed';
  sortBy: 'newest' | 'oldest' | 'name';
  filterType: 'all' | 'album' | 'track';
}
```

## IndexedDB Schema (Dexie.js)

```typescript
// db.ts
import Dexie from 'dexie';

class CampBandDB extends Dexie {
  artists!: Table<CachedArtist>;
  releases!: Table<CachedRelease>;
  playlists!: Table<Playlist>;
  history!: Table<HistoryEntry>;
  settings!: Table<Setting>;

  constructor() {
    super('campband');
    this.version(1).stores({
      artists: 'url, bandId, name, cachedAt',
      releases: 'url, artistUrl, type, cachedAt',
      playlists: '++id, name, createdAt',
      history: '++id, trackUrl, playedAt',
      settings: 'key',
    });
  }
}
```

## Component Structure

```
components/
├── ui/                    # Base components
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Slider.tsx
│   ├── IconButton.tsx
│   ├── Skeleton.tsx
│   ├── Modal.tsx
│   └── Tooltip.tsx
│
├── layout/                # Layout components
│   ├── AppLayout.tsx      # Main shell
│   ├── Sidebar.tsx
│   ├── Header.tsx
│   └── PlayerBar.tsx
│
├── player/                # Player components
│   ├── NowPlaying.tsx
│   ├── PlaybackControls.tsx
│   ├── ProgressBar.tsx
│   ├── VolumeControl.tsx
│   └── QueuePanel.tsx
│
├── search/                # Search components
│   ├── SearchInput.tsx
│   ├── SearchResults.tsx
│   ├── ArtistResult.tsx
│   └── AlbumResult.tsx
│
├── artist/                # Artist page components
│   ├── ArtistHeader.tsx
│   ├── DiscographyGrid.tsx
│   ├── DiscographyList.tsx
│   ├── ReleaseCard.tsx
│   └── ViewModeToggle.tsx
│
└── library/               # Library components
    ├── LibraryTabs.tsx
    ├── FavoritesList.tsx
    ├── PlaylistsList.tsx
    └── HistoryList.tsx
```

## Styling System

> **Full design system documentation:** See [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) for comprehensive glass effects, animations, component patterns, and the `ImageBackdrop` component.

### Rose Pine Theme
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

### Glassmorphism Utilities
```css
.glass              /* Standard glass - 80% opacity, 12px blur */
.glass-subtle       /* Lighter glass - 50% opacity, 8px blur */
.glass-strong       /* Heavy glass - 95% opacity, 20px blur */

/* Apple-style Liquid Glass */
.liquid-glass       /* Gradient bg, 24px blur, subtle glow */
.liquid-glass-strong /* Heavy gradient, 32px blur, prominent glow */
.liquid-glass-glow  /* Rose-tinted border glow, perfect for popups */

.frosted-glass      /* Light frosted effect */
```

## Browser Extension APIs Used

| API | Purpose |
|-----|---------|
| `browser.storage.local` | Persist settings |
| `browser.tabs` | Tab communication |
| `browser.runtime` | Message passing |
| `fetch` | HTTP requests (CORS bypass) |
| `navigator.mediaSession` | OS media controls (play/pause/skip/metadata) |
| `IndexedDB` | Large data storage |

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

1. **Virtual scrolling** for large lists (74+ releases)
2. **Image lazy loading** with placeholder
3. **Debounced search** (300ms)
4. **Memoized components** where needed
5. **Web Workers** for heavy parsing (future)

