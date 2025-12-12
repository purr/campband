/**
 * Audio Engine Types
 */

export type AudioEventCallback = () => void;
export type AudioProgressCallback = (currentTime: number, duration: number) => void;
export type AudioErrorCallback = (error: string) => void;

export interface AudioCallbacks {
  onPlay?: AudioEventCallback;
  onPause?: AudioEventCallback;
  onEnded?: AudioEventCallback;
  onTimeUpdate?: AudioProgressCallback;
  onDurationChange?: (duration: number) => void;
  onError?: AudioErrorCallback;
  onLoadStart?: AudioEventCallback;
  onCanPlay?: AudioEventCallback;
  onCrossfadeStart?: AudioEventCallback;
}

export interface AudioSettings {
  crossfadeEnabled: boolean;
  crossfadeDuration: number;  // 1-12 seconds
  volumeNormalization: boolean;
  gaplessPlayback: boolean;
}

export const DEFAULT_SETTINGS: AudioSettings = {
  crossfadeEnabled: true,
  crossfadeDuration: 4,
  volumeNormalization: false,
  gaplessPlayback: true,
};

export interface AudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  src: string | null;
  volume: number;
  muted: boolean;
}

/**
 * Audio element configuration
 */
export interface AudioElementConfig {
  id: string;
  preload?: 'none' | 'metadata' | 'auto';
}

/**
 * Processing node types for the audio graph
 */
export type ProcessingNodeType = 'compressor' | 'gain' | 'equalizer';

export interface ProcessingNode {
  type: ProcessingNodeType;
  node: AudioNode;
  enabled: boolean;
}

