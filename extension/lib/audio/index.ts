// Main audio engine
export { audioEngine, EQ_FREQUENCIES, EQ_PRESETS, DEFAULT_EQ_SETTINGS } from './AudioEngine';
export type { EqSettings, EqBand, EqPresetName } from './AudioEngine';

// Modular components
export { AudioGraph } from './AudioGraph';
export { AudioElement } from './AudioElement';
export { AudioCrossfade } from './AudioCrossfade';

// Audio interceptor (captures ALL audio on page)
export { 
  initAudioInterceptor, 
  updateInterceptorOptions,
  onAudioCaptured,
  getElementGraph,
  isElementCaptured,
  captureAudioElement,
  destroyAudioInterceptor,
} from './AudioInterceptor';

// Types
export * from './types';

