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
  private eventListeners: Array<{ event: string; handler: () => void }> = [];

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
   * Remove all event listeners
   */
  private removeListeners(): void {
    if (!this.audio || this.eventListeners.length === 0) return;

    const audio = this.audio;
    for (const { event, handler } of this.eventListeners) {
      audio.removeEventListener(event, handler);
    }
    this.eventListeners = [];
    this.listenersBound = false;
  }

  /**
   * Bind event listeners to audio element
   */
  private bindListeners(): void {
    if (!this.audio) return;

    // Remove old listeners first
    this.removeListeners();

    const audio = this.audio;

    const playHandler = () => this.callbacks.onPlay?.();
    const pauseHandler = () => this.callbacks.onPause?.();
    const endedHandler = () => this.callbacks.onEnded?.();
    const timeUpdateHandler = () => {
      this.callbacks.onTimeUpdate?.(audio.currentTime, audio.duration || 0);
    };
    const durationChangeHandler = () => {
      if (audio.duration) {
        this.callbacks.onDurationChange?.(audio.duration);
      }
    };
    const errorHandler = () => {
      const error = audio.error;
      let message = 'Unknown playback error';
      let errorCode = 'UNKNOWN';
      if (error) {
        switch (error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            // Abort errors are expected when cancelling loads - don't show as error
            message = 'Playback aborted';
            errorCode = 'MEDIA_ERR_ABORTED';
            // Don't call onError for abort - it's expected during load cancellation
            return;
          case MediaError.MEDIA_ERR_NETWORK:
            message = 'Network error - stream may have expired';
            errorCode = 'MEDIA_ERR_NETWORK';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            message = 'Audio decode error';
            errorCode = 'MEDIA_ERR_DECODE';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            message = 'Audio format not supported';
            errorCode = 'MEDIA_ERR_SRC_NOT_SUPPORTED';
            break;
        }
      }

      console.error('[AudioElement] ERROR EVENT', {
        errorCode,
        message,
        currentSrc: audio.currentSrc?.substring(0, 50),
        src: audio.src?.substring(0, 50),
        currentTime: audio.currentTime,
        duration: audio.duration,
        readyState: audio.readyState,
        networkState: audio.networkState,
        paused: audio.paused,
        error: error ? {
          code: error.code,
          message: error.message
        } : null
      });

      this.callbacks.onError?.(message);
    };
    const loadStartHandler = () => this.callbacks.onLoadStart?.();
    const canPlayHandler = () => this.callbacks.onCanPlay?.();

    audio.addEventListener('play', playHandler);
    audio.addEventListener('pause', pauseHandler);
    audio.addEventListener('ended', endedHandler);
    audio.addEventListener('timeupdate', timeUpdateHandler);
    audio.addEventListener('durationchange', durationChangeHandler);
    audio.addEventListener('error', errorHandler);
    audio.addEventListener('loadstart', loadStartHandler);
    audio.addEventListener('canplay', canPlayHandler);

    // Store listeners for later removal
    this.eventListeners = [
      { event: 'play', handler: playHandler },
      { event: 'pause', handler: pauseHandler },
      { event: 'ended', handler: endedHandler },
      { event: 'timeupdate', handler: timeUpdateHandler },
      { event: 'durationchange', handler: durationChangeHandler },
      { event: 'error', handler: errorHandler },
      { event: 'loadstart', handler: loadStartHandler },
      { event: 'canplay', handler: canPlayHandler },
    ];

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
      // Check for abort in multiple ways
      const isAbort =
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError') ||
        (error instanceof Error && error.message.toLowerCase().includes('aborted')) ||
        (error instanceof Error && error.message.toLowerCase().includes('abort'));

      if (isAbort) {
        // Don't log or call onError for abort - it's expected
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
    this.removeListeners();
    this.revokeBlobUrl();
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio.remove();
      this.audio = null;
    }
    this.callbacks = {};
    this.currentSrc = null;
  }
}

