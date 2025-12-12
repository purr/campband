/**
 * Shared layout constants for consistent sizing across the app.
 * Single source of truth - change here, updates everywhere.
 */

// Heights in pixels
export const LAYOUT = {
  /** Header bar height (px) */
  HEADER_HEIGHT: 80,
  /** Player bar height (px) */
  PLAYER_HEIGHT: 80,
  /** Sidebar logo section height - matches header */
  SIDEBAR_LOGO_HEIGHT: 80,
  /** Sidebar settings section height - matches header/player */
  SIDEBAR_SETTINGS_HEIGHT: 80,
  /** Sidebar width expanded */
  SIDEBAR_WIDTH: 240,
  /** Sidebar width collapsed - fits cover + padding */
  SIDEBAR_WIDTH_COLLAPSED: 76,
} as const;

// Sidebar item sizes - shared constants
export const SIDEBAR_SIZES = {
  /** Cover art / icon container size */
  COVER: 'w-[44px] h-[44px]', // 44px
  /** Logo button size */
  LOGO: 'w-10 h-10', // 40px
  /** Type badge size (playlist/album indicator) */
  BADGE: 'w-4 h-4', // 16px
  /** Nav icon size (Lucide icons) */
  ICON: 22,
  /** Badge icon size */
  BADGE_ICON: 10,
} as const;

// Tailwind class equivalents
export const LAYOUT_CLASSES = {
  /** Header/Player/Logo height as Tailwind class */
  BAR_HEIGHT: 'h-20', // 80px
  /** Sidebar width expanded */
  SIDEBAR_WIDTH: 'w-60', // 240px
  /** Sidebar width collapsed */
  SIDEBAR_WIDTH_COLLAPSED: 'w-[76px]', // 76px - fits 44px cover + padding
  /** Main content padding to account for player bar overlay */
  MAIN_CONTENT_PADDING: 'pb-24', // 96px (80px player + 16px extra breathing room)
} as const;

