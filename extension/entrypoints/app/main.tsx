import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@/styles/globals.css';

// Detect hot-reload and trigger full page refresh
if (import.meta.hot) {
  // Check if module was already loaded (indicates hot-reload)
  if ((window as any).__campband_module_loaded__) {
    console.log('[CampBand] Hot-reload detected (module reload) - refreshing page...');
    window.location.reload();
    // Exit early - the reload will happen
    throw new Error('Hot-reload refresh');
  }

  // Only set up listeners once - check if they're already set up
  if (!(window as any).__campband_hmr_listeners_setup__) {
    // Listen for HMR updates and refresh the page immediately
    import.meta.hot.on('vite:beforeUpdate', () => {
      console.log('[CampBand] Hot-reload detected - refreshing page...');
      window.location.reload();
    });

    // Also listen for any HMR update
    import.meta.hot.on('vite:afterUpdate', () => {
      console.log('[CampBand] Hot-reload update detected - refreshing page...');
      window.location.reload();
    });

    // Mark listeners as set up
    (window as any).__campband_hmr_listeners_setup__ = true;
  }

  // Mark module as loaded
  (window as any).__campband_module_loaded__ = true;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);

