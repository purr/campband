/**
 * AudioEngine - Audio playback with crossfade support
 */

type AudioEventCallback = () => void;
type AudioProgressCallback = (currentTime: number, duration: number) => void;
type AudioErrorCallback = (error: string) => void;

interface AudioCallbacks {
  onPlay?: AudioEventCallback;
  onPause?: AudioEventCallback;
  onEnded?: AudioEventCallback;
  onTimeUpdate?: AudioProgressCallback;
  onDurationChange?: (duration: number) => void;
  onError?: AudioErrorCallback;
  onLoadStart?: AudioEventCallback;
  onCanPlay?: AudioEventCallback;
  onCrossfadeStart?: () => void;
}

interface AudioSettings {
  crossfadeEnabled: boolean;
  crossfadeDuration: number;
  equalizerEnabled: boolean;
  eqGains: number[];
}

class AudioEngine {
  // Primary audio element (always used)
  private audio: HTMLAudioElement | null = null;
  private currentBlobUrl: string | null = null;

  // Secondary audio for crossfade
  private crossfadeAudio: HTMLAudioElement | null = null;
  private crossfadeBlobUrl: string | null = null;
  private isCrossfading = false;
  private crossfadeInterval: ReturnType<typeof setInterval> | null = null;

  private callbacks: AudioCallbacks = {};
  private currentSrc: string | null = null;
  private abortController: AbortController | null = null;
  private crossfadeTriggered = false;

  private settings: AudioSettings = {
    crossfadeEnabled: false,
    crossfadeDuration: 4,
    equalizerEnabled: false,
    eqGains: [],
  };

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  private init() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.setupListeners(this.audio, true);

    // Create secondary audio for crossfade
    this.crossfadeAudio = new Audio();
    this.crossfadeAudio.preload = 'auto';
  }

  private setupListeners(audio: HTMLAudioElement, isPrimary: boolean) {
    if (!isPrimary) return;

    audio.addEventListener('play', () => this.callbacks.onPlay?.());
    audio.addEventListener('pause', () => {
      if (!this.isCrossfading) {
        this.callbacks.onPause?.();
      }
    });
    audio.addEventListener('ended', () => {
      if (!this.isCrossfading) {
        this.crossfadeTriggered = false;
        this.callbacks.onEnded?.();
      }
    });
    audio.addEventListener('timeupdate', () => {
      this.callbacks.onTimeUpdate?.(audio.currentTime, audio.duration || 0);
      this.checkCrossfade();
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
  }

  private checkCrossfade() {
    if (!this.audio || !this.settings.crossfadeEnabled || this.crossfadeTriggered || this.isCrossfading) return;

    const timeRemaining = this.audio.duration - this.audio.currentTime;
    const threshold = this.settings.crossfadeDuration;

    if (timeRemaining <= threshold && timeRemaining > 0.5) {
      this.crossfadeTriggered = true;
      this.callbacks.onCrossfadeStart?.();
    }
  }

  setCallbacks(callbacks: AudioCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  updateSettings(settings: AudioSettings) {
    this.settings = settings;
  }

  /**
   * Perform crossfade to a new track
   */
  async crossfadeTo(nextSrc: string): Promise<void> {
    if (!this.audio || !this.crossfadeAudio) return;

    this.isCrossfading = true;
    const duration = this.settings.crossfadeDuration;
    const currentAudio = this.audio;

    try {
      // Load next track into crossfade audio
      if (this.crossfadeBlobUrl) {
        URL.revokeObjectURL(this.crossfadeBlobUrl);
      }

      const response = await fetch(nextSrc);
      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

      const blob = await response.blob();
      this.crossfadeBlobUrl = URL.createObjectURL(blob);
      this.crossfadeAudio.src = this.crossfadeBlobUrl;
      this.crossfadeAudio.load();

      // Wait for it to be ready
      await new Promise<void>((resolve, reject) => {
        const onCanPlay = () => {
          this.crossfadeAudio!.removeEventListener('canplay', onCanPlay);
          this.crossfadeAudio!.removeEventListener('error', onError);
          resolve();
        };
        const onError = () => {
          this.crossfadeAudio!.removeEventListener('canplay', onCanPlay);
          this.crossfadeAudio!.removeEventListener('error', onError);
          reject(new Error('Load failed'));
        };
        this.crossfadeAudio!.addEventListener('canplay', onCanPlay);
        this.crossfadeAudio!.addEventListener('error', onError);
      });

      // Start crossfade audio at volume 0
      this.crossfadeAudio.volume = 0;
      await this.crossfadeAudio.play();

      // Fade volumes
      const startVolume = currentAudio.volume;
      const steps = 20;
      const stepTime = (duration * 1000) / steps;
      let step = 0;

      await new Promise<void>((resolve) => {
        this.crossfadeInterval = setInterval(() => {
          step++;
          const progress = step / steps;

          currentAudio.volume = startVolume * (1 - progress);
          this.crossfadeAudio!.volume = startVolume * progress;

          if (step >= steps) {
            if (this.crossfadeInterval) {
              clearInterval(this.crossfadeInterval);
              this.crossfadeInterval = null;
            }
            resolve();
          }
        }, stepTime);
      });

      // Crossfade complete - swap audios
      currentAudio.pause();
      currentAudio.currentTime = 0;

      // Swap: crossfadeAudio becomes the new primary
      const oldBlobUrl = this.currentBlobUrl;
      this.currentBlobUrl = this.crossfadeBlobUrl;
      this.crossfadeBlobUrl = oldBlobUrl;

      // Swap elements
      const oldAudio = this.audio;
      this.audio = this.crossfadeAudio;
      this.crossfadeAudio = oldAudio;

      // Set up listeners on new primary
      this.setupListeners(this.audio, true);

      // Update state
      this.currentSrc = nextSrc;
      this.audio.volume = startVolume;
      this.crossfadeTriggered = false;
      this.isCrossfading = false;

    } catch (error) {
      console.error('[AudioEngine] Crossfade failed:', error);
      this.isCrossfading = false;
      this.crossfadeTriggered = false;
      throw error;
    }
  }

  async load(src: string): Promise<void> {
    if (!this.audio) {
      this.init();
    }

    if (!this.audio) {
      throw new Error('Failed to initialize audio');
    }

    // Don't reload same source
    if (this.currentSrc === src) {
      return;
    }

    // Cancel pending fetch
    if (this.abortController) {
      this.abortController.abort();
    }

    // Cancel crossfade
    if (this.crossfadeInterval) {
      clearInterval(this.crossfadeInterval);
      this.crossfadeInterval = null;
    }
    this.isCrossfading = false;
    this.crossfadeTriggered = false;

    // Clean up old blob
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }

    this.currentSrc = src;
    this.callbacks.onLoadStart?.();

    try {
      this.abortController = new AbortController();

      const response = await fetch(src, { signal: this.abortController.signal });
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.status}`);
      }

      const blob = await response.blob();
      this.currentBlobUrl = URL.createObjectURL(blob);
      this.audio.src = this.currentBlobUrl;
      this.audio.load();

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('[AudioEngine] Load failed:', error);
      this.callbacks.onError?.(error instanceof Error ? error.message : 'Load failed');
      throw error;
    }
  }

  async play(): Promise<void> {
    if (!this.audio) return;

    try {
      await this.audio.play();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error('[AudioEngine] Play failed:', error);
      throw error;
    }
  }

  pause(): void {
    this.audio?.pause();
  }

  stop(): void {
    if (!this.audio) return;

    this.audio.pause();
    this.audio.currentTime = 0;
    this.currentSrc = null;
    this.crossfadeTriggered = false;
    this.isCrossfading = false;

    if (this.crossfadeInterval) {
      clearInterval(this.crossfadeInterval);
      this.crossfadeInterval = null;
    }

    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
  }

  seek(time: number): void {
    if (!this.audio) return;
    this.audio.currentTime = Math.max(0, Math.min(time, this.audio.duration || 0));
  }

  seekPercent(percent: number): void {
    if (!this.audio?.duration) return;
    this.seek(this.audio.duration * (percent / 100));
  }

  setVolume(volume: number): void {
    if (!this.audio) return;
    this.audio.volume = Math.max(0, Math.min(1, volume));
  }

  getVolume(): number {
    return this.audio?.volume ?? 1;
  }

  setMuted(muted: boolean): void {
    if (this.audio) this.audio.muted = muted;
  }

  isMuted(): boolean {
    return this.audio?.muted ?? false;
  }

  isPlaying(): boolean {
    return this.audio ? !this.audio.paused : false;
  }

  getCurrentTime(): number {
    return this.audio?.currentTime ?? 0;
  }

  getDuration(): number {
    return this.audio?.duration ?? 0;
  }

  destroy(): void {
    if (this.abortController) this.abortController.abort();
    if (this.crossfadeInterval) clearInterval(this.crossfadeInterval);

    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
    }

    if (this.crossfadeAudio) {
      this.crossfadeAudio.pause();
      this.crossfadeAudio.src = '';
    }

    if (this.currentBlobUrl) URL.revokeObjectURL(this.currentBlobUrl);
    if (this.crossfadeBlobUrl) URL.revokeObjectURL(this.crossfadeBlobUrl);

    this.callbacks = {};
    this.currentSrc = null;
  }
}

export const audioEngine = new AudioEngine();
