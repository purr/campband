// GitHub Pages host URL for the CampBand app
const CAMPBAND_HOST_URL = 'https://purr.github.io/campband/';

export default defineBackground(() => {
  console.log('[CampBand] Background script loaded');

  // Open the app in a new tab when the extension icon is clicked
  // Use browserAction for MV2 (Firefox)
  browser.browserAction.onClicked.addListener(async () => {
    console.log('[CampBand] Extension icon clicked');
    await openCampBandTab();
  });

  // Handle messages from content scripts or newtab
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Don't log every message (can be spammy with PROXY_FETCH)
    if (message.type !== 'PROXY_FETCH') {
      console.log('[CampBand] Message received:', message);
    }

    if (message.type === 'OPEN_IN_CAMPBAND') {
      handleOpenInCampBand(message.url, message.pageType);
      sendResponse({ success: true });
      return true;
    }

    // Proxy fetch requests from content scripts (to bypass CORS)
    if (message.type === 'PROXY_FETCH') {
      handleProxyFetch(message.url, message.options)
        .then(sendResponse)
        .catch((error) => sendResponse({ error: error.message }));
      return true; // Keep channel open for async response
    }

    return true; // Keep the message channel open for async response
  });
});

// Use local storage for Firefox MV2 compatibility (session storage isn't available)
const storageArea = browser.storage.local;

/**
 * Open or focus the CampBand tab
 * Uses GitHub Pages host for production (allows other extensions to detect audio)
 * Falls back to extension page if host is unreachable
 */
async function openCampBandTab(hash?: string): Promise<browser.Tabs.Tab> {
  const hostUrl = CAMPBAND_HOST_URL;
  const extensionUrl = browser.runtime.getURL('/app.html');
  
  const tabs = await browser.tabs.query({});
  
  // Check for existing CampBand tab (either host or extension page)
  const existingHostTab = tabs.find(tab => tab.url?.startsWith(hostUrl));
  const existingExtTab = tabs.find(tab => tab.url?.startsWith(extensionUrl));
  const existingTab = existingHostTab || existingExtTab;

  if (existingTab && existingTab.id) {
    // Focus existing tab and optionally update hash
    const baseUrl = existingTab.url?.startsWith(hostUrl) ? hostUrl : extensionUrl;
    if (hash) {
      await browser.tabs.update(existingTab.id, {
        active: true,
        url: `${baseUrl}${hash}`,
      });
    } else {
      await browser.tabs.update(existingTab.id, { active: true });
    }

    if (existingTab.windowId) {
      await browser.windows.update(existingTab.windowId, { focused: true });
    }

    return existingTab;
  } else {
    // Create new tab - use host URL (content script will inject the app)
    const url = hash ? `${hostUrl}${hash}` : hostUrl;
    return await browser.tabs.create({ url });
  }
}

/**
 * Handle opening a Bandcamp URL in CampBand
 */
async function handleOpenInCampBand(url: string, pageType: 'artist' | 'album' | 'track') {
  console.log(`[CampBand] Opening ${pageType}: ${url}`);

  // Store the URL to navigate to
  // The app will read this and navigate accordingly
  await storageArea.set({
    pendingNavigation: {
      url,
      pageType,
      timestamp: Date.now(),
    },
  });

  // Open or focus the CampBand tab
  await openCampBandTab();
}

/**
 * Proxy fetch requests from content scripts
 * This is needed because content scripts on purr.github.io cannot directly
 * fetch from bandcamp.com due to CORS restrictions.
 * The background script has host_permissions and can make these requests.
 */
async function handleProxyFetch(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; status: number; statusText: string; text: string; url: string } | { error: string }> {
  try {
    console.log('[CampBand] Proxying fetch:', url);
    const response = await fetch(url, options);
    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      text,
      url: response.url, // Final URL after redirects
    };
  } catch (error) {
    console.error('[CampBand] Proxy fetch error:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
