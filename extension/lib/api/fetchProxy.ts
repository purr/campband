/**
 * Fetch Proxy Utility
 *
 * Detects whether we're running in an extension page or content script context,
 * and routes fetch requests accordingly.
 *
 * - Extension page: Direct fetch (has host_permissions)
 * - Content script: Proxy through background script (to bypass CORS)
 */

/**
 * Check if we're running in a content script context
 * (i.e., on a regular webpage, not an extension page)
 */
function isContentScriptContext(): boolean {
  // Extension pages have moz-extension:// or chrome-extension:// protocol
  const protocol = window.location.protocol;
  return !protocol.startsWith('moz-extension') && !protocol.startsWith('chrome-extension');
}

/** Minimal response interface for our needs */
interface ProxyResponse {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

/**
 * Fetch that works in both extension and content script contexts
 * In content script context, routes through background script to bypass CORS
 * Always bypasses browser cache to ensure fresh data
 */
export async function proxyFetch(url: string, options?: RequestInit): Promise<ProxyResponse> {
  if (!isContentScriptContext()) {
    // Direct fetch in extension context - bypass cache for fresh data
    return fetch(url, {
      ...options,
      cache: 'no-store',
      redirect: 'follow',
    });
  }

  // In content script - proxy through background
  try {
    const response = await browser.runtime.sendMessage({
      type: 'PROXY_FETCH',
      url,
      options: options ? {
        method: options.method,
        headers: options.headers,
        body: options.body,
      } : undefined,
    });

    // Check if we got an error response
    if (!response) {
      throw new Error('No response from background script. Make sure the extension background script is loaded.');
    }

    if ('error' in response) {
      throw new Error(response.error);
    }

    // Create a Response-like object from the proxied data
    return new ProxiedResponse(response);
  } catch (error) {
    // Handle connection errors (background script not available)
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Could not establish connection') ||
        errorMessage.includes('Receiving end does not exist') ||
        errorMessage.includes('Extension context invalidated')) {
      console.error('[CampBand] Background script connection error:', errorMessage);
      throw new Error('Background script is not available. Please reload the extension.');
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Response wrapper for proxied fetch results
 */
class ProxiedResponse implements ProxyResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  private _text: string;

  constructor(data: { ok: boolean; status: number; statusText: string; text: string; url: string }) {
    this.ok = data.ok;
    this.status = data.status;
    this.statusText = data.statusText;
    this.url = data.url;
    this._text = data.text;
  }

  async text(): Promise<string> {
    return this._text;
  }

  async json(): Promise<unknown> {
    return JSON.parse(this._text);
  }
}

