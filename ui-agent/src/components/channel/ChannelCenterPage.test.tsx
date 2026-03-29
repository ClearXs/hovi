import { fireEvent, render, screen } from "@testing-library/react";

const mockLoadChannels = jest.fn();
const mockRefreshMonitor = jest.fn();
const mockOpenChannel = jest.fn();
const mockBackToGrid = jest.fn();
const mockSetDetailTab = jest.fn();
const mockSetMonitorWindow = jest.fn();
const mockLoadSelectedChannelConfig = jest.fn();
const mockSaveSelectedChannelConfig = jest.fn();
const mockCreateChannel = jest.fn().mockResolvedValue(undefined);
const mockProbeSelectedChannel = jest.fn();
const mockSetChannelConfigDraft = jest.fn();
const mockUseChannelConfigTemplate = jest.fn();

type MockStoreState = {
  view: "grid" | "detail";
  cards: Array<{
    channelId: string;
    label: string;
    configured: boolean;
    health: "healthy" | "warning" | "offline";
    accountTotal: number;
    accountConnected: number;
    alertCount: number;
  }>;
  selectedChannelId: string | null;
  activeDetailTab: "monitor" | "config" | "logs";
  monitorWindow: "5m" | "1h" | "24h";
  monitor: {
    channelId: string;
    ts: number;
    accounts: unknown[];
    alerts: unknown[];
    stream: unknown[];
    stats: {
      window: "5m" | "1h" | "24h";
      inbound: number;
      outbound: number;
      total: number;
      successRate: number;
      errorRate: number;
    };
  } | null;
  channelConfigDraft: string;
  isLoadingConfig: boolean;
  isSavingConfig: boolean;
  isCreatingChannel: boolean;
  isProbingChannel: boolean;
  isLoading: boolean;
  isRefreshingMonitor: boolean;
  error: string | null;
  createError: string | null;
  configError: string | null;
  createMessage: string | null;
  saveMessage: string | null;
  probeMessage: string | null;
  probeSuggestions: string[];
  probeDetails: Array<{
    accountId: string;
    connected?: boolean;
    configured?: boolean;
    running?: boolean;
    lastError?: string | null;
    reconnectAttempts?: number;
  }>;
  loadChannels: () => void;
  createChannel: (input: unknown) => Promise<void>;
  loadSelectedChannelConfig: () => void;
  saveSelectedChannelConfig: () => void;
  probeSelectedChannel: () => void;
  refreshMonitor: () => void;
  openChannel: (channelId: string, tab: "monitor" | "config" | "logs") => void;
  backToGrid: () => void;
  setDetailTab: (tab: "monitor" | "config" | "logs") => void;
  setMonitorWindow: (window: "5m" | "1h" | "24h") => void;
  setChannelConfigDraft: (next: string) => void;
  useChannelConfigTemplate: () => void;
};

const storeState: MockStoreState = {
  view: "grid",
  cards: [
    {
      channelId: "telegram",
      label: "Telegram",
      configured: true,
      health: "healthy" as const,
      accountTotal: 1,
      accountConnected: 1,
      alertCount: 0,
    },
  ],
  selectedChannelId: null,
  activeDetailTab: "monitor",
  monitorWindow: "1h",
  monitor: null,
  channelConfigDraft: "{}",
  isLoadingConfig: false,
  isSavingConfig: false,
  isCreatingChannel: false,
  isProbingChannel: false,
  isLoading: false,
  isRefreshingMonitor: false,
  error: null,
  createError: null,
  configError: null,
  createMessage: null,
  saveMessage: null,
  probeMessage: null,
  probeSuggestions: [],
  probeDetails: [],
  loadChannels: mockLoadChannels,
  createChannel: mockCreateChannel,
  loadSelectedChannelConfig: mockLoadSelectedChannelConfig,
  saveSelectedChannelConfig: mockSaveSelectedChannelConfig,
  probeSelectedChannel: mockProbeSelectedChannel,
  refreshMonitor: mockRefreshMonitor,
  openChannel: mockOpenChannel,
  backToGrid: mockBackToGrid,
  setDetailTab: mockSetDetailTab,
  setMonitorWindow: mockSetMonitorWindow,
  setChannelConfigDraft: mockSetChannelConfigDraft,
  useChannelConfigTemplate: mockUseChannelConfigTemplate,
};

jest.mock("@/stores/channelCenterStore", () => ({
  useChannelCenterStore: jest.fn((selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
  ),
}));

describe("ChannelCenterPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storeState.view = "grid";
    storeState.selectedChannelId = null;
    storeState.activeDetailTab = "monitor";
    storeState.monitor = null;
    storeState.createError = null;
    storeState.configError = null;
    storeState.createMessage = null;
    storeState.saveMessage = null;
    storeState.probeMessage = null;
    storeState.probeSuggestions = [];
    storeState.probeDetails = [];
  });

  test("renders channel grid and opens monitor detail", async () => {
    const { ChannelCenterPage } = await import("./ChannelCenterPage");
    render(<ChannelCenterPage />);

    expect(screen.getByText("频道")).toBeInTheDocument();
    expect(screen.getByText("Telegram")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "监控" }));
    expect(mockOpenChannel).toHaveBeenCalledWith("telegram", "monitor");
  });

  test("renders detail header when in detail view", async () => {
    storeState.view = "detail";
    storeState.selectedChannelId = "telegram";
    storeState.monitor = {
      channelId: "telegram",
      ts: Date.now(),
      accounts: [],
      alerts: [],
      stream: [],
      stats: {
        window: "1h",
        inbound: 0,
        outbound: 0,
        total: 0,
        successRate: 1,
        errorRate: 0,
      },
    };

    const { ChannelCenterPage } = await import("./ChannelCenterPage");
    render(<ChannelCenterPage />);

    expect(screen.getByText("Telegram")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "配置" })).toBeInTheDocument();
  });

  test("renders editable config tab controls", async () => {
    storeState.view = "detail";
    storeState.selectedChannelId = "telegram";
    storeState.activeDetailTab = "config";
    storeState.channelConfigDraft = '{\n  "enabled": true\n}';
    const { ChannelCenterPage } = await import("./ChannelCenterPage");
    render(<ChannelCenterPage />);

    expect(screen.getByRole("button", { name: "保存配置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "使用模板" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新加载" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "连通性探测" })).toBeInTheDocument();
  });
});
