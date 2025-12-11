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
- ✅ Configure Tailwind CSS with Rosé Pine theme
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
- ✅ Single-release artist support (/music → 303 redirect detection)

### Basic UI Shell
- ✅ App layout (sidebar, main content, player bar)
- ✅ Navigation system (SPA router with back/forward)
- ✅ URL routing with /a/ (album) and /t/ (track) prefixes
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
- ✅ Queue panel (slide-out with shuffle/repeat controls)
- ✅ Reorder queue (drag & drop)

### Shuffle & Repeat
- ✅ Shuffle mode (synced between player bar and queue panel)
- ✅ Repeat modes (off, track, all)
- ✅ Visual feedback in queue (dimmed tracks when looping single)

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
- ✅ Set up Dexie.js schema (v2 with all tables)
- ✅ Favorites tables (artists, albums, tracks)
- ✅ History table
- ✅ Playlists table (with playlistTracks junction)
- ✅ Track stats table
- ✅ Cache tables (schema ready: cachedArtists, cachedAlbums)

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
- ✅ Cache tables in database schema (ready for use)
- [ ] Implement artist metadata caching
- [ ] Implement album/track metadata caching
- [ ] Cache invalidation strategy (TTL-based)
- [ ] User settings for cache size

---

## Phase 5: Multi-Tab & Background 🟡

### Background Service Worker
- ✅ Background script (icon click, message handling)
- ✅ Content script for Bandcamp pages ("Open in CampBand" button)
- ✅ Pending navigation via storage.local
- ✅ Media session API (OS controls - play/pause/skip/metadata)
- [ ] Centralized playback state (move audio to background)
- [ ] Tab communication (play/pause sync)

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
- ✅ Queue panel (slide-out, liquid glass, shuffle/repeat controls)
- ✅ Right-click context menus (tracks, albums, artists, playlists, liked songs)
- ✅ Redesigned sidebar (Following, Liked Songs sticky; Playlists with collage covers)
- ✅ Grid/List view toggles (Following, Artist Discography)
- ✅ External links redesigned (liquid glass pills)
- ✅ Linkified URLs in bios/credits/about text
- ✅ Tags section with liquid glass styling
- ✅ Volume popup redesigned (liquid glass via portal)
- ✅ Progress bar smooth animation (requestAnimationFrame)
- ✅ Playing indicator (animated equalizer bars) on all track covers
- ✅ JavaScript smooth scrolling (useSmoothScroll hook with velocity + friction)
- ✅ Rose Pine cursors and selection colors
- [ ] Focus states (accessibility)
- [ ] Full responsive design (mobile)
- 🚧 Keyboard shortcuts (Spacebar play/pause done, more to come)

### Settings
- ✅ Settings page with sectioned design
- ✅ Audio settings UI (crossfade, gapless playback, volume normalization, mono audio)
- ✅ Equalizer with presets and custom 10-band EQ
- ✅ Crossfade implementation (Web Audio API with cosine-eased fade)
- ✅ Gapless playback (preloading next track)
- ✅ Web Audio API integration (EQ filters, compressor, mono mix)
- ✅ Volume normalization (DynamicsCompressorNode)
- ✅ Mono audio (ChannelSplitter/Merger)
- [ ] Cache settings
- [ ] Theme customization
- [ ] Import/Export library

### First-Time Experience
- ✅ Welcome screen (home page)
- ✅ Tips/hints
- ✅ Empty states with guidance (shared EmptyState component)

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

- **Mouse Navigation**: Mouse4/Mouse5 (back/forward) buttons blocked by Firefox - use UI buttons instead
- **Stream Expiry**: Bandcamp streaming URLs expire after ~24 hours
- **Lazy Images**: Some collaborative releases use lazy-loaded images (handled via data-original attribute)
- **Backdrop-Filter Nesting**: CSS backdrop-filter doesn't work when nested inside another element with backdrop-filter - all popups and modals render via React Portal to document.body to ensure glass effects work correctly
- **Firefox MV2**: Using Manifest V2 for Firefox compatibility - session storage not available, using storage.local instead

## Extension Compatibility

- **Auto-Stop Media**: Audio elements are appended to DOM (hidden) so other extensions like Auto-Stop can detect and control playback

## Recently Fixed
- ✅ Progress bar resets to 0 on track change (requestAnimationFrame sync)
- ✅ Clear queue preserves currently playing track
- ✅ Playlist add/remove separated from like functionality
- ✅ Sidebar auto-collapse on narrow screens, auto-expand when widened
- ✅ Sidebar collapse bug: Manual expand then narrow screen now auto-collapses correctly
- ✅ Volume popup renders via portal (glass effect works)
- ✅ Context menus render via portal (glass effect works)
- ✅ Smooth progress bar animation using requestAnimationFrame
- ✅ Code cleanup: Created shared utilities (toPlayableTrack, useConfirmationState, etc.)
- ✅ Code cleanup: Removed dead code (album/TrackList.tsx, album/AlbumHeader.tsx)
- ✅ Code cleanup: HeartButton/AddToQueueButton now used consistently across all track rows
- ✅ Code cleanup: Shared EmptyState component for all empty list/grid states
- ✅ Liking consistency: All favorite actions (tracks, albums, artists) now use same store functions with complete data
- ✅ Album context menu now passes complete bandId/bandUrl for proper favoriting
- ✅ Playback source tracking: Clicking album art in player bar navigates to where playback started
- ✅ Unified PlaylistModal: Same modal used for create and edit, with real-time name validation
- ✅ URL-based routing: Pages reflect in URL hash, browser back/forward works
- ✅ Single-release artists: /music 303 redirect detection now works properly
- ✅ Track vs Album URL distinction: Uses /a/ and /t/ prefixes in hash routing
- ✅ Rose-pine cursors and selection colors added to globals.css
- ✅ Sidebar album context menu (right-click on liked albums)
- ✅ Sidebar playlist context menu (right-click: play, edit, delete, queue)
- ✅ Audio features fully implemented with Web Audio API (see below)
- ✅ Crossfade slider UI simplified (no thumb dot, cleaner labels)
- ✅ Toggle focus ring removed for cleaner UI
- ✅ Sidebar collapse/expand animation smoothed (opacity + width transition)
- ✅ Following & Liked Songs now sticky in sidebar (like Home/Search)
- ✅ Liked Songs context menu (Play, Play Next, Add to Queue)
- ✅ JavaScript smooth scrolling (useSmoothScroll hook with velocity + friction)
- ✅ Audio elements appended to DOM for Auto-Stop Media extension compatibility
- ✅ Queue panel shows shuffle/repeat mode buttons (synced with player bar)
- ✅ Queue panel dims "Next Up" when single track loop is active
- ✅ Shuffle button sync fixed (was using wrong store - playerStore vs queueStore)
- ✅ Single track loop + crossfade edge case fixed (was desync'd - UI showed next track while audio looped)
- ✅ Crossfade now works for looping tracks (smooth fade back to start)
- ✅ Responsive track list columns (hide Added → Album → Duration as page narrows)
- ✅ Sortable track list columns (click to sort by title, album, added, duration)
- ✅ Duration column uses clock icon (permanent), other columns use text

## Audio Engine (December 2024)
Full Web Audio API implementation:
- ✅ **Crossfade**: Smooth cosine-eased fade between tracks (default 4s)
- ✅ **Volume Normalization**: DynamicsCompressorNode for consistent loudness
- ✅ **Mono Audio**: ChannelSplitter/Merger for accessibility
- ✅ **10-band Equalizer**: BiquadFilterNodes at standard frequencies (32Hz-16kHz)
- ✅ **Gapless Playback**: Preloads next track, starts 300ms before current ends
- ✅ **Loop Track Crossfade**: Crossfades back to start when looping single track

---

*Last updated: December 2024*

---

## Ideas Backlog

### Features
- Collaborative playlists (via export/import)
- Artist radio (play similar artists/albums)
- Integration with MusicBrainz for better metadata
- PWA version (non-extension)
- Chrome extension port (MV3)
- Re-enable History in sidebar (data is tracked, UI hidden)

### Queue & Playlist Improvements
- Drag & drop queue reordering
- Drag & drop playlist reordering
- Context menu: Add album to playlist
- Context menu: Share to social

### Context Menus
- ✅ Copy Bandcamp link (tracks, albums, artists)
- ✅ Like/Unlike from context menu
- ✅ Add to playlist submenu with track highlighting
- ✅ Sidebar album right-click menu (like, queue, copy link, open in Bandcamp)
- ✅ Sidebar playlist right-click menu (play, play next, add to queue, edit, delete)
- ✅ Album context menu: Play, Play Next, Add to Queue
- ✅ Artist context menu: Play, Play Next, Add to Queue (loads releases dynamically)
- Go to artist from track/album context
- Go to album from track context

### Keyboard Shortcuts
Current:
- ✅ Spacebar: play/pause

Planned:
  - Arrow keys for seek (left/right)
  - M for mute toggle
  - N for next track, P for previous
  - S for shuffle toggle, R for repeat toggle
  - / or Ctrl+K for search focus
  - Escape to close panels/modals
- Up/Down for volume
