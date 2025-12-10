# 📋 CampBand TODO

## Legend
- 🔴 **Critical** - Must have for MVP
- 🟡 **Important** - Should have soon
- 🟢 **Nice to have** - Future enhancement
- ✅ **Done**
- 🚧 **In Progress**
- ⏸️ **Blocked**

---

## Phase 1: Foundation ✅

### Setup
- ✅ Initialize WXT project with React + TypeScript
- ✅ Configure Tailwind CSS with Rose Pine theme
- ✅ Set up project structure (components, lib, hooks, types)
- ✅ Set up Zustand stores
- ✅ Set up IndexedDB with Dexie.js
- [ ] Configure ESLint + Prettier

### Core Scraping
- ✅ Port Python scraper to TypeScript
- ✅ Artist page scraper (data-band, music-grid, data-client-items)
- ✅ Album/Track page scraper (data-tralbum, ld+json)
- ✅ Bandcamp search scraper (bandcamp.com/search)
- ✅ Error handling & retry logic
- ✅ Rate limiting (delays between requests)
- ✅ Centralized image URL helpers (getArtworkUrl, extractArtIdFromUrl)

### Basic UI Shell
- ✅ App layout (sidebar, main content, player bar)
- ✅ Navigation system (SPA router with back/forward)
- ✅ Loading states / skeletons
- [ ] Error boundaries

---

## Phase 2: Core Player ✅

### Playback Engine
- ✅ Audio element management
- ✅ Play / Pause
- ✅ Skip / Previous
- ✅ Seek (progress bar)
- ✅ Volume control
- ✅ Mute toggle
- ✅ CORS bypass (fetch as blob)

### Queue System
- ✅ Queue state management
- ✅ Add to queue (single track)
- ✅ Add multiple to queue (album)
- ✅ Play next / previous
- ✅ Remove from queue
- ✅ Clear queue
- ✅ Queue panel (slide-out)
- [ ] Reorder queue (drag & drop)

### Shuffle & Repeat
- ✅ Shuffle mode
- ✅ Repeat modes (off, track, all)

### Now Playing Bar
- ✅ Album art display
- ✅ Track title & artist
- ✅ Progress bar with time (top edge design)
- ✅ Player controls
- ✅ Volume slider
- ✅ Buffering indicator
- ✅ Queue toggle button
- ✅ Like button (favorite current track)

---

## Phase 3: Search & Discovery ✅

### Search
- ✅ Search input with debounce
- ✅ Search results page
- ✅ Artist results
- ✅ Album results
- ✅ Track results
- ✅ Recent searches (persisted)

### Artist Page
- ✅ Artist header (name, image, bio)
- ✅ Discography grid
- ✅ "Play All" button (loads multiple releases)
- ✅ "Shuffle All" button
- ✅ Favorite artist button
- ✅ Discography list view
- ✅ View mode toggle (grid/list)
- [ ] Sorting (newest, oldest, name)
- [ ] Filtering (albums, tracks, all)

### Album Page
- ✅ Album header with art
- ✅ Track listing with play buttons
- ✅ About/credits section
- ✅ Play/shuffle buttons
- ✅ Tags display
- ✅ Favorite album button
- ✅ Add to queue button
- ✅ Track heart buttons
- ✅ Track queue buttons

---

## Phase 4: Library & Persistence ✅

### Database Setup
- ✅ Set up Dexie.js schema
- ✅ Favorites table
- ✅ History table
- ✅ Playlists table
- [ ] Cache table

### Favorites
- ✅ Favorite artists
- ✅ Favorite albums
- ✅ Favorite tracks
- ✅ Library page with tabs
- ✅ Heart button on artist/album headers
- ✅ Heart button on track rows

### Playlists
- ✅ Create playlist (with optional cover & description)
- ✅ Add tracks to playlist (via context menu, stays open for multiple adds)
- ✅ Remove from playlist (via context menu, red X on hover)
- ✅ Rename playlist
- ✅ Delete playlist
- ✅ Playlist page (with auto-cover collage from track art)
- ✅ Playlist covers in sidebar (collage for 2-4+ tracks)
- ✅ Highlight playlists that already contain track in picker

### History
- ✅ Recently played tracks
- ✅ History tab in library (currently hidden - can be re-enabled)
- ✅ Clear history button
- ⏸️ History UI hidden for cleaner sidebar design (data still tracked)

### Caching
- [ ] Cache artist metadata
- [ ] Cache album/track metadata
- [ ] Cache invalidation strategy
- [ ] User settings for cache size

---

## Phase 5: Multi-Tab & Background 🟡

### Background Service Worker
- [ ] Centralized playback state
- [ ] Tab communication (play/pause sync)
- ✅ Media session API (OS controls)

### Multi-Tab Sync
- [ ] Detect playback in other tabs
- [ ] Pause other tabs when playing
- [ ] Sync queue across tabs
- [ ] Sync library across tabs

---

## Phase 6: Polish 🟢

### UI Enhancements
- ✅ Glassmorphism effects (liquid glass throughout - header, player, sidebar, popups)
- ✅ Smooth transitions/animations (bidirectional)
- ✅ Hover states
- ✅ Collapsible sidebar (manual + auto-collapse on narrow screens)
- ✅ Queue panel (slide-out, liquid glass)
- ✅ Right-click context menus (tracks, albums, artists)
- ✅ Redesigned sidebar (Following, Liked Songs, Playlists with collage covers)
- ✅ Grid/List view toggles (Following, Artist Discography)
- ✅ External links redesigned (liquid glass pills)
- ✅ Linkified URLs in bios/credits/about text
- ✅ Tags section with liquid glass styling
- ✅ Volume popup redesigned (liquid glass via portal)
- ✅ Progress bar smooth animation (requestAnimationFrame)
- ✅ Playing indicator (animated equalizer bars) on all track covers
- [ ] Focus states (accessibility)
- [ ] Full responsive design (mobile)
- 🚧 Keyboard shortcuts (Spacebar play/pause done, more to come)

### Settings
- ✅ Settings page with sectioned design
- ✅ Audio settings UI (crossfade, gapless playback, volume normalization, mono audio)
- ✅ Equalizer with presets and custom 10-band EQ
- ✅ Crossfade implementation (dual audio elements with fade)
- ✅ Gapless playback (preloading next track)
- ✅ Web Audio API integration (EQ filters)
- [ ] Cache settings
- [ ] Theme customization
- [ ] Import/Export library

### First-Time Experience
- ✅ Welcome screen (home page)
- ✅ Tips/hints
- [ ] Empty states with guidance

---

## Phase 7: Future Features 🟢

### Advanced
- [ ] Waveform visualization
- [ ] Lyrics display (from ld+json)
- [ ] Album art color extraction (dynamic themes)
- [ ] Bandcamp user login (collection access)
- [ ] Download support
- [ ] Scrobbling (Last.fm)
- [ ] Discord Rich Presence
- ✅ Context menus for albums/artists
- ✅ Hidden track detection (shows count of unlisted tracks)

### Mobile
- [ ] Mobile-friendly responsive design
- [ ] Touch gestures

---

## Known Issues

- Mouse4/Mouse5 navigation blocked by Firefox (use UI buttons instead)
- Stream URLs expire after ~24 hours
- Some collaborative releases on Bandcamp use lazy-loaded images (handled via data-original attribute)
- Backdrop-filter doesn't work when nested - popups must use React portals

## Recently Fixed
- ✅ Progress bar now resets to 0 when switching tracks
- ✅ Clear queue no longer removes currently playing track
- ✅ Adding to playlist no longer adds to liked tracks
- ✅ Sidebar auto-collapses on narrow screens, auto-expands when widened

---

## Ideas Backlog

- Collaborative playlists (via export/import)
- Artist radio (play similar)
- Integration with MusicBrainz for better metadata
- PWA version (non-extension)
- Drag & drop queue reordering
- Drag & drop playlist reordering
- Context menu: Share to social
- ✅ Context menu: Copy Bandcamp link (for tracks, albums, artists)
- Context menu: Add album to playlist
- Context menu: Go to artist/album
- Re-enable History in sidebar (currently hidden)
- More keyboard shortcuts:
  - Arrow keys for seek (left/right)
  - M for mute toggle
  - N for next track, P for previous
  - S for shuffle toggle, R for repeat toggle
  - / or Ctrl+K for search focus
  - Escape to close panels/modals
