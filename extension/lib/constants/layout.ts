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
  /** Sidebar width collapsed */
  SIDEBAR_WIDTH_COLLAPSED: 64,
} as const;

// Tailwind class equivalents
export const LAYOUT_CLASSES = {
  /** Header/Player/Logo height as Tailwind class */
  BAR_HEIGHT: 'h-20', // 80px
  /** Sidebar width expanded */
  SIDEBAR_WIDTH: 'w-60', // 240px
  /** Sidebar width collapsed */
  SIDEBAR_WIDTH_COLLAPSED: 'w-16', // 64px
  /** Main content padding to account for player bar overlay */
  MAIN_CONTENT_PADDING: 'pb-24', // 96px (80px player + 16px extra breathing room)
} as const;

