import { create } from "zustand";
import { useConnectionStore } from "./connectionStore";

export type SettingsTab =
  | "general"
  | "skills"
  | "connectors"
  | "models"
  | "appearance"
  | "advanced"
  | "quota";

/** Partial config shape for the fields we expose in the UI */
export interface OpenClawConfigPartial {
  ui?: {
    seamColor?: string;
    assistant?: {
      name?: string;
      avatar?: string;
    };
  };
  models?: {
    providers?: Record<
      string,
      {
        baseUrl?: string;
        apiKey?: string;
        api?: string;
        auth?: string;
        models?: Array<{
          id: string;
          name?: string;
          reasoning?: boolean;
          input?: string[];
          cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
          contextWindow?: number;
          maxTokens?: number;
        }>;
      }
    >;
  };
  gateway?: {
    port?: number;
    bind?: string;
    auth?: {
      mode?: string;
      token?: string;
      password?: string;
      allowTailscale?: boolean;
    };
    reload?: {
      mode?: string;
      debounceMs?: number;
    };
  };
  agents?: {
    defaults?: {
      model?: string | { primary?: string; fallbacks?: string[] };
      maxConcurrent?: number;
      humanDelay?: {
        mode?: string;
        minMs?: number;
        maxMs?: number;
      };
    };
  };
  session?: {
    dmScope?: string;
    reset?: {
      mode?: string;
      atHour?: number;
      idleMinutes?: number;
    };
  };
  logging?: {
    level?: string;
    file?: string;
    consoleLevel?: string;
  };
  diagnostics?: {
    enabled?: boolean;
    otel?: {
      enabled?: boolean;
      endpoint?: string;
    };
  };
  messages?: {
    ackReaction?: string;
  };
  commands?: {
    native?: boolean;
    config?: boolean;
    debug?: boolean;
  };
  quota?: {
    enabled?: boolean;
    users?: Record<string, { limit: number; spent: number }>;
  };
}

interface ConfigGetResponse {
  raw: string;
  hash: string;
  config?: OpenClawConfigPartial;
  parsed?: OpenClawConfigPartial;
}

interface SettingsState {
  // Dialog state
  isOpen: boolean;
  activeTab: SettingsTab;

  // Config data
  config: OpenClawConfigPartial | null;
  configHash: string | null;
  isLoadingConfig: boolean;
  isSavingConfig: boolean;
  configError: string | null;

  // Actions - Dialog
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  setActiveTab: (tab: SettingsTab) => void;

  // Actions - Config
  loadConfig: () => Promise<void>;
  patchConfig: (
    patch: Record<string, unknown>,
  ) => Promise<{ ok: boolean; error?: string; needsRestart?: boolean }>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  isOpen: false,
  activeTab: "general",

  config: null,
  configHash: null,
  isLoadingConfig: false,
  isSavingConfig: false,
  configError: null,

  openSettings: (tab) => {
    set({
      isOpen: true,
      activeTab: tab ?? "general",
    });
    // Auto-load config when opening
    void get().loadConfig();
  },

  closeSettings: () =>
    set({
      isOpen: false,
    }),

  setActiveTab: (tab) =>
    set({
      activeTab: tab,
    }),

  loadConfig: async () => {
    const wsClient = useConnectionStore.getState().wsClient;
    if (!wsClient) {
      set({ configError: "未连接到网关" });
      return;
    }

    set({ isLoadingConfig: true, configError: null });
    try {
      const result = await wsClient.sendRequest<ConfigGetResponse>("config.get", {});
      // Use config first (has original values), fallback to parsed (may be redacted)
      const parsed =
        result?.config ?? result?.parsed ?? (result?.raw ? JSON.parse(result.raw) : null);
      set({
        config: parsed,
        configHash: result?.hash ?? null,
        isLoadingConfig: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "加载配置失败";
      set({ isLoadingConfig: false, configError: message });
    }
  },

  patchConfig: async (patch) => {
    const wsClient = useConnectionStore.getState().wsClient;
    if (!wsClient) {
      return { ok: false, error: "未连接到网关" };
    }

    const { configHash } = get();
    set({ isSavingConfig: true, configError: null });
    try {
      const result = await wsClient.sendRequest<{
        hash?: string;
        restart?: boolean;
        parsed?: OpenClawConfigPartial;
        raw?: string;
      }>("config.patch", {
        raw: JSON.stringify(patch),
        baseHash: configHash,
      });

      const newParsed = result?.parsed ?? (result?.raw ? JSON.parse(result.raw) : null);
      set({
        config: newParsed ?? get().config,
        configHash: result?.hash ?? get().configHash,
        isSavingConfig: false,
      });

      return { ok: true, needsRestart: result?.restart };
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存配置失败";
      set({ isSavingConfig: false, configError: message });
      return { ok: false, error: message };
    }
  },
}));
