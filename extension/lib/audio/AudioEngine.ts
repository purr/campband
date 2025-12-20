/**
 * AudioEngine - Main audio playback orchestrator
 *
 * Uses modular components:
 * - AudioGraph: Web Audio API processing (EQ, compressor, gain)
 * - AudioElement: HTMLAudioElement wrapper
 * - AudioCrossfade: Crossfade transitions
 *
 * ALL audio goes through the processing pipeline for consistent effects.
 */

import { AudioGraph, type EqSettings, type EqBand, EQ_PRESETS, type EqPresetName, DEFAULT_EQ_SETTINGS } from './AudioGraph';
import { AudioElement } from './AudioElement';
import type { AudioCallbacks, AudioSettings, AudioState } from './types';
import { DEFAULT_SETTINGS } from './types';

// Debug logging for song operations
const DEBUG_SONGS = false;

function logSong(...args: any[]) {
  if (DEBUG_SONGS) {
    console.log('[AudioEngine]', ...args);
  }
}

// Re-export for convenience
export { EQ_FREQUENCIES, EQ_PRESETS, DEFAULT_EQ_SETTINGS } from './AudioGraph';
export type { EqSettings, EqBand, EqPresetName } from './AudioGraph';

class AudioEngine {
  // Audio elements
  private primaryElement: AudioElement;
  private crossfadeElement: AudioElement;

  // Audio graphs (processing chains)
  private primaryGraph: AudioGraph;
  private crossfadeGraph: AudioGraph;

  // State
  private callbacks: AudioCallbacks = {};
  private settings: AudioSettings = { ...DEFAULT_SETTINGS };
  private eqSettings: EqSettings = { ...DEFAULT_EQ_SETTINGS };
  private volume = 1;
  private abortController: AbortController | null = null;

  // Crossfade state
  private isCrossfading = false;
  private crossfadeTriggered = false;
  private crossfadeInterval: ReturnType<typeof setInterval> | null = null;

  // Preload state
  private preloadedSrc: string | null = null;
  private preloadedBlob: Blob | null = null;

  constructor() {
    // Create audio elements
    this.primaryElement = new AudioElement({ id: 'campband-audio-primary' });
    this.crossfadeElement = new AudioElement({ id: 'campband-audio-crossfade' });

    // Create processing graphs
    this.primaryGraph = new AudioGraph();
    this.crossfadeGraph = new AudioGraph();

    // Initialize
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  private init(): void {
    // Initialize primary element
    const primary = this.primaryElement.init();

    // Initialize crossfade element
    this.crossfadeElement.init();

    // Set up event forwarding from primary element
    this.primaryElement.setCallbacks({
      onPlay: () => this.callbacks.onPlay?.(),
      onPause: () => {
        if (!this.isCrossfading) {
          this.callbacks.onPause?.();
        }
      },
      onEnded: () => {
        if (!this.isCrossfading) {
          this.crossfadeTriggered = false;
          this.callbacks.onEnded?.();
        }
      },
      onTimeUpdate: (time, duration) => {
        this.callbacks.onTimeUpdate?.(time, duration);
        this.checkCrossfadeTrigger();
      },
      onDurationChange: (duration) => this.callbacks.onDurationChange?.(duration),
      onError: (error) => this.callbacks.onError?.(error),
      onLoadStart: () => this.callbacks.onLoadStart?.(),
      onCanPlay: () => this.callbacks.onCanPlay?.(),
    });

    // Clean up any stray audio elements
    this.cleanupStrayElements();

    console.log('[AudioEngine] Initialized with modular architecture');
  }

  /**
   * Remove any audio elements that aren't ours
   */
  private cleanupStrayElements(): void {
    const allAudio = document.querySelectorAll('audio');
    for (const audio of allAudio) {
      const el = audio as HTMLAudioElement;
      if (el.id !== 'campband-audio-primary' && el.id !== 'campband-audio-crossfade') {
        console.warn('[AudioEngine] Removing stray audio element:', el.src?.substring(0, 50));
        el.pause();
        el.src = '';
        el.remove();
      }
    }
  }

  /**
   * Ensure audio is connected to processing graph
   */
  private async ensureGraphConnected(): Promise<void> {
    const audio = this.primaryElement.get();

    if (!this.primaryGraph.isConnected(audio)) {
      await this.primaryGraph.connect(audio, {
        volumeNormalization: this.settings.volumeNormalization,
        eq: this.eqSettings,
      });
      this.primaryGraph.setVolume(this.volume);
    }
  }

  /**
   * Check if crossfade should trigger
   */
  private checkCrossfadeTrigger(): void {
    if (this.crossfadeTriggered || this.isCrossfading) return;

    const duration = this.primaryElement.getDuration();
    const currentTime = this.primaryElement.getCurrentTime();
    const timeRemaining = duration - currentTime;

    if (this.settings.crossfadeEnabled) {
      const threshold = this.settings.crossfadeDuration;
      if (timeRemaining <= threshold && timeRemaining > 0.5) {
        this.crossfadeTriggered = true;
        this.callbacks.onCrossfadeStart?.();
      }
    } else if (this.settings.gaplessPlayback) {
      if (timeRemaining <= 0.3 && timeRemaining > 0.1) {
        this.crossfadeTriggered = true;
        this.callbacks.onCrossfadeStart?.();
      }
    }
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: AudioCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };

    // Resync with DOM in case of hot reload
    this.resyncWithDOM(true);

    // Re-apply EQ settings after hot reload (graph might have been reconnected)
    this.reapplyEqSettings();
  }

  /**
   * Re-apply EQ settings (used after hot reload)
   */
  private reapplyEqSettings(): void {
    // Force update EQ on both graphs
    this.primaryGraph.updateOptions({ eq: this.eqSettings });
    this.crossfadeGraph.updateOptions({ eq: this.eqSettings });
  }

  /**
   * Force reconnect audio graph (for hot-reload recovery)
   * This ensures the EQ and other processing is properly connected
   */
  async forceReconnect(): Promise<void> {
    // Don't interfere with ongoing crossfade
    if (this.isCrossfading) {
      console.log('[AudioEngine] Skipping force reconnect during crossfade');
      return;
    }

    const audio = this.primaryElement.get();

    // Force reconnection by passing current settings
    await this.primaryGraph.connect(audio, {
      volumeNormalization: this.settings.volumeNormalization,
      eq: this.eqSettings,
      initialVolume: this.volume,  // Preserve current volume
    });

    console.log('[AudioEngine] Force reconnected audio graph');
  }

  /**
   * Update audio settings
   */
  updateSettings(settings: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...settings };

    // Update graphs
    this.primaryGraph.updateOptions({
      volumeNormalization: this.settings.volumeNormalization,
    });
    this.crossfadeGraph.updateOptions({
      volumeNormalization: this.settings.volumeNormalization,
    });
  }

  /**
   * Update EQ settings
   */
  updateEqSettings(settings: Partial<EqSettings>): void {
    this.eqSettings = { ...this.eqSettings, ...settings };

    this.primaryGraph.updateOptions({ eq: this.eqSettings });
    this.crossfadeGraph.updateOptions({ eq: this.eqSettings });
  }

  /**
   * Set single EQ band
   */
  setEqBand(frequency: EqBand, gain: number): void {
    this.eqSettings.gains[frequency] = gain;
    this.primaryGraph.setEqBand(frequency, gain);
    this.crossfadeGraph.setEqBand(frequency, gain);
  }

  /**
   * Apply EQ preset
   */
  applyEqPreset(preset: EqPresetName): void {
    const presetGains = EQ_PRESETS[preset];
    this.eqSettings.gains = { ...presetGains } as Record<EqBand, number>;
    this.primaryGraph.applyPreset(preset);
    this.crossfadeGraph.applyPreset(preset);
  }

  /**
   * Enable/disable EQ
   */
  setEqEnabled(enabled: boolean): void {
    this.eqSettings.enabled = enabled;
    this.primaryGraph.setEqEnabled(enabled);
    this.crossfadeGraph.setEqEnabled(enabled);
  }

  /**
   * Get current EQ settings
   */
  getEqSettings(): EqSettings {
    return { ...this.eqSettings };
  }

  /**
   * Load a track
   * @param src - Stream URL
   * @param force - If true, always load. If false, skip if audio is already playing.
   * @returns Object with success status and whether stream URL expired (410)
   */
  async load(src: string, force = false): Promise<{ success: boolean; expired?: boolean; error?: string }> {
    logSong('LOAD START', { src: src.substring(0, 50), force, currentSrc: this.primaryElement.getCurrentSrc()?.substring(0, 50), isPlaying: this.primaryElement.isPlaying() });

    // Don't interrupt playing audio unless forced
    if (!force && this.primaryElement.isPlaying()) {
      logSong('LOAD SKIP - already playing');
      return { success: true }; // Already playing, consider it success
    }

    // Handle loading during crossfade
    if (this.isCrossfading) {
      logSong('LOAD during crossfade - completing swap');
      this.completeCrossfadeSwap();
      return { success: true };
    }

    // Abort any pending fetch
    if (this.abortController) {
      this.abortController.abort();
    }

    // Cancel ongoing crossfade
    this.cancelCrossfade();

    // Stop current playback
    logSong('LOAD - pausing current playback');
    this.primaryElement.pause();

    if (!src || !src.startsWith('http')) {
      logSong('LOAD ERROR - invalid source');
      return { success: false, error: 'Invalid source' };
    }

    // Skip if same source
    if (this.primaryElement.getCurrentSrc() === src) {
      logSong('LOAD SKIP - same source');
      return { success: true };
    }

      this.abortController = new AbortController();

      // Use preloaded blob if available
      if (this.preloadedSrc === src && this.preloadedBlob) {
        logSong('LOAD - using preloaded blob');
        this.primaryElement.loadFromBlob(this.preloadedBlob, src);
        this.preloadedBlob = null;
        this.preloadedSrc = null;
      this.crossfadeTriggered = false;
      logSong('LOAD SUCCESS - from preloaded blob');
      return { success: true };
      }

    logSong('LOAD - fetching and loading audio');
    const result = await this.primaryElement.load(src, this.abortController.signal);

    if (result.success) {
      this.crossfadeTriggered = false;
      logSong('LOAD SUCCESS', { src: src.substring(0, 50) });
    } else {
      logSong('LOAD FAILED', { error: result.error, expired: result.expired });
    }

    return result;
  }

  /**
   * Start playback
   */
  async play(): Promise<void> {
    logSong('PLAY START');
    await this.ensureGraphConnected();

    // CRITICAL: Resume AudioContext on first user gesture (play button)
    // This is when the browser allows audio to start
    const primaryContext = this.primaryGraph.getContextIfExists();
    if (primaryContext && primaryContext.state === 'suspended') {
      try {
        await primaryContext.resume();
        logSong('AudioContext resumed on play');
      } catch (error) {
        // Ignore - will resume on next attempt
      }
    }

    // Ensure graph volume is applied before play (fix loudness after hot reload)
    this.primaryGraph.setVolume(this.volume);
    this.primaryElement.get().volume = this.volume;
    await this.primaryElement.play();
    logSong('PLAY SUCCESS');
  }

  /**
   * Pause playback
   */
  pause(): void {
    this.primaryElement.pause();
  }

  /**
   * Stop and reset
   */
  stop(): void {
    this.primaryElement.stop();
    this.cancelCrossfade();
  }

  /**
   * Seek to time in seconds
   */
  seek(time: number): void {
    // Don't seek during crossfade (would break the transition)
    if (this.isCrossfading) {
      logSong('SEEK IGNORED - crossfade in progress');
      return;
    }

    const duration = this.primaryElement.getDuration();
    const clampedTime = Math.max(0, Math.min(time, duration || 0));

    logSong('SEEK', { time: clampedTime, duration, currentTime: this.primaryElement.getCurrentTime() });

    this.primaryElement.seek(clampedTime);
  }

  /**
   * Seek to percentage (0-100)
   */
  seekPercent(percent: number): void {
    const duration = this.primaryElement.getDuration();
    if (duration > 0) {
      this.seek(duration * (percent / 100));
    }
  }

  /**
   * Set volume (0-1)
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    // Apply to both graphs so crossfade audio is also attenuated
    this.primaryGraph.setVolume(this.volume);
    this.crossfadeGraph.setVolume(this.volume);
    // Keep HTMLAudioElements in sync (fallback/direct path safety)
    this.primaryElement.get().volume = this.volume;
    this.crossfadeElement.get().volume = this.volume;
  }

  /**
   * Get current volume
   */
  getVolume(): number {
    return this.volume;
  }

  /**
   * Set muted state
   */
  setMuted(muted: boolean): void {
    this.primaryElement.setMuted(muted);
  }

  /**
   * Check if muted
   */
  isMuted(): boolean {
    return this.primaryElement.isMuted();
  }

  /**
   * Check if playing
   */
  isPlaying(): boolean {
    return this.primaryElement.isPlaying();
  }

  /**
   * Get current playback time
   */
  getCurrentTime(): number {
    return this.primaryElement.getCurrentTime();
  }

  /**
   * Get track duration
   */
  getDuration(): number {
    return this.primaryElement.getDuration();
  }

  /**
   * Get current source URL
   */
  getCurrentSrc(): string | null {
    return this.primaryElement.getCurrentSrc();
  }

  /**
   * Get full state object
   */
  getState(): AudioState {
    return {
      isPlaying: this.isPlaying(),
      currentTime: this.getCurrentTime(),
      duration: this.getDuration(),
      src: this.getCurrentSrc(),
      volume: this.volume,
      muted: this.isMuted(),
    };
  }

  // ============================================
  // Crossfade
  // ============================================

  /**
   * Preload next track for gapless playback
   */
  async preloadNext(src: string): Promise<void> {
    if (!src || this.preloadedSrc === src) return;

    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
      this.preloadedBlob = await response.blob();
      this.preloadedSrc = src;
      console.log('[AudioEngine] Preloaded next track');
    } catch {
      this.preloadedBlob = null;
      this.preloadedSrc = null;
    }
  }

  /**
   * Crossfade to next track
   */
  async crossfadeTo(nextSrc: string): Promise<void> {
    logSong('CROSSFADE START', { nextSrc: nextSrc.substring(0, 50), currentSrc: this.primaryElement.getCurrentSrc()?.substring(0, 50) });

    if (this.isCrossfading) {
      logSong('CROSSFADE - canceling existing crossfade');
      this.cancelCrossfade(false);
    }

    await this.ensureGraphConnected();

    // Connect crossfade element to its graph (start at volume 0)
    const crossfadeAudio = this.crossfadeElement.get();
    if (!this.crossfadeGraph.isConnected(crossfadeAudio)) {
      logSong('CROSSFADE - connecting crossfade graph');
      await this.crossfadeGraph.connect(crossfadeAudio, {
        volumeNormalization: this.settings.volumeNormalization,
        eq: this.eqSettings,
        initialVolume: 0,  // Critical: start at 0 for crossfade
      });
    } else {
      // Already connected, but ensure volume is 0 before starting
      this.crossfadeGraph.setVolume(0);
    }

    this.isCrossfading = true;
    const duration = this.settings.crossfadeEnabled ? this.settings.crossfadeDuration : 0.1;
    logSong('CROSSFADE - duration', duration);

    try {
      // Load next track into crossfade element
      let blob: Blob;
      if (this.preloadedSrc === nextSrc && this.preloadedBlob) {
        logSong('CROSSFADE - using preloaded blob');
        blob = this.preloadedBlob;
        this.preloadedBlob = null;
        this.preloadedSrc = null;
      } else {
        logSong('CROSSFADE - fetching next track');
        const response = await fetch(nextSrc);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        blob = await response.blob();
      }

      logSong('CROSSFADE - loading blob into crossfade element');
      this.crossfadeElement.loadFromBlob(blob, nextSrc);

      // Wait for ready
      logSong('CROSSFADE - waiting for canplay');
      await new Promise<void>((resolve, reject) => {
        const audio = this.crossfadeElement.get();
        const onCanPlay = () => {
          audio.removeEventListener('canplay', onCanPlay);
          audio.removeEventListener('error', onError);
          logSong('CROSSFADE - canplay received');
          resolve();
        };
        const onError = () => {
          audio.removeEventListener('canplay', onCanPlay);
          audio.removeEventListener('error', onError);
          logSong('CROSSFADE - error loading');
          reject(new Error('Load failed'));
        };
        audio.addEventListener('canplay', onCanPlay);
        audio.addEventListener('error', onError);
      });

      // Set initial volumes
      this.crossfadeGraph.setVolume(0);
      this.primaryGraph.setVolume(this.volume);
      logSong('CROSSFADE - volumes set, starting playback');

      // Start playing crossfade track
      await this.crossfadeElement.play();
      logSong('CROSSFADE - crossfade track playing, starting fade');

      // Perform crossfade
      const startVolume = this.volume;
      const steps = Math.max(20, Math.round(duration * 20));
      const stepTime = (duration * 1000) / steps;
      let step = 0;

      await new Promise<void>((resolve) => {
        this.crossfadeInterval = setInterval(() => {
          if (!this.isCrossfading) {
            if (this.crossfadeInterval) {
              clearInterval(this.crossfadeInterval);
              this.crossfadeInterval = null;
            }
            resolve();
            return;
          }

          step++;
          const progress = step / steps;
          // Equal-power crossfade
          const fadeOut = Math.cos(progress * Math.PI / 2);
          const fadeIn = Math.sin(progress * Math.PI / 2);

          this.primaryGraph.setVolume(startVolume * fadeOut);
          this.crossfadeGraph.setVolume(startVolume * fadeIn);

          if (step >= steps) {
            if (this.crossfadeInterval) {
              clearInterval(this.crossfadeInterval);
              this.crossfadeInterval = null;
            }
            logSong('CROSSFADE - fade complete');
            resolve();
          }
        }, stepTime);
      });

      // Complete swap if still crossfading
      if (this.isCrossfading) {
        logSong('CROSSFADE - completing swap');
        this.completeCrossfadeSwap();
      }

      logSong('CROSSFADE SUCCESS');
    } catch (error) {
      logSong('CROSSFADE FAILED', error);
      console.error('[AudioEngine] Crossfade failed:', error);
      this.isCrossfading = false;
      this.crossfadeTriggered = false;
      throw error;
    }
  }

  /**
   * Complete crossfade swap (also used when skipping during crossfade)
   *
   * CRITICAL: Instead of swapping the actual HTMLAudioElement objects (which breaks
   * MediaElementSourceNode connections), we swap the variable references to the
   * AudioElement wrappers and AudioGraphs. This keeps the same underlying audio
   * sources connected to their graphs, preventing any pause or glitch.
   *
   * MOST CRITICAL: We do NOT pause the old primary until AFTER the swap is complete.
   * This ensures the crossfade audio continues playing without ANY interruption.
   */
  private completeCrossfadeSwap(): void {
    logSong('SWAP START');
    const swapStartTime = performance.now();

    if (this.crossfadeInterval) {
      clearInterval(this.crossfadeInterval);
      this.crossfadeInterval = null;
    }

    // Capture the current state before swap
    const crossfadeWasPlaying = this.crossfadeElement.isPlaying();
    const crossfadeAudio = this.crossfadeElement.get();
    const crossfadeCurrentTime = crossfadeAudio.currentTime;
    const primaryAudio = this.primaryElement.get();
    const primaryWasPlaying = this.primaryElement.isPlaying();

    logSong('SWAP - state', {
      crossfadeWasPlaying,
      crossfadeCurrentTime,
      primaryWasPlaying,
      crossfadePaused: crossfadeAudio.paused,
      primaryPaused: primaryAudio.paused
    });

    // CRITICAL: Swap FIRST, then stop old primary
    // This ensures the new primary (crossfade) continues playing without ANY gap
    const tempElement = this.primaryElement;
    this.primaryElement = this.crossfadeElement;
    this.crossfadeElement = tempElement;

    // Swap graphs (these are already connected to their respective HTMLAudioElements)
    const tempGraph = this.primaryGraph;
    this.primaryGraph = this.crossfadeGraph;
    this.crossfadeGraph = tempGraph;

    logSong('SWAP - elements and graphs swapped');

    // NOW stop old primary (which is now in crossfadeElement)
    // But do it asynchronously to not block the swap
    // The new primary (crossfadeAudio) should already be playing
    requestAnimationFrame(() => {
      this.crossfadeElement.pause();
      this.crossfadeElement.seek(0);
      logSong('SWAP - old primary stopped (async)');
    });

    // Reset volumes - the graphs are already connected to the correct audio elements
    this.primaryGraph.setVolume(this.volume);
    this.crossfadeGraph.setVolume(0);

    logSong('SWAP - volumes reset', { primaryVolume: this.volume, crossfadeVolume: 0 });

    // CRITICAL: Verify the new primary is still playing
    // The audio should continue seamlessly since we kept the same HTMLAudioElement
    if (crossfadeWasPlaying) {
      if (crossfadeAudio.paused) {
        logSong('SWAP WARNING - crossfade audio paused, resuming immediately');
        crossfadeAudio.play().catch((err) => {
          logSong('SWAP ERROR - failed to resume', err);
          console.warn('[AudioEngine] Failed to resume after swap:', err);
        });
      } else {
        logSong('SWAP - new primary is playing, no action needed');
      }
    }

    // Clear callbacks on old primary (now crossfadeElement) to prevent spam
    // This stops the old element from firing canplay events repeatedly
    this.crossfadeElement.setCallbacks({});

    // Update callbacks on new primary (this doesn't affect playback)
    this.primaryElement.setCallbacks({
      onPlay: () => this.callbacks.onPlay?.(),
      onPause: () => {
        if (!this.isCrossfading) {
          this.callbacks.onPause?.();
        }
      },
      onEnded: () => {
        if (!this.isCrossfading) {
          this.crossfadeTriggered = false;
          this.callbacks.onEnded?.();
        }
      },
      onTimeUpdate: (time, duration) => {
        this.callbacks.onTimeUpdate?.(time, duration);
        this.checkCrossfadeTrigger();
      },
      onDurationChange: (duration) => this.callbacks.onDurationChange?.(duration),
      onError: (error) => this.callbacks.onError?.(error),
      onLoadStart: () => this.callbacks.onLoadStart?.(),
      onCanPlay: () => this.callbacks.onCanPlay?.(),
    });

    this.isCrossfading = false;
    this.crossfadeTriggered = false;

    const swapDuration = performance.now() - swapStartTime;
    logSong('SWAP COMPLETE', { duration: `${swapDuration.toFixed(2)}ms`, crossfadeWasPlaying });

    // Sync UI immediately - audio should already be playing seamlessly
    if (crossfadeWasPlaying) {
      this.callbacks.onPlay?.();
    }
    this.callbacks.onDurationChange?.(this.getDuration());
    this.callbacks.onTimeUpdate?.(this.getCurrentTime(), this.getDuration());
  }

  /**
   * Cancel ongoing crossfade
   */
  cancelCrossfade(stopPrimary = true): void {
    if (this.crossfadeInterval) {
      clearInterval(this.crossfadeInterval);
      this.crossfadeInterval = null;
    }

    if (stopPrimary) {
      this.primaryElement.pause();
    }

    this.crossfadeElement.pause();
    this.crossfadeElement.seek(0);

    this.primaryGraph.setVolume(this.volume);
    this.crossfadeGraph.setVolume(0);

    this.isCrossfading = false;
    this.crossfadeTriggered = false;
  }

  // ============================================
  // Hot Reload Support
  // ============================================

  /**
   * Resync with DOM after hot reload
   */
  resyncWithDOM(force = false): void {
    if (!force && this.primaryElement.isValid() && this.isPlaying()) {
      return;
    }

    // Find best audio element in DOM
    const allAudio = document.querySelectorAll('audio');
    let bestCandidate: HTMLAudioElement | null = null;
    let bestScore = -1;

    for (const audio of allAudio) {
      let score = 0;
      if (!audio.paused) score += 100;
      if (audio.currentTime > 0) score += 50;
      if (audio.id === 'campband-audio-primary') score += 25;
      if (audio.src?.startsWith('blob:')) score += 10;
      if (audio.duration > 0 && !isNaN(audio.duration)) score += 5;

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = audio as HTMLAudioElement;
      }
    }

    if (bestCandidate && bestScore > 0) {
      this.primaryElement.adopt(bestCandidate);

      // Reconnect to graph and reapply volume/mute after hot reload
      this.primaryGraph.connect(bestCandidate, {
        volumeNormalization: this.settings.volumeNormalization,
        eq: this.eqSettings,
        initialVolume: this.volume,
      }).then(() => {
        // Force gain to current volume
        this.primaryGraph.setVolume(this.volume);
        // Keep element volume in sync; element is unmuted, gain controls loudness
        bestCandidate.volume = this.volume;
        this.primaryElement.setMuted(false);
      }).catch(console.warn);
    }

    // Find crossfade element
    const crossfadeEl = document.getElementById('campband-audio-crossfade') as HTMLAudioElement | null;
    if (crossfadeEl) {
      this.crossfadeElement.adopt(crossfadeEl);
      this.crossfadeGraph.connect(crossfadeEl, {
        volumeNormalization: this.settings.volumeNormalization,
        eq: this.eqSettings,
        initialVolume: 0,
      }).then(() => {
        this.crossfadeGraph.setVolume(0);
        crossfadeEl.volume = this.volume;
        this.crossfadeElement.setMuted(false);
      }).catch(console.warn);
    }
  }

  /**
   * Check if audio chain is connected
   */
  isAudioChainConnected(): boolean {
    return this.primaryGraph.hasContext() &&
           this.primaryGraph.isConnected(this.primaryElement.get());
  }

  /**
   * Destroy the engine
   */
  destroy(): void {
    if (this.abortController) this.abortController.abort();
    this.cancelCrossfade();

    this.primaryGraph.destroy();
    this.crossfadeGraph.destroy();
    this.primaryElement.destroy();
    this.crossfadeElement.destroy();

    this.callbacks = {};
  }
}

// ============================================
// Singleton Management
// ============================================

declare global {
  interface Window {
    __campband_audio_engine__?: AudioEngine;
  }
}

function getOrCreateAudioEngine(): AudioEngine {
  if (typeof window === 'undefined') {
    return new AudioEngine();
  }

  if (window.__campband_audio_engine__) {
    return window.__campband_audio_engine__;
  }

  window.__campband_audio_engine__ = new AudioEngine();
  return window.__campband_audio_engine__;
}

export const audioEngine = getOrCreateAudioEngine();
