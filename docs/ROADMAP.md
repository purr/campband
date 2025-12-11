# 🗺️ CampBand Development Roadmap

## Overview

CampBand development is divided into phases. Each phase builds on the previous, with the goal of having a usable MVP as soon as possible.

```
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5 ──► Phase 6+
  Setup      Player      Search      Library     Sync        Polish
    ✅          ✅          ✅          ✅          🟡          🟡
```

---

## 📍 Phase 1: Foundation ✅ Complete
**Goal:** Project setup and basic structure

### Tasks
- [x] Create project documentation (README, TODO, TECHNICAL, DESIGN_SYSTEM)
- [x] Set up Cursor rules
- [x] Create .gitignore
- [x] Initialize WXT project with React + TypeScript
- [x] Configure Tailwind CSS v4 with Rosé Pine theme
- [x] Set up folder structure (components, lib, hooks, types)
- [x] Create base UI components (Button, IconButton, Input, Slider, Skeleton)
- [x] Port TypeScript types from Python models

### Deliverable ✅
Extension that opens a styled app in a new tab with navigation shell.

---

## 📍 Phase 2: Core Player ✅ Complete
**Goal:** Working audio playback with basic controls

### Tasks
- [x] Create AudioEngine (play, pause, seek, volume, CORS bypass via blob)
- [x] Build Now Playing bar component (PlayerBar)
- [x] Implement play/pause/skip controls
- [x] Add volume control with popup (via portal for glass effect)
- [x] Create progress bar with seek (requestAnimationFrame for smooth animation)
- [x] Add shuffle toggle
- [x] Add repeat modes (off/track/all)
- [x] Queue panel (slide-out with liquid glass)
- [x] Buffering indicator
- [x] Crossfade implementation (dual audio elements)

### Deliverable ✅
Full audio playback with queue management, shuffle, repeat, and crossfade.

---

## 📍 Phase 3: Search & Artist Pages ✅ Complete
**Goal:** Search Bandcamp and view artist/album pages

### Tasks
- [x] Implement Bandcamp search scraper
- [x] Create search UI with debounced input
- [x] Search results (artists, albums, tracks)
- [x] Recent searches (persisted)
- [x] Build artist page scraper (data-band, music-grid, data-client-items)
- [x] Create artist header component with favorite button
- [x] Build discography grid/list views with toggle
- [x] Implement "Play All" / "Shuffle All"
- [x] Album/track page scraper (data-tralbum, ld+json)
- [x] Album page with track listing, about section, tags
- [x] Track play buttons, heart buttons, queue buttons
- [x] Hidden track detection (shows count of unlisted tracks)

### Deliverable ✅
Can search for artists, view their pages, browse albums, and play music.

---

## 📍 Phase 4: Library & Persistence ✅ Complete
**Goal:** Save favorites and create playlists

### Tasks
- [x] Set up IndexedDB with Dexie.js (schema v2)
- [x] Implement favorites system (artists, albums, tracks)
- [x] Create playlist CRUD operations
- [x] Add tracks to playlist via context menu (stays open for multiple adds)
- [x] Playlist covers (auto-collage from track art)
- [x] Build Library pages (Following, Liked Songs)
- [x] Add recently played history (data tracked, UI hidden)
- [x] Cache tables for artists/albums (schema ready)
- [x] Sidebar redesign (Following, Liked Songs, Playlists sections)

### Deliverable ✅
Full library management with favorites and playlists, persisted across sessions.

---

## 📍 Phase 5: Multi-Tab & Background 🟡 Partial
**Goal:** Seamless playback across tabs

### Tasks
- [x] Set up background service worker
- [x] Add Media Session API (OS controls - play/pause/skip/metadata)
- [x] Content script for "Open in CampBand" from Bandcamp pages
- [x] Pending navigation handling (storage-based communication)
- [ ] Centralized playback state in background
- [ ] Tab-to-tab messaging for play/pause sync
- [ ] "Pause others" when playing in one tab
- [ ] Sync queue across tabs
- [ ] Sync library across tabs

### Deliverable
Play in one tab, control from another, OS media keys work. *(Partially complete)*

---

## 📍 Phase 6: Polish & UX 🟡 Mostly Complete
**Goal:** Production-ready experience

### Tasks
- [x] Glassmorphism effects (liquid glass throughout - header, player, sidebar, popups)
- [x] Smooth bidirectional animations
- [x] Collapsible sidebar (manual + auto-collapse on narrow screens)
- [x] Right-click context menus (tracks, albums, artists)
- [x] Copy Bandcamp link functionality
- [x] External links with liquid glass pills
- [x] Linkified URLs in bios/credits
- [x] Tags section with liquid glass styling
- [x] Playing indicator (animated equalizer bars)
- [x] Settings page with sections
- [x] Audio settings (crossfade, gapless, volume normalization, mono audio)
- [x] 10-band Equalizer with presets
- [x] Welcome/Home page
- [x] Hover states throughout
- [x] Empty states with guidance (shared EmptyState component)
- [x] Code cleanup: Shared utilities (toPlayableTrack, hooks)
- [x] Code cleanup: Removed dead code, DRY components
- [x] Liking consistency: All favorites use same functions with complete data
- [x] URL-based routing: Pages reflect in URL hash, browser back/forward works
- [x] Playback source tracking: Album art click navigates to where playback started
- [x] Unified PlaylistModal: Same modal for create/edit with real-time validation
- [ ] Keyboard shortcuts (only Spacebar done, more planned)
- [ ] Focus states (accessibility)
- [ ] Full responsive design (mobile)
- [ ] Cache settings UI
- [ ] Theme customization
- [ ] Import/Export library

### Deliverable
Polished, delightful user experience. *(Mostly complete)*

---

## 🔮 Future Phases

### Phase 7: Advanced Features
- [ ] Waveform visualization
- [ ] Lyrics display (from ld+json)
- [ ] Dynamic theme from album art (color extraction)
- [ ] Download support
- [ ] Drag & drop queue/playlist reordering

### Phase 8: Integration
- [ ] Bandcamp login (access purchases/collection)
- [ ] Last.fm scrobbling
- [ ] Discord Rich Presence

### Phase 9: Platform Expansion
- [ ] Chrome extension port (MV3)
- [ ] PWA version
- [ ] Mobile-friendly redesign

---

## Timeline

| Phase | Estimated | Status |
|-------|-----------|--------|
| Phase 1 | 2 days | ✅ Complete |
| Phase 2 | 3 days | ✅ Complete |
| Phase 3 | 2 days | ✅ Complete |
| Phase 4 | 3 days | ✅ Complete |
| Phase 5 | 2 days | 🟡 Partial |
| Phase 6 | Ongoing | 🟡 Mostly Complete |

**MVP (Phases 1-4):** ✅ Complete
**Full v1 (Phases 1-6):** ~90% Complete

---

*Last updated: December 2024*
