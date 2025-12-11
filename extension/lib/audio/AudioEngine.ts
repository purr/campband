/**
 * AudioEngine - Full-featured audio playback with Web Audio API
 * 
 * Features:
 * - Crossfade between tracks
 * - 10-band Equalizer
 * - Volume Normalization (via compressor)
 * - Mono Audio mixing
 * - Gapless Playback
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
  volumeNormalization: boolean;
  monoAudio: boolean;
  gaplessPlayback: boolean;
}

// Standard 10-band EQ frequencies
const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

class AudioEngine {
  // Audio Context (Web Audio API)
  private audioContext: AudioContext | null = null;
  
  // Primary audio element
  private audio: HTMLAudioElement | null = null;
  private currentBlobUrl: string | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;

  // Secondary audio for crossfade/gapless
  private crossfadeAudio: HTMLAudioElement | null = null;
  private crossfadeBlobUrl: string | null = null;
  private crossfadeSourceNode: MediaElementAudioSourceNode | null = null;
  private isCrossfading = false;
  private crossfadeInterval: ReturnType<typeof setInterval> | null = null;

  // EQ filter nodes (10 bands)
  private eqFilters: BiquadFilterNode[] = [];
  private crossfadeEqFilters: BiquadFilterNode[] = [];
  
  // Gain nodes for volume control
  private gainNode: GainNode | null = null;
  private crossfadeGainNode: GainNode | null = null;
  
  // Compressor for volume normalization
  private compressorNode: DynamicsCompressorNode | null = null;
  private crossfadeCompressorNode: DynamicsCompressorNode | null = null;
  
  // Channel merger for mono audio
  private channelMerger: ChannelMergerNode | null = null;
  private channelSplitter: ChannelSplitterNode | null = null;
  private monoGainL: GainNode | null = null;
  private monoGainR: GainNode | null = null;

  private callbacks: AudioCallbacks = {};
  private currentSrc: string | null = null;
  private abortController: AbortController | null = null;
  private crossfadeTriggered = false;
  
  // Preloaded next track for gapless
  private preloadedNextSrc: string | null = null;
  private preloadedBlob: Blob | null = null;

  private settings: AudioSettings = {
    crossfadeEnabled: true,
    crossfadeDuration: 4,
    equalizerEnabled: false,
    eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    volumeNormalization: false,
    monoAudio: false,
    gaplessPlayback: true,
  };

  // Track current volume for crossfade
  private currentVolume = 1;

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  private init() {
    // Create audio elements
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.crossfadeAudio = new Audio();
    this.crossfadeAudio.preload = 'auto';

    // Audio context will be created on first user interaction
    // (browsers require user gesture to start AudioContext)
  }

  /**
   * Initialize or resume AudioContext (must be called after user interaction)
   */
  private async ensureAudioContext(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.setupAudioGraph();
    }
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Set up the Web Audio API processing graph
   */
  private setupAudioGraph() {
    if (!this.audioContext || !this.audio || !this.crossfadeAudio) return;

    // Create source nodes
    this.sourceNode = this.audioContext.createMediaElementSource(this.audio);
    this.crossfadeSourceNode = this.audioContext.createMediaElementSource(this.crossfadeAudio);

    // Create processing nodes for primary audio
    this.eqFilters = this.createEqFilters();
    this.gainNode = this.audioContext.createGain();
    this.compressorNode = this.createCompressor();

    // Create processing nodes for crossfade audio
    this.crossfadeEqFilters = this.createEqFilters();
    this.crossfadeGainNode = this.audioContext.createGain();
    this.crossfadeCompressorNode = this.createCompressor();

    // Create mono processing nodes (shared)
    this.channelSplitter = this.audioContext.createChannelSplitter(2);
    this.channelMerger = this.audioContext.createChannelMerger(2);
    this.monoGainL = this.audioContext.createGain();
    this.monoGainR = this.audioContext.createGain();

    // Connect the audio graph
    this.connectAudioGraph();
  }

  /**
   * Create 10-band EQ filters
   */
  private createEqFilters(): BiquadFilterNode[] {
    if (!this.audioContext) return [];

    return EQ_FREQUENCIES.map((freq, index) => {
      const filter = this.audioContext!.createBiquadFilter();
      
      // Use different filter types for edge bands
      if (index === 0) {
        filter.type = 'lowshelf';
      } else if (index === EQ_FREQUENCIES.length - 1) {
        filter.type = 'highshelf';
      } else {
        filter.type = 'peaking';
        filter.Q.value = 1.4; // Bandwidth
      }
      
      filter.frequency.value = freq;
      filter.gain.value = 0;
      
      return filter;
    });
  }

  /**
   * Create a compressor for volume normalization
   */
  private createCompressor(): DynamicsCompressorNode {
    const compressor = this.audioContext!.createDynamicsCompressor();
    
    // Settings for gentle normalization
    compressor.threshold.value = -24;  // Start compressing at -24dB
    compressor.knee.value = 30;        // Soft knee for smooth transition
    compressor.ratio.value = 4;        // 4:1 compression ratio
    compressor.attack.value = 0.003;   // Fast attack (3ms)
    compressor.release.value = 0.25;   // Medium release (250ms)
    
    return compressor;
  }

  /**
   * Connect the audio processing graph based on current settings
   */
  private connectAudioGraph() {
    if (!this.audioContext || !this.sourceNode || !this.crossfadeSourceNode) return;

    // Disconnect everything first
    this.disconnectAll();

    // Build the chain for primary audio
    this.connectChain(
      this.sourceNode,
      this.eqFilters,
      this.gainNode!,
      this.compressorNode!,
      false
    );

    // Build the chain for crossfade audio
    this.connectChain(
      this.crossfadeSourceNode,
      this.crossfadeEqFilters,
      this.crossfadeGainNode!,
      this.crossfadeCompressorNode!,
      true
    );
  }

  /**
   * Connect a single audio chain
   */
  private connectChain(
    source: MediaElementAudioSourceNode,
    eqFilters: BiquadFilterNode[],
    gain: GainNode,
    compressor: DynamicsCompressorNode,
    isCrossfade: boolean
  ) {
    if (!this.audioContext) return;

    let lastNode: AudioNode = source;

    // EQ filters (if enabled)
    if (this.settings.equalizerEnabled && eqFilters.length > 0) {
      // Chain filters together
      for (let i = 0; i < eqFilters.length; i++) {
        lastNode.connect(eqFilters[i]);
        lastNode = eqFilters[i];
      }
    }

    // Compressor (if normalization enabled)
    if (this.settings.volumeNormalization) {
      lastNode.connect(compressor);
      lastNode = compressor;
    }

    // Gain node for volume control
    lastNode.connect(gain);
    lastNode = gain;

    // Mono audio processing (if enabled)
    if (this.settings.monoAudio) {
      // Split stereo into L/R
      lastNode.connect(this.channelSplitter!);
      
      // Mix both channels together (L+R)/2
      this.channelSplitter!.connect(this.monoGainL!, 0);
      this.channelSplitter!.connect(this.monoGainL!, 1);
      this.monoGainL!.gain.value = 0.5;
      
      this.channelSplitter!.connect(this.monoGainR!, 0);
      this.channelSplitter!.connect(this.monoGainR!, 1);
      this.monoGainR!.gain.value = 0.5;
      
      // Merge back to stereo (both channels get the same mono mix)
      this.monoGainL!.connect(this.channelMerger!, 0, 0);
      this.monoGainR!.connect(this.channelMerger!, 0, 1);
      
      this.channelMerger!.connect(this.audioContext.destination);
    } else {
      // Direct to output
      lastNode.connect(this.audioContext.destination);
    }
  }

  /**
   * Disconnect all nodes
   */
  private disconnectAll() {
    try {
      this.sourceNode?.disconnect();
      this.crossfadeSourceNode?.disconnect();
      this.eqFilters.forEach(f => f.disconnect());
      this.crossfadeEqFilters.forEach(f => f.disconnect());
      this.gainNode?.disconnect();
      this.crossfadeGainNode?.disconnect();
      this.compressorNode?.disconnect();
      this.crossfadeCompressorNode?.disconnect();
      this.channelSplitter?.disconnect();
      this.channelMerger?.disconnect();
      this.monoGainL?.disconnect();
      this.monoGainR?.disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
  }

  /**
   * Update EQ filter gains
   */
  private updateEqGains() {
    if (!this.settings.equalizerEnabled) return;

    const gains = this.settings.eqGains;
    
    this.eqFilters.forEach((filter, i) => {
      if (gains[i] !== undefined) {
        filter.gain.value = gains[i];
      }
    });

    this.crossfadeEqFilters.forEach((filter, i) => {
      if (gains[i] !== undefined) {
        filter.gain.value = gains[i];
      }
    });
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
      this.checkCrossfadeOrGapless();
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

  private checkCrossfadeOrGapless() {
    if (!this.audio || this.crossfadeTriggered || this.isCrossfading) return;

    const timeRemaining = this.audio.duration - this.audio.currentTime;
    
    // Check for crossfade
    if (this.settings.crossfadeEnabled) {
      const threshold = this.settings.crossfadeDuration;
      if (timeRemaining <= threshold && timeRemaining > 0.5) {
        this.crossfadeTriggered = true;
        this.callbacks.onCrossfadeStart?.();
      }
    }
    // Check for gapless (trigger slightly before end)
    else if (this.settings.gaplessPlayback) {
      if (timeRemaining <= 0.3 && timeRemaining > 0.1) {
        this.crossfadeTriggered = true;
        this.callbacks.onCrossfadeStart?.();
      }
    }
  }

  setCallbacks(callbacks: AudioCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  updateSettings(settings: Partial<AudioSettings>) {
    const prevSettings = { ...this.settings };
    this.settings = { ...this.settings, ...settings };

    // Update EQ gains if changed
    if (settings.eqGains) {
      this.updateEqGains();
    }

    // Reconnect audio graph if routing-related settings changed
    if (
      settings.equalizerEnabled !== undefined ||
      settings.volumeNormalization !== undefined ||
      settings.monoAudio !== undefined
    ) {
      // Only reconnect if context exists
      if (this.audioContext && this.sourceNode) {
        this.connectAudioGraph();
        this.updateEqGains();
      }
    }
  }

  /**
   * Preload the next track for gapless playback
   */
  async preloadNext(nextSrc: string): Promise<void> {
    if (!nextSrc || this.preloadedNextSrc === nextSrc) return;

    try {
      const response = await fetch(nextSrc);
      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
      
      this.preloadedBlob = await response.blob();
      this.preloadedNextSrc = nextSrc;
      console.log('[AudioEngine] Preloaded next track');
    } catch (error) {
      console.warn('[AudioEngine] Failed to preload:', error);
      this.preloadedBlob = null;
      this.preloadedNextSrc = null;
    }
  }

  /**
   * Perform crossfade to a new track
   */
  async crossfadeTo(nextSrc: string): Promise<void> {
    if (!this.audio || !this.crossfadeAudio) return;

    await this.ensureAudioContext();
    
    this.isCrossfading = true;
    const duration = this.settings.crossfadeEnabled ? this.settings.crossfadeDuration : 0.1;
    const currentAudio = this.audio;

    try {
      // Load next track into crossfade audio
      if (this.crossfadeBlobUrl) {
        URL.revokeObjectURL(this.crossfadeBlobUrl);
      }

      // Use preloaded blob if available
      let blob: Blob;
      if (this.preloadedNextSrc === nextSrc && this.preloadedBlob) {
        blob = this.preloadedBlob;
        this.preloadedBlob = null;
        this.preloadedNextSrc = null;
      } else {
        const response = await fetch(nextSrc);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        blob = await response.blob();
      }

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
      if (this.crossfadeGainNode) {
        this.crossfadeGainNode.gain.value = 0;
      }
      await this.crossfadeAudio.play();

      // Fade volumes using Web Audio API gain nodes
      const startVolume = this.currentVolume;
      const steps = Math.max(20, Math.round(duration * 20)); // At least 20 steps
      const stepTime = (duration * 1000) / steps;
      let step = 0;

      await new Promise<void>((resolve) => {
        this.crossfadeInterval = setInterval(() => {
          step++;
          const progress = step / steps;
          
          // Smooth easing curve for nicer crossfade
          const fadeOut = Math.cos(progress * Math.PI / 2); // 1 -> 0
          const fadeIn = Math.sin(progress * Math.PI / 2);  // 0 -> 1

          if (this.gainNode) {
            this.gainNode.gain.value = startVolume * fadeOut;
          }
          if (this.crossfadeGainNode) {
            this.crossfadeGainNode.gain.value = startVolume * fadeIn;
          }

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

      // Swap blob URLs
      const oldBlobUrl = this.currentBlobUrl;
      this.currentBlobUrl = this.crossfadeBlobUrl;
      this.crossfadeBlobUrl = oldBlobUrl;

      // Swap audio elements
      const oldAudio = this.audio;
      this.audio = this.crossfadeAudio;
      this.crossfadeAudio = oldAudio;

      // Swap source nodes
      const oldSourceNode = this.sourceNode;
      this.sourceNode = this.crossfadeSourceNode;
      this.crossfadeSourceNode = oldSourceNode;

      // Swap gain nodes
      const oldGainNode = this.gainNode;
      this.gainNode = this.crossfadeGainNode;
      this.crossfadeGainNode = oldGainNode;

      // Swap EQ filters
      const oldEqFilters = this.eqFilters;
      this.eqFilters = this.crossfadeEqFilters;
      this.crossfadeEqFilters = oldEqFilters;

      // Swap compressors
      const oldCompressor = this.compressorNode;
      this.compressorNode = this.crossfadeCompressorNode;
      this.crossfadeCompressorNode = oldCompressor;

      // Set up listeners on new primary
      this.setupListeners(this.audio, true);

      // Update state
      this.currentSrc = nextSrc;
      if (this.gainNode) {
        this.gainNode.gain.value = startVolume;
      }
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

    await this.ensureAudioContext();

    // Set up listeners if not already done
    if (!this.audio.onplay) {
      this.setupListeners(this.audio, true);
    }

    // Validate source URL
    if (!src || !src.startsWith('http')) {
      console.warn('[AudioEngine] Invalid source URL:', src);
      return;
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

      // Check if we have this preloaded
      let blob: Blob;
      if (this.preloadedNextSrc === src && this.preloadedBlob) {
        blob = this.preloadedBlob;
        this.preloadedBlob = null;
        this.preloadedNextSrc = null;
      } else {
        const response = await fetch(src, { signal: this.abortController.signal });
        if (!response.ok) {
          throw new Error(`Failed to fetch audio: ${response.status}`);
        }
        blob = await response.blob();
      }

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

    await this.ensureAudioContext();

    // Don't try to play without a valid source loaded
    if (!this.currentBlobUrl && !this.currentSrc) {
      console.warn('[AudioEngine] No audio source loaded');
      return;
    }

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
    this.currentVolume = Math.max(0, Math.min(1, volume));
    
    // Use gain node if available, otherwise fall back to audio element
    if (this.gainNode) {
      this.gainNode.gain.value = this.currentVolume;
    } else if (this.audio) {
      this.audio.volume = this.currentVolume;
    }
  }

  getVolume(): number {
    return this.currentVolume;
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

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

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
