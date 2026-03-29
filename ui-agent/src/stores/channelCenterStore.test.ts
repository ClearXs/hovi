import type { ChannelsStatusPayload, LogsTailPayload } from "@/services/channelApi";

const mockFetchChannelsStatus = jest.fn<
  Promise<ChannelsStatusPayload>,
  [params?: { probe?: boolean; timeoutMs?: number }]
>();
const mockFetchLogsTail = jest.fn<Promise<LogsTailPayload>, [params?: { cursor?: number }]>();
const mockFetchChannelConfigSection = jest.fn<
  Promise<{ hash: string; section: Record<string, unknown> | null }>,
  [channelId: string]
>();
const mockPatchChannelConfigSection = jest.fn<
  Promise<void>,
  [channelId: string, section: Record<string, unknown>, baseHash: string]
>();

jest.mock("@/services/channelApi", () => {
  const actual = jest.requireActual("@/services/channelApi");
  return {
    ...actual,
    fetchChannelsStatus: (params?: { probe?: boolean; timeoutMs?: number }) =>
      mockFetchChannelsStatus(params),
    fetchLogsTail: (params?: { cursor?: number }) => mockFetchLogsTail(params),
    fetchChannelConfigSection: (channelId: string) => mockFetchChannelConfigSection(channelId),
    patchChannelConfigSection: (
      channelId: string,
      section: Record<string, unknown>,
      baseHash: string,
    ) => mockPatchChannelConfigSection(channelId, section, baseHash),
  };
});

describe("channelCenterStore", () => {
  beforeEach(async () => {
    jest.resetModules();
    mockFetchChannelsStatus.mockReset();
    mockFetchLogsTail.mockReset();
    mockFetchChannelConfigSection.mockReset();
    mockPatchChannelConfigSection.mockReset();
  });

  it("loads channel cards from channels.status", async () => {
    const payload: ChannelsStatusPayload = {
      ts: Date.now(),
      channelOrder: ["telegram"],
      channelLabels: { telegram: "Telegram" },
      channels: {
        telegram: { configured: true },
      },
      channelAccounts: {
        telegram: [{ accountId: "default", configured: true, connected: true }],
      },
      channelDefaultAccountId: { telegram: "default" },
    };
    mockFetchChannelsStatus.mockResolvedValue(payload);
    mockFetchLogsTail.mockResolvedValue({
      file: "/tmp/openclaw.log",
      cursor: 0,
      size: 0,
      lines: [],
      truncated: false,
      reset: false,
    });

    const { useChannelCenterStore } = await import("./channelCenterStore");
    useChannelCenterStore.getState().reset();

    await useChannelCenterStore.getState().loadChannels();

    const state = useChannelCenterStore.getState();
    expect(state.cards).toHaveLength(1);
    expect(state.cards[0].channelId).toBe("telegram");
    expect(state.error).toBeNull();
  });

  it("opens channel detail and refreshes monitor data", async () => {
    const payload: ChannelsStatusPayload = {
      ts: Date.now(),
      channelOrder: ["telegram"],
      channelLabels: { telegram: "Telegram" },
      channels: {
        telegram: { configured: true },
      },
      channelAccounts: {
        telegram: [{ accountId: "default", configured: true, connected: true }],
      },
      channelDefaultAccountId: { telegram: "default" },
    };
    mockFetchChannelsStatus.mockResolvedValue(payload);
    mockFetchLogsTail.mockResolvedValue({
      file: "/tmp/openclaw.log",
      cursor: 120,
      size: 120,
      lines: [`[${new Date().toISOString()}] [telegram/default] inbound message from user123`],
      truncated: false,
      reset: false,
    });

    const { useChannelCenterStore } = await import("./channelCenterStore");
    useChannelCenterStore.getState().reset();

    await useChannelCenterStore.getState().loadChannels();
    useChannelCenterStore.getState().openChannel("telegram", "monitor");
    await useChannelCenterStore.getState().refreshMonitor();

    const state = useChannelCenterStore.getState();
    expect(state.selectedChannelId).toBe("telegram");
    expect(state.activeDetailTab).toBe("monitor");
    expect(state.monitor?.channelId).toBe("telegram");
    expect(state.monitor?.stream.length).toBe(1);
    expect(mockFetchLogsTail).toHaveBeenCalled();
  });

  it("stores error when status loading fails", async () => {
    mockFetchChannelsStatus.mockRejectedValue(new Error("status failed"));

    const { useChannelCenterStore } = await import("./channelCenterStore");
    useChannelCenterStore.getState().reset();

    await useChannelCenterStore.getState().loadChannels();

    expect(useChannelCenterStore.getState().error).toContain("status failed");
  });

  it("loads selected channel config draft when entering config tab", async () => {
    const payload: ChannelsStatusPayload = {
      ts: Date.now(),
      channelOrder: ["telegram"],
      channelLabels: { telegram: "Telegram" },
      channels: { telegram: { configured: true } },
      channelAccounts: { telegram: [{ accountId: "default", configured: true, connected: true }] },
      channelDefaultAccountId: { telegram: "default" },
    };
    mockFetchChannelsStatus.mockResolvedValue(payload);
    mockFetchLogsTail.mockResolvedValue({
      file: "/tmp/openclaw.log",
      cursor: 0,
      size: 0,
      lines: [],
      truncated: false,
      reset: false,
    });
    mockFetchChannelConfigSection.mockResolvedValue({
      hash: "hash-1",
      section: { enabled: true, botToken: "abc" },
    });

    const { useChannelCenterStore } = await import("./channelCenterStore");
    useChannelCenterStore.getState().reset();
    await useChannelCenterStore.getState().loadChannels();
    useChannelCenterStore.getState().openChannel("telegram", "config");
    await useChannelCenterStore.getState().loadSelectedChannelConfig();

    const state = useChannelCenterStore.getState();
    expect(state.channelConfigHash).toBe("hash-1");
    expect(state.channelConfigDraft).toContain('"enabled": true');
    expect(state.configError).toBeNull();
  });

  it("saves selected channel config and refreshes hash", async () => {
    const payload: ChannelsStatusPayload = {
      ts: Date.now(),
      channelOrder: ["telegram"],
      channelLabels: { telegram: "Telegram" },
      channels: { telegram: { configured: true } },
      channelAccounts: { telegram: [{ accountId: "default", configured: true, connected: true }] },
      channelDefaultAccountId: { telegram: "default" },
    };
    mockFetchChannelsStatus.mockResolvedValue(payload);
    mockFetchLogsTail.mockResolvedValue({
      file: "/tmp/openclaw.log",
      cursor: 0,
      size: 0,
      lines: [],
      truncated: false,
      reset: false,
    });
    mockFetchChannelConfigSection
      .mockResolvedValueOnce({
        hash: "hash-before",
        section: { enabled: true },
      })
      .mockResolvedValueOnce({
        hash: "hash-after",
        section: { enabled: true, dmPolicy: "open" },
      });
    mockPatchChannelConfigSection.mockResolvedValue();

    const { useChannelCenterStore } = await import("./channelCenterStore");
    useChannelCenterStore.getState().reset();
    await useChannelCenterStore.getState().loadChannels();
    useChannelCenterStore.getState().openChannel("telegram", "config");
    await useChannelCenterStore.getState().loadSelectedChannelConfig();

    useChannelCenterStore
      .getState()
      .setChannelConfigDraft(JSON.stringify({ enabled: true, dmPolicy: "open" }, null, 2));
    await useChannelCenterStore.getState().saveSelectedChannelConfig();

    const state = useChannelCenterStore.getState();
    expect(mockPatchChannelConfigSection).toHaveBeenCalledWith(
      "telegram",
      { enabled: true, dmPolicy: "open" },
      "hash-before",
    );
    expect(state.channelConfigHash).toBe("hash-after");
    expect(state.configError).toBeNull();
    expect(state.saveMessage).toBe("配置保存成功");
  });

  it("probes selected channel and updates message", async () => {
    const payload: ChannelsStatusPayload = {
      ts: Date.now(),
      channelOrder: ["telegram"],
      channelLabels: { telegram: "Telegram" },
      channels: { telegram: { configured: true } },
      channelAccounts: { telegram: [{ accountId: "default", configured: true, connected: true }] },
      channelDefaultAccountId: { telegram: "default" },
    };
    mockFetchChannelsStatus.mockResolvedValue(payload);

    const { useChannelCenterStore } = await import("./channelCenterStore");
    useChannelCenterStore.getState().reset();
    useChannelCenterStore.getState().openChannel("telegram", "config");

    await useChannelCenterStore.getState().probeSelectedChannel();

    const state = useChannelCenterStore.getState();
    expect(mockFetchChannelsStatus).toHaveBeenCalledWith({
      probe: true,
      timeoutMs: 15_000,
    });
    expect(state.cards).toHaveLength(1);
    expect(state.monitor?.channelId).toBe("telegram");
    expect(state.probeMessage).toContain("连通性探测成功");
    expect(state.probeDetails).toHaveLength(1);
    expect(state.probeDetails[0]?.accountId).toBe("default");
    expect(state.probeSuggestions).toHaveLength(0);
    expect(state.isProbingChannel).toBe(false);
  });

  it("stores probe error message when probe fails", async () => {
    mockFetchChannelsStatus.mockRejectedValue(new Error("probe timeout"));

    const { useChannelCenterStore } = await import("./channelCenterStore");
    useChannelCenterStore.getState().reset();
    useChannelCenterStore.getState().openChannel("telegram", "config");

    await useChannelCenterStore.getState().probeSelectedChannel();

    const state = useChannelCenterStore.getState();
    expect(state.isProbingChannel).toBe(false);
    expect(state.probeMessage).toContain("probe timeout");
    expect(state.probeDetails).toHaveLength(0);
    expect(state.probeSuggestions).toHaveLength(0);
  });

  it("builds channel specific probe suggestions when not connected", async () => {
    const payload: ChannelsStatusPayload = {
      ts: Date.now(),
      channelOrder: ["discord"],
      channelLabels: { discord: "Discord" },
      channels: { discord: { configured: true } },
      channelAccounts: {
        discord: [
          {
            accountId: "default",
            configured: true,
            connected: false,
            running: false,
            lastError: "token expired",
            reconnectAttempts: 2,
          },
        ],
      },
      channelDefaultAccountId: { discord: "default" },
    };
    mockFetchChannelsStatus.mockResolvedValue(payload);

    const { useChannelCenterStore } = await import("./channelCenterStore");
    useChannelCenterStore.getState().reset();
    useChannelCenterStore.getState().openChannel("discord", "config");

    await useChannelCenterStore.getState().probeSelectedChannel();

    const state = useChannelCenterStore.getState();
    expect(state.probeMessage).toContain("未发现在线账号");
    expect(state.probeSuggestions.some((item) => item.includes("Discord Bot Token"))).toBe(true);
    expect(state.probeSuggestions.some((item) => item.includes("Privileged Intents"))).toBe(true);
  });

  it("creates channel from wizard payload and opens config detail", async () => {
    const payload: ChannelsStatusPayload = {
      ts: Date.now(),
      channelOrder: ["telegram"],
      channelLabels: { telegram: "Telegram" },
      channels: { telegram: { configured: true } },
      channelAccounts: { telegram: [{ accountId: "default", configured: true, connected: false }] },
      channelDefaultAccountId: { telegram: "default" },
    };
    mockFetchChannelsStatus.mockResolvedValue(payload);
    mockFetchChannelConfigSection
      .mockResolvedValueOnce({
        hash: "hash-create",
        section: null,
      })
      .mockResolvedValueOnce({
        hash: "hash-after",
        section: { enabled: true, botToken: "bot-1", dmPolicy: "pairing" },
      });
    mockPatchChannelConfigSection.mockResolvedValue();

    const { useChannelCenterStore } = await import("./channelCenterStore");
    useChannelCenterStore.getState().reset();
    await useChannelCenterStore.getState().createChannel({
      channelId: "telegram",
      botToken: "bot-1",
      dmPolicy: "pairing",
      enabled: true,
    });

    const state = useChannelCenterStore.getState();
    expect(mockPatchChannelConfigSection).toHaveBeenCalledWith(
      "telegram",
      { enabled: true, botToken: "bot-1", dmPolicy: "pairing" },
      "hash-create",
    );
    expect(state.view).toBe("detail");
    expect(state.selectedChannelId).toBe("telegram");
    expect(state.activeDetailTab).toBe("config");
    expect(state.createMessage).toContain("新增");
    expect(state.createError).toBeNull();
  });

  it("creates telegram channel from section payload", async () => {
    const payload: ChannelsStatusPayload = {
      ts: Date.now(),
      channelOrder: ["telegram"],
      channelLabels: { telegram: "Telegram" },
      channels: { telegram: { configured: true } },
      channelAccounts: { telegram: [{ accountId: "default", configured: true, connected: false }] },
      channelDefaultAccountId: { telegram: "default" },
    };
    mockFetchChannelsStatus.mockResolvedValue(payload);
    mockFetchChannelConfigSection
      .mockResolvedValueOnce({
        hash: "hash-create-2",
        section: null,
      })
      .mockResolvedValueOnce({
        hash: "hash-after-2",
        section: { enabled: true, botToken: "bot-2", dmPolicy: "allowlist" },
      });
    mockPatchChannelConfigSection.mockResolvedValue();

    const { useChannelCenterStore } = await import("./channelCenterStore");
    useChannelCenterStore.getState().reset();
    await useChannelCenterStore.getState().createChannel({
      channelId: "telegram",
      enabled: true,
      section: {
        botToken: "bot-2",
        dmPolicy: "allowlist",
      },
    });

    expect(mockPatchChannelConfigSection).toHaveBeenCalledWith(
      "telegram",
      { enabled: true, botToken: "bot-2", dmPolicy: "allowlist" },
      "hash-create-2",
    );
  });

  it("creates unsupported channel with base enabled section", async () => {
    const payload: ChannelsStatusPayload = {
      ts: Date.now(),
      channelOrder: ["matrix"],
      channelLabels: { matrix: "Matrix" },
      channels: { matrix: { configured: false } },
      channelAccounts: { matrix: [{ accountId: "default", configured: false, connected: false }] },
      channelDefaultAccountId: { matrix: "default" },
    };
    mockFetchChannelsStatus.mockResolvedValue(payload);
    mockFetchChannelConfigSection
      .mockResolvedValueOnce({
        hash: "hash-create-matrix",
        section: null,
      })
      .mockResolvedValueOnce({
        hash: "hash-after-matrix",
        section: { enabled: true },
      });
    mockPatchChannelConfigSection.mockResolvedValue();

    const { useChannelCenterStore } = await import("./channelCenterStore");
    useChannelCenterStore.getState().reset();
    await useChannelCenterStore.getState().createChannel({
      channelId: "matrix",
      enabled: true,
    });

    expect(mockPatchChannelConfigSection).toHaveBeenCalledWith(
      "matrix",
      { enabled: true },
      "hash-create-matrix",
    );
  });

  it("creates unsupported channel with JSON section payload", async () => {
    const payload: ChannelsStatusPayload = {
      ts: Date.now(),
      channelOrder: ["line"],
      channelLabels: { line: "LINE" },
      channels: { line: { configured: false } },
      channelAccounts: { line: [{ accountId: "default", configured: false, connected: false }] },
      channelDefaultAccountId: { line: "default" },
    };
    mockFetchChannelsStatus.mockResolvedValue(payload);
    mockFetchChannelConfigSection
      .mockResolvedValueOnce({
        hash: "hash-create-line",
        section: null,
      })
      .mockResolvedValueOnce({
        hash: "hash-after-line",
        section: {
          enabled: true,
          channelAccessToken: "line-token",
          channelSecret: "line-secret",
        },
      });
    mockPatchChannelConfigSection.mockResolvedValue();

    const { useChannelCenterStore } = await import("./channelCenterStore");
    useChannelCenterStore.getState().reset();
    await useChannelCenterStore.getState().createChannel({
      channelId: "line",
      enabled: true,
      section: {
        enabled: true,
        channelAccessToken: "line-token",
        channelSecret: "line-secret",
      },
    });

    expect(mockPatchChannelConfigSection).toHaveBeenCalledWith(
      "line",
      {
        enabled: true,
        channelAccessToken: "line-token",
        channelSecret: "line-secret",
      },
      "hash-create-line",
    );
  });
});
