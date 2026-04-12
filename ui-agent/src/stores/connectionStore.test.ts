const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn();
const mockIsConnected = jest.fn(() => false);
const mockAddEventListener = jest.fn();
const mockSendRequest = jest.fn();
let lastClientOptions:
  | {
      onConnected?: () => void;
      onDisconnected?: () => void;
      onError?: (error: Error) => void;
    }
  | undefined;

const MockClawdbotWebSocketClient = jest.fn().mockImplementation((options: unknown) => {
  lastClientOptions = options as typeof lastClientOptions;
  return {
    connect: mockConnect,
    disconnect: mockDisconnect,
    isConnected: mockIsConnected,
    addEventListener: mockAddEventListener,
    sendRequest: mockSendRequest,
  };
});

jest.mock("../services/clawdbot-websocket", () => ({
  ClawdbotWebSocketClient: MockClawdbotWebSocketClient,
}));

describe("connectionStore gateway client defaults", () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    delete process.env.NEXT_PUBLIC_CLIENT_ID;
    delete process.env.NEXT_PUBLIC_WS_URL;
    delete (window as Window & { __TAURI__?: unknown }).__TAURI__;
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    mockConnect.mockClear();
    mockDisconnect.mockClear();
    mockIsConnected.mockClear();
    mockAddEventListener.mockClear();
    mockSendRequest.mockClear();
    MockClawdbotWebSocketClient.mockClear();
    lastClientOptions = undefined;
  });

  it("uses the Control UI client id by default", async () => {
    let useConnectionStore: typeof import("./connectionStore").useConnectionStore | undefined;

    await jest.isolateModulesAsync(async () => {
      ({ useConnectionStore } = await import("./connectionStore"));
    });

    expect(useConnectionStore).toBeDefined();
    await useConnectionStore!.getState().connect();

    expect(MockClawdbotWebSocketClient).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "openclaw-control-ui",
      }),
    );
  });

  it("uses a locally saved gateway url when present", async () => {
    let useConnectionStore: typeof import("./connectionStore").useConnectionStore | undefined;
    localStorage.setItem("clawdbot.gateway.url", "ws://192.168.110.193:18789");

    await jest.isolateModulesAsync(async () => {
      ({ useConnectionStore } = await import("./connectionStore"));
    });

    expect(useConnectionStore).toBeDefined();
    await useConnectionStore!.getState().connect();

    expect(MockClawdbotWebSocketClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "ws://192.168.110.193:18789",
      }),
    );
  });

  it("defaults to the loopback desktop gateway url in tauri mode", async () => {
    let useConnectionStore: typeof import("./connectionStore").useConnectionStore | undefined;
    (window as Window & { __TAURI_INTERNALS__?: object }).__TAURI_INTERNALS__ = {};

    await jest.isolateModulesAsync(async () => {
      ({ useConnectionStore } = await import("./connectionStore"));
    });

    expect(useConnectionStore).toBeDefined();
    await useConnectionStore!.getState().connect();

    expect(MockClawdbotWebSocketClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "ws://127.0.0.1:18789",
      }),
    );
  });

  it("persists gateway url updates and resets the active connection", async () => {
    let useConnectionStore: typeof import("./connectionStore").useConnectionStore | undefined;

    await jest.isolateModulesAsync(async () => {
      ({ useConnectionStore } = await import("./connectionStore"));
    });

    expect(useConnectionStore).toBeDefined();
    await useConnectionStore!.getState().connect();
    useConnectionStore!.getState().setGatewayUrl(" ws://192.168.110.193:18789 ");

    expect(localStorage.getItem("clawdbot.gateway.url")).toBe("ws://192.168.110.193:18789");
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(useConnectionStore!.getState().gatewayUrl).toBe("ws://192.168.110.193:18789");
    expect(useConnectionStore!.getState().wsClient).toBeNull();
    expect(useConnectionStore!.getState().status).toBe("disconnected");
  });

  it("maps the legacy webchat-ui env override to the Control UI client id", async () => {
    let useConnectionStore: typeof import("./connectionStore").useConnectionStore | undefined;
    process.env.NEXT_PUBLIC_CLIENT_ID = "webchat-ui";

    await jest.isolateModulesAsync(async () => {
      ({ useConnectionStore } = await import("./connectionStore"));
    });

    expect(useConnectionStore).toBeDefined();
    await useConnectionStore!.getState().connect();

    expect(MockClawdbotWebSocketClient).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "openclaw-control-ui",
      }),
    );
  });

  it("approves pending device pairing directly via RPC", async () => {
    let useConnectionStore: typeof import("./connectionStore").useConnectionStore | undefined;
    mockIsConnected.mockReturnValue(true);
    mockSendRequest.mockResolvedValue({ requestId: "req-123" });

    await jest.isolateModulesAsync(async () => {
      ({ useConnectionStore } = await import("./connectionStore"));
    });

    expect(useConnectionStore).toBeDefined();
    await useConnectionStore!.getState().connect();
    useConnectionStore!.setState({ pairingRequestId: "req-123", pairingDeviceId: "dev-1" });

    await useConnectionStore!.getState().approvePairingRequest();

    expect(mockSendRequest).toHaveBeenCalledWith("device.pair.approve", {
      requestId: "req-123",
    });
    expect(useConnectionStore!.getState().pairingRequestId).toBeNull();
    expect(useConnectionStore!.getState().pairingDeviceId).toBeNull();
  });

  it("subscribes to session transcript events after connecting", async () => {
    let useConnectionStore: typeof import("./connectionStore").useConnectionStore | undefined;

    await jest.isolateModulesAsync(async () => {
      ({ useConnectionStore } = await import("./connectionStore"));
    });

    expect(useConnectionStore).toBeDefined();
    await useConnectionStore!.getState().connect();
    lastClientOptions?.onConnected?.();

    expect(mockSendRequest).toHaveBeenCalledWith("sessions.subscribe", {});
  });

  it("registers approval resolved listeners for exec and plugin approvals", async () => {
    let useConnectionStore: typeof import("./connectionStore").useConnectionStore | undefined;

    await jest.isolateModulesAsync(async () => {
      ({ useConnectionStore } = await import("./connectionStore"));
    });

    expect(useConnectionStore).toBeDefined();
    await useConnectionStore!.getState().connect();

    expect(mockAddEventListener).toHaveBeenCalledWith(
      "exec.approval.resolved",
      expect.any(Function),
    );
    expect(mockAddEventListener).toHaveBeenCalledWith(
      "plugin.approval.resolved",
      expect.any(Function),
    );
  });
});
