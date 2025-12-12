/**
 * Centralized Request Handler
 *
 * All Bandcamp API requests go through this handler for:
 * - Consistent error handling
 * - Automatic retries with exponential backoff
 * - Rate limiting
 * - Logging
 */

import { proxyFetch } from './fetchProxy';

// Rate limiting: track last request time
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 100; // ms between requests

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 500; // ms

interface RequestOptions {
  /** Number of retries on failure (default: 3) */
  retries?: number;
  /** Whether to follow redirects and return final URL info */
  trackRedirects?: boolean;
}

interface RequestResult {
  html: string;
  finalUrl: string;
  wasRedirected: boolean;
}

/**
 * Make a request with automatic retry and rate limiting
 */
export async function request(url: string, options: RequestOptions = {}): Promise<RequestResult> {
  const { retries = MAX_RETRIES, trackRedirects = true } = options;

  // Rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
  }
  lastRequestTime = Date.now();

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        const retryDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        console.log(`[Request] Retry ${attempt}/${retries} after ${retryDelay}ms for:`, url);
        await delay(retryDelay);
      }

      console.log('[Request] Fetching:', url);
      const response = await proxyFetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const finalUrl = response.url;

      // Detect redirects
      let wasRedirected = false;
      if (trackRedirects) {
        const requestedPath = new URL(url).pathname.replace(/\/$/, '').toLowerCase();
        const finalPath = new URL(finalUrl).pathname.replace(/\/$/, '').toLowerCase();
        wasRedirected = requestedPath !== finalPath;

        if (wasRedirected) {
          console.log('[Request] Redirected:', requestedPath, '→', finalPath);
        }
      }

      return { html, finalUrl, wasRedirected };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[Request] Attempt ${attempt + 1} failed:`, lastError.message);

      // Don't retry on 4xx errors (client errors)
      if (lastError.message.includes('HTTP 4')) {
        break;
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${url}`);
}

/**
 * Fetch HTML from a URL (simple wrapper)
 */
export async function fetchHtml(url: string): Promise<string> {
  const result = await request(url, { trackRedirects: false });
  return result.html;
}

/**
 * Fetch HTML with redirect tracking
 */
export async function fetchHtmlWithRedirect(url: string): Promise<RequestResult> {
  return request(url, { trackRedirects: true });
}

/**
 * Build the /music URL for an artist from any Bandcamp URL
 * Always extracts base domain to ensure correct URL
 */
export function buildMusicUrl(artistUrl: string): string {
  const parsed = new URL(artistUrl);
  return `${parsed.protocol}//${parsed.hostname}/music`;
}

/**
 * Extract base artist URL from any Bandcamp URL
 */
export function getArtistBaseUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.hostname}`;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

