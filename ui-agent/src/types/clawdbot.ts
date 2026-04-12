/**
 * Clawdbot WebSocket API Type Definitions
 * Based on Clawdbot API v1.0.0 Documentation
 */

// ============================================================================
// WebSocket Message Types
// ============================================================================

/**
 * WebSocket message frame types
 */
export type WSMessageType = "req" | "res" | "event";

/**
 * Base WebSocket message structure
 */
export interface WSMessage {
  type: WSMessageType;
}

/**
 * WebSocket Request message
 */
export interface WSRequest extends WSMessage {
  type: "req";
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * WebSocket Response message
 */
export interface WSResponse extends WSMessage {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: WSError;
}

/**
 * WebSocket Event message
 */
export interface WSEvent extends WSMessage {
  type: "event";
  event: string;
  payload: unknown;
  seq?: number;
  stateVersion?: number;
}

/**
 * WebSocket Error structure
 */
export interface WSError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Connection & Authentication
// ============================================================================

/**
 * Connection challenge event payload
 */
export interface ConnectChallengePayload {
  nonce: string;
  ts: number;
}

export interface DevicePairRequestedPayload {
  requestId: string;
  deviceId: string;
  ts?: number;
}

export interface GatewaySessionRow {
  key: string;
  kind: "direct" | "group" | "global" | "unknown";
  label?: string;
  displayName?: string;
  derivedTitle?: string;
  lastMessagePreview?: string;
  channel?: string;
  subject?: string;
  groupChannel?: string;
  space?: string;
  updatedAt: number | null;
  sessionId?: string;
  systemSent?: boolean;
  abortedLastRun?: boolean;
  sendPolicy?: "allow" | "deny";
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  responseUsage?: "on" | "off" | "tokens" | "full";
  modelProvider?: string;
  model?: string;
  contextTokens?: number;
  lastChannel?: string;
  lastTo?: string;
  lastAccountId?: string;
}

export interface SessionsListResult {
  ts: number;
  path: string;
  count: number;
  defaults: {
    modelProvider: string | null;
    model: string | null;
    contextTokens: number | null;
  };
  sessions: GatewaySessionRow[];
}

/**
 * Connect request parameters
 */
export interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    version: string;
    platform: "web" | "ios" | "android" | "macos" | "linux";
    mode: "webchat" | "cli" | "ui" | "backend" | "node" | "probe" | "test";
  };
  caps?: string[];
  role: "operator" | "node";
  scopes: string[];
  auth?: {
    token?: string;
  };
  device?: {
    id: string;
    publicKey: string;
    signature: string;
    signedAt: number;
    nonce?: string;
  };
  locale?: string;
  userAgent?: string;
}

/**
 * Hello response payload
 */
export interface HelloPayload {
  type: "hello-ok";
  protocol: number;
  policy?: {
    tickIntervalMs?: number;
  };
}

// ============================================================================
// Agent Message Types
// ============================================================================

/**
 * Attachment for multimodal content
 */
export interface Attachment {
  type: "image" | "file";
  mimeType: string;
  fileName?: string;
  content: string; // Base64 encoded
}

/**
 * Agent request parameters
 */
export interface AgentParams {
  message: string;
  sessionKey?: string;
  deliver?: boolean;
  idempotencyKey: string;
  thinking?: "low" | "default" | "medium" | "extended";
  timeout?: number;
  attachments?: Attachment[];
  channel?: string;
  accountId?: string;
  threadId?: string;
  groupId?: string;
  extraSystemPrompt?: string;
  label?: string;
  lane?: string;
}

/**
 * Agent response payload
 */
export interface AgentResponsePayload {
  runId: string;
}

/**
 * Token usage information
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Agent message event payload
 */
export interface AgentMessagePayload {
  sessionKey: string;
  message: string;
  runId: string;
  status: "completed" | "error";
  model: string;
  usage?: TokenUsage;
}

/**
 * Agent wait parameters
 */
export interface AgentWaitParams {
  runId: string;
  timeoutMs?: number;
}

/**
 * Agent wait response
 */
export interface AgentWaitResponse {
  status: "ok" | "timeout" | "error" | "unknown";
  startedAt?: number;
  endedAt?: number;
  error?: string | null;
}

// ============================================================================
// Chat History Types
// ============================================================================

/**
 * Message role types
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * Content part types
 */
export interface ContentPart {
  type: "text" | "image" | "audio" | "file" | "tool_use" | "tool_result";
  text?: string;
  image?: ImageContent;
  audio?: BinaryContent;
  file?: BinaryContent;
  toolUse?: ToolUse;
  toolResult?: ToolResult;
  source?: BinaryContent["source"];
  fileName?: string;
}

/**
 * Image content
 */
export interface ImageContent {
  source: BinaryContent["source"];
}

export interface BinaryContent {
  source: {
    type: "base64" | "url";
    media_type: string;
    data?: string;
    url?: string;
  };
}

/**
 * Tool use information
 */
export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool result information
 */
export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/**
 * Chat message
 */
export interface ChatMessage {
  role: MessageRole;
  content: string | ContentPart[];
  timestamp?: number;
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

/**
 * Tool call information
 */
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Chat history parameters
 */
export interface ChatHistoryParams {
  sessionKey?: string;
  limit?: number;
  maxBytes?: number;
}

/**
 * Chat history response
 */
export interface ChatHistoryResponse {
  messages: ChatMessage[];
  sessionKey: string;
  sessionId: string;
  truncated: boolean;
  totalMessages: number;
}

/**
 * Chat send parameters
 */
export interface ChatSendParams {
  sessionKey?: string;
  message: string;
  idempotencyKey: string;
}

/**
 * Chat abort parameters
 */
export interface ChatAbortParams {
  sessionKey?: string;
  runId?: string;
  reason?: string;
}

// ============================================================================
// Session Management Types
// ============================================================================

/**
 * Session list parameters
 */
export interface SessionsListParams {
  agentId?: string;
  limit?: number;
  includeSubagents?: boolean;
}

/**
 * Session information
 */
export interface SessionInfo {
  key: string;
  sessionId: string;
  agentId: string;
  label?: string;
  model?: string;
  modelProvider?: string;
  updatedAt?: number;
  createdAt?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  lastChannel?: string;
  thinkingLevel?: string;
  sendPolicy?: string;
}

/**
 * Sessions list response
 */
export interface SessionsListResponse {
  sessions: SessionInfo[];
  total: number;
  agentIds: string[];
}

/**
 * Session delete parameters
 */
export interface SessionDeleteParams {
  key: string;
}

/**
 * Session delete response
 */
export interface SessionDeleteResponse {
  ok: boolean;
  key: string;
  deleted: boolean;
  reason?: string;
}

/**
 * Session reset parameters
 */
export interface SessionResetParams {
  key: string;
}

/**
 * Session reset response
 */
export interface SessionResetResponse {
  ok: boolean;
  key: string;
  reset: boolean;
}

/**
 * Session compact parameters
 */
export interface SessionCompactParams {
  key: string;
  maxLines?: number;
}

/**
 * Session compact response
 */
export interface SessionCompactResponse {
  ok: boolean;
  key: string;
  compacted: boolean;
  archived?: string;
  kept?: number;
  reason?: string;
}

// ============================================================================
// Agent Identity Types
// ============================================================================

/**
 * Agent identity parameters
 */
export interface AgentIdentityGetParams {
  agentId?: string;
}

/**
 * Agent identity response
 */
export interface AgentIdentityResponse {
  name: string;
  avatar?: string;
  model?: string;
  personality?: string;
  systemPrompt?: string;
}

/**
 * Agents list response
 */
export interface AgentsListResponse {
  agents: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
}

// ============================================================================
// Memory Search Types (for visualization)
// ============================================================================

/**
 * Memory search result
 */
export interface MemorySearchResult {
  path: string;
  lines: string;
  score: number;
  text: string;
  vectorScore: number;
  textScore: number;
}

// ============================================================================
// Connection State Types
// ============================================================================

/**
 * Connection status
 */
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/**
 * Connection state
 */
export interface ConnectionState {
  status: ConnectionStatus;
  lastError: string | null;
  reconnectAttempts: number;
  lastConnectedAt?: number;
}
