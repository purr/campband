import { useEffect, useRef, type RefObject } from 'react';

// ============================================
// GLOBAL SMOOTH SCROLL SETTINGS
// ============================================

/** How fast scroll catches up to target (0.05 = very slow, 0.15 = medium, 0.3 = fast) */
export const SCROLL_SMOOTHNESS = 0.06;

/** How quickly momentum decays when user stops scrolling (0.5 = stops fast, 0.9 = coasts long) */
export const SCROLL_FRICTION = 0.5;

/** Minimum velocity to keep animating */
const MIN_VELOCITY = 0.5;

interface SmoothScrollOptions {
  /** Whether smooth scroll is enabled. Default: true */
  enabled?: boolean;
}

/**
 * Adds smooth scroll wheel behavior to a scrollable element.
 * Smooth while scrolling, stops quickly when you stop.
 */
export function useSmoothScroll<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: SmoothScrollOptions = {}
) {
  const { enabled = true } = options;

  // Track scroll state
  const currentScrollTop = useRef(0);
  const velocity = useRef(0);
  const animationFrame = useRef<number | null>(null);
  const lastWheelTime = useRef(0);

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;

    // Initialize scroll position
    currentScrollTop.current = element.scrollTop;

    const animate = () => {
      if (!element) return;

      const now = performance.now();
      const timeSinceLastWheel = now - lastWheelTime.current;

      // Apply friction when user stopped scrolling (after 50ms of no wheel events)
      if (timeSinceLastWheel > 50) {
        velocity.current *= SCROLL_FRICTION;
      }

      // Stop if velocity is negligible
      if (Math.abs(velocity.current) < MIN_VELOCITY) {
        velocity.current = 0;
        animationFrame.current = null;
        return;
      }

      // Apply velocity
      const maxScroll = element.scrollHeight - element.clientHeight;
      currentScrollTop.current = Math.max(
        0,
        Math.min(maxScroll, currentScrollTop.current + velocity.current)
      );
      element.scrollTop = currentScrollTop.current;

      // Continue animation
      animationFrame.current = requestAnimationFrame(animate);
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      lastWheelTime.current = performance.now();

      // Add to velocity (with smoothing)
      velocity.current += e.deltaY * SCROLL_SMOOTHNESS;

      // Start animation if not already running
      if (!animationFrame.current) {
        animationFrame.current = requestAnimationFrame(animate);
      }
    };

    // Sync when user scrolls via other means (scrollbar, touch)
    const handleScroll = () => {
      if (!animationFrame.current) {
        currentScrollTop.current = element.scrollTop;
      }
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    element.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('scroll', handleScroll);
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [ref, enabled]);
}

/**
 * Creates a ref with smooth scrolling attached.
 * Use this when you don't have an existing ref.
 */
export function useSmoothScrollRef<T extends HTMLElement>(
  options: SmoothScrollOptions = {}
) {
  const ref = useRef<T>(null);
  useSmoothScroll(ref, options);
  return ref;
}

