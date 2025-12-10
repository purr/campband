/**
 * CampBand Content Script for Bandcamp Pages
 * Adds an "Open in CampBand" button on artist/album/track pages
 */

// WXT content script configuration
export default defineContentScript({
  matches: ['*://*.bandcamp.com/*'],
  excludeMatches: ['*://bandcamp.com/*'], // Exclude main site
  runAt: 'document_end',

  main() {
    console.log('[CampBand] Content script loaded on:', window.location.href);

    // Wait a bit for the page to fully render
    setTimeout(injectButton, 500);
  },
});

function injectButton() {
  // Check if button already exists
  if (document.getElementById('campband-open-button')) {
    return;
  }

  // Find the following-actions container (near the follow button)
  const followingActions = document.querySelector('.following-actions-wrapper');

  if (followingActions) {
    // Create the button container
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'campband-button-container';
    buttonContainer.style.cssText = `
      margin-top: 12px;
      display: flex;
      justify-content: center;
    `;

    // Create the button
    const button = createCampBandButton();
    buttonContainer.appendChild(button);

    // Insert after the following-actions-wrapper
    followingActions.parentNode?.insertBefore(buttonContainer, followingActions.nextSibling);
    console.log('[CampBand] Button injected near follow button');
    return;
  }

  // Try alternative location - bio container
  const bioContainer = document.getElementById('bio-container');
  if (bioContainer) {
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'campband-button-container';
    buttonContainer.style.cssText = `
      margin: 16px 0;
      display: flex;
      justify-content: center;
    `;

    const button = createCampBandButton();
    buttonContainer.appendChild(button);

    // Insert after band-name-location or at the start
    const bandNameLocation = bioContainer.querySelector('#band-name-location');
    if (bandNameLocation && bandNameLocation.nextSibling) {
      bandNameLocation.parentNode?.insertBefore(buttonContainer, bandNameLocation.nextSibling);
    } else {
      bioContainer.insertBefore(buttonContainer, bioContainer.firstChild);
    }
    console.log('[CampBand] Button injected in bio container');
    return;
  }

  // Try on album/track pages - near the title
  const nameSection = document.getElementById('name-section');
  if (nameSection) {
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'campband-button-container';
    buttonContainer.style.cssText = `
      margin: 12px 0;
    `;

    const button = createCampBandButton();
    buttonContainer.appendChild(button);
    nameSection.appendChild(buttonContainer);
    console.log('[CampBand] Button injected in name section');
    return;
  }

  console.log('[CampBand] Could not find suitable location for button');
}

function createCampBandButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = 'campband-open-button';
  button.type = 'button';

  // Style the button - clean and subtle
  button.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: #ebbcba;
    color: #191724;
    border: none;
    border-radius: 4px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  `;

  // Icon (music note)
  const icon = document.createElement('span');
  icon.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 18V5l12-2v13"/>
      <circle cx="6" cy="18" r="3"/>
      <circle cx="18" cy="16" r="3"/>
    </svg>
  `;
  icon.style.display = 'flex';
  icon.style.alignItems = 'center';

  const text = document.createElement('span');
  text.textContent = 'Open in CampBand';

  button.appendChild(icon);
  button.appendChild(text);

  // Hover effects
  button.addEventListener('mouseenter', () => {
    button.style.background = '#d4a5a3';
  });

  button.addEventListener('mouseleave', () => {
    button.style.background = '#ebbcba';
  });

  button.addEventListener('mousedown', () => {
    button.style.background = '#c4a7e7';
  });

  button.addEventListener('mouseup', () => {
    button.style.background = '#d4a5a3';
  });

  // Click handler - open the current page in CampBand
  button.addEventListener('click', async () => {
    const currentUrl = window.location.href;
    const pageType = detectPageType();

    console.log('[CampBand] Opening in CampBand:', currentUrl, pageType);

    try {
      // Send message to background script to open CampBand with this URL
      await browser.runtime.sendMessage({
        type: 'OPEN_IN_CAMPBAND',
        url: currentUrl,
        pageType,
      });
    } catch (error) {
      console.error('[CampBand] Failed to send message:', error);
    }
  });

  return button;
}

function detectPageType(): 'artist' | 'album' | 'track' {
  const path = window.location.pathname;

  if (path.includes('/track/')) {
    return 'track';
  }

  if (path.includes('/album/')) {
    return 'album';
  }

  // Default to artist page (root of subdomain)
  return 'artist';
}
