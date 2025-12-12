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

/**
 * Fetch that works in both extension and content script contexts
 * In content script context, routes through background script to bypass CORS
 */
export async function proxyFetch(url: string, options?: RequestInit): Promise<Response> {
  if (!isContentScriptContext()) {
    // Direct fetch in extension context
    return fetch(url, options);
  }

  // In content script - proxy through background
  const response = await browser.runtime.sendMessage({
    type: 'PROXY_FETCH',
    url,
    options: options ? {
      method: options.method,
      headers: options.headers,
      body: options.body,
    } : undefined,
  });

  if ('error' in response) {
    throw new Error(response.error);
  }

  // Create a Response-like object from the proxied data
  return new ProxiedResponse(response);
}

/**
 * Response wrapper for proxied fetch results
 * Implements the Response interface methods we need
 */
class ProxiedResponse implements Pick<Response, 'ok' | 'status' | 'statusText' | 'url' | 'text' | 'json'> {
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

