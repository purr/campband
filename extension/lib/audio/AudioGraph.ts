/**
 * AudioGraph - Web Audio API graph management
 *
 * Manages the audio processing chain:
 * Source → EQ (10-band) → Compressor → Gain → Destination
 *
 * Key principle: ALL audio must go through this graph.
 * This ensures consistent processing and effects.
 */

// Standard 10-band EQ frequencies (Hz)
export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

// Global map to track audio elements that already have MediaElementSourceNode attached
// This is crucial for hot-reload: MediaElementSourceNode can only be created ONCE per audio element
const audioSourceNodes = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

export type EqBand = typeof EQ_FREQUENCIES[number];

export interface EqSettings {
  enabled: boolean;
  gains: Record<EqBand, number>;  // -12 to +12 dB
}

export const DEFAULT_EQ_SETTINGS: EqSettings = {
  enabled: false,
  gains: {
    32: 0, 64: 0, 125: 0, 250: 0, 500: 0,
    1000: 0, 2000: 0, 4000: 0, 8000: 0, 16000: 0,
  },
};

// EQ Presets
export const EQ_PRESETS = {
  flat: { ...DEFAULT_EQ_SETTINGS.gains },
  bass: { 32: 6, 64: 5, 125: 4, 250: 2, 500: 0, 1000: 0, 2000: 0, 4000: 0, 8000: 0, 16000: 0 },
  treble: { 32: 0, 64: 0, 125: 0, 250: 0, 500: 0, 1000: 1, 2000: 2, 4000: 4, 8000: 5, 16000: 6 },
  vocal: { 32: -2, 64: -1, 125: 0, 250: 2, 500: 4, 1000: 4, 2000: 3, 4000: 2, 8000: 1, 16000: 0 },
  rock: { 32: 5, 64: 4, 125: 2, 250: 0, 500: -1, 1000: 0, 2000: 2, 4000: 4, 8000: 5, 16000: 5 },
  electronic: { 32: 6, 64: 5, 125: 2, 250: 0, 500: -2, 1000: 0, 2000: 2, 4000: 4, 8000: 5, 16000: 6 },
  acoustic: { 32: 3, 64: 2, 125: 1, 250: 2, 500: 3, 1000: 2, 2000: 3, 4000: 3, 8000: 2, 16000: 1 },
} as const;

export type EqPresetName = keyof typeof EQ_PRESETS;

export interface AudioGraphOptions {
  volumeNormalization?: boolean;
  eq?: EqSettings;
  initialVolume?: number;  // Set initial gain (0-1), useful for crossfade
}

export interface AudioGraphNodes {
  source: MediaElementAudioSourceNode | null;
  eqFilters: BiquadFilterNode[];
  compressor: DynamicsCompressorNode | null;
  gain: GainNode | null;
}

export class AudioGraph {
  private context: AudioContext | null = null;
  private nodes: AudioGraphNodes = {
    source: null,
    eqFilters: [],
    compressor: null,
    gain: null,
  };
  private audioElement: HTMLAudioElement | null = null;
  private options: AudioGraphOptions = {};

  /**
   * Get or create the AudioContext
   * If an existing source node is found, reuse its context to avoid mismatches
   */
  async getContext(audio?: HTMLAudioElement): Promise<AudioContext> {
    // If we have an audio element, check if it already has a source node
    // If so, reuse that node's context to avoid AudioContext mismatches
    if (audio && !this.context) {
      const existingSource = audioSourceNodes.get(audio);
      if (existingSource) {
        const existingContext = (existingSource as any).context;
        if (existingContext && existingContext.state !== 'closed') {
          console.log('[AudioGraph] Reusing AudioContext from existing source node');
          this.context = existingContext;
        }
      }
    }

    if (!this.context) {
      // Create AudioContext - it will be suspended until user gesture
      // This is expected browser behavior, not an error
      this.context = new AudioContext();

      // Suppress the browser warning by catching it immediately
      // The context will be resumed on first user interaction (play button)
      if (this.context.state === 'suspended') {
        // This is normal - context will resume on user gesture
        // Don't log anything, just let it resume naturally on first play
      }
    }

    // Only try to resume if suspended - browsers require user gesture
    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch (error) {
        // Will resume on next user gesture - this is expected behavior
        // Don't log - this is normal browser security behavior
      }
    }

    return this.context;
  }

  /**
   * Get context without creating (for checking state)
   */
  getContextIfExists(): AudioContext | null {
    return this.context;
  }

  /**
   * Check if context exists (without creating one)
   */
  hasContext(): boolean {
    return this.context !== null;
  }

  /**
   * Connect an audio element to the graph
   * Note: MediaElementSourceNode can only be created ONCE per audio element
   */
  async connect(audio: HTMLAudioElement, options: AudioGraphOptions = {}): Promise<void> {
    // ALWAYS merge options first (fix for hot-reload)
    this.options = { ...this.options, ...options };
    // Pass audio element to getContext so it can reuse existing source node's context
    const ctx = await this.getContext(audio);

    // Check if we already have a source for this element in this graph
    if (this.nodes.source?.mediaElement === audio) {
      // Same audio element - check if context matches
      const sourceContext = (this.nodes.source as any).context;
      if (sourceContext !== ctx) {
        // Context mismatch - need to recreate everything
        console.warn('[AudioGraph] Source node from different AudioContext, recreating graph');
        this.disconnect();
        // Fall through to create new nodes
      } else {
        // Same element, same context - just reconnect the graph and update settings
        // Make sure EQ filters exist (they might have been cleared)
        if (this.nodes.eqFilters.length === 0) {
          console.log('[AudioGraph] Recreating EQ filters after reconnect');
          this.nodes.eqFilters = this.createEqFilters(ctx);
        }
        // Verify all nodes belong to current context
        if (this.nodes.gain && (this.nodes.gain as any).context !== ctx) {
          this.nodes.gain = ctx.createGain();
          this.nodes.gain.gain.setValueAtTime(this._pendingVolume, ctx.currentTime);
        }
        if (this.nodes.compressor && (this.nodes.compressor as any).context !== ctx) {
          this.nodes.compressor = this.createCompressor(ctx);
        }
        this.reconnect();
        // Reapply EQ gains with the newly merged options
        if (this.options.eq?.gains) {
          this.applyEqGains(this.options.eq.gains);
        }
        return;
      }
    }

    // Disconnect our current nodes
    this.disconnect();

    try {
      this.audioElement = audio;

      // Check if this audio element already has a MediaElementSourceNode globally
      // (this happens after hot-reload - the source node persists but our reference was lost)
      let sourceNode = audioSourceNodes.get(audio);

      if (!sourceNode) {
        // Create new source node and store it globally
        sourceNode = ctx.createMediaElementSource(audio);
        audioSourceNodes.set(audio, sourceNode);
        console.log('[AudioGraph] Created new MediaElementSourceNode');
      } else {
        // Check if existing source node belongs to current context
        const existingContext = (sourceNode as any).context;
        if (existingContext !== ctx) {
          console.warn('[AudioGraph] Existing source node from different AudioContext, cannot reuse. Audio element may need to be recreated.');
          // Can't create a new source node - MediaElementSourceNode can only be created once
          // The audio element needs to be recreated or we need to use the old context
          // For now, clear the reference and try to create new (will likely fail)
          audioSourceNodes.delete(audio);
          try {
            sourceNode = ctx.createMediaElementSource(audio);
            audioSourceNodes.set(audio, sourceNode);
            console.log('[AudioGraph] Created new MediaElementSourceNode after clearing old one');
          } catch (error) {
            console.error('[AudioGraph] Cannot create MediaElementSourceNode - element already has one:', error);
            throw new Error('Audio element already has a MediaElementSourceNode from a different AudioContext. Element must be recreated.');
          }
        } else {
          console.log('[AudioGraph] Reusing existing MediaElementSourceNode');
        }
      }

      this.nodes.source = sourceNode;

      // Always create fresh processing nodes (they don't have the same limitation)
      this.nodes.eqFilters = this.createEqFilters(ctx);
      this.nodes.compressor = this.createCompressor(ctx);
      this.nodes.gain = ctx.createGain();

      // Set initial volume (important for crossfade - start at 0)
      const initialVol = this.options.initialVolume ?? this._pendingVolume;
      this.nodes.gain.gain.setValueAtTime(initialVol, ctx.currentTime);

      this.reconnect();
    } catch (error) {
      console.error('[AudioGraph] Failed to connect audio element:', error);
      throw error;
    }
  }

  /**
   * Create 10-band parametric EQ filters
   */
  private createEqFilters(ctx: AudioContext): BiquadFilterNode[] {
    return EQ_FREQUENCIES.map((freq, index) => {
      const filter = ctx.createBiquadFilter();

      // First and last bands use shelving filters, middle bands use peaking
      if (index === 0) {
        filter.type = 'lowshelf';
      } else if (index === EQ_FREQUENCIES.length - 1) {
        filter.type = 'highshelf';
      } else {
        filter.type = 'peaking';
        filter.Q.value = 1.4; // Moderate Q for musical EQ
      }

      filter.frequency.value = freq;
      filter.gain.value = this.options.eq?.gains[freq] ?? 0;

      return filter;
    });
  }

  /**
   * Reconnect the audio graph based on current options
   */
  private reconnect(): void {
    if (!this.context || !this.nodes.source || !this.nodes.gain) return;

    // CRITICAL: Check if source node belongs to current context
    // If not, we can't reconnect - source nodes can't be moved between contexts
    const sourceContext = (this.nodes.source as any).context;
    if (sourceContext !== this.context) {
      console.error('[AudioGraph] Cannot reconnect: source node from different AudioContext. Call disconnect() and connect() again.');
      // Clear the source node reference - caller needs to reconnect properly
      this.nodes.source = null;
      return;
    }

    // Check if processing nodes belong to current context - if not, recreate them
    if (this.nodes.eqFilters.length > 0) {
      const firstFilter = this.nodes.eqFilters[0];
      if (firstFilter && (firstFilter as any).context !== this.context) {
        console.warn('[AudioGraph] EQ filters from different context, recreating...');
        this.nodes.eqFilters = this.createEqFilters(this.context);
      }
    }
    if (this.nodes.compressor && (this.nodes.compressor as any).context !== this.context) {
      console.warn('[AudioGraph] Compressor from different context, recreating...');
      this.nodes.compressor = this.createCompressor(this.context);
    }
    if ((this.nodes.gain as any).context !== this.context) {
      console.warn('[AudioGraph] Gain from different context, recreating...');
      this.nodes.gain = this.context.createGain();
      this.nodes.gain.gain.setValueAtTime(this._pendingVolume, this.context.currentTime);
    }

    // Disconnect all nodes first
    this.disconnectNodes();

    let lastNode: AudioNode = this.nodes.source;

    // Add EQ filters if enabled
    if (this.options.eq?.enabled && this.nodes.eqFilters.length > 0) {
      for (const filter of this.nodes.eqFilters) {
        // Double-check filter belongs to current context
        if ((filter as any).context !== this.context) {
          console.warn('[AudioGraph] EQ filter from different context, skipping');
          continue;
        }
        lastNode.connect(filter);
        lastNode = filter;
      }
    }

    // Add compressor if volume normalization is enabled
    if (this.options.volumeNormalization && this.nodes.compressor) {
      // Double-check compressor belongs to current context
      if ((this.nodes.compressor as any).context !== this.context) {
        console.warn('[AudioGraph] Compressor from different context, recreating');
        this.nodes.compressor = this.createCompressor(this.context);
      }
      lastNode.connect(this.nodes.compressor);
      lastNode = this.nodes.compressor;
    }

    // Always connect through gain node for volume control
    // Double-check gain belongs to current context
    if ((this.nodes.gain as any).context !== this.context) {
      console.warn('[AudioGraph] Gain from different context, recreating');
      this.nodes.gain = this.context.createGain();
      this.nodes.gain.gain.setValueAtTime(this._pendingVolume, this.context.currentTime);
    }
    lastNode.connect(this.nodes.gain);
    lastNode = this.nodes.gain;

    // Connect to destination
    lastNode.connect(this.context.destination);
  }

  /**
   * Disconnect all nodes (but don't destroy them)
   */
  private disconnectNodes(): void {
    try {
      this.nodes.source?.disconnect();
      this.nodes.eqFilters.forEach(f => f.disconnect());
      this.nodes.compressor?.disconnect();
      this.nodes.gain?.disconnect();
    } catch {
      // Ignore - nodes may already be disconnected
    }
  }

  /**
   * Create a dynamics compressor for volume normalization
   */
  private createCompressor(ctx: AudioContext): DynamicsCompressorNode {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    return compressor;
  }

  /**
   * Update graph options (reconnects if needed)
   */
  updateOptions(options: Partial<AudioGraphOptions>): void {
    const needsReconnect =
      options.volumeNormalization !== this.options.volumeNormalization ||
      options.eq?.enabled !== this.options.eq?.enabled;

    this.options = {
      ...this.options,
      ...options,
      eq: options.eq ? { ...this.options.eq, ...options.eq } : this.options.eq,
    };

    // If we have a source but no EQ filters, we need to create them
    if (this.nodes.source && this.nodes.eqFilters.length === 0 && this.context) {
      console.log('[AudioGraph] Creating missing EQ filters');
      this.nodes.eqFilters = this.createEqFilters(this.context);
      if (!this.nodes.compressor) {
        this.nodes.compressor = this.createCompressor(this.context);
      }
      if (!this.nodes.gain) {
        this.nodes.gain = this.context.createGain();
      }
      this.reconnect();
      return;
    }

    // Update EQ gains without reconnecting
    if (options.eq?.gains && this.nodes.eqFilters.length > 0) {
      this.applyEqGains(options.eq.gains);
    }

    if (needsReconnect && this.nodes.source) {
      this.reconnect();
    }
  }

  /**
   * Apply EQ gains to filters
   */
  private applyEqGains(gains: Record<EqBand, number>): void {
    if (this.nodes.eqFilters.length !== EQ_FREQUENCIES.length) {
      console.warn(`[AudioGraph] EQ filter count mismatch: ${this.nodes.eqFilters.length} vs ${EQ_FREQUENCIES.length}`);
      return;
    }

    EQ_FREQUENCIES.forEach((freq, index) => {
      const filter = this.nodes.eqFilters[index];
      if (filter && this.context) {
        const gainValue = gains[freq] ?? 0;
        // Use setValueAtTime for more reliable updates
        filter.gain.setValueAtTime(gainValue, this.context.currentTime);
      }
    });
  }

  /**
   * Set EQ band gain
   */
  setEqBand(frequency: EqBand, gain: number): void {
    // Clamp gain to -12 to +12 dB
    const clampedGain = Math.max(-12, Math.min(12, gain));

    // Always store the gain value in options (even if filters don't exist yet)
    if (this.options.eq) {
      this.options.eq.gains[frequency] = clampedGain;
    }

    // Apply to filter if it exists
    const index = EQ_FREQUENCIES.indexOf(frequency);
    if (index >= 0 && this.nodes.eqFilters[index] && this.context) {
      this.nodes.eqFilters[index].gain.setValueAtTime(clampedGain, this.context.currentTime);
    }
  }

  /**
   * Apply EQ preset
   */
  applyPreset(presetName: EqPresetName): void {
    const preset = EQ_PRESETS[presetName];
    if (preset && this.options.eq) {
      this.options.eq.gains = { ...preset } as Record<EqBand, number>;
      this.applyEqGains(this.options.eq.gains);
    }
  }

  /**
   * Enable/disable EQ
   */
  setEqEnabled(enabled: boolean): void {
    if (this.options.eq) {
      this.options.eq.enabled = enabled;
    }

    // Create filters if they don't exist and we have a source
    if (this.nodes.source && this.nodes.eqFilters.length === 0 && this.context) {
      this.nodes.eqFilters = this.createEqFilters(this.context);
    }

    if (this.nodes.source) {
      this.reconnect();
    }
  }

  /**
   * Get current EQ settings
   */
  getEqSettings(): EqSettings | undefined {
    return this.options.eq;
  }

  /**
   * Set the output volume (0-1)
   */
  setVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    // Store for later if gain node doesn't exist yet
    this._pendingVolume = clampedVolume;
    if (this.nodes.gain && this.context) {
      // Use setValueAtTime for immediate, glitch-free volume changes
      this.nodes.gain.gain.setValueAtTime(clampedVolume, this.context.currentTime);
    }
    // Silently ignore if no gain node - volume will be applied when connected
  }

  private _pendingVolume: number = 1;

  /**
   * Get current volume
   */
  getVolume(): number {
    return this.nodes.gain?.gain.value ?? 1;
  }

  /**
   * Check if audio element is connected
   */
  isConnected(audio: HTMLAudioElement): boolean {
    return this.nodes.source?.mediaElement === audio;
  }

  /**
   * Get the gain node (for crossfade volume control)
   */
  getGainNode(): GainNode | null {
    return this.nodes.gain;
  }

  /**
   * Fully disconnect and clean up
   */
  disconnect(): void {
    this.disconnectNodes();
    this.nodes = {
      source: null,
      eqFilters: [],
      compressor: null,
      gain: null,
    };
    this.audioElement = null;
  }

  /**
   * Destroy the graph and close context
   */
  destroy(): void {
    this.disconnect();
    if (this.context) {
      this.context.close();
      this.context = null;
    }
  }
}
