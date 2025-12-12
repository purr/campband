/**
 * CampBand Host Content Script
 *
 * Injects the full CampBand React app into the GitHub Pages host.
 * This allows the app to run in webpage context so other extensions
 * (like Auto-Stop) can detect the audio playback.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../app/App';
// Import CSS as raw string for injection into page
import globalsCss from '@/styles/globals.css?inline';

// Configuration: which hosts to inject on
const ALLOWED_HOSTS = [
  'purr.github.io',
];

export default defineContentScript({
  matches: [
    // GitHub Pages host
    'https://purr.github.io/campband/*',
  ],
  runAt: 'document_end',
  // Don't use cssInjectionMode - we'll inject CSS manually into the page

  async main(ctx) {
    const host = window.location.hostname;

    // Safety check - only run on allowed hosts
    if (!ALLOWED_HOSTS.some(allowed => host === allowed || host.endsWith('.' + allowed))) {
      console.warn('[CampBand] Host not allowed:', host);
      return;
    }

    console.log('[CampBand] Content script loaded on host page:', window.location.href);

    // Wait for DOM to be ready
    await waitForElement('#campband-root');

    // Mark body so landing page hides
    document.body.classList.add('campband-active');

    // Get the root element
    const rootElement = document.getElementById('campband-root');
    if (!rootElement) {
      console.error('[CampBand] Could not find #campband-root element');
      return;
    }

    // Inject styles into the page
    const styleElement = injectStyles();

    // Mount React app
    console.log('[CampBand] Mounting React app...');
    const root = createRoot(rootElement);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );

    console.log('[CampBand] App mounted successfully!');

    // Cleanup on context invalidation (extension reload/disable)
    ctx.onInvalidated(() => {
      console.log('[CampBand] Context invalidated, unmounting...');
      root.unmount();
      document.body.classList.remove('campband-active');
      styleElement?.remove();
    });
  },
});

/**
 * Wait for an element to exist in the DOM
 */
function waitForElement(selector: string, timeout = 5000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver((_mutations, obs) => {
      const el = document.querySelector(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // Timeout
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

/**
 * Inject the global styles into the page
 */
function injectStyles(): HTMLStyleElement | null {
  // Set up the root element to take full height
  const rootElement = document.getElementById('campband-root');
  if (rootElement) {
    rootElement.style.minHeight = '100vh';
  }

  // Hide the landing page content completely
  const landing = document.getElementById('install-landing');
  if (landing) {
    landing.style.display = 'none';
  }

  // Inject the global CSS into the page
  const style = document.createElement('style');
  style.id = 'campband-styles';
  style.textContent = globalsCss;
  document.head.appendChild(style);

  return style;
}

