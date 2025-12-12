/**
 * AudioCrossfade - Crossfade and gapless playback logic
 *
 * Handles:
 * - Smooth crossfade transitions between tracks
 * - Gapless playback (instant switch)
 * - Pre-loading next track
 * - Swapping audio elements mid-crossfade
 */

import type { AudioSettings } from './types';
import { AudioElement } from './AudioElement';
import { AudioGraph } from './AudioGraph';

export interface CrossfadeState {
  isActive: boolean;
  triggered: boolean;
}

export class AudioCrossfade {
  private primaryElement: AudioElement;
  private secondaryElement: AudioElement;
  private primaryGraph: AudioGraph;
  private secondaryGraph: AudioGraph;

  private settings: AudioSettings;
  private volume = 1;

  private isActive = false;
  private triggered = false;
  private interval: ReturnType<typeof setInterval> | null = null;

  // Preloaded next track
  private preloadedSrc: string | null = null;
  private preloadedBlob: Blob | null = null;

  // Callbacks
  private onCrossfadeStart?: () => void;
  private onSwapComplete?: () => void;

  constructor(
    primaryElement: AudioElement,
    secondaryElement: AudioElement,
    primaryGraph: AudioGraph,
    secondaryGraph: AudioGraph,
    settings: AudioSettings
  ) {
    this.primaryElement = primaryElement;
    this.secondaryElement = secondaryElement;
    this.primaryGraph = primaryGraph;
    this.secondaryGraph = secondaryGraph;
    this.settings = settings;
  }

  /**
   * Set callbacks for crossfade events
   */
  setCallbacks(callbacks: {
    onCrossfadeStart?: () => void;
    onSwapComplete?: () => void;
  }): void {
    this.onCrossfadeStart = callbacks.onCrossfadeStart;
    this.onSwapComplete = callbacks.onSwapComplete;
  }

  /**
   * Update settings
   */
  updateSettings(settings: AudioSettings): void {
    this.settings = settings;
  }

  /**
   * Set the current volume for fade calculations
   */
  setVolume(volume: number): void {
    this.volume = volume;
  }

  /**
   * Check if crossfade should start based on time remaining
   */
  checkTrigger(timeRemaining: number): boolean {
    if (this.triggered || this.isActive) return false;

    if (this.settings.crossfadeEnabled) {
      const threshold = this.settings.crossfadeDuration;
      if (timeRemaining <= threshold && timeRemaining > 0.5) {
        this.triggered = true;
        this.onCrossfadeStart?.();
        return true;
      }
    } else if (this.settings.gaplessPlayback) {
      if (timeRemaining <= 0.3 && timeRemaining > 0.1) {
        this.triggered = true;
        this.onCrossfadeStart?.();
        return true;
      }
    }

    return false;
  }

  /**
   * Pre-load the next track for gapless playback
   */
  async preloadNext(src: string): Promise<void> {
    if (!src || this.preloadedSrc === src) return;

    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
      this.preloadedBlob = await response.blob();
      this.preloadedSrc = src;
    } catch {
      this.preloadedBlob = null;
      this.preloadedSrc = null;
    }
  }

  /**
   * Start crossfade to next track
   */
  async crossfadeTo(nextSrc: string): Promise<void> {
    // Cancel any existing crossfade
    if (this.isActive) {
      this.cancel(false);
    }

    this.isActive = true;
    const duration = this.settings.crossfadeEnabled ? this.settings.crossfadeDuration : 0.1;

    try {
      // Load the next track into secondary element
      let blob: Blob;
      if (this.preloadedSrc === nextSrc && this.preloadedBlob) {
        blob = this.preloadedBlob;
        this.preloadedBlob = null;
        this.preloadedSrc = null;
      } else {
        const response = await fetch(nextSrc);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        blob = await response.blob();
      }

      this.secondaryElement.loadFromBlob(blob, nextSrc);

      // Wait for it to be ready
      await new Promise<void>((resolve, reject) => {
        const audio = this.secondaryElement.get();
        const onCanPlay = () => {
          audio.removeEventListener('canplay', onCanPlay);
          audio.removeEventListener('error', onError);
          resolve();
        };
        const onError = () => {
          audio.removeEventListener('canplay', onCanPlay);
          audio.removeEventListener('error', onError);
          reject(new Error('Load failed'));
        };
        audio.addEventListener('canplay', onCanPlay);
        audio.addEventListener('error', onError);
      });

      // Set secondary gain to 0 before playing
      const secondaryGain = this.secondaryGraph.getGainNode();
      if (secondaryGain) {
        secondaryGain.gain.value = 0;
      }

      // Ensure primary is at full volume
      const primaryGain = this.primaryGraph.getGainNode();
      if (primaryGain) {
        primaryGain.gain.value = this.volume;
      }

      // Start playing secondary
      await this.secondaryElement.play();

      // Perform the crossfade
      const startVolume = this.volume;
      const steps = Math.max(20, Math.round(duration * 20));
      const stepTime = (duration * 1000) / steps;
      let step = 0;

      await new Promise<void>((resolve) => {
        this.interval = setInterval(() => {
          if (!this.isActive) {
            if (this.interval) {
              clearInterval(this.interval);
              this.interval = null;
            }
            resolve();
            return;
          }

          step++;
          const progress = step / steps;
          // Use sine/cosine for smooth equal-power crossfade
          const fadeOut = Math.cos(progress * Math.PI / 2);
          const fadeIn = Math.sin(progress * Math.PI / 2);

          if (primaryGain) {
            primaryGain.gain.value = startVolume * fadeOut;
          }
          if (secondaryGain) {
            secondaryGain.gain.value = startVolume * fadeIn;
          }

          if (step >= steps) {
            if (this.interval) {
              clearInterval(this.interval);
              this.interval = null;
            }
            resolve();
          }
        }, stepTime);
      });

      // Complete the swap if still active
      if (this.isActive) {
        this.completeSwap();
      }

    } catch (error) {
      console.error('[AudioCrossfade] Crossfade failed:', error);
      this.isActive = false;
      this.triggered = false;
      throw error;
    }
  }

  /**
   * Complete the element swap (called after crossfade or when skipping)
   */
  completeSwap(): void {
    // Stop the interval if running
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    // Stop the old primary
    this.primaryElement.pause();
    this.primaryElement.seek(0);

    // Swap the elements and graphs
    const tempElement = this.primaryElement;
    this.primaryElement = this.secondaryElement;
    this.secondaryElement = tempElement;

    const tempGraph = this.primaryGraph;
    this.primaryGraph = this.secondaryGraph;
    this.secondaryGraph = tempGraph;

    // Set gain levels
    const primaryGain = this.primaryGraph.getGainNode();
    const secondaryGain = this.secondaryGraph.getGainNode();
    if (primaryGain) primaryGain.gain.value = this.volume;
    if (secondaryGain) secondaryGain.gain.value = 0;

    // Reset state
    this.isActive = false;
    this.triggered = false;

    this.onSwapComplete?.();
  }

  /**
   * Cancel ongoing crossfade
   */
  cancel(stopPrimary = true): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    if (stopPrimary) {
      this.primaryElement.pause();
    }

    this.secondaryElement.pause();
    this.secondaryElement.seek(0);

    // Reset gains
    const primaryGain = this.primaryGraph.getGainNode();
    const secondaryGain = this.secondaryGraph.getGainNode();
    if (primaryGain) primaryGain.gain.value = this.volume;
    if (secondaryGain) secondaryGain.gain.value = 0;

    this.isActive = false;
    this.triggered = false;
  }

  /**
   * Get current state
   */
  getState(): CrossfadeState {
    return {
      isActive: this.isActive,
      triggered: this.triggered,
    };
  }

  /**
   * Reset trigger flag (for when a new track is loaded)
   */
  resetTrigger(): void {
    this.triggered = false;
  }

  /**
   * Get the current primary element
   */
  getPrimaryElement(): AudioElement {
    return this.primaryElement;
  }

  /**
   * Get the current secondary element
   */
  getSecondaryElement(): AudioElement {
    return this.secondaryElement;
  }

  /**
   * Check if currently crossfading
   */
  isCrossfading(): boolean {
    return this.isActive;
  }
}

