// Persona API service using Gateway client

import type { ClawdbotWebSocketClient } from "@/services/clawdbot-websocket";
import type { AgentInfo, Persona, PersonaFormData } from "../types/persona";

// ============================================
// Agents/Persona RPC Methods
// ============================================

/**
 * Get all agents (personas) from gateway
 * RPC: agents.list
 */
export async function fetchAgents(client: ClawdbotWebSocketClient): Promise<AgentInfo[]> {
  const response = await client.sendRequest<
    { items?: AgentInfo[]; agents?: AgentInfo[] } | AgentInfo[]
  >("agents.list");

  // Handle different response formats
  if (Array.isArray(response)) {
    return response;
  }
  if (response && typeof response === "object") {
    return response.items ?? response.agents ?? [];
  }
  return [];
}

/**
 * Get a single agent by ID
 * RPC: agents.get
 */
export async function fetchAgent(
  client: ClawdbotWebSocketClient,
  agentId: string,
): Promise<AgentInfo | null> {
  const response = await client.sendRequest<AgentInfo | null>("agents.get", { agentId });
  return response;
}

/**
 * Create a new agent/persona
 * RPC: agents.create
 */
export async function createAgent(
  client: ClawdbotWebSocketClient,
  params: {
    id: string;
    name: string;
    description?: string;
    agent_type?: string;
    system?: string;
    topic?: string;
    tags?: string[];
    emoji?: string;
    avatar?: string;
  },
): Promise<{ ok: boolean; agentId: string }> {
  return await client.sendRequest("agents.create", params);
}

/**
 * Update an agent/persona
 * RPC: agents.update
 */
export async function updateAgent(
  client: ClawdbotWebSocketClient,
  params: {
    agentId: string;
    name?: string;
    description?: string;
    agent_type?: string;
    system?: string;
    topic?: string;
    tags?: string[];
    workspace?: string;
    model?: string;
    avatar?: string;
    activated?: boolean;
  },
): Promise<{ ok: boolean; agentId: string }> {
  return await client.sendRequest("agents.update", params);
}

/**
 * Delete an agent/persona
 * RPC: agents.delete
 */
export async function deleteAgent(
  client: ClawdbotWebSocketClient,
  agentId: string,
): Promise<{ ok: boolean }> {
  return await client.sendRequest("agents.delete", { id: agentId });
}

/**
 * Get agent identity
 * RPC: agent.identity.get
 */
export async function fetchAgentIdentity(
  client: ClawdbotWebSocketClient,
  agentId: string,
): Promise<{ name: string; avatar?: string; emoji?: string } | null> {
  try {
    const identity = await client.sendRequest<{ name: string; avatar?: string; emoji?: string }>(
      "agent.identity.get",
      { agentId },
    );
    return identity;
  } catch (error) {
    console.error("Failed to fetch agent identity:", error);
    return null;
  }
}

/**
 * Get agent file content
 * RPC: agents.files.get
 */
export async function getAgentFile(
  client: ClawdbotWebSocketClient,
  agentId: string,
  name: string,
): Promise<{ ok: boolean; content?: string; file?: { content?: string } }> {
  const result = await client.sendRequest<{
    ok: boolean;
    content?: string;
    file?: { content?: string };
  }>("agents.files.get", { agentId, name });
  // Backward compatibility: extract content from file object if present
  if (result.file?.content !== undefined) {
    return { ok: result.ok, content: result.file.content };
  }
  return result;
}

/**
 * Set agent file content
 * RPC: agents.files.set
 */
export async function setAgentFile(
  client: ClawdbotWebSocketClient,
  agentId: string,
  name: string,
  content: string,
): Promise<{ ok: boolean }> {
  return await client.sendRequest("agents.files.set", { agentId, name, content });
}

/**
 * Upload arbitrary file to agent workspace
 * RPC: agents.files.upload
 */
export async function uploadAgentFile(
  client: ClawdbotWebSocketClient,
  agentId: string,
  filename: string,
  content: string,
  mimeType?: string,
): Promise<{ ok: boolean; file: { name: string; path: string; size: number } }> {
  return await client.sendRequest("agents.files.upload", {
    agentId,
    filename,
    content,
    mimeType,
  });
}

// ============================================
// Chat/Conversation
// ============================================

/**
 * Send message to agent and get response
 * RPC: agent
 */
export async function sendToAgent(
  client: ClawdbotWebSocketClient,
  agentId: string,
  message: string,
  sessionKey?: string,
): Promise<{ sessionKey: string; message: string }> {
  const response = await client.sendRequest<{ sessionKey: string; message: string }>("agent", {
    agentId,
    message,
    sessionKey: sessionKey || `agent:${agentId}:ui-agent`,
  });
  return response;
}

// ============================================
// Config (legacy - may not be needed)
// ============================================

/**
 * Get config
 * RPC: config.get
 */
export async function fetchConfig(
  client: ClawdbotWebSocketClient,
): Promise<Record<string, unknown>> {
  const config = await client.sendRequest<Record<string, unknown>>("config.get");
  return config || {};
}

/**
 * Patch config
 * RPC: config.patch
 */
export async function patchConfig(
  client: ClawdbotWebSocketClient,
  path: string,
  value: unknown,
): Promise<void> {
  await client.sendRequest("config.patch", { path, value });
}

// ============================================
// Utilities
// ============================================

/**
 * File URL builder
 */
export function buildFileUrl(agentId: string, relativePath: string): string {
  return `/files/${agentId}/${relativePath}`;
}
