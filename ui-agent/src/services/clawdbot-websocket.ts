/**
 * Clawdbot WebSocket Client
 * Handles connection, authentication, and RPC communication with Clawdbot Gateway
 */

import type {
  WSMessage,
  WSRequest,
  WSResponse,
  WSEvent,
  ConnectParams,
  HelloPayload,
  ConnectChallengePayload,
} from "../types/clawdbot";
import {
  buildDeviceAuthPayload,
  loadOrCreateDeviceIdentity,
  signDevicePayload,
} from "./device-identity";

type EventHandler = (payload: unknown) => void;
type ResponseHandler = (response: WSResponse) => void;

export interface ClawdbotWebSocketClientOptions {
  url: string;
  token?: string;
  clientId?: string;
  clientVersion?: string;
  locale?: string;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Clawdbot WebSocket Client
 * Manages WebSocket connection and provides RPC-style API
 */
export class ClawdbotWebSocketClient {
  private ws: WebSocket | null = null;
  private options: Required<ClawdbotWebSocketClientOptions>;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private responseHandlers: Map<string, ResponseHandler> = new Map();
  private requestIdCounter = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isClosedManually = false;
  private connectNonce: string | null = null;

  constructor(options: ClawdbotWebSocketClientOptions) {
    // Merge with defaults
    this.options = {
      url: options.url,
      token: options.token || "",
      clientId: options.clientId || "ui-agent-web",
      clientVersion: options.clientVersion || "1.0.0",
      locale: options.locale || "zh-CN",
      autoReconnect: options.autoReconnect !== false,
      maxReconnectAttempts: options.maxReconnectAttempts || 10,
      reconnectDelay: options.reconnectDelay || 1000,
      onConnected: options.onConnected || (() => {}),
      onDisconnected: options.onDisconnected || (() => {}),
      onError: options.onError || (() => {}),
    };
  }

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.isClosedManually = false;
    this.connectNonce = null;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.options.url);

        this.ws.onopen = () => {
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          // Wait for challenge before resolving
        };

        this.ws.onmessage = async (event) => {
          try {
            const message = JSON.parse(event.data) as WSMessage;
            await this.handleMessage(message, resolve, reject);
          } catch (error) {
            this.options.onError(error as Error);
          }
        };

        this.ws.onerror = (event) => {
          this.isConnecting = false;
          const error = new Error("WebSocket connection error");
          this.options.onError(error);
          reject(error);
        };

        this.ws.onclose = (event) => {
          this.isConnecting = false;
          this.stopHeartbeat();
          this.ws = null;
          this.options.onDisconnected();

          // Auto-reconnect if not closed manually
          if (!this.isClosedManually && this.options.autoReconnect) {
            this.scheduleReconnect();
          }
        };

        // Connection timeout
        setTimeout(() => {
          if (this.isConnecting) {
            this.isConnecting = false;
            reject(new Error("Connection timeout"));
            this.ws?.close();
          }
        }, 10000); // 10 second timeout
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(
    message: WSMessage,
    connectResolve?: (value: void) => void,
    connectReject?: (reason: Error) => void,
  ): Promise<void> {
    if (message.type === "event") {
      const event = message as WSEvent;

      // Handle connect.challenge
      if (event.event === "connect.challenge") {
        const payload = event.payload as ConnectChallengePayload;
        this.connectNonce = payload.nonce;
        try {
          await this.sendConnectRequest();
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.options.onError(err);
          connectReject?.(err);
        }
      }

      // Notify event handlers
      const handlers = this.eventHandlers.get(event.event);
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(event.payload);
          } catch (error) {
            // Error in event handler
          }
        });
      }
    } else if (message.type === "res") {
      const response = message as WSResponse;

      // Handle connect response
      if (response.id.startsWith("connect-")) {
        if (response.ok) {
          const payload = response.payload as HelloPayload;
          this.options.onConnected();
          connectResolve?.();
        } else {
          const error = new Error(response.error?.message || "Connection failed");
          this.options.onError(error);
          connectReject?.(error);
        }
      }

      // Notify response handler
      const handler = this.responseHandlers.get(response.id);
      if (handler) {
        handler(response);
        this.responseHandlers.delete(response.id);
      }
    }
  }

  /**
   * Send connect request after receiving challenge
   */
  private async sendConnectRequest(): Promise<void> {
    const role = "operator";
    const scopes = ["operator.read", "operator.write", "operator.admin"];
    const params: ConnectParams = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: this.options.clientId,
        version: this.options.clientVersion,
        platform: "web",
        mode: "webchat", // Required: must be one of the predefined modes
      },
      caps: ["tool-events"], // Request tool events capability
      role,
      scopes,
      locale: this.options.locale,
    };

    // Add auth token if provided
    if (this.options.token) {
      params.auth = {
        token: this.options.token,
      };
    }

    const signedAt = Date.now();
    try {
      const identity = await loadOrCreateDeviceIdentity();
      const payload = buildDeviceAuthPayload({
        deviceId: identity.deviceId,
        clientId: params.client.id,
        clientMode: params.client.mode,
        role,
        scopes,
        signedAtMs: signedAt,
        token: this.options.token || null,
        nonce: this.connectNonce,
      });
      const signature = await signDevicePayload(identity.privateKey, payload);
      params.device = {
        id: identity.deviceId,
        publicKey: identity.publicKey,
        signature,
        signedAt,
        nonce: this.connectNonce || undefined,
      };
    } catch (error) {
      if (!this.options.token) {
        throw error;
      }
    }

    const request: WSRequest = {
      type: "req",
      id: `connect-${Date.now()}`,
      method: "connect",
      params: params as unknown as Record<string, unknown>,
    };

    this.send(request);
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    this.isClosedManually = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   * - First 3 attempts: 10 seconds interval
   * - After 3 failures: 60 seconds (1 minute) interval
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      // Continue trying even after max attempts, just with longer interval
      this.options.onError?.(new Error("Max reconnect attempts reached, will keep trying..."));
    }

    // First 3 attempts: 10 seconds, then switch to 60 seconds
    const delay = this.reconnectAttempts < 3 ? 10000 : 60000;

    this.reconnectAttempts++;

    console.log(
      `[WebSocket] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})...`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Reconnect failed, will schedule next attempt
      });
    }, delay);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    // Send heartbeat every 30 seconds
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Send a ping frame (browser WebSocket doesn't have built-in ping, so we use a JSON message)
        try {
          this.ws.send(JSON.stringify({ type: "ping" }));
        } catch (error) {
          console.warn("[ClawdbotWebSocket] Heartbeat failed:", error);
        }
      }
    }, 30000);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Send a raw WebSocket message
   */
  private send(message: WSRequest | WSMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send an RPC request and wait for response
   */
  async sendRequest<TPayload = unknown>(
    method: string,
    params?: Record<string, unknown> | ConnectParams,
  ): Promise<TPayload> {
    const id = `req-${++this.requestIdCounter}-${Date.now()}`;
    const request: WSRequest = {
      type: "req",
      id,
      method,
      params: params as Record<string, unknown>,
    };

    // Determine timeout based on method (long-running operations need longer timeout)
    const longRunningMethods = [
      "knowledge.rebuild",
      "knowledge.graph.build",
      "knowledge.graph.buildAll",
    ];
    const timeout = longRunningMethods.includes(method) ? 180000 : 30000; // 3 min for rebuild, 30s default

    return new Promise((resolve, reject) => {
      // Set up response handler
      this.responseHandlers.set(id, (response) => {
        if (response.ok) {
          resolve(response.payload as TPayload);
        } else {
          reject(new Error(response.error?.message || `Request ${method} failed`));
        }
      });

      // Send request
      try {
        this.send(request);
      } catch (error) {
        this.responseHandlers.delete(id);
        reject(error);
      }

      // Request timeout
      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error(`Request ${method} timeout`));
        }
      }, timeout);
    });
  }

  /**
   * Add an event listener
   */
  addEventListener(event: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Remove an event listener
   */
  removeEventListener(event: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    }
  }

  /**
   * Remove all event listeners for a specific event
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.eventHandlers.delete(event);
    } else {
      this.eventHandlers.clear();
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current connection state
   */
  getReadyState(): number | null {
    return this.ws?.readyState ?? null;
  }
}
