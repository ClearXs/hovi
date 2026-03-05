import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { listAgentIds, resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import { loadConfig } from "../../config/config.js";
import { sceneHandlers } from "./scene.js";
import type { RespondFn } from "./types.js";

type HandlerResult = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { message?: string } | null;
};

const createResponder = () => {
  let result: HandlerResult | undefined;
  const respond: RespondFn = (success, data, error) => {
    result = {
      success,
      data: data ? (data as Record<string, unknown>) : undefined,
      error: error ?? undefined,
    };
  };
  return {
    respond,
    getResult: () => result,
  };
};

describe("Scene Management", () => {
  const configSnapshot = loadConfig();
  const testAgentId = listAgentIds(configSnapshot)[0] ?? "default";
  let scenesFile: string;

  beforeEach(async () => {
    const cfg = loadConfig();
    const workspace = resolveAgentWorkspaceDir(cfg, testAgentId);
    scenesFile = path.join(workspace, "custom/scenes/scenes.json");

    // Clean up test data
    try {
      await fs.rm(path.dirname(scenesFile), { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  describe("scenes.list", () => {
    it("should return empty list when no scenes exist", async () => {
      const { respond, getResult } = createResponder();

      await sceneHandlers["scenes.list"]({
        req: { method: "scenes.list", params: { agentId: testAgentId } },
        params: { agentId: testAgentId },
        respond,
        client: undefined,
        isWebchatConnect: false,
        context: {},
      });

      const result = getResult();
      expect(result?.success).toBe(true);
      const data = result?.data as {
        scenes: Array<{ id: string; name: string }>;
        activeSceneId: string | null;
      };
      expect(data.scenes).toEqual([]);
      expect(data.activeSceneId).toBeNull();
    });

    it("should return existing scenes", async () => {
      // Create test scene data
      const testScene = {
        id: randomUUID(),
        name: "Test Scene",
        description: "A test scene",
        r_path: "scenes/test",
        main_file: "main.json",
        thumb: null,
        active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: testAgentId,
      };

      await fs.mkdir(path.dirname(scenesFile), { recursive: true });
      await fs.writeFile(scenesFile, JSON.stringify({ scenes: [testScene], activeSceneId: null }));

      const { respond, getResult } = createResponder();

      await sceneHandlers["scenes.list"]({
        req: { method: "scenes.list", params: { agentId: testAgentId } },
        params: { agentId: testAgentId },
        respond,
        client: undefined,
        isWebchatConnect: false,
        context: {},
      });

      const result = getResult();
      expect(result?.success).toBe(true);
      const data = result?.data as {
        scenes: Array<{ id: string; name: string }>;
      };
      expect(data.scenes).toHaveLength(1);
      expect(data.scenes[0].id).toBe(testScene.id);
      expect(data.scenes[0].name).toBe("Test Scene");
    });
  });

  describe("scenes.create", () => {
    it("should create a new scene", async () => {
      const { respond, getResult } = createResponder();

      await sceneHandlers["scenes.create"]({
        req: { method: "scenes.create", params: {} },
        params: {
          agentId: testAgentId,
          name: "New Scene",
          description: "A new test scene",
          r_path: "scenes/new",
          main_file: "main.json",
        },
        respond,
        client: undefined,
        isWebchatConnect: false,
        context: {},
      });

      const result = getResult();
      expect(result?.success).toBe(true);
      const data = result?.data as {
        scene: { name: string; description: string; user_id: string };
      };
      expect(data.scene.name).toBe("New Scene");
      expect(data.scene.description).toBe("A new test scene");
      expect(data.scene.user_id).toBe(testAgentId);

      // Verify file was created
      const fileData = JSON.parse(await fs.readFile(scenesFile, "utf-8"));
      expect(fileData.scenes).toHaveLength(1);
      expect(fileData.scenes[0].name).toBe("New Scene");
    });

    it("should require agentId", async () => {
      const { respond, getResult } = createResponder();

      await sceneHandlers["scenes.create"]({
        req: { method: "scenes.create", params: {} },
        params: {
          name: "New Scene",
          r_path: "scenes/new",
          main_file: "main.json",
        },
        respond,
        client: undefined,
        isWebchatConnect: false,
        context: {},
      });

      const result = getResult();
      expect(result?.success).toBe(false);
      const errorMessage = result?.error?.message ?? "";
      expect(errorMessage).toContain("agentId is required");
    });

    it("should require name", async () => {
      const { respond, getResult } = createResponder();

      await sceneHandlers["scenes.create"]({
        req: { method: "scenes.create", params: {} },
        params: {
          agentId: testAgentId,
          r_path: "scenes/new",
          main_file: "main.json",
        },
        respond,
        client: undefined,
        isWebchatConnect: false,
        context: {},
      });

      const result = getResult();
      expect(result?.success).toBe(false);
      const errorMessage = result?.error?.message ?? "";
      expect(errorMessage).toContain("name is required");
    });
  });

  describe("scenes.get", () => {
    it("should get a specific scene", async () => {
      const testScene = {
        id: randomUUID(),
        name: "Test Scene",
        description: "A test scene",
        r_path: "scenes/test",
        main_file: "main.json",
        thumb: null,
        active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: testAgentId,
      };

      await fs.mkdir(path.dirname(scenesFile), { recursive: true });
      await fs.writeFile(scenesFile, JSON.stringify({ scenes: [testScene], activeSceneId: null }));

      const { respond, getResult } = createResponder();

      await sceneHandlers["scenes.get"]({
        req: { method: "scenes.get", params: {} },
        params: {
          agentId: testAgentId,
          sceneId: testScene.id,
        },
        respond,
        client: undefined,
        isWebchatConnect: false,
        context: {},
      });

      const result = getResult();
      expect(result?.success).toBe(true);
      const data = result?.data as { scene: { id: string; name: string } };
      expect(data.scene.id).toBe(testScene.id);
      expect(data.scene.name).toBe("Test Scene");
    });

    it("should return error for non-existent scene", async () => {
      const { respond, getResult } = createResponder();

      await sceneHandlers["scenes.get"]({
        req: { method: "scenes.get", params: {} },
        params: {
          agentId: testAgentId,
          sceneId: "non-existent-id",
        },
        respond,
        client: undefined,
        isWebchatConnect: false,
        context: {},
      });

      const result = getResult();
      expect(result?.success).toBe(false);
      const errorMessage = result?.error?.message ?? "";
      expect(errorMessage).toContain("not found");
    });
  });

  describe("scenes.update", () => {
    it("should update a scene", async () => {
      const testScene = {
        id: randomUUID(),
        name: "Test Scene",
        description: "A test scene",
        r_path: "scenes/test",
        main_file: "main.json",
        thumb: null,
        active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: testAgentId,
      };

      await fs.mkdir(path.dirname(scenesFile), { recursive: true });
      await fs.writeFile(scenesFile, JSON.stringify({ scenes: [testScene], activeSceneId: null }));

      const { respond, getResult } = createResponder();

      await sceneHandlers["scenes.update"]({
        req: { method: "scenes.update", params: {} },
        params: {
          agentId: testAgentId,
          sceneId: testScene.id,
          name: "Updated Scene",
          description: "Updated description",
        },
        respond,
        client: undefined,
        isWebchatConnect: false,
        context: {},
      });

      const result = getResult();
      expect(result?.success).toBe(true);
      const data = result?.data as {
        scene: { name: string; description: string };
      };
      expect(data.scene.name).toBe("Updated Scene");
      expect(data.scene.description).toBe("Updated description");

      // Verify file was updated
      const fileData = JSON.parse(await fs.readFile(scenesFile, "utf-8"));
      expect(fileData.scenes[0].name).toBe("Updated Scene");
    });
  });

  describe("scenes.delete", () => {
    it("should delete a scene", async () => {
      const testScene = {
        id: randomUUID(),
        name: "Test Scene",
        description: "A test scene",
        r_path: "scenes/test",
        main_file: "main.json",
        thumb: null,
        active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: testAgentId,
      };

      await fs.mkdir(path.dirname(scenesFile), { recursive: true });
      await fs.writeFile(scenesFile, JSON.stringify({ scenes: [testScene], activeSceneId: null }));

      const { respond, getResult } = createResponder();

      await sceneHandlers["scenes.delete"]({
        req: { method: "scenes.delete", params: {} },
        params: {
          agentId: testAgentId,
          sceneId: testScene.id,
        },
        respond,
        client: undefined,
        isWebchatConnect: false,
        context: {},
      });

      const result = getResult();
      expect(result?.success).toBe(true);

      // Verify scene was deleted
      const fileData = JSON.parse(await fs.readFile(scenesFile, "utf-8"));
      expect(fileData.scenes).toHaveLength(0);
    });

    it("should clear activeSceneId when deleting active scene", async () => {
      const testScene = {
        id: randomUUID(),
        name: "Test Scene",
        description: "A test scene",
        r_path: "scenes/test",
        main_file: "main.json",
        thumb: null,
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: testAgentId,
      };

      await fs.mkdir(path.dirname(scenesFile), { recursive: true });
      await fs.writeFile(
        scenesFile,
        JSON.stringify({ scenes: [testScene], activeSceneId: testScene.id }),
      );

      const { respond, getResult } = createResponder();

      await sceneHandlers["scenes.delete"]({
        req: { method: "scenes.delete", params: {} },
        params: {
          agentId: testAgentId,
          sceneId: testScene.id,
        },
        respond,
        client: undefined,
        isWebchatConnect: false,
        context: {},
      });

      const result = getResult();
      expect(result?.success).toBe(true);

      // Verify activeSceneId was cleared
      const fileData = JSON.parse(await fs.readFile(scenesFile, "utf-8"));
      expect(fileData.activeSceneId).toBeNull();
    });
  });

  describe("scenes.setActive", () => {
    it("should set active scene", async () => {
      const scene1 = {
        id: randomUUID(),
        name: "Scene 1",
        description: "Scene 1",
        r_path: "scenes/1",
        main_file: "main.json",
        thumb: null,
        active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: testAgentId,
      };

      const scene2 = {
        id: randomUUID(),
        name: "Scene 2",
        description: "Scene 2",
        r_path: "scenes/2",
        main_file: "main.json",
        thumb: null,
        active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: testAgentId,
      };

      await fs.mkdir(path.dirname(scenesFile), { recursive: true });
      await fs.writeFile(
        scenesFile,
        JSON.stringify({ scenes: [scene1, scene2], activeSceneId: null }),
      );

      const { respond, getResult } = createResponder();

      await sceneHandlers["scenes.setActive"]({
        req: { method: "scenes.setActive", params: {} },
        params: {
          agentId: testAgentId,
          sceneId: scene2.id,
        },
        respond,
        client: undefined,
        isWebchatConnect: false,
        context: {},
      });

      const result = getResult();
      expect(result?.success).toBe(true);
      const data = result?.data as { activeSceneId: string };
      expect(data.activeSceneId).toBe(scene2.id);

      // Verify file was updated
      const fileData = JSON.parse(await fs.readFile(scenesFile, "utf-8"));
      expect(fileData.activeSceneId).toBe(scene2.id);
      expect(fileData.scenes[0].active).toBe(false);
      expect(fileData.scenes[1].active).toBe(true);
    });

    it("should allow setting sceneId to null to deactivate all", async () => {
      const testScene = {
        id: randomUUID(),
        name: "Test Scene",
        description: "A test scene",
        r_path: "scenes/test",
        main_file: "main.json",
        thumb: null,
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: testAgentId,
      };

      await fs.mkdir(path.dirname(scenesFile), { recursive: true });
      await fs.writeFile(
        scenesFile,
        JSON.stringify({ scenes: [testScene], activeSceneId: testScene.id }),
      );

      const { respond, getResult } = createResponder();

      await sceneHandlers["scenes.setActive"]({
        req: { method: "scenes.setActive", params: {} },
        params: {
          agentId: testAgentId,
          sceneId: null,
        },
        respond,
        client: undefined,
        isWebchatConnect: false,
        context: {},
      });

      const result = getResult();
      expect(result?.success).toBe(true);
      const data = result?.data as { activeSceneId: string | null };
      expect(data.activeSceneId).toBeNull();

      // Verify all scenes are inactive
      const fileData = JSON.parse(await fs.readFile(scenesFile, "utf-8"));
      expect(fileData.activeSceneId).toBeNull();
      expect(fileData.scenes[0].active).toBe(false);
    });
  });
});
