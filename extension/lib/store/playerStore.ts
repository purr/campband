import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track, RepeatMode } from '@/types';

interface PlayerState {
  // Current track
  currentTrack: Track | null;

  // Playback state
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;    // Current time in seconds
  duration: number;       // Total duration in seconds
  error: string | null;

  // Volume
  volume: number;      // 0-1
  isMuted: boolean;
  previousVolume: number;  // Volume before muting (for restore)

  // Modes
  shuffle: boolean;
  repeat: RepeatMode;

  // Actions
  setCurrentTrack: (track: Track | null, resetTime?: boolean) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsBuffering: (buffering: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  setError: (error: string | null) => void;
  clearError: () => void;

  // Playback control
  play: () => void;
  pause: () => void;
  toggle: () => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentTrack: null,
      isPlaying: false,
      isBuffering: false,
      currentTime: 0,
      duration: 0,
      error: null,
      volume: 1,
      isMuted: false,
      previousVolume: 1,  // Default to same as volume
      shuffle: false,
      repeat: 'off',

      // Setters
      setCurrentTrack: (track, resetTime = true) => set((state) => ({
        currentTrack: track,
        // Only reset time if explicitly requested (not when restoring from storage)
        currentTime: resetTime ? 0 : state.currentTime,
        duration: track?.duration || state.duration || 0,
      })),
      setIsPlaying: (isPlaying) => set({ isPlaying }),
      setIsBuffering: (isBuffering) => set({ isBuffering }),
      setCurrentTime: (currentTime) => set({ currentTime }),
      setDuration: (duration) => set({ duration }),
      setVolume: (volume) => set((state) => {
        const clampedVolume = Math.max(0, Math.min(1, volume));
        // If user changes volume while muted, unmute them (they're adjusting volume)
        if (state.isMuted && clampedVolume > 0) {
          return {
            volume: clampedVolume,
            isMuted: false,
            previousVolume: clampedVolume,
          };
        }
        // If not muted, update previousVolume so it's saved for next mute
        return {
          volume: clampedVolume,
          previousVolume: state.isMuted ? state.previousVolume : clampedVolume,
        };
      }),
      setMuted: (muted) => set((state) => {
        if (muted && !state.isMuted) {
          // Muting: save current volume and set to 0
          return {
            isMuted: true,
            previousVolume: state.volume,
            volume: 0,
          };
        } else if (!muted && state.isMuted) {
          // Unmuting: restore previous volume
          return {
            isMuted: false,
            volume: state.previousVolume > 0 ? state.previousVolume : 0.5,
          };
        }
        return { isMuted: muted };
      }),
      setError: (error) => set({ error }),
      clearError: () => set({ error: null }),

      // Toggles
      toggleMute: () => set((state) => {
        if (!state.isMuted) {
          // Muting: save current volume and set to 0
          return {
            isMuted: true,
            previousVolume: state.volume,
            volume: 0,
          };
        } else {
          // Unmuting: restore previous volume
          return {
            isMuted: false,
            volume: state.previousVolume > 0 ? state.previousVolume : 0.5,
          };
        }
      }),
      toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),
      toggleRepeat: () => set((state) => {
        const modes: RepeatMode[] = ['off', 'all', 'track'];
        const currentIndex = modes.indexOf(state.repeat);
        const nextIndex = (currentIndex + 1) % modes.length;
        return { repeat: modes[nextIndex] };
      }),

      // Playback
      play: () => set({ isPlaying: true }),
      pause: () => set({ isPlaying: false }),
      toggle: () => set((state) => ({ isPlaying: !state.isPlaying })),
    }),
    {
      name: 'campband-player',
      partialize: (state) => ({
        // Persist track info, playback position, and settings
        currentTrack: state.currentTrack,
        currentTime: state.currentTime,  // Resume from where we left off
        duration: state.duration,
        volume: state.volume,
        isMuted: state.isMuted,
        previousVolume: state.previousVolume,
        shuffle: state.shuffle,
        repeat: state.repeat,
        // Don't persist: isPlaying (start paused), isBuffering, error
      }),
    }
  )
);
