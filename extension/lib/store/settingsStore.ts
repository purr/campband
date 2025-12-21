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

interface LastFmSettings {
  enabled: boolean;
  username: string;
  password: string; // Stored in plaintext (localStorage only accessible to extension)
  apiKey: string;
  apiSecret: string;
  sessionKey: string | null; // Retrieved via auth.getMobileSession
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  // Scrobbling criteria (must respect Last.fm rules: min 30s, min 50% or 4min)
  minDuration: number; // Minimum track duration in seconds (default: 30, min: 30)
  minPlayPercent: number; // Minimum play percentage (default: 50, min: 50, max: 100)
  minPlayTime: number; // Alternative: minimum play time in seconds (default: 240, min: 30)
}

interface SettingsState {
  audio: AudioSettings;
  app: AppSettings;
  lastfm: LastFmSettings;

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

  // Last.fm actions
  setLastFmEnabled: (enabled: boolean) => void;
  setLastFmCredentials: (username: string, password: string, apiKey: string, apiSecret: string) => void;
  setLastFmSessionKey: (sessionKey: string | null) => void;
  setLastFmConnectionStatus: (status: LastFmSettings['connectionStatus']) => void;
  setLastFmScrobbleCriteria: (minDuration: number, minPlayPercent: number, minPlayTime: number) => void;

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
  confirmOnUnlike: true,
};

const defaultLastFmSettings: LastFmSettings = {
  enabled: false,
  username: '',
  password: '',
  apiKey: '',
  apiSecret: '',
  sessionKey: null,
  connectionStatus: 'disconnected',
  minDuration: 30, // Last.fm minimum requirement
  minPlayPercent: 50, // Last.fm minimum requirement
  minPlayTime: 30, // Last.fm minimum requirement (smallest possible)
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      audio: defaultAudioSettings,
      app: defaultAppSettings,
      lastfm: defaultLastFmSettings,

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

      // Last.fm actions
      setLastFmEnabled: (enabled) =>
        set((state) => ({ lastfm: { ...state.lastfm, enabled } })),

      setLastFmCredentials: (username, password, apiKey, apiSecret) =>
        set((state) => ({
          lastfm: {
            ...state.lastfm,
            username,
            password,
            apiKey,
            apiSecret,
            // Reset session and connection status when credentials change
            sessionKey: null,
            connectionStatus: 'disconnected',
          },
        })),

      setLastFmSessionKey: (sessionKey) =>
        set((state) => ({ lastfm: { ...state.lastfm, sessionKey } })),

      setLastFmConnectionStatus: (connectionStatus) =>
        set((state) => ({ lastfm: { ...state.lastfm, connectionStatus } })),

      setLastFmScrobbleCriteria: (minDuration, minPlayPercent, minPlayTime) =>
        set((state) => ({
          lastfm: {
            ...state.lastfm,
            minDuration: Math.max(30, minDuration), // Enforce Last.fm minimum
            minPlayPercent: Math.max(50, Math.min(100, minPlayPercent)), // Enforce Last.fm minimum, max 100
            minPlayTime: Math.max(30, minPlayTime), // Enforce minimum
          },
        })),

      // Reset
      resetAudioSettings: () => set({ audio: defaultAudioSettings }),
      resetAllSettings: () => set({ audio: defaultAudioSettings, app: defaultAppSettings, lastfm: defaultLastFmSettings }),
    }),
    {
      name: 'campband-settings',
      version: 2,
      migrate: (persistedState, version) => {
        const state = persistedState as SettingsState;

        // Migration from version 0 (before EQ)
        if (version === 0) {
          // Ensure eq property exists
          if (!state.audio.eq) {
            state.audio.eq = defaultEqSettings;
          }
        }

        // Migration from version 1 (before Last.fm)
        if (version === 0 || version === 1) {
          // Ensure lastfm property exists
          if (!state.lastfm) {
            state.lastfm = defaultLastFmSettings;
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
          lastfm: {
            ...defaultLastFmSettings,
            ...(persisted.lastfm || {}),
          },
        };
      },
    }
  )
);
