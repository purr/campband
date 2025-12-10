import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '@/types';
import { usePlayerStore } from './playerStore';
import { audioEngine } from '@/lib/audio';

interface QueueState {
  // Queue
  queue: Track[];
  currentIndex: number;
  shuffle: boolean;

  // History (for previous button)
  history: Track[];

  // Original queue (for unshuffle)
  originalQueue: Track[];

  // Actions
  setQueue: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (track: Track) => void;
  addMultipleToQueue: (tracks: Track[]) => void;
  insertNext: (track: Track) => void;
  insertMultipleNext: (tracks: Track[]) => void;
  removeFromQueue: (index: number) => void;
  moveTrack: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;

  // Navigation (also updates player)
  playNext: () => void;
  playPrevious: () => void;
  playTrackAt: (index: number) => void;
  advanceToNext: () => void; // For crossfade - advances without reloading

  // Shuffle
  setShuffle: (shuffle: boolean) => void;
  shuffleQueue: () => void;
  unshuffleQueue: () => void;

  // Computed
  hasNext: () => boolean;
  hasPrevious: () => boolean;
  getCurrentTrack: () => Track | null;
}

export const useQueueStore = create<QueueState>()(
  persist(
    (set, get) => ({
  queue: [],
  currentIndex: -1,
  shuffle: false,
  history: [],
  originalQueue: [],

  setQueue: (tracks, startIndex = 0) => {
    const queue = [...tracks];
    set({
      queue,
      originalQueue: [...tracks],
      currentIndex: startIndex,
      history: [],
    });

    // Update player's current track
    if (queue[startIndex]) {
      usePlayerStore.getState().setCurrentTrack(queue[startIndex]);
    }
  },

  addToQueue: (track) => {
    set((state) => ({
      queue: [...state.queue, track],
      originalQueue: [...state.originalQueue, track],
    }));
  },

  addMultipleToQueue: (tracks) => {
    set((state) => ({
      queue: [...state.queue, ...tracks],
      originalQueue: [...state.originalQueue, ...tracks],
    }));
  },

  insertNext: (track) => {
    set((state) => {
      const newQueue = [...state.queue];
      newQueue.splice(state.currentIndex + 1, 0, track);
      return { queue: newQueue };
    });
  },

  insertMultipleNext: (tracks) => {
    set((state) => {
      const newQueue = [...state.queue];
      // Insert all tracks after current, in order
      newQueue.splice(state.currentIndex + 1, 0, ...tracks);
      return { queue: newQueue };
    });
  },

  removeFromQueue: (index) => {
    set((state) => {
      const newQueue = state.queue.filter((_, i) => i !== index);
      let newIndex = state.currentIndex;
      if (index < state.currentIndex) {
        newIndex--;
      } else if (index === state.currentIndex && index >= newQueue.length) {
        newIndex = newQueue.length - 1;
      }
      return { queue: newQueue, currentIndex: newIndex };
    });
  },

  moveTrack: (fromIndex, toIndex) => {
    set((state) => {
      // Don't move the current track
      if (fromIndex === state.currentIndex) return state;

      const newQueue = [...state.queue];
      const [movedTrack] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, movedTrack);

      // Update currentIndex if needed
      let newCurrentIndex = state.currentIndex;
      if (fromIndex < state.currentIndex && toIndex >= state.currentIndex) {
        newCurrentIndex--;
      } else if (fromIndex > state.currentIndex && toIndex <= state.currentIndex) {
        newCurrentIndex++;
      }

      return { queue: newQueue, currentIndex: newCurrentIndex };
    });
  },

  clearQueue: () => {
    const state = get();
    const currentTrack = state.queue[state.currentIndex];

    // If there's a current track, keep ONLY that track
    if (currentTrack) {
      set({
        queue: [currentTrack],
        currentIndex: 0,
        history: [],
        originalQueue: [currentTrack]
      });
    }
    // If no current track, do nothing - don't clear the queue entirely
    // This prevents accidentally removing a playing track
  },

  playNext: () => {
    const state = get();
    if (state.currentIndex < state.queue.length - 1) {
      const currentTrack = state.queue[state.currentIndex];
      const newIndex = state.currentIndex + 1;
      const nextTrack = state.queue[newIndex];

      set({
        currentIndex: newIndex,
        history: currentTrack ? [...state.history, currentTrack] : state.history,
      });

      // Update player
      usePlayerStore.getState().setCurrentTrack(nextTrack);
      usePlayerStore.getState().play();
    }
  },

  // Advance to next track without triggering playback (for crossfade)
  advanceToNext: () => {
    const state = get();
    if (state.currentIndex < state.queue.length - 1) {
      const currentTrack = state.queue[state.currentIndex];
      const newIndex = state.currentIndex + 1;
      const nextTrack = state.queue[newIndex];

      set({
        currentIndex: newIndex,
        history: currentTrack ? [...state.history, currentTrack] : state.history,
      });

      // Update player's current track info (but don't reload since crossfade already loaded it)
      const playerStore = usePlayerStore.getState();
      // Use internal setState to avoid triggering load
      usePlayerStore.setState({ currentTrack: nextTrack });
      playerStore.setIsPlaying(true);
    }
  },

  playPrevious: () => {
    const state = get();
    const playerStore = usePlayerStore.getState();

    // If we're more than 3 seconds into a track, restart it
    if (playerStore.currentTime > 3) {
      audioEngine.seek(0);
      playerStore.setCurrentTime(0);
      return;
    }

    if (state.history.length > 0) {
      const previousTrack = state.history[state.history.length - 1];
      const previousIndex = state.queue.findIndex((t) => t.id === previousTrack.id);
      set({
        currentIndex: previousIndex >= 0 ? previousIndex : Math.max(0, state.currentIndex - 1),
        history: state.history.slice(0, -1),
      });
      playerStore.setCurrentTrack(previousTrack);
      playerStore.play();
    } else if (state.currentIndex > 0) {
      const newIndex = state.currentIndex - 1;
      const previousTrack = state.queue[newIndex];
      set({ currentIndex: newIndex });
      playerStore.setCurrentTrack(previousTrack);
      playerStore.play();
    }
  },

  playTrackAt: (index) => {
    const state = get();
    if (index >= 0 && index < state.queue.length) {
      const currentTrack = state.queue[state.currentIndex];
      const newTrack = state.queue[index];
      set({
        currentIndex: index,
        history: currentTrack ? [...state.history, currentTrack] : state.history,
      });

      usePlayerStore.getState().setCurrentTrack(newTrack);
      usePlayerStore.getState().play();
    }
  },

  setShuffle: (shuffle) => {
    set({ shuffle });
    if (shuffle) {
      get().shuffleQueue();
    } else {
      get().unshuffleQueue();
    }
  },

  shuffleQueue: () => {
    set((state) => {
      const currentTrack = state.queue[state.currentIndex];
      const otherTracks = state.queue.filter((_, i) => i !== state.currentIndex);

      // Fisher-Yates shuffle
      for (let i = otherTracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherTracks[i], otherTracks[j]] = [otherTracks[j], otherTracks[i]];
      }

      // Keep current track at the front
      const shuffled = currentTrack ? [currentTrack, ...otherTracks] : otherTracks;
      return { queue: shuffled, currentIndex: 0 };
    });
  },

  unshuffleQueue: () => {
    set((state) => {
      const currentTrack = state.queue[state.currentIndex];
      const newIndex = state.originalQueue.findIndex((t) => t.id === currentTrack?.id);
      return {
        queue: [...state.originalQueue],
        currentIndex: newIndex >= 0 ? newIndex : 0,
      };
    });
  },

  hasNext: () => {
    const state = get();
    return state.currentIndex < state.queue.length - 1;
  },

  hasPrevious: () => {
    const state = get();
    return state.currentIndex > 0 || state.history.length > 0;
  },

  getCurrentTrack: () => {
    const state = get();
    return state.queue[state.currentIndex] || null;
  },
}),
    {
      name: 'campband-queue',
      partialize: (state) => ({
        queue: state.queue,
        currentIndex: state.currentIndex,
        shuffle: state.shuffle,
        originalQueue: state.originalQueue,
      }),
    }
  )
);
