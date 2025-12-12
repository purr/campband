import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EQ_FREQUENCIES, EQ_PRESETS, type EqBand, type EqPresetName } from '@/lib/audio';

// EQ gain values for each frequency band (-12 to +12 dB)
type EqGains = Record<EqBand, number>;

interface EqSettings {
  enabled: boolean;
  preset: EqPresetName | 'custom';
  gains: EqGains;
}

interface AudioSettings {
  // Crossfade
  crossfadeEnabled: boolean;
  crossfadeDuration: number; // 0-12 seconds

  // Volume
  volumeNormalization: boolean;

  // Playback
  gaplessPlayback: boolean;

  // Equalizer
  eq: EqSettings;
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

  // EQ actions
  setEqEnabled: (enabled: boolean) => void;
  setEqPreset: (preset: EqPresetName | 'custom') => void;
  setEqBand: (frequency: EqBand, gain: number) => void;
  resetEq: () => void;

  // App actions
  setTheme: (theme: AppSettings['theme']) => void;
  setShowNotifications: (enabled: boolean) => void;
  setConfirmBeforeClearQueue: (enabled: boolean) => void;
  setConfirmOnUnlike: (enabled: boolean) => void;

  // Reset
  resetAudioSettings: () => void;
  resetAllSettings: () => void;
}

const defaultEqGains: EqGains = EQ_FREQUENCIES.reduce((acc, freq) => {
  acc[freq] = 0;
  return acc;
}, {} as EqGains);

const defaultEqSettings: EqSettings = {
  enabled: false,
  preset: 'flat',
  gains: defaultEqGains,
};

const defaultAudioSettings: AudioSettings = {
  crossfadeEnabled: true,
  crossfadeDuration: 4,
  volumeNormalization: false,
  gaplessPlayback: true,
  eq: defaultEqSettings,
};

const defaultAppSettings: AppSettings = {
  theme: 'dark',
  showNotifications: true,
  confirmBeforeClearQueue: false,
  confirmOnUnlike: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
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

      // EQ actions
      setEqEnabled: (enabled) =>
        set((state) => ({
          audio: {
            ...state.audio,
            eq: { ...state.audio.eq, enabled },
          },
        })),

      setEqPreset: (preset) =>
        set((state) => {
          const gains = preset === 'custom'
            ? state.audio.eq.gains
            : { ...EQ_PRESETS[preset] } as EqGains;
          return {
            audio: {
              ...state.audio,
              eq: { ...state.audio.eq, preset, gains },
            },
          };
        }),

      setEqBand: (frequency, gain) =>
        set((state) => {
          const clampedGain = Math.max(-12, Math.min(12, gain));
          return {
            audio: {
              ...state.audio,
              eq: {
                ...state.audio.eq,
                preset: 'custom',
                gains: { ...state.audio.eq.gains, [frequency]: clampedGain },
              },
            },
          };
        }),

      resetEq: () =>
        set((state) => ({
          audio: {
            ...state.audio,
            eq: defaultEqSettings,
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
      version: 1,
      migrate: (persistedState, version) => {
        const state = persistedState as SettingsState;

        // Migration from version 0 (before EQ)
        if (version === 0) {
          // Ensure eq property exists
          if (!state.audio.eq) {
            state.audio.eq = defaultEqSettings;
          }
        }

        return state;
      },
      // Merge persisted state with defaults to handle missing properties
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<SettingsState>;
        return {
          ...currentState,
          audio: {
            ...currentState.audio,
            ...persisted.audio,
            // Ensure eq always exists with defaults merged
            eq: {
              ...defaultEqSettings,
              ...(persisted.audio?.eq || {}),
            },
          },
          app: {
            ...currentState.app,
            ...persisted.app,
          },
        };
      },
    }
  )
);
