import { create } from "zustand";
import { useConnectionStore } from "@/stores/connectionStore";
import type { GatewaySessionRow, SessionsListResult } from "@/types/clawdbot";

type SessionDialogAction = "rename" | "reset" | "delete" | "details";

type SessionStore = {
  sessions: GatewaySessionRow[];
  isLoading: boolean;
  error: string | null;
  activeSessionKey: string | null;
  lastSeenByKey: Record<string, number>;
  searchQuery: string;
  filterKind: "all" | "direct" | "group" | "global" | "unknown";
  unreadOnly: boolean;
  sortMode: "recent" | "name";
  selectionMode: boolean;
  selectedKeys: string[];
  labelOverrides: Record<string, string>;
  fetchSessions: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  setFilterKind: (kind: SessionStore["filterKind"]) => void;
  setUnreadOnly: (value: boolean) => void;
  setSortMode: (mode: SessionStore["sortMode"]) => void;
  toggleSelectionMode: () => void;
  toggleSelectedKey: (key: string) => void;
  selectAllKeys: (keys: string[]) => void;
  clearSelection: () => void;
  selectSession: (key: string | null) => void;
  createSession: (label?: string) => Promise<string | null>;
  renameSession: (key: string, label: string) => Promise<void>;
  deleteSession: (key: string) => Promise<void>;
  markSeen: (key: string) => void;
  getSessionByKey: (key: string) => GatewaySessionRow | undefined;
  getFilteredSessions: () => GatewaySessionRow[];
  getUnreadMap: () => Record<string, boolean>;
  action?: SessionDialogAction;
};

const LAST_SEEN_KEY = "clawdbot.sessions.lastSeen.v1";
const PREFS_KEY = "clawdbot.sessions.prefs.v1";
const LABEL_OVERRIDES_KEY = "clawdbot.sessions.labelOverrides.v1";

type SessionPrefs = {
  filterKind?: SessionStore["filterKind"];
  sortMode?: SessionStore["sortMode"];
  unreadOnly?: boolean;
};

const loadLastSeen = (): Record<string, number> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed ?? {};
  } catch {
    return {};
  }
};

const persistLastSeen = (value: Record<string, number>) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(value));
};

const loadPrefs = (): SessionPrefs => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SessionPrefs;
  } catch {
    return {};
  }
};

const persistPrefs = (prefs: SessionPrefs) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
};

const loadLabelOverrides = (): Record<string, string> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LABEL_OVERRIDES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
};

const persistLabelOverrides = (value: Record<string, string>) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(LABEL_OVERRIDES_KEY, JSON.stringify(value));
};

const buildSessionKey = () => `agent:main:ui-${Date.now().toString(36)}`;

const prefs = loadPrefs();

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  isLoading: false,
  error: null,
  activeSessionKey: null,
  lastSeenByKey: loadLastSeen(),
  searchQuery: "",
  filterKind: prefs.filterKind ?? "all",
  unreadOnly: prefs.unreadOnly ?? false,
  sortMode: prefs.sortMode ?? "recent",
  selectionMode: false,
  selectedKeys: [],
  labelOverrides: loadLabelOverrides(),

  fetchSessions: async () => {
    const wsClient = useConnectionStore.getState().wsClient;
    if (!wsClient) return;
    set({ isLoading: true, error: null });
    try {
      const { searchQuery, filterKind } = get();
      const result = await wsClient.sendRequest<SessionsListResult>("sessions.list", {
        includeDerivedTitles: true,
        includeLastMessage: true,
        includeGlobal: true,
        includeUnknown: false,
        limit: 200,
        search: searchQuery.trim() || undefined,
      });
      set((state) => {
        const nextOverrides = { ...state.labelOverrides };
        const sessions = (result.sessions ?? []).map((session) => {
          const override = nextOverrides[session.key];
          if (session.label) {
            if (override) {
              delete nextOverrides[session.key];
            }
            return session;
          }
          if (override) {
            return { ...session, label: override };
          }
          return session;
        });
        persistLabelOverrides(nextOverrides);
        return {
          sessions,
          isLoading: false,
          selectedKeys: state.selectedKeys.filter((key) =>
            (result.sessions ?? []).some((session) => session.key === key),
          ),
          labelOverrides: nextOverrides,
        };
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load sessions",
      });
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  setFilterKind: (kind) =>
    set((state) => {
      const next = { ...state, filterKind: kind };
      persistPrefs({ filterKind: kind, sortMode: state.sortMode, unreadOnly: state.unreadOnly });
      return next;
    }),

  setUnreadOnly: (value) =>
    set((state) => {
      const next = { ...state, unreadOnly: value };
      persistPrefs({ filterKind: state.filterKind, sortMode: state.sortMode, unreadOnly: value });
      return next;
    }),

  setSortMode: (mode) =>
    set((state) => {
      const next = { ...state, sortMode: mode };
      persistPrefs({ filterKind: state.filterKind, sortMode: mode, unreadOnly: state.unreadOnly });
      return next;
    }),

  toggleSelectionMode: () =>
    set((state) => ({
      selectionMode: !state.selectionMode,
      selectedKeys: state.selectionMode ? [] : state.selectedKeys,
    })),

  toggleSelectedKey: (key) =>
    set((state) => {
      const exists = state.selectedKeys.includes(key);
      return {
        selectedKeys: exists
          ? state.selectedKeys.filter((item) => item !== key)
          : [...state.selectedKeys, key],
      };
    }),

  selectAllKeys: (keys) =>
    set({
      selectedKeys: [...new Set(keys)],
    }),

  clearSelection: () => set({ selectedKeys: [] }),

  selectSession: (key) => {
    set({ activeSessionKey: key });
    if (key) get().markSeen(key);
  },

  createSession: async (label) => {
    const wsClient = useConnectionStore.getState().wsClient;
    const connectionStatus = useConnectionStore.getState().status;
    if (!wsClient || !wsClient.isConnected()) {
      return null;
    }
    const key = buildSessionKey();
    try {
      // Store label in local overrides (webchat clients cannot use sessions.patch)
      if (label?.trim()) {
        set((state) => {
          const nextOverrides = { ...state.labelOverrides, [key]: label.trim() };
          persistLabelOverrides(nextOverrides);
          return { labelOverrides: nextOverrides };
        });
      }
      await wsClient.sendRequest("sessions.reset", { key });
      await get().fetchSessions();
      get().selectSession(key);
      return key;
    } catch (error) {
      if (label?.trim()) {
        set((state) => {
          if (!state.labelOverrides[key]) return state;
          const nextOverrides = { ...state.labelOverrides };
          delete nextOverrides[key];
          persistLabelOverrides(nextOverrides);
          return { labelOverrides: nextOverrides };
        });
      }
      return null;
    }
  },

  renameSession: async (key, label) => {
    const wsClient = useConnectionStore.getState().wsClient;
    if (!wsClient) return;
    await wsClient.sendRequest("sessions.patch", { key, label: label.trim() });
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.key === key ? { ...session, label: label.trim() } : session,
      ),
      labelOverrides: (() => {
        const next = { ...state.labelOverrides };
        if (next[key]) {
          delete next[key];
          persistLabelOverrides(next);
        }
        return next;
      })(),
    }));
  },

  deleteSession: async (key) => {
    const wsClient = useConnectionStore.getState().wsClient;
    if (!wsClient) return;
    const result = await wsClient.sendRequest<{ ok: true; deleted: boolean }>("sessions.delete", {
      key,
      deleteTranscript: true,
    });
    if (!result?.deleted) return;
    set((state) => ({
      sessions: state.sessions.filter((session) => session.key !== key),
      activeSessionKey: state.activeSessionKey === key ? null : state.activeSessionKey,
      labelOverrides: (() => {
        const next = { ...state.labelOverrides };
        if (next[key]) {
          delete next[key];
          persistLabelOverrides(next);
        }
        return next;
      })(),
    }));
  },

  markSeen: (key) => {
    const next = { ...get().lastSeenByKey, [key]: Date.now() };
    persistLastSeen(next);
    set({ lastSeenByKey: next });
  },

  getSessionByKey: (key) => get().sessions.find((session) => session.key === key),

  getFilteredSessions: () => {
    const { sessions, filterKind, unreadOnly, lastSeenByKey, activeSessionKey, sortMode } = get();
    let filtered = sessions;
    if (filterKind !== "all") {
      filtered = filtered.filter((session) => session.kind === filterKind);
    }
    if (unreadOnly) {
      filtered = filtered.filter((session) => {
        const updatedAt = session.updatedAt ?? 0;
        const lastSeen = lastSeenByKey[session.key] ?? 0;
        return session.key !== activeSessionKey && updatedAt > 0 && updatedAt > lastSeen;
      });
    }
    const sorted = [...filtered];
    if (sortMode === "name") {
      sorted.sort((a, b) => {
        const aName = (a.label || a.derivedTitle || a.displayName || "").toLowerCase();
        const bName = (b.label || b.derivedTitle || b.displayName || "").toLowerCase();
        return aName.localeCompare(bName, "zh-Hans-CN");
      });
    } else {
      sorted.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    }
    return sorted;
  },

  getUnreadMap: () => {
    const { sessions, lastSeenByKey, activeSessionKey } = get();
    const unreadMap: Record<string, boolean> = {};
    sessions.forEach((session) => {
      const updatedAt = session.updatedAt ?? 0;
      const lastSeen = lastSeenByKey[session.key] ?? 0;
      unreadMap[session.key] =
        session.key !== activeSessionKey && updatedAt > 0 && updatedAt > lastSeen;
    });
    return unreadMap;
  },
}));
