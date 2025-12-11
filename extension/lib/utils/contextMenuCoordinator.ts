/**
 * Global Context Menu Coordinator
 *
 * Single source of truth for all context menus.
 * Only ONE menu can be open at a time, period.
 */

export type MenuType = 'track' | 'album' | 'artist' | 'playlist' | 'likedSongs';

export interface MenuState {
  type: MenuType | null;
  position: { x: number; y: number };
  data: unknown;
  key: number; // Forces remount on each open for proper animations
  isVisible: boolean; // Controls animation state
}

// Global state
const state: MenuState = {
  type: null,
  position: { x: 0, y: 0 },
  data: null,
  key: 0,
  isVisible: false,
};

// Listeners for state changes
const listeners = new Set<() => void>();

// Animation timing
const ANIMATION_DURATION = 150;

// Pending operations
let closeTimeout: ReturnType<typeof setTimeout> | null = null;
let openTimeout: ReturnType<typeof setTimeout> | null = null;

function notify(): void {
  listeners.forEach(listener => listener());
}

/**
 * Subscribe to state changes
 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Get current state
 */
export function getMenuState(): Readonly<MenuState> {
  return state;
}

/**
 * Open a context menu. Closes any existing menu first with animation.
 */
export function openMenu(type: MenuType, position: { x: number; y: number }, data: unknown): void {
  // Clear any pending operations
  if (closeTimeout) {
    clearTimeout(closeTimeout);
    closeTimeout = null;
  }
  if (openTimeout) {
    clearTimeout(openTimeout);
    openTimeout = null;
  }

  // If a menu is currently open/visible
  if (state.type !== null && state.isVisible) {
    // Start close animation
    state.isVisible = false;
    notify();

    // After animation, open new menu
    openTimeout = setTimeout(() => {
      openTimeout = null;
      state.type = type;
      state.position = position;
      state.data = data;
      state.key = Date.now();
      state.isVisible = false;
      notify();

      // Trigger enter animation
      requestAnimationFrame(() => {
        state.isVisible = true;
        notify();
      });
    }, ANIMATION_DURATION + 10);
    return;
  }

  // If menu is closing (not visible but type still set)
  if (state.type !== null && !state.isVisible) {
    // Wait for close to finish, then open
    openTimeout = setTimeout(() => {
      openTimeout = null;
      state.type = type;
      state.position = position;
      state.data = data;
      state.key = Date.now();
      state.isVisible = false;
      notify();

      requestAnimationFrame(() => {
        state.isVisible = true;
        notify();
      });
    }, ANIMATION_DURATION + 10);
    return;
  }

  // No menu open, open immediately
  state.type = type;
  state.position = position;
  state.data = data;
  state.key = Date.now();
  state.isVisible = false;
  notify();

  // Trigger enter animation
  requestAnimationFrame(() => {
    state.isVisible = true;
    notify();
  });
}

/**
 * Close the currently open menu with animation
 */
export function closeMenu(): void {
  if (state.type === null) return;

  // Clear any pending operations
  if (closeTimeout) {
    clearTimeout(closeTimeout);
    closeTimeout = null;
  }
  if (openTimeout) {
    clearTimeout(openTimeout);
    openTimeout = null;
  }

  // Start close animation
  state.isVisible = false;
  notify();

  // After animation, clear state
  closeTimeout = setTimeout(() => {
    closeTimeout = null;
    state.type = null;
    state.data = null;
    notify();
  }, ANIMATION_DURATION + 10);
}

/**
 * Schedule close from mousedown (can be cancelled)
 */
let pendingMousedownClose: ReturnType<typeof setTimeout> | null = null;

export function scheduleCloseFromMousedown(): void {
  if (state.type === null) return;

  if (pendingMousedownClose) {
    clearTimeout(pendingMousedownClose);
  }

  pendingMousedownClose = setTimeout(() => {
    pendingMousedownClose = null;
    closeMenu();
  }, 30);
}

/**
 * Cancel pending mousedown close
 */
export function cancelPendingClose(): void {
  if (pendingMousedownClose) {
    clearTimeout(pendingMousedownClose);
    pendingMousedownClose = null;
  }
}
