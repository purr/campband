import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track } from '@/types';
import { usePlayerStore } from './playerStore';
import { audioEngine } from '@/lib/audio';
import type { Route } from './routerStore';

// Lazy getter for router store to avoid circular dependency
let getRouterStore: (() => { currentRoute: Route }) | null = null;
export function setRouterStoreGetter(getter: () => { currentRoute: Route }) {
  getRouterStore = getter;
}

interface QueueState {
  // Queue
  queue: Track[];
  currentIndex: number;
  shuffle: boolean;

  // History (for previous button)
  history: Track[];

  // Original queue (for unshuffle)
  originalQueue: Track[];

  // Where playback started from (for "click album cover to go back" feature)
  playbackSourceRoute: Route | null;

  // Manual queue items (tracks added via insertNext/addToQueue - should be preserved)
  manualQueueItemIds: Set<number>;

  // Actions
  setQueue: (tracks: Track[], startIndex?: number, sourceRoute?: Route, clearManual?: boolean) => void;
  addToQueue: (track: Track) => void;
  addMultipleToQueue: (tracks: Track[]) => void;
  insertNext: (track: Track) => void;
  insertMultipleNext: (tracks: Track[]) => void;
  removeFromQueue: (index: number) => void;
  moveTrack: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  clearAutoQueue: () => void; // Clear auto-queue but preserve manual items

  // Navigation (also updates player)
  playNext: () => void;
  playPrevious: () => void;
  playTrackAt: (index: number) => void;
  advanceToNext: () => void; // For crossfade - advances without reloading

  // Shuffle
  setShuffle: (shuffle: boolean) => void;
  shuffleQueue: () => void;
  unshuffleQueue: () => void;

  // Loop/Repeat
  expandQueueForLoop: () => void; // Add remaining tracks from originalQueue when loop is enabled

  // Computed
  hasNext: () => boolean;
  hasPrevious: () => boolean;
  getCurrentTrack: () => Track | null;
  getPlaybackSourceRoute: () => Route | null;
}

export const useQueueStore = create<QueueState>()(
  persist(
    (set, get) => ({
  queue: [],
  currentIndex: -1,
  shuffle: false,
  history: [],
  originalQueue: [],
  playbackSourceRoute: null,
  manualQueueItemIds: new Set<number>(),

  setQueue: (tracks, startIndex = 0, sourceRoute, clearManual = false) => {
    const queue = [...tracks];

    // Get current route if no source provided
    let routeToStore = sourceRoute;
    if (routeToStore === undefined && getRouterStore) {
      routeToStore = getRouterStore().currentRoute;
    }

    // If clearManual is true, clear manual queue items
    // Otherwise, preserve manual items that are still in the new queue
    let manualQueueItemIds = new Set<number>();
    if (!clearManual) {
      const state = get();
      // Preserve manual items that exist in the new queue
      queue.forEach(track => {
        if (state.manualQueueItemIds.has(track.id)) {
          manualQueueItemIds.add(track.id);
        }
      });
    }

    console.log('[QueueStore] setQueue', {
      trackCount: queue.length,
      startIndex,
      clearManual,
      preservedManualItems: manualQueueItemIds.size
    });

    set({
      queue,
      originalQueue: [...tracks],
      currentIndex: startIndex,
      history: [],
      playbackSourceRoute: routeToStore ?? null,
      manualQueueItemIds,
    });

    // Update player's current track
    if (queue[startIndex]) {
      usePlayerStore.getState().setCurrentTrack(queue[startIndex]);
    }
  },

  addToQueue: (track) => {
    console.log('[QueueStore] addToQueue (manual)', track.id);
    set((state) => ({
      queue: [...state.queue, track],
      originalQueue: [...state.originalQueue, track],
      manualQueueItemIds: new Set([...state.manualQueueItemIds, track.id]),
    }));
  },

  addMultipleToQueue: (tracks) => {
    set((state) => ({
      queue: [...state.queue, ...tracks],
      originalQueue: [...state.originalQueue, ...tracks],
    }));
  },

  insertNext: (track) => {
    console.log('[QueueStore] insertNext (manual)', track.id);
    set((state) => {
      const newQueue = [...state.queue];
      newQueue.splice(state.currentIndex + 1, 0, track);
      return {
        queue: newQueue,
        manualQueueItemIds: new Set([...state.manualQueueItemIds, track.id]),
      };
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
        originalQueue: [currentTrack],
        manualQueueItemIds: new Set<number>(),
      });
    }
    // If no current track, do nothing - don't clear the queue entirely
    // This prevents accidentally removing a playing track
  },

  clearAutoQueue: () => {
    const state = get();
    const currentTrack = state.queue[state.currentIndex];

    // Keep current track + all manual queue items
    const manualItems = state.queue.filter(track =>
      state.manualQueueItemIds.has(track.id)
    );

    // If we have a current track, include it
    const newQueue = currentTrack
      ? [currentTrack, ...manualItems.filter(t => t.id !== currentTrack.id)]
      : manualItems;

    const newIndex = currentTrack ? 0 : -1;

    console.log('[QueueStore] clearAutoQueue', {
      before: state.queue.length,
      after: newQueue.length,
      manualItems: manualItems.length,
      currentTrack: currentTrack?.id
    });

    set({
      queue: newQueue,
      currentIndex: newIndex,
      originalQueue: newQueue,
      history: [],
      // Preserve manual queue item IDs
    });
  },

  playNext: () => {
    const state = get();
    const repeat = usePlayerStore.getState().repeat;

    // If loop is enabled, expand queue with remaining tracks first
    if (repeat === 'all') {
      get().expandQueueForLoop();
    }

    const updatedState = get();

    // Check if there's a next track in current queue
    if (updatedState.currentIndex < updatedState.queue.length - 1) {
      const currentTrack = updatedState.queue[updatedState.currentIndex];
      const newIndex = updatedState.currentIndex + 1;
      const nextTrack = updatedState.queue[newIndex];

      set({
        currentIndex: newIndex,
        history: currentTrack ? [...updatedState.history, currentTrack] : updatedState.history,
      });

      // Update player
      usePlayerStore.getState().setCurrentTrack(nextTrack);
      usePlayerStore.getState().play();
      return;
    }

    // If we're at the end and loop is enabled, go to first track
    if (repeat === 'all' && updatedState.originalQueue.length > 0) {
      const currentTrack = updatedState.queue[updatedState.currentIndex];

      // Loop back to first track in originalQueue
      const firstTrack = updatedState.originalQueue[0];
      if (firstTrack) {
        const firstIndex = updatedState.queue.findIndex(t => t.id === firstTrack.id);
        if (firstIndex !== -1) {
          // First track is already in queue
          console.log('[QueueStore] playNext - looping to first track (already in queue)', { firstIndex });
          set({
            currentIndex: firstIndex,
            history: currentTrack ? [...updatedState.history, currentTrack] : updatedState.history,
          });
          usePlayerStore.getState().setCurrentTrack(firstTrack);
          usePlayerStore.getState().play();
        } else {
          // First track not in queue, add it and play
          console.log('[QueueStore] playNext - looping to first track (adding to queue)');
          set({
            queue: [...updatedState.queue, firstTrack],
            currentIndex: updatedState.queue.length,
            history: currentTrack ? [...updatedState.history, currentTrack] : updatedState.history,
          });
          usePlayerStore.getState().setCurrentTrack(firstTrack);
          usePlayerStore.getState().play();
        }
      }
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

  expandQueueForLoop: () => {
    const state = get();
    const repeat = usePlayerStore.getState().repeat;

    // Only expand if loop (repeat all) is enabled
    if (repeat !== 'all') return;

    // Only expand if we have an originalQueue
    if (state.originalQueue.length === 0) return;

    const currentTrack = state.queue[state.currentIndex];
    if (!currentTrack) return;

    // Find current track in originalQueue
    const currentInOriginal = state.originalQueue.findIndex(t => t.id === currentTrack.id);
    if (currentInOriginal === -1) return;

    // Get remaining tracks from originalQueue (tracks after current in original order)
    const remainingTracks = state.originalQueue.slice(currentInOriginal + 1);

    // Get tracks that are already in queue (to avoid duplicates)
    const queueTrackIds = new Set(state.queue.map(t => t.id));

    // Add only tracks that aren't already in queue
    const tracksToAdd = remainingTracks.filter(t => !queueTrackIds.has(t.id));

    if (tracksToAdd.length > 0) {
      console.log('[QueueStore] expandQueueForLoop', {
        adding: tracksToAdd.length,
        currentIndex: currentInOriginal,
        originalLength: state.originalQueue.length,
        currentTrack: currentTrack.id
      });
      set((state) => ({
        queue: [...state.queue, ...tracksToAdd],
      }));
    }
  },

  hasNext: () => {
    const state = get();
    // Check if there's a next track in current queue
    if (state.currentIndex < state.queue.length - 1) {
      return true;
    }
    // If loop is enabled, check if there are more tracks in originalQueue
    const repeat = usePlayerStore.getState().repeat;
    if (repeat === 'all' && state.originalQueue.length > 0) {
      const currentTrack = state.queue[state.currentIndex];
      if (currentTrack) {
        const currentInOriginal = state.originalQueue.findIndex(t => t.id === currentTrack.id);
        // If we're not at the last track in originalQueue, there's more to play
        return currentInOriginal < state.originalQueue.length - 1;
      }
    }
    return false;
  },

  hasPrevious: () => {
    const state = get();
    return state.currentIndex > 0 || state.history.length > 0;
  },

  getCurrentTrack: () => {
    const state = get();
    return state.queue[state.currentIndex] || null;
  },

  getPlaybackSourceRoute: () => {
    return get().playbackSourceRoute;
  },
}),
    {
      name: 'campband-queue',
      partialize: (state) => ({
        queue: state.queue,
        currentIndex: state.currentIndex,
        shuffle: state.shuffle,
        originalQueue: state.originalQueue,
        playbackSourceRoute: state.playbackSourceRoute,
        manualQueueItemIds: Array.from(state.manualQueueItemIds), // Convert Set to Array for persistence
      }),
      // Restore Set from Array on load
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.manualQueueItemIds)) {
          state.manualQueueItemIds = new Set(state.manualQueueItemIds);
        } else if (state) {
          state.manualQueueItemIds = new Set<number>();
        }
      },
    }
  )
);
