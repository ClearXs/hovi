// Scene API service using Gateway client

import type { ClawdbotWebSocketClient } from "@/services/clawdbot-websocket";
import type { Scene } from "../types/scene";

/**
 * Get all scenes for an agent
 * RPC: scenes.list
 */
export async function fetchScenes(
  client: ClawdbotWebSocketClient,
  agentId: string,
): Promise<Scene[]> {
  const response = await client.sendRequest<{ items?: Scene[]; scenes?: Scene[] } | Scene[]>(
    "scenes.list",
    { agentId },
  );

  // Handle different response formats
  if (Array.isArray(response)) {
    return response;
  }
  if (response && typeof response === "object") {
    return response.items ?? response.scenes ?? [];
  }
  return [];
}

/**
 * Get a single scene
 * RPC: scenes.get
 */
export async function fetchScene(
  client: ClawdbotWebSocketClient,
  agentId: string,
  sceneId: string,
): Promise<Scene | null> {
  try {
    const scene = await client.sendRequest<Scene>("scenes.get", { agentId, sceneId });
    return scene;
  } catch (error) {
    return null;
  }
}

/**
 * Create a new scene
 * RPC: scenes.create
 */
export async function createScene(
  client: ClawdbotWebSocketClient,
  params: {
    agentId: string;
    name: string;
    description?: string;
    r_path: string;
    main_file: string;
    thumb?: string;
  },
): Promise<{ ok: boolean; scene?: Scene }> {
  return await client.sendRequest("scenes.create", params);
}

/**
 * Update a scene
 * RPC: scenes.update
 */
export async function updateScene(
  client: ClawdbotWebSocketClient,
  params: {
    agentId: string;
    sceneId: string;
    name?: string;
    description?: string;
    r_path?: string;
    main_file?: string;
    thumb?: string;
  },
): Promise<{ ok: boolean }> {
  return await client.sendRequest("scenes.update", params);
}

/**
 * Delete a scene
 * RPC: scenes.delete
 */
export async function deleteScene(
  client: ClawdbotWebSocketClient,
  agentId: string,
  sceneId: string,
): Promise<{ ok: boolean }> {
  return await client.sendRequest("scenes.delete", { agentId, sceneId });
}
