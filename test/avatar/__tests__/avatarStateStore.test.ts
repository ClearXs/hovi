import { describe, test, expect, beforeEach } from "vitest";

// Simplified test for avatarStateStore logic
// Testing the core state management concepts

interface AvatarStatePayload {
  type: "avatar_state";
  state: "idle" | "emote";
  emoteId: string | null;
  expression: string;
}

// Simple store simulation for testing
class SimpleAvatarStateStore {
  currentState: AvatarStatePayload | null = null;
  stateQueue: AvatarStatePayload[] = [];

  setAvatarState(state: AvatarStatePayload): void {
    if (!this.currentState) {
      this.currentState = state;
      return;
    }
    // Filter out duplicates with same state
    this.stateQueue = this.stateQueue.filter((s) => s.state !== state.state);
    this.stateQueue.push(state);
  }

  clearAvatarState(): void {
    this.currentState = null;
    this.stateQueue = [];
  }

  processNextState(): void {
    if (this.stateQueue.length > 0) {
      this.currentState = this.stateQueue.shift()!;
    }
  }
}

describe("avatarStateStore logic", () => {
  let store: SimpleAvatarStateStore;

  beforeEach(() => {
    store = new SimpleAvatarStateStore();
  });

  describe("initial state", () => {
    test("should have null currentState initially", () => {
      expect(store.currentState).toBeNull();
    });

    test("should have empty stateQueue initially", () => {
      expect(store.stateQueue).toEqual([]);
    });
  });

  describe("setAvatarState", () => {
    test("should set currentState when no state is active", () => {
      const payload: AvatarStatePayload = {
        type: "avatar_state",
        state: "idle",
        emoteId: null,
        expression: "neutral",
      };

      store.setAvatarState(payload);

      expect(store.currentState).toEqual(payload);
    });

    test("should queue state when currentState is already set", () => {
      const payload1: AvatarStatePayload = {
        type: "avatar_state",
        state: "idle",
        emoteId: null,
        expression: "neutral",
      };

      const payload2: AvatarStatePayload = {
        type: "avatar_state",
        state: "emote",
        emoteId: "wave",
        expression: "happy",
      };

      store.setAvatarState(payload1);
      store.setAvatarState(payload2);

      expect(store.currentState).toEqual(payload1);
      expect(store.stateQueue).toHaveLength(1);
      expect(store.stateQueue[0]).toEqual(payload2);
    });

    test("should filter out duplicate states in queue", () => {
      const payload1: AvatarStatePayload = {
        type: "avatar_state",
        state: "emote",
        emoteId: "wave",
        expression: "happy",
      };

      store.setAvatarState(payload1);
      store.setAvatarState(payload1);
      store.setAvatarState(payload1);

      // Should only have one emote in queue (the last one)
      expect(store.stateQueue.filter((s) => s.state === "emote")).toHaveLength(1);
    });
  });

  describe("clearAvatarState", () => {
    test("should clear currentState and stateQueue", () => {
      const payload: AvatarStatePayload = {
        type: "avatar_state",
        state: "emote",
        emoteId: "wave",
        expression: "happy",
      };

      store.setAvatarState(payload);
      store.clearAvatarState();

      expect(store.currentState).toBeNull();
      expect(store.stateQueue).toEqual([]);
    });
  });

  describe("processNextState", () => {
    test("should do nothing when queue is empty", () => {
      store.processNextState();

      expect(store.currentState).toBeNull();
    });

    test("should process next state from queue", () => {
      const payload1: AvatarStatePayload = {
        type: "avatar_state",
        state: "idle",
        emoteId: null,
        expression: "neutral",
      };

      const payload2: AvatarStatePayload = {
        type: "avatar_state",
        state: "emote",
        emoteId: "wave",
        expression: "happy",
      };

      store.setAvatarState(payload1);
      store.setAvatarState(payload2);
      store.processNextState();

      expect(store.currentState).toEqual(payload2);
      expect(store.stateQueue).toEqual([]);
    });
  });

  describe("state transitions", () => {
    test("should handle rapid state changes correctly", () => {
      const states: AvatarStatePayload[] = [
        { type: "avatar_state", state: "emote", emoteId: "wave", expression: "happy" },
        { type: "avatar_state", state: "emote", emoteId: "nod", expression: "neutral" },
        { type: "avatar_state", state: "emote", emoteId: "surprise", expression: "surprised" },
        { type: "avatar_state", state: "idle", emoteId: null, expression: "neutral" },
      ];

      // Apply all states rapidly
      states.forEach((state) => {
        store.setAvatarState(state);
      });

      // Process all queued states
      while (store.stateQueue.length > 0) {
        store.processNextState();
      }

      // Final state should be the last one
      expect(store.currentState).toEqual(states[states.length - 1]);
    });
  });
});
