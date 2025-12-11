import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Equalizer presets with gain values for each frequency band
export type EqualizerPreset = 'flat' | 'bass_boost' | 'treble_boost' | 'vocal' | 'rock' | 'electronic' | 'acoustic' | 'custom';

export interface EqualizerBand {
  frequency: number; // Hz
  gain: number;      // -12 to +12 dB
}

// Default 10-band EQ frequencies
export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

// Preset configurations
export const EQ_PRESETS: Record<EqualizerPreset, number[]> = {
  flat:         [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass_boost:   [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  treble_boost: [0, 0, 0, 0, 0, 0, 2, 4, 5, 6],
  vocal:        [-2, -1, 0, 2, 4, 4, 3, 2, 0, -1],
  rock:         [4, 3, 2, 0, -1, 0, 2, 3, 4, 4],
  electronic:   [5, 4, 2, 0, -2, 0, 2, 3, 4, 5],
  acoustic:     [3, 2, 1, 0, 1, 1, 2, 2, 3, 2],
  custom:       [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

interface AudioSettings {
  // Crossfade
  crossfadeEnabled: boolean;
  crossfadeDuration: number; // 0-12 seconds

  // Volume
  volumeNormalization: boolean;

  // Playback
  gaplessPlayback: boolean;
  monoAudio: boolean;

  // Equalizer
  equalizerEnabled: boolean;
  equalizerPreset: EqualizerPreset;
  customEqGains: number[]; // 10 bands, -12 to +12 dB
}

interface AppSettings {
  // Theme (future)
  theme: 'dark' | 'light' | 'system';

  // Behavior
  showNotifications: boolean;
  confirmBeforeClearQueue: boolean;
  confirmOnUnlike: boolean;
}

interface SettingsState {
  audio: AudioSettings;
  app: AppSettings;

  // Audio actions
  setCrossfadeEnabled: (enabled: boolean) => void;
  setCrossfadeDuration: (duration: number) => void;
  setVolumeNormalization: (enabled: boolean) => void;
  setGaplessPlayback: (enabled: boolean) => void;
  setMonoAudio: (enabled: boolean) => void;
  setEqualizerEnabled: (enabled: boolean) => void;
  setEqualizerPreset: (preset: EqualizerPreset) => void;
  setCustomEqGain: (bandIndex: number, gain: number) => void;
  resetEqualizer: () => void;

  // App actions
  setTheme: (theme: AppSettings['theme']) => void;
  setShowNotifications: (enabled: boolean) => void;
  setConfirmBeforeClearQueue: (enabled: boolean) => void;
  setConfirmOnUnlike: (enabled: boolean) => void;

  // Reset
  resetAudioSettings: () => void;
  resetAllSettings: () => void;
}

const defaultAudioSettings: AudioSettings = {
  crossfadeEnabled: true,
  crossfadeDuration: 4,
  volumeNormalization: false,
  gaplessPlayback: true,
  monoAudio: false,
  equalizerEnabled: false,
  equalizerPreset: 'flat',
  customEqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

const defaultAppSettings: AppSettings = {
  theme: 'dark',
  showNotifications: true,
  confirmBeforeClearQueue: false,
  confirmOnUnlike: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      audio: defaultAudioSettings,
      app: defaultAppSettings,

      // Audio actions
      setCrossfadeEnabled: (enabled) =>
        set((state) => ({ audio: { ...state.audio, crossfadeEnabled: enabled } })),

      setCrossfadeDuration: (duration) =>
        set((state) => ({ audio: { ...state.audio, crossfadeDuration: Math.max(0, Math.min(12, duration)) } })),

      setVolumeNormalization: (enabled) =>
        set((state) => ({ audio: { ...state.audio, volumeNormalization: enabled } })),

      setGaplessPlayback: (enabled) =>
        set((state) => ({ audio: { ...state.audio, gaplessPlayback: enabled } })),

      setMonoAudio: (enabled) =>
        set((state) => ({ audio: { ...state.audio, monoAudio: enabled } })),

      setEqualizerEnabled: (enabled) =>
        set((state) => ({ audio: { ...state.audio, equalizerEnabled: enabled } })),

      setEqualizerPreset: (preset) =>
        set((state) => ({
          audio: {
            ...state.audio,
            equalizerPreset: preset,
            // Copy preset gains to custom if switching to custom
            customEqGains: preset === 'custom' ? state.audio.customEqGains : EQ_PRESETS[preset],
          },
        })),

      setCustomEqGain: (bandIndex, gain) =>
        set((state) => {
          const newGains = [...state.audio.customEqGains];
          newGains[bandIndex] = Math.max(-12, Math.min(12, gain));
          return {
            audio: {
              ...state.audio,
              equalizerPreset: 'custom',
              customEqGains: newGains,
            },
          };
        }),

      resetEqualizer: () =>
        set((state) => ({
          audio: {
            ...state.audio,
            equalizerPreset: 'flat',
            customEqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          },
        })),

      // App actions
      setTheme: (theme) =>
        set((state) => ({ app: { ...state.app, theme } })),

      setShowNotifications: (enabled) =>
        set((state) => ({ app: { ...state.app, showNotifications: enabled } })),

      setConfirmBeforeClearQueue: (enabled) =>
        set((state) => ({ app: { ...state.app, confirmBeforeClearQueue: enabled } })),

      setConfirmOnUnlike: (enabled) =>
        set((state) => ({ app: { ...state.app, confirmOnUnlike: enabled } })),

      // Reset
      resetAudioSettings: () => set({ audio: defaultAudioSettings }),
      resetAllSettings: () => set({ audio: defaultAudioSettings, app: defaultAppSettings }),
    }),
    {
      name: 'campband-settings',
    }
  )
);

