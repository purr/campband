export default defineBackground(() => {
  console.log('[CampBand] Background script loaded');

  // Open the app in a new tab when the extension icon is clicked
  // Use browserAction for MV2 (Firefox)
  browser.browserAction.onClicked.addListener(async () => {
    console.log('[CampBand] Extension icon clicked');
    await openCampBandTab();
  });

  // Handle messages from content scripts or newtab
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log('[CampBand] Message received:', message);

    if (message.type === 'OPEN_IN_CAMPBAND') {
      handleOpenInCampBand(message.url, message.pageType);
      sendResponse({ success: true });
    }

    return true; // Keep the message channel open for async response
  });
});

// Use local storage for Firefox MV2 compatibility (session storage isn't available)
const storageArea = browser.storage.local;

/**
 * Open or focus the CampBand tab
 */
async function openCampBandTab(hash?: string): Promise<browser.Tabs.Tab> {
  const extensionUrl = browser.runtime.getURL('/app.html');
  const tabs = await browser.tabs.query({});
  const existingTab = tabs.find(tab => tab.url?.startsWith(extensionUrl));

  if (existingTab && existingTab.id) {
    // Focus existing tab and optionally update hash
    if (hash) {
      await browser.tabs.update(existingTab.id, {
        active: true,
        url: `${extensionUrl}${hash}`,
      });
    } else {
      await browser.tabs.update(existingTab.id, { active: true });
    }

    if (existingTab.windowId) {
      await browser.windows.update(existingTab.windowId, { focused: true });
    }

    return existingTab;
  } else {
    // Create new tab
    const url = hash ? `${extensionUrl}${hash}` : extensionUrl;
    return await browser.tabs.create({ url });
  }
}

/**
 * Handle opening a Bandcamp URL in CampBand
 */
async function handleOpenInCampBand(url: string, pageType: 'artist' | 'album' | 'track') {
  console.log(`[CampBand] Opening ${pageType}: ${url}`);

  // Store the URL to navigate to
  // The newtab app will read this and navigate accordingly
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
