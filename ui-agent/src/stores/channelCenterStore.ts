import { create } from "zustand";
import {
  buildChannelCards,
  buildChannelMonitorSnapshot,
  type ChannelAccountSnapshot,
  fetchChannelsStatus,
  fetchChannelConfigSection,
  fetchLogsTail,
  patchChannelConfigSection,
  type ChannelCardVM,
  type ChannelMonitorSnapshotVM,
  type ChannelMonitorWindow,
  type ChannelsStatusPayload,
} from "@/services/channelApi";

export type ChannelDetailTab = "monitor" | "config" | "logs";
export type ChannelCenterView = "grid" | "detail";
export type ChannelCreateInput = {
  channelId: string;
  enabled?: boolean;
  section?: Record<string, unknown>;
  botToken?: string;
  token?: string;
  appToken?: string;
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  groupPolicy?: "allowlist" | "open" | "disabled";
};

type ChannelCenterStore = {
  view: ChannelCenterView;
  cards: ChannelCardVM[];
  selectedChannelId: string | null;
  activeDetailTab: ChannelDetailTab;
  monitorWindow: ChannelMonitorWindow;
  monitor: ChannelMonitorSnapshotVM | null;
  channelConfigDraft: string;
  channelConfigHash: string | null;
  statusPayload: ChannelsStatusPayload | null;
  logCursor?: number;
  logLines: string[];
  isLoading: boolean;
  isRefreshingMonitor: boolean;
  isLoadingConfig: boolean;
  isSavingConfig: boolean;
  isCreatingChannel: boolean;
  isProbingChannel: boolean;
  error: string | null;
  createError: string | null;
  configError: string | null;
  createMessage: string | null;
  saveMessage: string | null;
  probeMessage: string | null;
  probeDetails: ChannelAccountSnapshot[];
  probeSuggestions: string[];
  lastUpdatedAt: number | null;
  reset: () => void;
  loadChannels: () => Promise<void>;
  openChannel: (channelId: string, tab?: ChannelDetailTab) => void;
  backToGrid: () => void;
  setDetailTab: (tab: ChannelDetailTab) => void;
  setMonitorWindow: (window: ChannelMonitorWindow) => void;
  setChannelConfigDraft: (draft: string) => void;
  useChannelConfigTemplate: () => void;
  createChannel: (input: ChannelCreateInput) => Promise<void>;
  loadSelectedChannelConfig: () => Promise<void>;
  saveSelectedChannelConfig: () => Promise<void>;
  probeSelectedChannel: () => Promise<void>;
  refreshMonitor: () => Promise<void>;
};

const MAX_LOG_LINES = 2000;

const initialState = {
  view: "grid" as ChannelCenterView,
  cards: [] as ChannelCardVM[],
  selectedChannelId: null as string | null,
  activeDetailTab: "monitor" as ChannelDetailTab,
  monitorWindow: "1h" as ChannelMonitorWindow,
  monitor: null as ChannelMonitorSnapshotVM | null,
  channelConfigDraft: "",
  channelConfigHash: null as string | null,
  statusPayload: null as ChannelsStatusPayload | null,
  logCursor: undefined as number | undefined,
  logLines: [] as string[],
  isLoading: false,
  isRefreshingMonitor: false,
  isLoadingConfig: false,
  isSavingConfig: false,
  isCreatingChannel: false,
  isProbingChannel: false,
  error: null as string | null,
  createError: null as string | null,
  configError: null as string | null,
  createMessage: null as string | null,
  saveMessage: null as string | null,
  probeMessage: null as string | null,
  probeDetails: [] as ChannelAccountSnapshot[],
  probeSuggestions: [] as string[],
  lastUpdatedAt: null as number | null,
};

function buildChannelConfigTemplate(channelId: string): Record<string, unknown> {
  if (channelId === "telegram") {
    return { enabled: true, botToken: "" };
  }
  if (channelId === "discord") {
    return { enabled: true, token: "", groupPolicy: "allowlist" };
  }
  if (channelId === "slack") {
    return { enabled: true, botToken: "", appToken: "" };
  }
  return { enabled: true };
}

function buildChannelCreateSection(
  input: ChannelCreateInput,
  existingSection: Record<string, unknown> | null,
): Record<string, unknown> {
  const base = existingSection ?? buildChannelConfigTemplate(input.channelId);
  const enabled = input.enabled ?? true;
  if (input.section && typeof input.section === "object" && !Array.isArray(input.section)) {
    const merged = {
      ...base,
      ...input.section,
      enabled,
    };
    if (input.channelId === "telegram") {
      const botToken = String((merged as { botToken?: unknown }).botToken ?? "").trim();
      if (!botToken) {
        throw new Error("请填写 Telegram Bot Token");
      }
    }
    if (input.channelId === "discord") {
      const token = String((merged as { token?: unknown }).token ?? "").trim();
      if (!token) {
        throw new Error("请填写 Discord Bot Token");
      }
    }
    if (input.channelId === "slack") {
      const botToken = String((merged as { botToken?: unknown }).botToken ?? "").trim();
      const appToken = String((merged as { appToken?: unknown }).appToken ?? "").trim();
      if (!botToken || !appToken) {
        throw new Error("请填写 Slack Bot Token 与 App Token");
      }
    }
    return merged;
  }

  if (input.channelId === "telegram") {
    const botToken = (input.botToken ?? "").trim();
    if (!botToken) {
      throw new Error("请填写 Telegram Bot Token");
    }
    return {
      ...base,
      enabled,
      botToken,
      dmPolicy: input.dmPolicy ?? "pairing",
    };
  }
  if (input.channelId === "discord") {
    const token = (input.token ?? "").trim();
    if (!token) {
      throw new Error("请填写 Discord Bot Token");
    }
    return {
      ...base,
      enabled,
      token,
      groupPolicy: input.groupPolicy ?? "allowlist",
    };
  }
  if (input.channelId === "slack") {
    const botToken = (input.botToken ?? "").trim();
    const appToken = (input.appToken ?? "").trim();
    if (!botToken || !appToken) {
      throw new Error("请填写 Slack Bot Token 与 App Token");
    }
    return {
      ...base,
      enabled,
      botToken,
      appToken,
    };
  }

  return {
    ...base,
    enabled,
  };
}

function buildProbeSuggestions(
  channelId: string,
  accounts: ChannelAccountSnapshot[],
  hasConnectedAccount: boolean,
): string[] {
  if (hasConnectedAccount) {
    return [];
  }
  const suggestions = new Set<string>();
  if (accounts.some((account) => account.configured === false)) {
    suggestions.add("请先补全该频道账号配置并保存。");
  }
  if (accounts.some((account) => (account.reconnectAttempts ?? 0) > 0)) {
    suggestions.add("检测到重连，建议检查网关网络连通性与代理配置。");
  }
  if (accounts.some((account) => (account.lastError ?? "").toLowerCase().includes("token"))) {
    suggestions.add("检测到鉴权错误，请检查凭证是否过期并重新生成。");
  }
  if (channelId === "telegram") {
    suggestions.add("请检查 Telegram Bot Token 是否有效。");
    suggestions.add("请确认 Bot 已被正确拉入目标群组并具备发言权限。");
  } else if (channelId === "discord") {
    suggestions.add("请检查 Discord Bot Token 是否有效。");
    suggestions.add("请确认已开启 Privileged Intents。");
    suggestions.add("请确认 Bot 已被邀请到目标服务器且权限完整。");
  } else if (channelId === "slack") {
    suggestions.add("请检查 Slack Bot Token 与 App Token 是否匹配且未过期。");
    suggestions.add("请确认已启用 Socket Mode，并完成应用安装授权。");
  } else {
    suggestions.add("请核对该频道配置字段是否完整、凭证是否有效。");
  }
  suggestions.add("请在日志页查看最新错误并按错误关键字继续排查。");
  return Array.from(suggestions);
}

export const useChannelCenterStore = create<ChannelCenterStore>((set, get) => ({
  ...initialState,

  reset: () => {
    set(initialState);
  },

  loadChannels: async () => {
    set({ isLoading: true, error: null });
    try {
      const payload = await fetchChannelsStatus();
      const cards = buildChannelCards(payload);
      const selectedChannelId = get().selectedChannelId;
      const stillExists =
        selectedChannelId != null && cards.some((card) => card.channelId === selectedChannelId);
      set({
        statusPayload: payload,
        cards,
        selectedChannelId: stillExists ? selectedChannelId : null,
        view: stillExists ? get().view : "grid",
        isLoading: false,
        lastUpdatedAt: Date.now(),
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "加载频道失败",
      });
    }
  },

  openChannel: (channelId, tab = "monitor") => {
    set({
      selectedChannelId: channelId,
      activeDetailTab: tab,
      view: "detail",
      error: null,
      createError: null,
      createMessage: null,
      configError: null,
      saveMessage: null,
      probeMessage: null,
      probeDetails: [],
      probeSuggestions: [],
    });
  },

  backToGrid: () => {
    set({
      view: "grid",
      createError: null,
      createMessage: null,
    });
  },

  setDetailTab: (tab) => {
    set({ activeDetailTab: tab });
  },

  setChannelConfigDraft: (draft) => {
    set({ channelConfigDraft: draft, saveMessage: null });
  },

  useChannelConfigTemplate: () => {
    const channelId = get().selectedChannelId;
    if (!channelId) {
      return;
    }
    const template = buildChannelConfigTemplate(channelId);
    set({
      channelConfigDraft: JSON.stringify(template, null, 2),
      configError: null,
      saveMessage: null,
    });
  },

  createChannel: async (input) => {
    set({
      isCreatingChannel: true,
      createError: null,
      createMessage: null,
      error: null,
    });
    try {
      const current = await fetchChannelConfigSection(input.channelId);
      if (!current.hash) {
        throw new Error("配置哈希缺失，请稍后重试");
      }
      const section = buildChannelCreateSection(input, current.section);
      await patchChannelConfigSection(input.channelId, section, current.hash);

      set({
        isCreatingChannel: false,
        createMessage: `已新增 ${input.channelId} 频道`,
        selectedChannelId: input.channelId,
        activeDetailTab: "config",
        view: "detail",
      });
      await get().loadChannels();
      await get().loadSelectedChannelConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : "新增频道失败";
      set({
        isCreatingChannel: false,
        createError: message,
      });
      throw new Error(message);
    }
  },

  loadSelectedChannelConfig: async () => {
    const channelId = get().selectedChannelId;
    if (!channelId) {
      return;
    }
    set({
      isLoadingConfig: true,
      configError: null,
      saveMessage: null,
      probeSuggestions: [],
    });
    try {
      const result = await fetchChannelConfigSection(channelId);
      const section = result.section ?? buildChannelConfigTemplate(channelId);
      set({
        isLoadingConfig: false,
        channelConfigHash: result.hash || null,
        channelConfigDraft: JSON.stringify(section, null, 2),
        configError: null,
        saveMessage: null,
      });
    } catch (error) {
      set({
        isLoadingConfig: false,
        configError: error instanceof Error ? error.message : "加载频道配置失败",
        saveMessage: null,
      });
    }
  },

  saveSelectedChannelConfig: async () => {
    const channelId = get().selectedChannelId;
    const baseHash = get().channelConfigHash;
    if (!channelId) {
      return;
    }
    if (!baseHash) {
      set({ configError: "配置哈希缺失，请先重新加载配置" });
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      const draft = get().channelConfigDraft.trim();
      parsed = draft ? (JSON.parse(draft) as Record<string, unknown>) : {};
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("配置必须是 JSON 对象");
      }
    } catch (error) {
      set({
        configError: error instanceof Error ? error.message : "配置 JSON 解析失败",
        saveMessage: null,
      });
      return;
    }

    set({ isSavingConfig: true, configError: null, saveMessage: null });
    try {
      await patchChannelConfigSection(channelId, parsed, baseHash);
      const refreshed = await fetchChannelConfigSection(channelId);
      set({
        isSavingConfig: false,
        channelConfigHash: refreshed.hash || null,
        channelConfigDraft: JSON.stringify(
          refreshed.section ?? buildChannelConfigTemplate(channelId),
          null,
          2,
        ),
        configError: null,
        saveMessage: "配置保存成功",
      });
      await get().loadChannels();
    } catch (error) {
      set({
        isSavingConfig: false,
        configError: error instanceof Error ? error.message : "保存频道配置失败",
        saveMessage: null,
      });
    }
  },

  probeSelectedChannel: async () => {
    const selectedChannelId = get().selectedChannelId;
    if (!selectedChannelId) {
      return;
    }

    set({
      isProbingChannel: true,
      probeMessage: null,
      probeDetails: [],
      probeSuggestions: [],
      error: null,
    });
    try {
      const payload = await fetchChannelsStatus({
        probe: true,
        timeoutMs: 15_000,
      });
      const cards = buildChannelCards(payload);
      const monitor = buildChannelMonitorSnapshot({
        channelId: selectedChannelId,
        payload,
        logLines: get().logLines,
        window: get().monitorWindow,
      });
      const details = payload.channelAccounts[selectedChannelId] ?? [];
      const hasConnectedAccount = (payload.channelAccounts[selectedChannelId] ?? []).some(
        (account) => account.connected,
      );
      const suggestions = buildProbeSuggestions(selectedChannelId, details, hasConnectedAccount);
      set({
        statusPayload: payload,
        cards,
        monitor,
        isProbingChannel: false,
        probeDetails: details,
        probeSuggestions: suggestions,
        probeMessage: hasConnectedAccount
          ? "连通性探测成功：当前频道已连接。"
          : "连通性探测完成：未发现在线账号，请检查配置。",
        lastUpdatedAt: Date.now(),
      });
    } catch (error) {
      set({
        isProbingChannel: false,
        probeDetails: [],
        probeSuggestions: [],
        probeMessage:
          error instanceof Error ? `连通性探测失败：${error.message}` : "连通性探测失败",
      });
    }
  },

  setMonitorWindow: (window) => {
    set({ monitorWindow: window });
    const { selectedChannelId, statusPayload, logLines } = get();
    if (!selectedChannelId || !statusPayload) {
      return;
    }
    set({
      monitor: buildChannelMonitorSnapshot({
        channelId: selectedChannelId,
        payload: statusPayload,
        logLines,
        window,
      }),
    });
  },

  refreshMonitor: async () => {
    const selectedChannelId = get().selectedChannelId;
    if (!selectedChannelId) {
      return;
    }

    set({ isRefreshingMonitor: true, error: null });
    try {
      const [payload, tail] = await Promise.all([
        fetchChannelsStatus(),
        fetchLogsTail({ cursor: get().logCursor }),
      ]);
      const previousLines = tail.reset ? [] : get().logLines;
      const mergedLines = [...previousLines, ...(tail.lines ?? [])].slice(-MAX_LOG_LINES);
      const monitor = buildChannelMonitorSnapshot({
        channelId: selectedChannelId,
        payload,
        logLines: mergedLines,
        window: get().monitorWindow,
      });

      set({
        statusPayload: payload,
        cards: buildChannelCards(payload),
        monitor,
        logCursor: tail.cursor,
        logLines: mergedLines,
        isRefreshingMonitor: false,
        lastUpdatedAt: Date.now(),
      });
    } catch (error) {
      set({
        isRefreshingMonitor: false,
        error: error instanceof Error ? error.message : "刷新频道监控失败",
      });
    }
  },
}));
