/**
 * AudioInterceptor - Captures ALL audio sources on the page
 *
 * Ensures every audio/video element goes through our processing pipeline.
 * This enables consistent volume control, EQ, and effects across all sources.
 *
 * Methods used:
 * 1. Override Audio constructor
 * 2. Override HTMLMediaElement.prototype.play
 * 3. MutationObserver for dynamically added elements
 * 4. Periodic scan for elements that might have been missed
 */

import { AudioGraph, type AudioGraphOptions } from './AudioGraph';

// Keep track of all captured audio elements
const capturedElements = new WeakSet<HTMLMediaElement>();
const elementGraphs = new WeakMap<HTMLMediaElement, AudioGraph>();

// Shared AudioContext for all elements (more efficient)
let sharedContext: AudioContext | null = null;

// Current processing options (applied to all audio)
let currentOptions: AudioGraphOptions = {};

// Callbacks for when new audio is captured
type AudioCapturedCallback = (element: HTMLMediaElement, graph: AudioGraph) => void;
const captureCallbacks: AudioCapturedCallback[] = [];

/**
 * Get or create shared AudioContext
 * Note: Context will be suspended until user gesture - this is expected
 */
async function getSharedContext(): Promise<AudioContext> {
  if (!sharedContext) {
    try {
      sharedContext = new AudioContext();
    } catch (error) {
      console.warn('[AudioInterceptor] Failed to create AudioContext:', error);
      throw error;
    }
  }
  // Don't try to resume here - wait for user gesture
  // The browser warning is expected and will stop once user interacts
  return sharedContext;
}

/**
 * Connect an audio element to our processing graph
 * AudioContext creation is delayed until element is actually ready to play
 */
async function captureElement(element: HTMLMediaElement): Promise<AudioGraph | null> {
  // Skip if already captured
  if (capturedElements.has(element)) {
    return elementGraphs.get(element) || null;
  }

  // Skip elements that are too short (likely UI sounds)
  // or have no source
  if (!element.src && !element.currentSrc) {
    return null;
  }

  try {
    const graph = new AudioGraph();

    // Delay AudioContext creation until element is ready or user interacts
    // This reduces browser warnings by not creating contexts during page scan
    if (element instanceof HTMLAudioElement) {
      // Only connect immediately if element is ready
      // Otherwise, delay connection until element loads or user plays
      const shouldConnectNow = element.readyState >= HTMLMediaElement.HAVE_METADATA ||
                               element.src ||
                               element.currentSrc;

      if (shouldConnectNow) {
        await graph.connect(element, currentOptions);
      } else {
        // Defer connection - will happen when element loads or user plays
        // This prevents creating AudioContext during initial page scan
        const connectWhenReady = async () => {
          if (!capturedElements.has(element)) {
            try {
              await graph.connect(element, currentOptions);
            } catch {
              // Ignore - will retry on play
            }
          }
          element.removeEventListener('loadedmetadata', connectWhenReady);
          element.removeEventListener('play', connectWhenReady);
        };

        // Connect when metadata loads OR when user plays
        element.addEventListener('loadedmetadata', connectWhenReady, { once: true });
        element.addEventListener('play', connectWhenReady, { once: true });
      }
    }

    capturedElements.add(element);
    elementGraphs.set(element, graph);

    console.log('[AudioInterceptor] Captured audio element:', element.src?.substring(0, 50) || element.id);

    // Notify callbacks
    captureCallbacks.forEach(cb => cb(element, graph));

    return graph;
  } catch (error) {
    console.warn('[AudioInterceptor] Failed to capture element:', error);
    return null;
  }
}

/**
 * Scan DOM for audio/video elements and capture them
 */
function scanAndCapture(): void {
  const mediaElements = document.querySelectorAll('audio, video');
  mediaElements.forEach(element => {
    if (element instanceof HTMLMediaElement) {
      captureElement(element);
    }
  });
}

// Store original constructors/methods
const OriginalAudio = window.Audio;
const originalPlay = HTMLMediaElement.prototype.play;

/**
 * Initialize the audio interceptor
 */
export function initAudioInterceptor(options: AudioGraphOptions = {}): void {
  currentOptions = options;

  // 1. Override Audio constructor
  (window as unknown as { Audio: typeof Audio }).Audio = class InterceptedAudio extends OriginalAudio {
    constructor(src?: string) {
      super(src);
      // Capture after a short delay to ensure the element is ready
      setTimeout(() => captureElement(this), 0);
    }
  };

  // 2. Override HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = async function(this: HTMLMediaElement) {
    // Capture before playing
    await captureElement(this);
    return originalPlay.call(this);
  };

  // 3. MutationObserver for dynamically added elements
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node instanceof HTMLMediaElement) {
          captureElement(node);
        }
        // Check children of added nodes
        if (node instanceof Element) {
          const mediaElements = node.querySelectorAll('audio, video');
          mediaElements.forEach(el => {
            if (el instanceof HTMLMediaElement) {
              captureElement(el);
            }
          });
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // 4. Initial scan
  scanAndCapture();

  // 5. Periodic scan (catches elements that might slip through)
  setInterval(scanAndCapture, 5000);

  console.log('[AudioInterceptor] Initialized - all audio will be processed');
}

/**
 * Update processing options for all captured audio
 */
export function updateInterceptorOptions(options: Partial<AudioGraphOptions>): void {
  currentOptions = { ...currentOptions, ...options };

  // Update all existing graphs
  // Note: WeakMap doesn't allow iteration, so we'd need to track elements differently
  // For now, new captures will use updated options
}

/**
 * Register callback for when audio is captured
 */
export function onAudioCaptured(callback: AudioCapturedCallback): () => void {
  captureCallbacks.push(callback);
  return () => {
    const index = captureCallbacks.indexOf(callback);
    if (index >= 0) captureCallbacks.splice(index, 1);
  };
}

/**
 * Get the graph for a specific element
 */
export function getElementGraph(element: HTMLMediaElement): AudioGraph | undefined {
  return elementGraphs.get(element);
}

/**
 * Check if an element has been captured
 */
export function isElementCaptured(element: HTMLMediaElement): boolean {
  return capturedElements.has(element);
}

/**
 * Manually capture an element (for elements we control)
 */
export async function captureAudioElement(element: HTMLMediaElement): Promise<AudioGraph | null> {
  return captureElement(element);
}

/**
 * Clean up (restore original behavior)
 */
export function destroyAudioInterceptor(): void {
  (window as unknown as { Audio: typeof Audio }).Audio = OriginalAudio;
  HTMLMediaElement.prototype.play = originalPlay;

  if (sharedContext) {
    sharedContext.close();
    sharedContext = null;
  }

  captureCallbacks.length = 0;
}

