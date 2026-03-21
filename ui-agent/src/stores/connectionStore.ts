/**
 * Connection Store
 * Manages WebSocket connection state using Zustand
 */

import { create } from "zustand";
import { normalizeGatewayClientId } from "../lib/gateway/client-info";
import { getGatewayWsBaseUrl } from "../lib/runtime/desktop-env";
import { ClawdbotWebSocketClient } from "../services/clawdbot-websocket";
import type { ConnectionStatus, DevicePairRequestedPayload } from "../types/clawdbot";

interface ConnectionStore {
  // State
  status: ConnectionStatus;
  wsClient: ClawdbotWebSocketClient | null;
  lastError: string | null;
  reconnectAttempts: number;
  lastConnectedAt: number | null;
  gatewayUrl: string;
  gatewayToken: string;
  pairingRequestId: string | null;
  pairingDeviceId: string | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  reset: () => void;
  setStatus: (status: ConnectionStatus) => void;
  setError: (error: string | null) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
  setGatewayUrl: (url: string) => void;
  setGatewayToken: (token: string) => void;
  clearPairingRequest: () => void;
}

const CLIENT_ID = normalizeGatewayClientId(process.env.NEXT_PUBLIC_CLIENT_ID);
const CLIENT_VERSION = process.env.NEXT_PUBLIC_CLIENT_VERSION || "1.0.0";
const URL_STORAGE_KEY = "clawdbot.gateway.url";
const TOKEN_STORAGE_KEY = "clawdbot.gateway.token";

function normalizeGatewayUrl(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed || getGatewayWsBaseUrl();
}

const getInitialGatewayUrl = (): string => {
  if (typeof window === "undefined") {
    return getGatewayWsBaseUrl();
  }

  return normalizeGatewayUrl(
    localStorage.getItem(URL_STORAGE_KEY) || process.env.NEXT_PUBLIC_WS_URL,
  );
};

const getInitialToken = (): string => {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_GATEWAY_TOKEN || "";
  }
  return localStorage.getItem(TOKEN_STORAGE_KEY) || process.env.NEXT_PUBLIC_GATEWAY_TOKEN || "";
};

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  // Initial state
  status: "disconnected",
  wsClient: null,
  lastError: null,
  reconnectAttempts: 0,
  lastConnectedAt: null,
  gatewayUrl: getInitialGatewayUrl(),
  gatewayToken: getInitialToken(),
  pairingRequestId: null,
  pairingDeviceId: null,

  // Connect to WebSocket
  connect: async () => {
    const { wsClient, status, gatewayToken, gatewayUrl } = get();

    // Already connected
    if (status === "connected" && wsClient?.isConnected()) {
      return;
    }

    // Connecting in progress
    if (status === "connecting") {
      return;
    }

    set({ status: "connecting", lastError: null });

    try {
      // Create new client if doesn't exist
      let client = wsClient;
      if (!client) {
        client = new ClawdbotWebSocketClient({
          url: gatewayUrl,
          token: gatewayToken,
          clientId: CLIENT_ID,
          clientVersion: CLIENT_VERSION,
          locale: "zh-CN",
          autoReconnect: true,
          maxReconnectAttempts: 10,
          reconnectDelay: 1000,

          onConnected: () => {
            set({
              status: "connected",
              lastError: null,
              reconnectAttempts: 0,
              lastConnectedAt: Date.now(),
              pairingRequestId: null,
              pairingDeviceId: null,
            });
          },

          onDisconnected: () => {
            const { status: currentStatus } = get();
            // Only update status if not manually disconnected
            if (currentStatus !== "disconnected") {
              set({ status: "disconnected" });
            }
          },

          onError: (error) => {
            set({
              status: "error",
              lastError: error.message,
            });
            get().incrementReconnectAttempts();
          },
        });

        client.addEventListener("device.pair.requested", (payload) => {
          const data = payload as DevicePairRequestedPayload;
          if (data?.requestId) {
            set({
              pairingRequestId: data.requestId,
              pairingDeviceId: data.deviceId ?? null,
            });
          }
        });

        set({ wsClient: client });
      }

      // Connect
      await client.connect();
    } catch (error) {
      set({
        status: "error",
        lastError: error instanceof Error ? error.message : "Connection failed",
      });
      get().incrementReconnectAttempts();
    }
  },

  // Disconnect from WebSocket
  disconnect: () => {
    const { wsClient } = get();
    if (wsClient) {
      wsClient.disconnect();
    }
    set({
      status: "disconnected",
      wsClient: null,
      lastError: null,
      reconnectAttempts: 0,
    });
  },

  // Reset connection state
  reset: () => {
    const { wsClient } = get();
    if (wsClient) {
      wsClient.disconnect();
    }
    set({
      status: "disconnected",
      wsClient: null,
      lastError: null,
      reconnectAttempts: 0,
      lastConnectedAt: null,
      pairingRequestId: null,
      pairingDeviceId: null,
    });
  },

  // Set connection status
  setStatus: (status) => {
    set({ status });
  },

  // Set error message
  setError: (error) => {
    set({ lastError: error });
  },

  // Increment reconnect attempts
  incrementReconnectAttempts: () => {
    set((state) => ({ reconnectAttempts: state.reconnectAttempts + 1 }));
  },

  // Reset reconnect attempts
  resetReconnectAttempts: () => {
    set({ reconnectAttempts: 0 });
  },

  setGatewayUrl: (url) => {
    const normalized = normalizeGatewayUrl(url);
    if (typeof window !== "undefined") {
      localStorage.setItem(URL_STORAGE_KEY, normalized);
    }
    const { wsClient } = get();
    if (wsClient) {
      wsClient.disconnect();
    }
    set({
      gatewayUrl: normalized,
      wsClient: null,
      status: "disconnected",
      lastError: null,
      reconnectAttempts: 0,
    });
  },

  setGatewayToken: (token) => {
    const trimmed = token.trim();
    if (typeof window !== "undefined") {
      if (trimmed) {
        localStorage.setItem(TOKEN_STORAGE_KEY, trimmed);
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }
    const { wsClient } = get();
    if (wsClient) {
      wsClient.disconnect();
    }
    set({
      gatewayToken: trimmed,
      wsClient: null,
      status: "disconnected",
      lastError: null,
      reconnectAttempts: 0,
    });
  },

  clearPairingRequest: () => {
    set({ pairingRequestId: null, pairingDeviceId: null });
  },
}));
