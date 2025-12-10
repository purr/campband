import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'extension',
  publicDir: 'extension/public',
  modules: ['@wxt-dev/module-react'],

  manifest: {
    name: 'CampBand',
    description: 'Modern Bandcamp client - A sleek alternative frontend for Bandcamp',
    permissions: ['storage', 'tabs'],
    host_permissions: [
      '*://*.bandcamp.com/*',
      'https://bandcamp.com/*',
      // Streaming servers (t1-t4.bcbits.com)
      '*://*.bcbits.com/*',
    ],

    // Extension icons
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      96: 'icon/96.png',
      128: 'icon/128.png',
    },

    // Firefox MV2 - browser action opens the app in a new tab when clicked
    browser_action: {
      default_title: 'Open CampBand',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
      },
    },

    // Firefox extension ID for Mozilla Add-ons (required for signing)
    // Format: email-like (name@domain) or UUID ({xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx})
    browser_specific_settings: {
      gecko: {
        id: 'campband@browser.extension',
        strict_min_version: '109.0',
      },
    },
  },

  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
