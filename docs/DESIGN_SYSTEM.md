# 🎨 CampBand Design System

A comprehensive guide to the visual language and reusable components that make CampBand look **modern as fuck**.

---

## Core Philosophy

1. **Glass is Life** - Everything floats on layers of frosted glass
2. **Depth Through Blur** - Background images are always blurred & zoomed for depth
3. **Subtle Glow** - Accent colors glow softly, never harshly
4. **Smooth Transitions** - Every state change is animated bidirectionally
5. **Rosé Pine Theme** - Dark, elegant, with rose/iris/foam accents

---

## 🪟 Glassmorphism System

### CSS Classes

```css
/* Standard Glass Variants */
.glass              /* 80% opacity, 12px blur - general use */
.glass-subtle       /* 50% opacity, 8px blur - overlays */
.glass-strong       /* 95% opacity, 20px blur - important UI */

/* Apple-style Liquid Glass (premium) */
.liquid-glass-bar       /* Player bar - 28px blur, inner glow, gradient bg */
.liquid-glass-sidebar   /* Sidebar - similar to bar, slightly more opaque */
.liquid-glass-glow      /* Rose-tinted border glow - popups, context menus */

.frosted-glass      /* Light frosted variant - 16px blur, minimal bg */
```

### Usage Examples

```tsx
// Queue Panel (popup over content, via portal)
<div className="liquid-glass-glow rounded-2xl">

// Player Bar (bottom bar, consistent with header)
<div className="liquid-glass-bar">

// Sidebar (matching glass effect)
<aside className="liquid-glass-sidebar">

// Volume Popup (via portal for glass effect)
<div className="liquid-glass-glow rounded-2xl">

// Context Menus (via portal)
<div className="liquid-glass-glow rounded-2xl">
```

### Key Properties

| Effect | Background | Blur | Border | Shadow |
|--------|------------|------|--------|--------|
| `liquid-glass-bar` | Gradient rgba(31,29,46, 0.45-0.6) | 28px + saturate(180%) | Inner 1px white/6% | Inner highlight glow |
| `liquid-glass-sidebar` | Gradient rgba(31,29,46, 0.5-0.65) | 28px + saturate(180%) | Inner 1px white/6% | Inner highlight glow |
| `liquid-glass-glow` | Gradient rgba(31,29,46, 0.45-0.6) | 28px + saturate(180%) | 1px rgba(235,188,186, 0.15) | Rose-tinted ambient glow + 8px shadow |
| `frosted-glass` | rgba(255,255,255, 0.03) | 16px + saturate(150%) | 1px white/8% | 4px shadow + inner glow |

**Note:** All liquid-glass utilities include inner box-shadow highlights for that "frosted glass" refraction effect.

---

## 🖼️ ImageBackdrop Component

The secret sauce for those **gorgeous header backgrounds**.

### What It Does

- Takes any image and renders it as a **zoomed-in, blurry backdrop**
- Includes a gradient fade that **blends seamlessly** into the UI
- Optional **accent glow** for colored ambient light effect
- Includes a subtle vignette for **depth**

### Props

```typescript
interface ImageBackdropProps {
  imageUrl?: string | null;     // Source image
  blur?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';  // Default: '3xl'
  scale?: number;               // Zoom level, default: 1.2
  opacity?: number;             // 0-1, default: 0.4
  height?: string;              // CSS height, default: '100%'
  showGradient?: boolean;       // Fade to bg, default: true
  gradient?: string;            // Custom Tailwind gradient class
  accentGlow?: 'rose' | 'iris' | 'foam' | 'pine' | 'gold' | 'none';
  className?: string;
}
```

### Usage

```tsx
import { ImageBackdrop } from '@/components/ui';

// Artist header - iris glow for that purple vibe
<div className="relative">
  <ImageBackdrop
    imageUrl={albumArtUrl}
    blur="3xl"
    scale={1.4}
    opacity={0.5}
    accentGlow="iris"
  />
  <div className="relative z-10">
    {/* Your content - must have z-10 to appear above */}
  </div>
</div>

// Album header - rose glow to match the accent
<ImageBackdrop
  imageUrl={artUrl}
  blur="3xl"
  scale={1.4}
  opacity={0.5}
  accentGlow="rose"
/>
```

### The Gradient Fade

Default gradient blends from transparent → base color:
```css
bg-gradient-to-b from-base/30 via-base/70 to-base
```

This creates the effect where the blurred image **naturally fades** into the UI background, no harsh edges.

---

## 🎨 Color System

### Rosé Pine Theme

| Token | Hex | Usage |
|-------|-----|-------|
| `base` | `#191724` | Main background |
| `surface` | `#1f1d2e` | Cards, panels |
| `overlay` | `#26233a` | Modals, dropdowns |
| `muted` | `#6e6a86` | Secondary text |
| `subtle` | `#908caa` | Tertiary text |
| `text` | `#e0def4` | Primary text |
| `love` | `#eb6f92` | Errors, favorites |
| `gold` | `#f6c177` | Warnings |
| `rose` | `#ebbcba` | **Primary accent** |
| `pine` | `#31748f` | Links |
| `foam` | `#9ccfd8` | Success, info |
| `iris` | `#c4a7e7` | Secondary accent |

### Semantic Usage

- **Primary accent**: `rose` - buttons, progress bars, active states
- **Secondary accent**: `iris` - highlights, selected items
- **Success/Info**: `foam` - confirmations, queue added
- **Error/Danger**: `love` - errors, delete actions
- **Links**: `pine` - clickable text

---

## 🖱️ Cursors & Selection

Using [rose-pine/cursor](https://github.com/rose-pine/cursor) **BreezeX-RoséPine** (Dark theme).

### Custom Cursors

Cursor PNG files are in `/public/cursors/`:

| Cursor | File | Elements |
|--------|------|----------|
| **Default** | `default.png` | `html` (entire app) |
| **Pointer** | `pointer.png` | `a`, `button`, `[role="button"]`, `.cursor-pointer` |
| **Link** | `link.png` | `a[href]`, `.cursor-link` |
| **Text** | `text.png` | `input`, `textarea`, `[contenteditable]` |
| **Grab** | `grab.png` | `.cursor-grab` |
| **Not-allowed** | `not-allowed.png` | `:disabled`, `[disabled]` |

### Selection Colors

```css
::selection {
  background-color: rgba(235, 188, 186, 0.35);  /* rose/35% */
  color: var(--color-text);
}
```

### Focus & Accent Colors

```css
/* Focus ring */
input:focus { outline: 2px solid var(--color-iris); }

/* Checkbox/Radio/Range accent */
input[type="checkbox"]:checked { accent-color: var(--color-rose); }

/* Search highlight */
mark, .highlight { background-color: rgba(246, 193, 119, 0.3); }  /* gold/30% */
```

---

## ✨ Hover & Interaction States

### Standard Pattern

```tsx
// Buttons and interactive elements
className={cn(
  'transition-all duration-200',
  'hover:bg-white/5',           // Subtle glass highlight
  'active:scale-95',            // Satisfying press feedback
  isActive && 'bg-white/8'      // Active state
)}
```

### Text Links (Clickable Titles)

```tsx
className={cn(
  'transition-colors duration-150',
  'hover:text-rose hover:underline underline-offset-2 cursor-pointer'
)}
```

### Icon Buttons

```tsx
className={cn(
  'p-2 rounded-full',
  'transition-all duration-200',
  'hover:bg-highlight-low active:scale-90',
  isActive && 'text-rose'
)}
```

---

## 🎬 Animations

### Available Classes

| Class | Duration | Effect |
|-------|----------|--------|
| `animate-fade-in` | 200ms | Opacity 0→1 |
| `animate-slide-up` | 300ms | Fade + translateY(10px→0) |
| `animate-scale-in` | 200ms | Scale 0→1 with fade |
| `animate-slide-in-right` | 200ms | Slide from right (panels) |
| `animate-breathe` | 25s | Slow organic float (background blobs) |
| `animate-blob` | 12s | Faster blob movement |
| `animate-equalizer` | 2.2s | Audio bars animation |
| `animate-pulse-subtle` | 2s | Gentle pulsing opacity |
| `animate-spin` | 1s | Continuous rotation (loaders) |

### Animation Delays

```css
.animation-delay-200  /* 200ms */
.animation-delay-400  /* 400ms */
.animation-delay-2000 /* 2s */
.animation-delay-4000 /* 4s */
.animation-delay-6000 /* 6s */
```

### Panel Animation Pattern

```tsx
// Slide-out panels (queue, etc)
className={cn(
  'transition-all duration-300 ease-out',
  'origin-bottom-right',
  isOpen
    ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
    : 'opacity-0 translate-y-4 scale-95 pointer-events-none'
)}
```

---

## 📐 Layout Patterns

### Header with Backdrop

```tsx
<div className="relative">
  <ImageBackdrop imageUrl={artUrl} accentGlow="rose" />
  <div className="relative z-10 px-8 pt-12 pb-8">
    {/* Header content */}
  </div>
</div>
```

### Scrollable Content with Fades

```tsx
<div className="relative">
  {/* Top fade */}
  <div className={cn(
    'absolute top-0 left-0 right-2 h-8 z-10',
    'bg-gradient-to-b from-base/40 via-base/20 to-transparent',
    'pointer-events-none transition-opacity',
    canScrollUp ? 'opacity-100' : 'opacity-0'
  )} />

  {/* Scrollable content */}
  <div className="overflow-y-auto" onScroll={updateScrollState}>
    {children}
  </div>

  {/* Bottom fade */}
  <div className={cn(
    'absolute bottom-0 left-0 right-2 h-8 z-10',
    'bg-gradient-to-t from-base/40 via-base/20 to-transparent',
    'pointer-events-none transition-opacity',
    canScrollDown ? 'opacity-100' : 'opacity-0'
  )} />
</div>
```

---

## 🔲 Border & Shadow Patterns

### Borders

```css
/* Subtle borders for glass surfaces */
border-white/5            /* Very subtle */
border-white/8            /* Subtle */
border-white/12           /* Visible */
border-highlight-low      /* Theme-aware subtle */
border-highlight-med      /* Theme-aware medium */

/* Accent borders */
border-rose/15            /* Rose glow effect */
```

### Shadows

```css
/* Standard elevation */
shadow-lg                 /* General use */
shadow-xl                 /* Cards, modals */
shadow-2xl                /* Hero elements */

/* Custom shadows for liquid glass */
box-shadow:
  0 8px 32px rgba(0, 0, 0, 0.4),           /* Main shadow */
  0 0 0 1px rgba(255, 255, 255, 0.05) inset, /* Inner border */
  0 1px 0 rgba(255, 255, 255, 0.1) inset;    /* Top highlight */
```

---

## 📱 Component Quick Reference

| Component | Glass Style | Notes |
|-----------|-------------|-------|
| Player Bar | `liquid-glass-bar` | Matches header styling |
| Queue Panel | `liquid-glass-glow` | Rose border, via portal |
| Volume Popup | `liquid-glass-glow` | Via portal for glass effect |
| Context Menus | `liquid-glass-glow` | Via portal, rose border |
| Sidebar | `liquid-glass-sidebar` | Slightly more opaque |
| Artist Header | `ImageBackdrop` | Iris glow accent |
| Album Header | `ImageBackdrop` | Rose glow accent |
| Modals | `liquid-glass-glow` | Via portal |
| Create Playlist | `liquid-glass-glow` | Via portal |

### Shared UI Components

| Component | Props | Notes |
|-----------|-------|-------|
| `HeartButton` | `isFavorite`, `onClick`, `size`, `showOnGroupHover` | Animated heart toggle |
| `AddToQueueButton` | `onClick`, `size`, `disabled`, `showOnGroupHover` | Check animation on add |
| `EmptyState` | `icon`, `title`, `description`, `action` | Consistent empty list/grid states |
| `PlayingIndicator` | `size` | Animated equalizer bars |
| `TrackRow` | `track`, handlers, `showMeta` | Generic track row for library/history |

### Shared Layout Components

| Component | Props | Notes |
|-----------|-------|-------|
| `CollectionHeader` | `title`, `cover`, playback handlers, etc. | Album/Playlist/Liked headers |
| `TrackList` | `tracks`, `onTrackPlay`, etc. | Album track list (numbered rows) |
| `PlaylistTrackList` | `tracks`, `onTrackPlay`, etc. | Playlist track list (cover art, date) |

---

## 🌀 Portal Rendering

**Critical for Glass Effects:** CSS `backdrop-filter` does not work when nested inside another element that already has `backdrop-filter` applied. This breaks the glass effect on popups, context menus, and volume controls.

### Solution: React Portals

All glass popups must render via `createPortal` to `document.body`:

```tsx
import { createPortal } from 'react-dom';

// Volume popup, context menus, modals
{isOpen && createPortal(
  <div className="fixed z-[9999] liquid-glass-glow rounded-2xl">
    {/* Content */}
  </div>,
  document.body
)}
```

### Components Using Portals
- `VolumeControl` (collapsed popup)
- `TrackContextMenu`
- `AlbumContextMenu`
- `ArtistContextMenu`
- `PlaylistPicker` (submenu)
- `CreatePlaylistModal`
- `QueuePanel`

---

## 🖼️ Image Handling

### Never Stretch, Always Crop

Images (especially vertical ones) should **crop** to fit, not stretch:

```tsx
// CORRECT - crops vertical images to fit square/circle
<div className="w-48 h-48 rounded-full overflow-hidden relative">
  <img
    src={avatarUrl}
    alt={name}
    className="absolute inset-0 w-full h-full object-cover object-center"
  />
</div>

// Key CSS:
// - `absolute inset-0` - fills container
// - `object-cover` - crops to fill (never stretches)
// - `object-center` - centers the crop point
```

### Pattern for Avatar/Art Containers

```tsx
// Circle avatar (artist)
<div className="w-48 h-48 rounded-full overflow-hidden bg-surface shadow-2xl relative">
  <img className="absolute inset-0 w-full h-full object-cover object-center" />
</div>

// Square art (album)
<div className="w-56 h-56 rounded-lg overflow-hidden bg-surface shadow-2xl relative">
  <img className="absolute inset-0 w-full h-full object-cover object-center" />
</div>
```

---

## 🎵 Playing Indicator

The animated equalizer bars show which track is currently playing:

```tsx
import { PlayingIndicator } from '@/components/ui';

// On track covers - shows when this track is playing
<PlayingIndicator isPlaying={isCurrentTrack && isPlaying} />
```

Uses `animate-equalizer` with staggered delays for organic movement.

---

## 🚀 Quick Tips

1. **Always use `relative` + `z-10`** when placing content over ImageBackdrop
2. **Prefer `bg-white/X`** over `bg-highlight-X` for hover states on glass
3. **Use `rounded-2xl`** for premium panels, `rounded-xl` for smaller elements
4. **Add `pointer-events-none`** to decorative overlays
5. **Use `transition-all duration-200`** as default, `duration-300` for panels
6. **Include `aria-hidden="true"`** on decorative backdrop elements
7. **Always use `object-cover object-center`** on images to crop, never stretch
8. **Render popups via portal** to ensure backdrop-filter works correctly
9. **Use `z-[9999]`** for portaled popups to stay above all content

---

*Last updated: December 2024*

