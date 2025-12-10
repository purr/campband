# 🗺️ CampBand Development Roadmap

## Overview

CampBand development is divided into phases. Each phase builds on the previous, with the goal of having a usable MVP as soon as possible.

```
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5 ──► Phase 6+
  Setup      Player      Search      Library     Sync        Polish
  2 days     3 days      2 days      3 days      2 days      Ongoing
```

---

## 📍 Phase 1: Foundation (Current)
**Goal:** Project setup and basic structure

### Tasks
- [x] Create project documentation (README, TODO, TECHNICAL)
- [x] Set up Cursor rules
- [x] Create .gitignore
- [ ] Initialize WXT project with React + TypeScript
- [ ] Configure Tailwind with Rose Pine theme
- [ ] Set up folder structure
- [ ] Create base UI components
- [ ] Port TypeScript types from Python models

### Deliverable
Empty extension that opens a styled "Hello World" in a new tab.

---

## 📍 Phase 2: Core Player
**Goal:** Working audio playback with basic controls

### Tasks
- [ ] Create audio manager (play, pause, seek)
- [ ] Build Now Playing bar component
- [ ] Implement play/pause/skip controls
- [ ] Add volume control
- [ ] Create progress bar with seek
- [ ] Add shuffle toggle
- [ ] Add repeat modes (off/track/all)
- [ ] Basic queue display

### Deliverable
Can play a hardcoded Bandcamp track with full controls.

---

## 📍 Phase 3: Search & Artist Pages
**Goal:** Search Bandcamp and view artist pages

### Tasks
- [ ] Implement Bandcamp search scraper
- [ ] Create search UI with results
- [ ] Build artist page scraper
- [ ] Create artist header component
- [ ] Build discography grid/list views
- [ ] Add view mode toggle
- [ ] Add sorting/filtering
- [ ] Implement "Play All" / "Shuffle All"
- [ ] Add loading states with progress

### Deliverable
Can search for an artist, view their page, and play their music.

---

## 📍 Phase 4: Library & Persistence
**Goal:** Save favorites and create playlists

### Tasks
- [ ] Set up IndexedDB with Dexie
- [ ] Implement favorites system
- [ ] Create playlist CRUD operations
- [ ] Build Library page with tabs
- [ ] Add recently played history
- [ ] Implement metadata caching
- [ ] Add album art caching

### Deliverable
Full library management with persistence across sessions.

---

## 📍 Phase 5: Multi-Tab & Background
**Goal:** Seamless playback across tabs

### Tasks
- [ ] Set up background service worker
- [ ] Implement tab-to-tab messaging
- [ ] Add "pause others" when playing
- [ ] Sync queue across tabs
- [ ] Add Media Session API (OS controls)
- [ ] Handle tab close gracefully

### Deliverable
Play in one tab, control from another, OS media keys work.

---

## 📍 Phase 6: Polish & UX
**Goal:** Production-ready experience

### Tasks
- [ ] Add glassmorphism effects
- [ ] Implement smooth animations
- [ ] Add keyboard shortcuts
- [ ] Create first-time experience
- [ ] Add settings page
- [ ] Error handling improvements
- [ ] Performance optimization
- [ ] Accessibility audit

### Deliverable
Polished, delightful user experience.

---

## 🔮 Future Phases

### Phase 7: Advanced Features
- Waveform visualization
- Lyrics display
- Dynamic theme from album art
- Download support

### Phase 8: Integration
- Bandcamp login (access purchases)
- Last.fm scrobbling
- Discord Rich Presence

### Phase 9: Platform Expansion
- Chrome extension port
- PWA version
- Mobile-friendly redesign

---

## Timeline Estimate

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1 | 2 days | 🚧 In Progress |
| Phase 2 | 3 days | ⏳ Pending |
| Phase 3 | 2 days | ⏳ Pending |
| Phase 4 | 3 days | ⏳ Pending |
| Phase 5 | 2 days | ⏳ Pending |
| Phase 6 | Ongoing | ⏳ Pending |

**MVP (Phases 1-3):** ~1 week
**Full v1 (Phases 1-5):** ~2 weeks

