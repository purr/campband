/**
 * AudioElement - HTMLAudioElement wrapper
 *
 * Handles:
 * - Creating/finding audio elements in DOM
 * - Blob URL management
 * - Event listener attachment
 * - Hot reload persistence
 */

import type { AudioCallbacks, AudioElementConfig } from './types';

const DEFAULT_CONFIG: AudioElementConfig = {
  id: 'campband-audio-primary',
  preload: 'auto',
};

export class AudioElement {
  private audio: HTMLAudioElement | null = null;
  private blobUrl: string | null = null;
  private currentSrc: string | null = null;
  private config: AudioElementConfig;
  private callbacks: AudioCallbacks = {};
  private listenersBound = false;

  constructor(config: Partial<AudioElementConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize or find existing audio element
   */
  init(): HTMLAudioElement {
    // First, try to find an existing element with our ID
    const existing = document.getElementById(this.config.id) as HTMLAudioElement | null;

    if (existing) {
      this.audio = existing;
      this.currentSrc = existing.currentSrc || existing.src || null;
      if (existing.src?.startsWith('blob:')) {
        this.blobUrl = existing.src;
      }
    } else {
      // Create new element
      this.audio = new Audio();
      this.audio.id = this.config.id;
      this.audio.preload = this.config.preload || 'auto';
      this.audio.style.display = 'none';
      document.body.appendChild(this.audio);
    }

    // Ensure element is unmuted; volume is controlled via Web Audio graph gain
    this.audio.muted = false;

    return this.audio;
  }

  /**
   * Get the audio element (initializes if needed)
   */
  get(): HTMLAudioElement {
    if (!this.audio) {
      return this.init();
    }
    return this.audio;
  }

  /**
   * Check if audio element exists and is valid
   */
  isValid(): boolean {
    return !!(this.audio && document.body.contains(this.audio));
  }

  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: AudioCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
    this.bindListeners();
  }

  /**
   * Bind event listeners to audio element
   */
  private bindListeners(): void {
    if (!this.audio || this.listenersBound) return;

    const audio = this.audio;

    audio.addEventListener('play', () => this.callbacks.onPlay?.());
    audio.addEventListener('pause', () => this.callbacks.onPause?.());
    audio.addEventListener('ended', () => this.callbacks.onEnded?.());
    audio.addEventListener('timeupdate', () => {
      this.callbacks.onTimeUpdate?.(audio.currentTime, audio.duration || 0);
    });
    audio.addEventListener('durationchange', () => {
      if (audio.duration) {
        this.callbacks.onDurationChange?.(audio.duration);
      }
    });
    audio.addEventListener('error', () => {
      const error = audio.error;
      let message = 'Unknown playback error';
      if (error) {
        switch (error.code) {
          case MediaError.MEDIA_ERR_ABORTED: message = 'Playback aborted'; break;
          case MediaError.MEDIA_ERR_NETWORK: message = 'Network error - stream may have expired'; break;
          case MediaError.MEDIA_ERR_DECODE: message = 'Audio decode error'; break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: message = 'Audio format not supported'; break;
        }
      }
      this.callbacks.onError?.(message);
    });
    audio.addEventListener('loadstart', () => this.callbacks.onLoadStart?.());
    audio.addEventListener('canplay', () => this.callbacks.onCanPlay?.());

    this.listenersBound = true;
  }

  /**
   * Load audio from URL (fetches as blob for CORS bypass)
   * @returns Object with success status and error details if failed
   */
  async load(src: string, signal?: AbortSignal): Promise<{ success: boolean; expired?: boolean; error?: string }> {
    if (!this.audio) {
      this.init();
    }

    if (!this.audio || !src || !src.startsWith('http')) {
      return { success: false, error: 'Invalid source' };
    }

    // Already loaded this source
    if (this.currentSrc === src) {
      return { success: true };
    }

    // Clean up old blob
    this.revokeBlobUrl();

    this.currentSrc = src;
    this.callbacks.onLoadStart?.();

    try {
      const response = await fetch(src, { signal });
      if (!response.ok) {
        // 410 Gone = stream URL expired
        const expired = response.status === 410;
        const errorMsg = expired
          ? 'Stream URL expired'
          : `Failed to fetch audio: ${response.status}`;

        // Don't call onError for expired URLs - let caller handle refresh
        if (!expired) {
          this.callbacks.onError?.(errorMsg);
        }

        // Reset currentSrc so we can try again with fresh URL
        this.currentSrc = null;

        return { success: false, expired, error: errorMsg };
      }

      const blob = await response.blob();
      this.blobUrl = URL.createObjectURL(blob);
      this.audio.src = this.blobUrl;
      this.audio.load();
      return { success: true };
    } catch (error) {
      // Handle abort errors silently (happens during rapid track changes)
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { success: false, error: 'Aborted' };
      }
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Aborted' };
      }
      // Also catch "The operation was aborted" message
      if (error instanceof Error && error.message.includes('aborted')) {
        return { success: false, error: 'Aborted' };
      }
      console.error('[AudioElement] Load failed:', error);
      const errorMsg = error instanceof Error ? error.message : 'Load failed';
      this.callbacks.onError?.(errorMsg);

      // Reset currentSrc so we can retry
      this.currentSrc = null;

      return { success: false, error: errorMsg };
    }
  }

  /**
   * Load from pre-fetched blob
   */
  loadFromBlob(blob: Blob, src: string): void {
    if (!this.audio) {
      this.init();
    }

    if (!this.audio) return;

    this.revokeBlobUrl();
    this.currentSrc = src;
    this.blobUrl = URL.createObjectURL(blob);
    this.audio.src = this.blobUrl;
    this.audio.load();
  }

  /**
   * Play audio
   */
  async play(): Promise<void> {
    if (!this.audio) return;
    try {
      await this.audio.play();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      throw error;
    }
  }

  /**
   * Pause audio
   */
  pause(): void {
    this.audio?.pause();
  }

  /**
   * Stop and reset
   */
  stop(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.currentSrc = null;
    this.revokeBlobUrl();
  }

  /**
   * Seek to time
   */
  seek(time: number): void {
    if (!this.audio) return;
    this.audio.currentTime = Math.max(0, Math.min(time, this.audio.duration || 0));
  }

  /**
   * Get current state
   */
  isPlaying(): boolean {
    return this.audio ? !this.audio.paused : false;
  }

  getCurrentTime(): number {
    return this.audio?.currentTime ?? 0;
  }

  getDuration(): number {
    return this.audio?.duration ?? 0;
  }

  getCurrentSrc(): string | null {
    return this.currentSrc;
  }

  getBlobUrl(): string | null {
    return this.blobUrl;
  }

  /**
   * Set muted state
   */
  setMuted(muted: boolean): void {
    if (this.audio) this.audio.muted = muted;
  }

  isMuted(): boolean {
    return this.audio?.muted ?? false;
  }

  /**
   * Revoke blob URL to free memory
   */
  private revokeBlobUrl(): void {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }

  /**
   * Adopt an existing audio element from DOM
   */
  adopt(audio: HTMLAudioElement): void {
    this.audio = audio;
    audio.id = this.config.id;
    this.currentSrc = audio.currentSrc || audio.src || null;
    if (audio.src?.startsWith('blob:')) {
      this.blobUrl = audio.src;
    }
    audio.muted = false;
    this.listenersBound = false;
    this.bindListeners();
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.revokeBlobUrl();
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio.remove();
      this.audio = null;
    }
    this.callbacks = {};
    this.currentSrc = null;
    this.listenersBound = false;
  }
}

