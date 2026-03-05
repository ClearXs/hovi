import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { listAgentIds, resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import { loadConfig } from "../../config/config.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

/**
 * Read JSON file with error handling
 */
async function readJSON<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Write JSON file with atomic write
 */
async function writeJSON<T>(filePath: string, value: T): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  try {
    await fs.chmod(tmp, 0o600);
  } catch {
    // Ignore chmod errors
  }
  await fs.rename(tmp, filePath);
}

type ScenesData = {
  scenes: Array<{
    id: string;
    name: string;
    description: string;
    r_path: string;
    main_file: string;
    thumb: string | null;
    active: boolean;
    created_at: string;
    updated_at: string;
    user_id: string;
  }>;
  activeSceneId: string | null;
};

function resolveAgentIdOrError(
  agentIdRaw: string,
  cfg: ReturnType<typeof loadConfig>,
): string | null {
  const agentId = normalizeAgentId(agentIdRaw);
  const allowed = new Set(listAgentIds(cfg));
  return allowed.has(agentId) ? agentId : null;
}

export const sceneHandlers: GatewayRequestHandlers = {
  /**
   * List all scenes for an agent
   */
  "scenes.list": async ({ params, respond }) => {
    const { agentId } = params;
    if (typeof agentId !== "string" || !agentId.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const cfg = loadConfig();
    const normalizedAgentId = resolveAgentIdOrError(agentId, cfg);
    if (!normalizedAgentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
      return;
    }
    const workspace = resolveAgentWorkspaceDir(cfg, normalizedAgentId);
    const scenesFile = path.join(workspace, "custom/scenes/scenes.json");

    try {
      const data = await readJSON<ScenesData>(scenesFile);
      respond(
        true,
        {
          scenes: data?.scenes || [],
          activeSceneId: data?.activeSceneId || null,
        },
        undefined,
      );
    } catch {
      // File doesn't exist yet
      respond(
        true,
        {
          scenes: [],
          activeSceneId: null,
        },
        undefined,
      );
    }
  },

  /**
   * Get a specific scene by ID
   */
  "scenes.get": async ({ params, respond }) => {
    const { agentId, sceneId } = params;
    if (typeof agentId !== "string" || !agentId.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }
    if (typeof sceneId !== "string" || !sceneId.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sceneId is required"));
      return;
    }

    const cfg = loadConfig();
    const normalizedAgentId = resolveAgentIdOrError(agentId, cfg);
    if (!normalizedAgentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
      return;
    }
    const workspace = resolveAgentWorkspaceDir(cfg, normalizedAgentId);
    const scenesFile = path.join(workspace, "custom/scenes/scenes.json");

    try {
      const data = await readJSON<ScenesData>(scenesFile);
      if (!data) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Scenes file not found"));
        return;
      }

      const scene = data.scenes?.find((s: { id: string }) => s.id === sceneId);
      if (scene) {
        respond(true, { scene }, undefined);
      } else {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Scene not found"));
      }
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Failed to read scene: ${String(error)}`),
      );
    }
  },

  /**
   * Create a new scene
   */
  "scenes.create": async ({ params, respond }) => {
    const { agentId, name, description, r_path, main_file, thumb } = params;

    if (typeof agentId !== "string" || !agentId.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }
    if (typeof name !== "string" || !name.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name is required"));
      return;
    }
    if (typeof r_path !== "string" || !r_path.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "r_path is required"));
      return;
    }
    if (typeof main_file !== "string" || !main_file.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "main_file is required"));
      return;
    }

    const cfg = loadConfig();
    const normalizedAgentId = resolveAgentIdOrError(agentId, cfg);
    if (!normalizedAgentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
      return;
    }
    const workspace = resolveAgentWorkspaceDir(cfg, normalizedAgentId);
    const scenesFile = path.join(workspace, "custom/scenes/scenes.json");

    const scene = {
      id: randomUUID(),
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : "",
      r_path: r_path.trim(),
      main_file: main_file.trim(),
      thumb: typeof thumb === "string" && thumb.trim() ? thumb.trim() : null,
      active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: normalizedAgentId,
    };

    try {
      await fs.mkdir(path.dirname(scenesFile), { recursive: true });

      let data: ScenesData = { scenes: [], activeSceneId: null };
      try {
        const existing = await readJSON<ScenesData>(scenesFile);
        if (existing && typeof existing === "object") {
          data = existing;
        }
      } catch {
        // File doesn't exist yet, use default
      }

      data.scenes = data.scenes || [];
      data.scenes.push(scene);

      await writeJSON(scenesFile, data);
      respond(true, { scene }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Failed to read scene: ${String(error)}`),
      );
    }
  },

  /**
   * Update an existing scene
   */
  "scenes.update": async ({ params, respond }) => {
    const { agentId, sceneId, ...updates } = params;

    if (typeof agentId !== "string" || !agentId.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }
    if (typeof sceneId !== "string" || !sceneId.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sceneId is required"));
      return;
    }

    const cfg = loadConfig();
    const normalizedAgentId = resolveAgentIdOrError(agentId, cfg);
    if (!normalizedAgentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
      return;
    }
    const workspace = resolveAgentWorkspaceDir(cfg, normalizedAgentId);
    const scenesFile = path.join(workspace, "custom/scenes/scenes.json");

    try {
      const data = await readJSON<ScenesData>(scenesFile);
      if (!data) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Scenes file not found"));
        return;
      }

      const scene = data.scenes?.find((s: { id: string }) => s.id === sceneId);

      if (!scene) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Scene not found"));
        return;
      }

      const nextUpdates: Partial<ScenesData["scenes"][number]> = {};
      if (typeof updates.name === "string") {
        nextUpdates.name = updates.name.trim();
      }
      if (typeof updates.description === "string") {
        nextUpdates.description = updates.description.trim();
      }
      if (typeof updates.r_path === "string") {
        nextUpdates.r_path = updates.r_path.trim();
      }
      if (typeof updates.main_file === "string") {
        nextUpdates.main_file = updates.main_file.trim();
      }
      if (updates.thumb === null) {
        nextUpdates.thumb = null;
      } else if (typeof updates.thumb === "string") {
        nextUpdates.thumb = updates.thumb.trim() || null;
      }

      Object.assign(scene, nextUpdates, { updated_at: new Date().toISOString() });
      await writeJSON(scenesFile, data);

      respond(true, { scene }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Failed to read scene: ${String(error)}`),
      );
    }
  },

  /**
   * Delete a scene
   */
  "scenes.delete": async ({ params, respond }) => {
    const { agentId, sceneId } = params;

    if (typeof agentId !== "string" || !agentId.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }
    if (typeof sceneId !== "string" || !sceneId.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sceneId is required"));
      return;
    }

    const cfg = loadConfig();
    const normalizedAgentId = resolveAgentIdOrError(agentId, cfg);
    if (!normalizedAgentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
      return;
    }
    const workspace = resolveAgentWorkspaceDir(cfg, normalizedAgentId);
    const scenesFile = path.join(workspace, "custom/scenes/scenes.json");

    try {
      const data = await readJSON<ScenesData>(scenesFile);
      if (!data) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Scenes file not found"));
        return;
      }

      const index = data.scenes?.findIndex((s: { id: string }) => s.id === sceneId);

      if (index === -1 || index === undefined) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Scene not found"));
        return;
      }

      data.scenes.splice(index, 1);
      if (data.activeSceneId === sceneId) {
        data.activeSceneId = null;
      }

      await writeJSON(scenesFile, data);
      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Failed to read scene: ${String(error)}`),
      );
    }
  },

  /**
   * Set the active scene
   */
  "scenes.setActive": async ({ params, respond }) => {
    const { agentId, sceneId } = params;

    if (typeof agentId !== "string" || !agentId.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const cfg = loadConfig();
    const normalizedAgentId = resolveAgentIdOrError(agentId, cfg);
    if (!normalizedAgentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
      return;
    }
    const workspace = resolveAgentWorkspaceDir(cfg, normalizedAgentId);
    const scenesFile = path.join(workspace, "custom/scenes/scenes.json");

    try {
      const data = await readJSON<ScenesData>(scenesFile);
      if (!data) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Scenes file not found"));
        return;
      }

      // Allow setting sceneId to null to deactivate all scenes
      if (sceneId !== null) {
        const scene = data.scenes?.find((s: { id: string }) => s.id === sceneId);
        if (!scene) {
          respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Scene not found"));
          return;
        }
      }

      data.activeSceneId = typeof sceneId === "string" ? sceneId : null;
      data.scenes?.forEach((s: { id: string; active: boolean }) => {
        s.active = s.id === sceneId;
      });

      await writeJSON(scenesFile, data);
      respond(true, { success: true, activeSceneId: sceneId }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Failed to read scene: ${String(error)}`),
      );
    }
  },
};
