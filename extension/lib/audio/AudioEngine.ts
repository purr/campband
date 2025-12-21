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
const DEBUG_SONGS = true; // Enable by default for troubleshooting
const DEBUG_VOLUME = true; // Always log volume changes
const DEBUG_AUDIO_STATE = true; // Always log audio state changes

function logSong(...args: any[]) {
  if (DEBUG_SONGS) {
    console.log('[AudioEngine]', ...args);
  }
}

// Debug logging for errors and stops
const DEBUG_STOPS = true; // Always log stops/errors

function logStop(reason: string, details?: any) {
  if (DEBUG_STOPS) {
    console.warn('[AudioEngine] STOP:', reason, details || '');
  }
}

function logError(error: any, context?: string) {
  if (DEBUG_STOPS) {
    console.error('[AudioEngine] ERROR:', context || '', error);
    if (error instanceof Error) {
      console.error('[AudioEngine] Error stack:', error.stack);
    }
  }
}

function logVolume(action: string, details: any) {
  if (DEBUG_VOLUME) {
    // Remove stack traces from normal logs - only log essential info
    const { stackTrace, ...cleanDetails } = details;
    console.log(`[AudioEngine] VOLUME ${action}:`, cleanDetails);
  }
}

function logAudioState(action: string, details: any) {
  if (DEBUG_AUDIO_STATE) {
    // Remove stack traces from normal logs - only log essential info
    const { stackTrace, ...cleanDetails } = details;
    console.log(`[AudioEngine] AUDIO STATE ${action}:`, cleanDetails);
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

  // Volume getter - always gets from store (persisted source of truth)
  private volumeGetter: (() => number) | null = null;
  private volume = 1; // Cache, but always sync with getter when available

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
    console.log('[AudioEngine] 🎵 INITIALIZING');

    // Initialize primary element
    const primary = this.primaryElement.init();

    // Initialize crossfade element
    this.crossfadeElement.init();

    // CRITICAL: Sync volume from centralized source on init
    // This ensures volume is correct even on first load
    this.syncVolumeFromGetter();

    // Set up event forwarding from primary element
    this.primaryElement.setCallbacks({
      onPlay: () => {
        logSong('EVENT: PLAY');
        this.callbacks.onPlay?.();
      },
      onPause: () => {
        if (!this.isCrossfading) {
          logStop('PAUSE', {
            reason: 'User paused or playback paused',
            currentTime: this.primaryElement.getCurrentTime(),
            duration: this.primaryElement.getDuration()
          });
          this.callbacks.onPause?.();
        } else {
          logSong('PAUSE IGNORED - crossfading');
        }
      },
      onEnded: () => {
        if (!this.isCrossfading) {
          logStop('TRACK ENDED', {
            reason: 'Track reached end',
            duration: this.primaryElement.getDuration(),
            currentSrc: this.primaryElement.getCurrentSrc()?.substring(0, 50)
          });
          this.crossfadeTriggered = false;
          this.callbacks.onEnded?.();
        } else {
          logSong('ENDED IGNORED - crossfading');
        }
      },
      onTimeUpdate: (time, duration) => {
        this.callbacks.onTimeUpdate?.(time, duration);
        this.checkCrossfadeTrigger();
      },
      onDurationChange: (duration) => this.callbacks.onDurationChange?.(duration),
      onError: (error) => {
        logError(error, 'AUDIO ELEMENT ERROR');
        logStop('ERROR', {
          reason: error,
          currentTime: this.primaryElement.getCurrentTime(),
          duration: this.primaryElement.getDuration(),
          currentSrc: this.primaryElement.getCurrentSrc()?.substring(0, 50)
        });
        this.callbacks.onError?.(error);
      },
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
   * CRITICAL: Always gets volume from centralized source (store)
   * CRITICAL: Only connects ONCE to prevent doubled audio
   * CRITICAL: Uses unified sync to ensure all settings are correct
   */
  private async ensureGraphConnected(): Promise<void> {
    const audio = this.primaryElement.get();

    // CRITICAL: Check if already connected - if so, just ensure volume is correct
    if (this.primaryGraph.isConnected(audio)) {
      // Already connected - just sync volume and settings
      const volume = this.getVolumeFromSource();
      this.applyVolume(volume);

      // Also ensure audio element volume is 1.0
      if (audio.volume !== 1.0) {
        console.warn('[AudioEngine] CRITICAL: Audio element volume is', audio.volume, 'when already connected - setting to 1.0');
        audio.volume = 1.0;
      }
      return;
    }

    // CRITICAL: Use unified sync to connect and apply all settings
    // This ensures volume, EQ, volume normalization, etc. are all correct
    await this.syncAllAudioSettings({
      // Volume will be gotten from centralized source (store) via getVolumeFromSource()
      volumeNormalization: this.settings.volumeNormalization,
      eqEnabled: this.eqSettings.enabled,
      eqGains: this.eqSettings.gains,
      crossfadeEnabled: this.settings.crossfadeEnabled,
      crossfadeDuration: this.settings.crossfadeDuration,
      gaplessPlayback: this.settings.gaplessPlayback,
    });

    logSong('GRAPH CONNECTED via ensureGraphConnected', {
      volume: this.getVolumeFromSource(),
      gainNodeVolume: this.primaryGraph.getVolume(),
      audioElementVolume: audio.volume,
      note: 'Audio now plays ONLY through Web Audio API graph'
    });
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
   * Sync all audio settings
   * This ensures all audio settings are properly applied
   */
  async syncAllAudioSettings(options: {
    volume?: number;
    volumeNormalization?: boolean;
    eqEnabled?: boolean;
    eqGains?: Record<EqBand, number>;
    crossfadeEnabled?: boolean;
    crossfadeDuration?: number;
    gaplessPlayback?: boolean;
  }): Promise<void> {
    const audio = this.primaryElement.get();
    const crossfadeAudio = this.crossfadeElement.get();

    // Capture state BEFORE sync
    const stateBefore = {
      primaryAudioVolume: audio.volume,
      crossfadeAudioVolume: crossfadeAudio.volume,
      primaryGainVolume: this.primaryGraph.getVolume(),
      crossfadeGainVolume: this.crossfadeGraph.getVolume(),
      cachedVolume: this.volume,
      primaryConnected: this.primaryGraph.isConnected(audio),
      crossfadeConnected: this.crossfadeGraph.isConnected(crossfadeAudio),
      primaryContextState: this.primaryGraph.getContextIfExists()?.state,
    };

    console.log('[AudioEngine] 🔄 SYNC START:', {
      volume: options.volume ?? this.getVolumeFromSource(),
      effectiveVolumeBefore: stateBefore.primaryGainVolume * stateBefore.primaryAudioVolume,
      isConnected: stateBefore.primaryConnected
    });

    // Step 1: Update settings if provided
    if (options.volumeNormalization !== undefined ||
        options.crossfadeEnabled !== undefined ||
        options.crossfadeDuration !== undefined ||
        options.gaplessPlayback !== undefined) {
      this.updateSettings({
        volumeNormalization: options.volumeNormalization ?? this.settings.volumeNormalization,
        crossfadeEnabled: options.crossfadeEnabled ?? this.settings.crossfadeEnabled,
        crossfadeDuration: options.crossfadeDuration ?? this.settings.crossfadeDuration,
        gaplessPlayback: options.gaplessPlayback ?? this.settings.gaplessPlayback,
      });
    }

    // Step 2: Update EQ settings if provided
    if (options.eqEnabled !== undefined || options.eqGains !== undefined) {
      this.updateEqSettings({
        enabled: options.eqEnabled ?? this.eqSettings.enabled,
        gains: options.eqGains ?? this.eqSettings.gains,
      });
    }

    // Step 3: Get volume from centralized source (store) or provided value
    const volume = options.volume !== undefined
      ? options.volume
      : this.getVolumeFromSource();

    // Step 4: CRITICAL - Ensure audio element volumes are 1.0 BEFORE connecting
    // This prevents volume multiplication
    audio.volume = 1.0;
    crossfadeAudio.volume = 1.0;

    // Step 5: Connect primary audio to graph (if not already connected)
    const wasConnected = this.primaryGraph.isConnected(audio);

    if (!wasConnected) {
      console.log('[AudioEngine] SYNC - Connecting primary audio to graph');
      await this.primaryGraph.connect(audio, {
        volumeNormalization: this.settings.volumeNormalization,
        eq: this.eqSettings,
        initialVolume: volume,
      });

      // CRITICAL: After connecting, verify audio element volume is 1.0
      // If MediaElementSourceNode was created, audio should ONLY play through Web Audio API
      if (audio.volume !== 1.0) {
        console.error('[AudioEngine] ❌ CRITICAL: Audio element volume is', audio.volume, 'after connect - setting to 1.0');
        audio.volume = 1.0;
      }

      // CRITICAL: Verify connection is actually working by checking gain node exists
      const gainNode = this.primaryGraph.getGainNode();
      if (!gainNode) {
        console.error('[AudioEngine] ❌ CRITICAL: No gain node after connect! Volume control will not work!');
      } else {
        const isConnected = this.primaryGraph.isConnected(audio);
        if (!isConnected) {
          console.error('[AudioEngine] ❌ CRITICAL: Graph reports not connected after connect()! Audio may play directly, bypassing volume control!');
        } else {
          console.log('[AudioEngine] ✅ Connection verified - gain node exists and graph reports connected');
        }
      }
    } else {
      // Only update if settings actually changed
      // This prevents excessive reconnects
      const currentOptions = this.primaryGraph.getOptions?.() || {};
      const normalizationChanged = currentOptions.volumeNormalization !== this.settings.volumeNormalization;
      const eqChanged = JSON.stringify(currentOptions.eq) !== JSON.stringify(this.eqSettings);

      if (normalizationChanged || eqChanged) {
        console.log('[AudioEngine] SYNC - Primary audio already connected, updating settings');
        this.primaryGraph.updateOptions({
          volumeNormalization: this.settings.volumeNormalization,
          eq: this.eqSettings,
        });
      }

      // CRITICAL: Verify audio element volume is still 1.0
      if (audio.volume !== 1.0) {
        console.error('[AudioEngine] ❌ CRITICAL: Audio element volume changed to', audio.volume, '- resetting to 1.0');
        audio.volume = 1.0;
      }
    }

    // Step 6: Connect crossfade audio to graph (if not already connected)
    if (!this.crossfadeGraph.isConnected(crossfadeAudio)) {
      logSong('SYNC - Connecting crossfade audio to graph');
      await this.crossfadeGraph.connect(crossfadeAudio, {
        volumeNormalization: this.settings.volumeNormalization,
        eq: this.eqSettings,
        initialVolume: 0, // Crossfade starts at 0
      });
    } else {
      // Only update if settings actually changed
      // This prevents excessive reconnects
      const currentOptions = this.crossfadeGraph.getOptions?.() || {};
      const normalizationChanged = currentOptions.volumeNormalization !== this.settings.volumeNormalization;
      const eqChanged = JSON.stringify(currentOptions.eq) !== JSON.stringify(this.eqSettings);

      if (normalizationChanged || eqChanged) {
        logSong('SYNC - Crossfade audio already connected, updating settings');
        this.crossfadeGraph.updateOptions({
          volumeNormalization: this.settings.volumeNormalization,
          eq: this.eqSettings,
        });
      }
    }

    // Step 7: CRITICAL - Apply volume from centralized source
    // This ensures gain nodes have correct volume
    // But don't override if we just did emergency connection (volume already applied)
    if (volume <= 0) {
      console.warn('[AudioEngine] ⚠️ Volume from source is', volume, '- this will mute audio!');
    }
    this.applyVolume(volume);

    // Step 8: CRITICAL - Double-check audio element volumes are 1.0
    // This prevents volume multiplication
    audio.volume = 1.0;
    crossfadeAudio.volume = 1.0;

    // Capture state AFTER sync
    const stateAfter = {
      primaryAudioVolume: audio.volume,
      crossfadeAudioVolume: crossfadeAudio.volume,
      primaryGainVolume: this.primaryGraph.getVolume(),
      crossfadeGainVolume: this.crossfadeGraph.getVolume(),
      cachedVolume: this.volume,
      primaryConnected: this.primaryGraph.isConnected(audio),
      crossfadeConnected: this.crossfadeGraph.isConnected(crossfadeAudio),
      primaryContextState: this.primaryGraph.getContextIfExists()?.state,
    };

    // Calculate effective volume (what user actually hears)
    const effectiveVolume = stateAfter.primaryGainVolume * stateAfter.primaryAudioVolume;
    const effectiveVolumeBefore = stateBefore.primaryGainVolume * stateBefore.primaryAudioVolume;

    const effectiveVolumeChanged = Math.abs(effectiveVolume - effectiveVolumeBefore) > 0.01;

    if (effectiveVolumeChanged) {
      console.error('[AudioEngine] ❌ VOLUME CHANGED DURING SYNC!', {
        before: effectiveVolumeBefore,
        after: effectiveVolume,
        difference: effectiveVolume - effectiveVolumeBefore,
        gainVolume: { before: stateBefore.primaryGainVolume, after: stateAfter.primaryGainVolume },
        audioVolume: { before: stateBefore.primaryAudioVolume, after: stateAfter.primaryAudioVolume }
      });
    } else {
      console.log('[AudioEngine] ✅ SYNC OK');
    }
  }

  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: AudioCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Force reconnect audio graph
   * This ensures the EQ and other processing is properly connected
   */
  async forceReconnect(): Promise<void> {
    // Don't interfere with ongoing crossfade
    if (this.isCrossfading) {
      logSong('Skipping force reconnect during crossfade');
      return;
    }

    const audio = this.primaryElement.get();

    // Get volume from centralized source (store)
    const volume = this.getVolumeFromSource();

    logSong('FORCE RECONNECT START', {
      volume,
      volumeNormalization: this.settings.volumeNormalization,
      eqEnabled: this.eqSettings.enabled
    });

    // Force reconnection by passing current settings
    await this.primaryGraph.connect(audio, {
      volumeNormalization: this.settings.volumeNormalization,
      eq: this.eqSettings,
      initialVolume: volume,  // Use volume from store
    });

    // CRITICAL: Apply volume from centralized source after connection
    this.applyVolume(volume);

    logSong('FORCE RECONNECT COMPLETE', {
      finalVolume: volume,
      gainNodeVolume: this.primaryGraph.getVolume(),
      audioElementVolume: audio.volume
    });
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

    // Skip if same source (but only if actually loaded and ready)
    const currentSrc = this.primaryElement.getCurrentSrc();
    if (currentSrc === src) {
      // Check if audio is actually ready to play
      const audio = this.primaryElement.get();
      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        logSong('LOAD SKIP - same source and ready');
        return { success: true };
      } else {
        logSong('LOAD - same source but not ready, reloading');
        // Fall through to reload
      }
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

      // After loading, ensure graph is connected and all settings are synced
      await this.ensureGraphConnected();
    } else {
      // Only log if it's not an abort (aborts are expected)
      if (result.error !== 'Aborted' && !result.error?.includes('aborted')) {
      logSong('LOAD FAILED', { error: result.error, expired: result.expired });
      }
    }

    return result;
  }

  /**
   * Start playback
   */
  async play(): Promise<void> {
    const audio = this.primaryElement.get();
    const stateBeforePlay = {
      cachedVolume: this.volume,
      gainNodeVolume: this.primaryGraph.getVolume(),
      audioElementVolume: audio.volume,
      effectiveVolume: this.primaryGraph.getVolume() * audio.volume,
      isConnected: this.primaryGraph.isConnected(audio),
      contextState: this.primaryGraph.getContextIfExists()?.state,
    };

    console.log('[AudioEngine] ▶️ PLAY:', {
      effectiveVolume: stateBeforePlay.effectiveVolume,
      gainVolume: stateBeforePlay.gainNodeVolume,
      audioVolume: stateBeforePlay.audioElementVolume
    });

    // Ensure graph is connected and all settings are synced
    await this.ensureGraphConnected();

    // CRITICAL: Resume AudioContext on first user gesture (play button)
    // This is when the browser allows audio to start
    const primaryContext = this.primaryGraph.getContextIfExists();
    if (primaryContext && primaryContext.state === 'suspended') {
      try {
        await primaryContext.resume();
        logSong('AudioContext resumed on play');
      } catch (error) {
        logError(error, 'Failed to resume AudioContext');
      }
    }

    // Get volume from centralized source and apply before play
    const volume = this.getVolumeFromSource();
    this.applyVolume(volume);

    // CRITICAL: Double-check audio element volume is 1.0 before playing
    // This prevents volume multiplication
    if (audio.volume !== 1.0) {
      console.warn('[AudioEngine] CRITICAL: Audio element volume is', audio.volume, 'before play - setting to 1.0');
      audio.volume = 1.0;
    }

    const stateAfterSync = {
      cachedVolume: this.volume,
      gainNodeVolume: this.primaryGraph.getVolume(),
      audioElementVolume: audio.volume,
      effectiveVolume: this.primaryGraph.getVolume() * audio.volume,
      isConnected: this.primaryGraph.isConnected(audio),
      contextState: this.primaryGraph.getContextIfExists()?.state,
    };

    try {
      await this.primaryElement.play();

      const stateAfterPlay = {
        cachedVolume: this.volume,
        gainNodeVolume: this.primaryGraph.getVolume(),
        audioElementVolume: audio.volume,
        effectiveVolume: this.primaryGraph.getVolume() * audio.volume,
        isConnected: this.primaryGraph.isConnected(audio),
        contextState: this.primaryGraph.getContextIfExists()?.state,
        isActuallyPlaying: !audio.paused,
      };

      // WARNING if effective volume changed
      if (Math.abs(stateAfterPlay.effectiveVolume - stateBeforePlay.effectiveVolume) > 0.01) {
        console.error('[AudioEngine] ❌ VOLUME CHANGED DURING PLAY!', {
          before: stateBeforePlay.effectiveVolume,
          after: stateAfterPlay.effectiveVolume,
          difference: stateAfterPlay.effectiveVolume - stateBeforePlay.effectiveVolume
        });
      }
    } catch (error) {
      logError(error, 'PLAY FAILED');
      logStop('PLAY FAILED', {
        reason: error instanceof Error ? error.message : String(error),
        volume: this.volume
      });
      throw error;
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    logSong('PAUSE CALLED', {
      currentTime: this.primaryElement.getCurrentTime(),
      duration: this.primaryElement.getDuration(),
      isPlaying: this.primaryElement.isPlaying()
    });
    this.primaryElement.pause();
  }

  /**
   * Stop and reset
   */
  stop(): void {
    logStop('STOP CALLED', {
      reason: 'Explicit stop() call',
      currentTime: this.primaryElement.getCurrentTime(),
      duration: this.primaryElement.getDuration(),
      currentSrc: this.primaryElement.getCurrentSrc()?.substring(0, 50)
    });
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
    // Don't seek if duration is invalid (NaN or 0) - audio isn't ready yet
    if (!duration || isNaN(duration) || duration <= 0) {
      logSong('SEEK IGNORED - duration not ready', { time, duration, currentTime: this.primaryElement.getCurrentTime() });
      return;
    }

    const clampedTime = Math.max(0, Math.min(time, duration));

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
   * Set volume getter function (from persisted store)
   * This is the centralized source of truth for volume
   */
  setVolumeGetter(getter: () => number): void {
    this.volumeGetter = getter;
    // Immediately sync volume from getter
    this.syncVolumeFromGetter();
  }

  /**
   * Get current volume from centralized source (store)
   * Falls back to cached volume if getter not set
   * Normalizes volume to 2 decimal places to avoid floating point precision issues
   */
  private getVolumeFromSource(): number {
    if (this.volumeGetter) {
      const rawStoreVolume = this.volumeGetter();
      // Normalize to 2 decimal places to avoid floating point precision issues
      const storeVolume = Math.round(rawStoreVolume * 100) / 100;
      const cachedVolume = this.volume;
      // Update cache with normalized value
      this.volume = storeVolume;

      if (storeVolume !== cachedVolume) {
    // Only log if volume changed
    if (Math.abs(storeVolume - cachedVolume) > 0.001) {
      logVolume('GET FROM SOURCE', {
        storeVolume,
        cachedVolume,
        changed: true
      });
    }
      }

      return storeVolume;
    }

    // Don't log this - it's normal if getter not set yet

    return this.volume;
  }

  /**
   * Sync volume from getter and apply to all audio elements
   * This is called whenever audio elements are recreated/reconnected
   */
  private syncVolumeFromGetter(): void {
    const volume = this.getVolumeFromSource();
    this.applyVolume(volume);
  }

  /**
   * Apply volume to all audio elements and graphs
   * This is the centralized place where volume is actually applied
   * CRITICAL: HTMLAudioElement volume MUST be 1.0 to prevent multiplication
   *
   * Normalizes volume to 2 decimal places to avoid floating point precision issues
   */
  private applyVolume(volume: number): void {
    // Normalize to 2 decimal places to avoid floating point precision issues
    // This ensures volumes like 0.98 become 0.98, and 0.999999 becomes 1.00
    const normalizedVolume = Math.round(volume * 100) / 100;
    const clampedVolume = Math.max(0, Math.min(1, normalizedVolume));
    const oldVolume = this.volume;
    this.volume = clampedVolume;

    const primaryAudio = this.primaryElement.get();
    const crossfadeAudio = this.crossfadeElement.get();

    // Get current state BEFORE applying
    const primaryGainBefore = this.primaryGraph.getVolume();
    const primaryAudioVolumeBefore = primaryAudio.volume;
    const crossfadeGainBefore = this.crossfadeGraph.getVolume();
    const crossfadeAudioVolumeBefore = crossfadeAudio.volume;

    // Apply to both graphs so crossfade audio is also attenuated
    this.primaryGraph.setVolume(clampedVolume);
    this.crossfadeGraph.setVolume(clampedVolume);

    // CRITICAL: HTMLAudioElement volume MUST be 1.0 - gain node controls actual volume
    // If HTMLAudioElement volume is NOT 1.0, it multiplies with gain node volume = DOUBLED AUDIO
    if (primaryAudio.volume !== 1.0) {
      console.warn('[AudioEngine] CRITICAL: Primary audio element volume is', primaryAudio.volume, '- setting to 1.0 to prevent volume multiplication');
      primaryAudio.volume = 1.0;
    }
    if (crossfadeAudio.volume !== 1.0) {
      console.warn('[AudioEngine] CRITICAL: Crossfade audio element volume is', crossfadeAudio.volume, '- setting to 1.0 to prevent volume multiplication');
      crossfadeAudio.volume = 1.0;
    }

    // Get state AFTER applying
    const primaryGainAfter = this.primaryGraph.getVolume();
    const primaryAudioVolumeAfter = primaryAudio.volume;
    const crossfadeGainAfter = this.crossfadeGraph.getVolume();
    const crossfadeAudioVolumeAfter = crossfadeAudio.volume;

    // Only log if volume changed significantly or audio element volume is wrong
    const volumeChanged = Math.abs(oldVolume - clampedVolume) > 0.01;
    const audioVolumeWrong = primaryAudioVolumeBefore !== 1.0 || primaryAudioVolumeAfter !== 1.0;

    if (volumeChanged || audioVolumeWrong) {
      logVolume('APPLY', {
        requested: volume,
        clamped: clampedVolume,
        oldVolume,
        primaryGain: { before: primaryGainBefore, after: primaryGainAfter },
        primaryAudioVolume: { before: primaryAudioVolumeBefore, after: primaryAudioVolumeAfter },
        effectiveVolume: {
          before: primaryGainBefore * primaryAudioVolumeBefore,
          after: primaryGainAfter * primaryAudioVolumeAfter
        },
        audioVolumeFixed: audioVolumeWrong
      });
    }
  }

  /**
   * Set volume (0-1)
   * CRITICAL: HTMLAudioElement volume must be 1.0, gain node controls actual volume
   * Note: This updates the cache, but the store is the source of truth
   */
  setVolume(volume: number): void {
    const oldVolume = this.volume;
    // Normalize to 2 decimal places to avoid floating point precision issues
    const normalizedVolume = Math.round(volume * 100) / 100;
    const clampedVolume = Math.max(0, Math.min(1, normalizedVolume));

    // Only log if volume changed significantly
    if (Math.abs(oldVolume - clampedVolume) > 0.01) {
      logVolume('SET VOLUME', {
        requested: volume,
        clamped: clampedVolume,
        oldVolume
      });
    }

    this.volume = clampedVolume;
    this.applyVolume(clampedVolume);

    const finalGainVolume = this.primaryGraph.getVolume();
    const finalAudioVolume = this.primaryElement.get().volume;
    const effectiveVolume = finalGainVolume * finalAudioVolume;

    logSong('SET VOLUME', {
      volume: clampedVolume,
      gainNodeVolume: finalGainVolume,
      audioElementVolume: finalAudioVolume,
      effectiveVolume,
      oldVolume
    });
  }

  /**
   * Get current volume
   */
  getVolume(): number {
    return this.getVolumeFromSource();
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
    const audio = this.primaryElement.get();
    const gainVolume = this.primaryGraph.getVolume();
    const audioVolume = audio.volume;
    const effectiveVolume = gainVolume * audioVolume;

    const state = {
      isPlaying: this.isPlaying(),
      currentTime: this.getCurrentTime(),
      duration: this.getDuration(),
      src: this.getCurrentSrc(),
      volume: this.volume,
      muted: this.isMuted(),
      // Debug info
      _debug: {
        cachedVolume: this.volume,
        gainNodeVolume: gainVolume,
        audioElementVolume: audioVolume,
        effectiveVolume: effectiveVolume,
        isConnected: this.primaryGraph.isConnected(audio),
        contextState: this.primaryGraph.getContextIfExists()?.state,
      }
    };

    return state;
  }

  /**
   * Get detailed debug state (for troubleshooting)
   */
  getDebugState(): any {
    const audio = this.primaryElement.get();
    const crossfadeAudio = this.crossfadeElement.get();

    return {
      cachedVolume: this.volume,
      volumeFromSource: this.getVolumeFromSource(),
      hasVolumeGetter: !!this.volumeGetter,
      primary: {
        audioElementVolume: audio.volume,
        gainNodeVolume: this.primaryGraph.getVolume(),
        effectiveVolume: this.primaryGraph.getVolume() * audio.volume,
        isConnected: this.primaryGraph.isConnected(audio),
        contextState: this.primaryGraph.getContextIfExists()?.state,
        isPlaying: !audio.paused,
        currentTime: audio.currentTime,
        duration: audio.duration,
      },
      crossfade: {
        audioElementVolume: crossfadeAudio.volume,
        gainNodeVolume: this.crossfadeGraph.getVolume(),
        effectiveVolume: this.crossfadeGraph.getVolume() * crossfadeAudio.volume,
        isConnected: this.crossfadeGraph.isConnected(crossfadeAudio),
        contextState: this.crossfadeGraph.getContextIfExists()?.state,
      },
      settings: {
        volumeNormalization: this.settings.volumeNormalization,
        eqEnabled: this.eqSettings.enabled,
        crossfadeEnabled: this.settings.crossfadeEnabled,
      },
      allAudioElements: (() => {
        const allAudioElements = Array.from(document.querySelectorAll('audio'));
        return allAudioElements.map((el, idx) => {
          const hasSourceNode = (window as any).__campband_audio_source_nodes__?.has?.(el) || false;
          return {
            index: idx,
            id: el.id || '(no id)',
            src: el.src?.substring(0, 80) || el.currentSrc?.substring(0, 80) || '(no src)',
            paused: el.paused,
            volume: el.volume,
            muted: el.muted,
            currentTime: el.currentTime,
            duration: el.duration,
            readyState: el.readyState,
            hasMediaElementSourceNode: hasSourceNode,
            isPrimary: el.id === 'campband-audio-primary',
            isCrossfade: el.id === 'campband-audio-crossfade',
            warning: !el.paused && el.volume === 1.0 && hasSourceNode
              ? '⚠️ Playing with volume 1.0 + source node - should be fine if source node disconnected direct output'
              : !el.paused && el.volume === 1.0 && !hasSourceNode
              ? '❌ Playing with volume 1.0 but NO source node - might be playing directly!'
              : '✅ OK'
          };
        });
      })(),
      doubledAudioCheck: (() => {
        const allAudioElements = Array.from(document.querySelectorAll('audio'));
        const playingElements = allAudioElements.filter(el => !el.paused);
        const playingWithoutSourceNode = playingElements.filter(el =>
          !(window as any).__campband_audio_source_nodes__?.has?.(el)
        );
        return {
          playingElements: playingElements.length,
          playingWithoutSourceNode: playingWithoutSourceNode.length,
          warning: playingElements.length > 1
            ? '❌ MULTIPLE AUDIO ELEMENTS PLAYING - POSSIBLE DOUBLED AUDIO!'
            : playingWithoutSourceNode.length > 0
            ? '❌ AUDIO PLAYING WITHOUT SOURCE NODE - PLAYING DIRECTLY (DOUBLED AUDIO!)'
            : '✅ OK - Single audio element with source node'
        };
      })()
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

          // Suppress logging during crossfade to avoid spam (volume changes rapidly)
          this.primaryGraph.setVolume(startVolume * fadeOut, true);
          this.crossfadeGraph.setVolume(startVolume * fadeIn, true);

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
      logError(error, 'CROSSFADE FAILED');
      logStop('CROSSFADE FAILED', {
        reason: error instanceof Error ? error.message : String(error),
        nextSrc: nextSrc.substring(0, 50)
      });
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
      onPlay: () => {
        logSong('EVENT: PLAY (after swap)');
        this.callbacks.onPlay?.();
      },
      onPause: () => {
        if (!this.isCrossfading) {
          logStop('PAUSE (after swap)', {
            reason: 'User paused or playback paused',
            currentTime: this.primaryElement.getCurrentTime(),
            duration: this.primaryElement.getDuration()
          });
          this.callbacks.onPause?.();
        } else {
          logSong('PAUSE IGNORED - crossfading (after swap)');
        }
      },
      onEnded: () => {
        if (!this.isCrossfading) {
          logStop('TRACK ENDED (after swap)', {
            reason: 'Track reached end',
            duration: this.primaryElement.getDuration(),
            currentSrc: this.primaryElement.getCurrentSrc()?.substring(0, 50)
          });
          this.crossfadeTriggered = false;
          this.callbacks.onEnded?.();
        } else {
          logSong('ENDED IGNORED - crossfading (after swap)');
        }
      },
      onTimeUpdate: (time, duration) => {
        this.callbacks.onTimeUpdate?.(time, duration);
        this.checkCrossfadeTrigger();
      },
      onDurationChange: (duration) => this.callbacks.onDurationChange?.(duration),
      onError: (error) => {
        logError(error, 'AUDIO ELEMENT ERROR (after swap)');
        logStop('ERROR (after swap)', {
          reason: error,
          currentTime: this.primaryElement.getCurrentTime(),
          duration: this.primaryElement.getDuration(),
          currentSrc: this.primaryElement.getCurrentSrc()?.substring(0, 50)
        });
        this.callbacks.onError?.(error);
      },
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

  // Expose debug helper to console
  if (typeof window !== 'undefined') {
    (window as any).__campband_audio_debug__ = () => {
      const engine = window.__campband_audio_engine__;
      if (engine) {
        const debug = engine.getDebugState();
        console.log('[AudioEngine] 🔍 DEBUG STATE:', debug);
        return debug;
      }
      console.warn('[AudioEngine] Audio engine not found');
      return null;
    };
    console.log('[AudioEngine] 💡 Debug helper available: window.__campband_audio_debug__()');
  }

  return window.__campband_audio_engine__;
}

export const audioEngine = getOrCreateAudioEngine();
