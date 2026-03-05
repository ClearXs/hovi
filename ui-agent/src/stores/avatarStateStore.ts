/**
 * Avatar State Store
 * Manages avatar state from tool events
 */

import { create } from "zustand";

export interface AvatarStatePayload {
  type: "avatar_state";
  state: "idle" | "emote";
  emoteId: string | null;
  expression: string;
}

interface AvatarStateStore {
  // Current avatar state
  currentState: AvatarStatePayload | null;

  // Queue for handling rapid state changes
  stateQueue: AvatarStatePayload[];

  // Actions
  setAvatarState: (state: AvatarStatePayload) => void;
  clearAvatarState: () => void;
  processNextState: () => void;
}

export const useAvatarStateStore = create<AvatarStateStore>((set, get) => ({
  currentState: null,
  stateQueue: [],

  setAvatarState: (state) => {
    const { currentState, stateQueue } = get();

    // If no current state, apply immediately
    if (!currentState) {
      set({ currentState: state });
      return;
    }

    // Queue the state change
    // Remove any duplicate states in queue
    const filteredQueue = stateQueue.filter((s) => s.state !== state.state);
    set({ stateQueue: [...filteredQueue, state] });
  },

  clearAvatarState: () => {
    set({ currentState: null, stateQueue: [] });
  },

  processNextState: () => {
    const { stateQueue } = get();
    if (stateQueue.length > 0) {
      const [next, ...rest] = stateQueue;
      set({ currentState: next, stateQueue: rest });
    }
  },
}));
