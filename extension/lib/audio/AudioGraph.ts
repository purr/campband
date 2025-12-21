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
// MediaElementSourceNode can only be created ONCE per audio element
const audioSourceNodes = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

// Expose for debugging
if (typeof window !== 'undefined') {
  (window as any).__campband_audio_source_nodes__ = {
    has: (el: HTMLAudioElement) => audioSourceNodes.has(el),
    get: (el: HTMLAudioElement) => audioSourceNodes.get(el),
    size: () => {
      // WeakMap doesn't have size, so we can't count, but we can check if specific element has one
      return 'WeakMap (no size)';
    }
  };
}

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

  // Track if we're connected to destination to prevent duplicates
  private isConnectedToDestination = false;

  // Prevent concurrent reconnects
  private isReconnecting = false;

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
      // The browser warning is expected and harmless - context will work after user gesture
      // We can't suppress the browser's internal warning, but it's just informational
      try {
        this.context = new AudioContext();
      } catch (error) {
        // If creation fails, we'll try again later
        console.warn('[AudioGraph] Failed to create AudioContext:', error);
        throw error;
      }

      // The context will be resumed on first user interaction (play button)
      if (this.context.state === 'suspended') {
        // This is normal - context will resume on user gesture
        // Don't log anything, just let it resume naturally on first play
      }
    }

    // Don't try to resume here - wait for user interaction
    // The resume will happen in AudioEngine when play() is called
    // This prevents the browser warning about AudioContext needing user gesture
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
    // CRITICAL: Check if already connected to this exact audio element
    // This prevents duplicate connections that cause doubled audio
    // BUT: If audio is playing and we're not actually connected (isConnected returns false),
    // we MUST reconnect even if source node exists, because audio is playing directly
    const isActuallyConnected = this.isConnected(audio);
    const isAudioPlaying = !audio.paused;

    if (isActuallyConnected) {
      console.log('[AudioGraph] Already connected to this audio element, skipping reconnect');
      // Just update options without reconnecting
      this.options = { ...this.options, ...options };
      // Update volume if provided
      if (options.initialVolume !== undefined) {
        this.setVolume(options.initialVolume);
      }
      return;
    }

    // CRITICAL: If audio is playing but we're not connected, we MUST force reconnect
    // This can happen when source node exists but isn't connected to our graph
    if (isAudioPlaying && this.nodes.source?.mediaElement === audio) {
      console.warn('[AudioGraph] ⚠️ Audio is playing but graph reports not connected! Forcing reconnect...');
      // Disconnect everything first to ensure clean state
      this.disconnectNodes();
      this.isConnectedToDestination = false;
    }

    // ALWAYS merge options first
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
      // (the source node may persist but our reference was lost)
      let sourceNode = audioSourceNodes.get(audio);

      if (!sourceNode) {
        // CRITICAL: If audio is playing, pause it FIRST before creating MediaElementSourceNode
        // This ensures direct output is stopped before we disable it
        const wasPlaying = !audio.paused;
        if (wasPlaying) {
          console.warn('[AudioGraph] ⚠️ Audio is playing - pausing before creating MediaElementSourceNode to ensure clean state');
          audio.pause();
        }

        // Create new source node and store it globally
        // MediaElementSourceNode will permanently disable direct audio output
        sourceNode = ctx.createMediaElementSource(audio);
        audioSourceNodes.set(audio, sourceNode);
        console.log('[AudioGraph] Created new MediaElementSourceNode', {
          wasPlayingBefore: wasPlaying,
          note: wasPlaying ? 'Audio was paused before creating source node - will resume through graph only' : 'Audio was already paused'
        });
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
          // CRITICAL: When reusing existing source node, audio might be playing DIRECTLY
          // MediaElementSourceNode only disables direct output when FIRST created, not when reused
          // If audio is playing, we MUST pause it to stop direct playback, then reconnect
          const wasPlaying = !audio.paused;
          if (wasPlaying) {
            console.error('[AudioGraph] ❌ CRITICAL: Reusing MediaElementSourceNode but audio is STILL playing!');
            console.error('[AudioGraph] MediaElementSourceNode only disables direct output when FIRST created!');
            console.error('[AudioGraph] Audio is playing DIRECTLY (bypassing graph) = DOUBLED AUDIO!');
            console.error('[AudioGraph] FIXING: Pausing audio to stop direct playback...');
            audio.pause();
            console.log('[AudioGraph] Audio paused - will resume through graph only after reconnection');
          }

          // CRITICAL: When reusing existing source node, DISCONNECT it completely first
          // This ensures it's not connected to any old graph that might still be playing
          // If we don't disconnect, audio might play through the old disconnected graph OR directly
          console.log('[AudioGraph] Reusing existing MediaElementSourceNode - disconnecting old connections first');
          try {
            // Disconnect from ALL destinations to ensure clean slate
            sourceNode.disconnect();
            // CRITICAL: Reset connection flag since we just disconnected
            this.isConnectedToDestination = false;
            console.log('[AudioGraph] Disconnected existing source node from all destinations');
          } catch (error) {
            console.warn('[AudioGraph] Error disconnecting existing source node:', error);
            // Reset flag anyway to be safe
            this.isConnectedToDestination = false;
          }
        }
      }

      this.nodes.source = sourceNode;

      // CRITICAL: When MediaElementSourceNode is created, it automatically disconnects
      // the audio element's direct output. Audio will ONLY play through this graph.
      // This prevents doubled audio (direct + Web Audio API paths).

      // CRITICAL DEBUG: Verify MediaElementSourceNode actually disconnected direct output
      // If audio is still playing directly, we have doubled audio!
      const wasPlayingBefore = !audio.paused;
      const audioVolumeBefore = audio.volume;

      console.log('[AudioGraph] 🔍 DEBUG: After creating/reusing MediaElementSourceNode:', {
        audioElementId: audio.id,
        audioElementSrc: audio.src?.substring(0, 80) || audio.currentSrc?.substring(0, 80) || '(no src)',
        audioElementVolume: audio.volume,
        audioElementPaused: audio.paused,
        wasPlayingBefore: wasPlayingBefore,
        sourceNodeExists: !!sourceNode,
        sourceNodeContext: sourceNode ? (sourceNode as any).context?.state : 'none',
        note: 'MediaElementSourceNode should have disabled direct audio output',
        warning: wasPlayingBefore && !audio.paused
          ? '⚠️ Audio was playing before and still playing - MediaElementSourceNode should have stopped direct output'
          : wasPlayingBefore && audio.paused
          ? '✅ Audio was playing but now paused - MediaElementSourceNode may have stopped it (check if it resumes)'
          : '✅ OK'
      });

      // CRITICAL: If audio was playing before creating MediaElementSourceNode, it should stop playing directly
      // If it continues playing, MediaElementSourceNode didn't work and we have doubled audio!
      if (wasPlayingBefore && !audio.paused) {
        console.error('[AudioGraph] ❌ CRITICAL: Audio was playing before MediaElementSourceNode creation and is STILL playing!');
        console.error('[AudioGraph] This suggests MediaElementSourceNode did NOT disable direct audio output!');
        console.error('[AudioGraph] Audio is likely playing BOTH through graph AND directly = DOUBLED AUDIO!');
      }

      // CRITICAL: Verify the source node is properly set up
      // If it was reused, make sure it's not already connected to destination
      if (sourceNode) {
        try {
          // Check if source is connected directly to destination (shouldn't happen, but check)
          const sourceConnections = (sourceNode as any)._connections || [];
          const hasDirectConnection = sourceConnections.some((conn: any) =>
            conn && conn.destination === ctx.destination
          );

          if (hasDirectConnection) {
            console.error('[AudioGraph] ❌ CRITICAL: Source node has direct connection to destination! Disconnecting...');
            sourceNode.disconnect(ctx.destination);
          }

          // DEBUG: Log all connections from source node
          console.log('[AudioGraph] 🔍 DEBUG: Source node connections:', {
            connectionCount: sourceConnections.length,
            connections: sourceConnections.map((conn: any, idx: number) => ({
              index: idx,
              destination: conn?.destination === ctx.destination ? 'AudioContext.destination' : 'other',
              destinationType: conn?.destination?.constructor?.name || 'unknown'
            }))
          });
        } catch {
          // Connection checking might not be available - that's fine
        }
      }

      // Always create fresh processing nodes (they don't have the same limitation)
      this.nodes.eqFilters = this.createEqFilters(ctx);
      this.nodes.compressor = this.createCompressor(ctx);
      this.nodes.gain = ctx.createGain();

      // Set initial volume (important for crossfade - start at 0)
      const initialVol = this.options.initialVolume ?? this._pendingVolume;
      const gainValueBefore = this.nodes.gain.gain.value;
      this.nodes.gain.gain.setValueAtTime(initialVol, ctx.currentTime);
      this._pendingVolume = initialVol; // Update pending volume
      const gainValueAfter = this.nodes.gain.gain.value;

      console.log('[AudioGraph] Connected:', {
        initialVol,
        audioElementVolume: audio.volume,
        effectiveVolume: initialVol * audio.volume,
        volumeNormalization: this.options.volumeNormalization,
        eqEnabled: this.options.eq?.enabled
      });

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
   * CRITICAL: Prevents concurrent reconnects to avoid doubled audio
   */
  private reconnect(): void {
    if (!this.context || !this.nodes.source || !this.nodes.gain) return;

    // CRITICAL: Prevent concurrent reconnects
    if (this.isReconnecting) {
      console.warn('[AudioGraph] ⚠️ Reconnect already in progress, skipping duplicate call');
      return;
    }

    this.isReconnecting = true;

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

    // CRITICAL: Disconnect gain node before reconnecting to prevent duplicate connections
    try {
      this.nodes.gain.disconnect();
    } catch {
      // Ignore - may not be connected yet
    }

    lastNode.connect(this.nodes.gain);
    lastNode = this.nodes.gain;

    // CRITICAL: If already connected to destination, disconnect first
    // This prevents duplicate connections that cause doubled/louder audio
    if (this.isConnectedToDestination) {
      console.warn('[AudioGraph] ⚠️ Already connected to destination - disconnecting first to prevent duplicates');
      try {
        this.nodes.gain.disconnect(this.context.destination);
      } catch {
        // May not be connected - that's fine
      }
      this.isConnectedToDestination = false;
    }

    // CRITICAL: Connect to destination - this is the ONLY path audio should take
    // MediaElementSourceNode automatically disconnects audio element's direct output
    // So audio ONLY plays through this graph, never directly
    lastNode.connect(this.context.destination);
    this.isConnectedToDestination = true;

    // CRITICAL DEBUG: Verify connection and check for doubled audio
    console.log('[AudioGraph] 🔍 DEBUG: Connected to destination:', {
      gainNodeValue: this.nodes.gain?.gain.value,
      audioElementVolume: this.audioElement?.volume,
      effectiveVolume: (this.nodes.gain?.gain.value || 0) * (this.audioElement?.volume || 1),
      isConnectedToDestination: this.isConnectedToDestination,
      audioElementPaused: this.audioElement?.paused,
      warning: this.audioElement && !this.audioElement.paused && this.audioElement.volume === 1.0
        ? '⚠️ Audio playing with volume 1.0 - if MediaElementSourceNode worked, this should be fine'
        : '✅ OK'
    });

    const finalGainValue = this.nodes.gain.gain.value;
    const audioElementVolume = this.audioElement?.volume ?? 1.0;
    const effectiveVolume = finalGainValue * audioElementVolume;

    this.isReconnecting = false;

    console.log('[AudioGraph] Reconnected:', {
      gainNodeValue: finalGainValue,
      audioElementVolume,
      effectiveVolume,
      isConnectedToDestination: this.isConnectedToDestination,
      note: this.isConnectedToDestination ? '✅ Connected to destination' : '❌ NOT connected!'
    });

    if (!this.isConnectedToDestination) {
      console.error('[AudioGraph] ❌ CRITICAL: Not connected to destination after reconnect!');
    }
  }

  /**
   * Disconnect all nodes (but don't destroy them)
   * CRITICAL: Must disconnect ALL connections to prevent doubled audio
   * CRITICAL: Must disconnect from destination specifically to prevent duplicate paths
   */
  private disconnectNodes(): void {
    // Reset reconnecting flag if we're disconnecting
    this.isReconnecting = false;
    try {
      // CRITICAL: Disconnect gain node from destination FIRST
      // This prevents audio from playing through multiple paths
      if (this.nodes.gain && this.context && this.isConnectedToDestination) {
        try {
          this.nodes.gain.disconnect(this.context.destination);
          this.isConnectedToDestination = false;
        } catch {
          // May not be connected - that's fine
          this.isConnectedToDestination = false;
        }
      }

      // Disconnect source node from ALL destinations
      if (this.nodes.source) {
        try {
          // CRITICAL: Disconnect from destination specifically (shouldn't be connected, but be safe)
          if (this.context) {
            try {
              this.nodes.source.disconnect(this.context.destination);
            } catch {
              // May not be connected - that's fine
            }
          }
          // Then disconnect from everything else
          this.nodes.source.disconnect();
        } catch {
          // May already be disconnected
        }
      }

      // Disconnect all EQ filters
      this.nodes.eqFilters.forEach(f => {
        try {
          f.disconnect();
        } catch {
          // Ignore - may already be disconnected
        }
      });

      // Disconnect compressor
      if (this.nodes.compressor) {
        try {
          this.nodes.compressor.disconnect();
        } catch {
          // Ignore - may already be disconnected
        }
      }

      // Disconnect gain node from everything (already disconnected from destination above)
      if (this.nodes.gain) {
        try {
          this.nodes.gain.disconnect();
        } catch {
          // Ignore - may already be disconnected
        }
      }
    } catch (error) {
      console.warn('[AudioGraph] Error during disconnectNodes:', error);
      this.isConnectedToDestination = false;
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
   * Get current options (for comparison to prevent unnecessary updates)
   */
  getOptions(): AudioGraphOptions {
    return { ...this.options };
  }

  /**
   * Update graph options (reconnects if needed)
   * CRITICAL: Only reconnects when options actually change to prevent excessive reconnects
   */
  updateOptions(options: Partial<AudioGraphOptions>): void {
    // Check if options actually changed
    const volumeNormalizationChanged = options.volumeNormalization !== undefined &&
                                       options.volumeNormalization !== this.options.volumeNormalization;
    const eqEnabledChanged = options.eq?.enabled !== undefined &&
                            options.eq.enabled !== this.options.eq?.enabled;
    const needsReconnect = volumeNormalizationChanged || eqEnabledChanged;

    // Check if EQ gains changed (no reconnect needed, just update gains)
    const eqGainsChanged = options.eq?.gains &&
                          JSON.stringify(options.eq.gains) !== JSON.stringify(this.options.eq?.gains);

    // If nothing changed, skip update
    if (!needsReconnect && !eqGainsChanged && !options.eq?.gains) {
      return;
    }

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

    // Update EQ gains without reconnecting (if only gains changed)
    if (eqGainsChanged && this.nodes.eqFilters.length > 0 && !needsReconnect && options.eq) {
      this.applyEqGains(options.eq.gains);
      return;
    }

    // Only reconnect if structure changed (volumeNormalization or eq enabled)
    if (needsReconnect && this.nodes.source) {
      this.reconnect();
    } else if (eqGainsChanged && this.nodes.eqFilters.length > 0 && options.eq) {
      // If structure didn't change but gains did, just update gains
      this.applyEqGains(options.eq.gains);
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
   * Normalizes volume to 2 decimal places to avoid floating point precision issues
   */
  setVolume(volume: number, suppressLogging = false): void {
    // Normalize to 2 decimal places to avoid floating point precision issues
    const normalizedVolume = Math.round(volume * 100) / 100;
    const clampedVolume = Math.max(0, Math.min(1, normalizedVolume));
    const oldPendingVolume = this._pendingVolume;
    const oldGainValue = this.nodes.gain?.gain.value;

    // Store for later if gain node doesn't exist yet
    this._pendingVolume = clampedVolume;
    if (this.nodes.gain && this.context) {
      // Use setValueAtTime for immediate, glitch-free volume changes
      this.nodes.gain.gain.setValueAtTime(clampedVolume, this.context.currentTime);
      const newGainValue = this.nodes.gain.gain.value;

      // Only log if volume changed significantly and logging is not suppressed
      // Suppress logging during crossfades (rapid volume changes)
      if (!suppressLogging && Math.abs((oldGainValue ?? oldPendingVolume) - clampedVolume) > 0.01) {
        console.log('[AudioGraph] setVolume:', {
          requested: volume,
          clamped: clampedVolume,
          oldGainValue,
          newGainValue,
          changed: true
        });
      }
    } else {
      // Only log if pending volume changed significantly and logging is not suppressed
      if (!suppressLogging && Math.abs(oldPendingVolume - clampedVolume) > 0.01) {
        console.log('[AudioGraph] setVolume (no gain node yet):', {
          requested: volume,
          clamped: clampedVolume,
          oldPendingVolume,
          pendingVolume: this._pendingVolume
        });
      }
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
    const isSourceConnected = this.nodes.source?.mediaElement === audio;
    const isDestinationConnected = this.isConnectedToDestination;

    // Both source and destination must be connected for audio to play
    const fullyConnected = isSourceConnected && isDestinationConnected;

    if (isSourceConnected && !isDestinationConnected) {
      console.warn('[AudioGraph] ⚠️ Source connected but NOT connected to destination! Audio will not play.');
    }

    return fullyConnected;
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
    this.isConnectedToDestination = false;
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
