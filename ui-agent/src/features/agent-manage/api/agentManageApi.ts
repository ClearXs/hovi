// Agent Manage API service using Gateway client

import type { ClawdbotWebSocketClient } from "@/services/clawdbot-websocket";
import type {
  AgentManageInfo,
  AgentManageCreate,
  AgentManageUpdate,
  AgentConfigFile,
  AgentFilesList,
} from "@/types/agent-manage";

/**
 * Get all agents
 * RPC: agents.list
 */
export async function fetchAgents(client: ClawdbotWebSocketClient): Promise<AgentManageInfo[]> {
  const response = await client.sendRequest<
    { items?: AgentManageInfo[]; agents?: AgentManageInfo[] } | AgentManageInfo[]
  >("agents.list");

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
): Promise<AgentManageInfo | null> {
  const response = await client.sendRequest<AgentManageInfo | null>("agents.get", { agentId });
  return response;
}

/**
 * Create a new agent
 * RPC: agents.create
 */
export async function createAgent(
  client: ClawdbotWebSocketClient,
  params: AgentManageCreate,
): Promise<{ ok: boolean; agentId: string }> {
  return await client.sendRequest("agents.create", params as unknown as Record<string, unknown>);
}

/**
 * Update an agent
 * RPC: agents.update
 */
export async function updateAgent(
  client: ClawdbotWebSocketClient,
  agentId: string,
  params: AgentManageUpdate,
): Promise<{ ok: boolean; agentId: string }> {
  return await client.sendRequest("agents.update", { agentId, ...params });
}

/**
 * Delete an agent
 * RPC: agents.delete
 */
export async function deleteAgent(
  client: ClawdbotWebSocketClient,
  agentId: string,
): Promise<{ ok: boolean }> {
  return await client.sendRequest("agents.delete", { id: agentId });
}

/**
 * List agent files
 * RPC: agents.files.list
 */
export async function listAgentFiles(
  client: ClawdbotWebSocketClient,
  agentId: string,
): Promise<AgentFilesList> {
  const response = await client.sendRequest<AgentFilesList>("agents.files.list", { agentId });
  return response;
}

/**
 * Get agent file content
 * RPC: agents.files.get
 */
export async function getAgentFile(
  client: ClawdbotWebSocketClient,
  agentId: string,
  name: string,
): Promise<AgentConfigFile> {
  const result = await client.sendRequest<{
    ok: boolean;
    content?: string;
    file?: { content?: string };
  }>("agents.files.get", { agentId, name });

  let content = "";
  if (result.file?.content !== undefined) {
    content = result.file.content;
  } else if (result.content !== undefined) {
    content = result.content;
  }

  return { name, content };
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
