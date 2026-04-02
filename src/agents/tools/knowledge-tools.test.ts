import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KnowledgeManager } from "../../../packages/memory-host-sdk/src/host/knowledge-manager.js";
import { ensureKnowledgeSchema } from "../../../packages/memory-host-sdk/src/host/knowledge-schema.js";
import { ensureMemoryIndexSchema } from "../../../packages/memory-host-sdk/src/host/memory-schema.js";
import type { OpenClawConfig } from "../../config/config.js";

// Simple test-only implementations (not using actual tools which require mocking)
describe("Knowledge Tools Integration", () => {
  let db: DatabaseSync;
  let tempDir: string;
  let manager: KnowledgeManager;
  let cfg: OpenClawConfig;
  let baseId: string;

  beforeEach(async () => {
    db = new DatabaseSync(":memory:");
    ensureMemoryIndexSchema({
      db,
      embeddingCacheTable: "embedding_cache",
      ftsTable: "chunks_fts",
      ftsEnabled: true,
      cacheEnabled: true,
    });
    ensureKnowledgeSchema(db);

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-tools-test-"));

    cfg = {
      agents: {
        defaults: {
          tools: {
            knowledgeBase: {
              enabled: true,
              storage: {
                maxFileSize: 1024 * 1024,
                maxDocuments: 10,
              },
              formats: {
                pdf: { enabled: true },
                docx: { enabled: true },
                txt: { enabled: true },
                html: { enabled: true },
              },
              upload: {
                webApi: true,
                chatAttachments: true,
              },
              search: {
                autoIndex: false,
                includeInMemorySearch: false,
              },
            },
          },
        },
      },
    } as OpenClawConfig;

    manager = new KnowledgeManager({ cfg, db, baseDir: tempDir, agentId: "agent-1" });
    baseId = manager.createBase({
      agentId: "agent-1",
      name: "Base-1",
      visibility: "private",
    }).id;
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("list operation", () => {
    beforeEach(async () => {
      await manager.uploadDocument({
        kbId: baseId,
        filename: "doc1.txt",
        buffer: Buffer.from("content1"),
        mimetype: "text/plain",
        sourceType: "web_api",
        agentId: "agent-1",
        tags: ["tag1"],
      });

      await manager.uploadDocument({
        kbId: baseId,
        filename: "doc2.txt",
        buffer: Buffer.from("content2"),
        mimetype: "text/plain",
        sourceType: "web_api",
        agentId: "agent-1",
        tags: ["tag2"],
      });
    });

    it("should list all documents", () => {
      const docs = manager.listDocuments({ agentId: "agent-1" });
      expect(docs).toHaveLength(2);
      expect(docs[0].filename).toBe("doc2.txt");
      expect(docs[0].tags).toEqual(["tag2"]);
    });

    it("should filter by tags", () => {
      const docs = manager.listDocuments({ agentId: "agent-1", tags: ["tag1"] });
      expect(docs).toHaveLength(1);
      expect(docs[0].filename).toBe("doc1.txt");
    });

    it("should respect pagination", () => {
      const page1 = manager.listDocuments({ agentId: "agent-1", limit: 1, offset: 0 });
      const page2 = manager.listDocuments({ agentId: "agent-1", limit: 1, offset: 1 });
      expect(page1).toHaveLength(1);
      expect(page2).toHaveLength(1);
      const names = [...page1, ...page2].map((doc) => doc.filename).toSorted();
      expect(names).toEqual(["doc1.txt", "doc2.txt"]);
    });
  });

  describe("get operation", () => {
    it("should get document details", async () => {
      const uploadResult = await manager.uploadDocument({
        kbId: baseId,
        filename: "test.txt",
        buffer: Buffer.from("test content"),
        mimetype: "text/plain",
        sourceType: "web_api",
        agentId: "agent-1",
        description: "Test document",
        tags: ["test"],
      });

      const doc = manager.getDocument({
        documentId: uploadResult.documentId,
        agentId: "agent-1",
      });

      expect(doc).toBeTruthy();
      expect(doc?.filename).toBe("test.txt");
      expect(doc?.description).toBe("Test document");
      expect(doc?.tags).toEqual(["test"]);
    });

    it("should return null for non-existent document", () => {
      const doc = manager.getDocument({
        documentId: "non-existent",
        agentId: "agent-1",
      });
      expect(doc).toBeNull();
    });
  });

  describe("delete operation", () => {
    it("should delete a document", async () => {
      const uploadResult = await manager.uploadDocument({
        kbId: baseId,
        filename: "delete-me.txt",
        buffer: Buffer.from("content"),
        mimetype: "text/plain",
        sourceType: "web_api",
        agentId: "agent-1",
      });

      const result = await manager.deleteDocument({
        documentId: uploadResult.documentId,
        agentId: "agent-1",
        kbId: baseId,
      });

      expect(result.success).toBe(true);

      const doc = manager.getDocument({
        documentId: uploadResult.documentId,
        agentId: "agent-1",
      });
      expect(doc).toBeNull();
    });

    it("should return false for non-existent document", async () => {
      const result = await manager.deleteDocument({
        documentId: "non-existent",
        agentId: "agent-1",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("disabled knowledge base", () => {
    it("should return false from isEnabled when disabled", () => {
      const disabledCfg = {
        agents: {
          defaults: {
            tools: {
              knowledgeBase: { enabled: false },
            },
          },
        },
      } as OpenClawConfig;

      const disabledManager = new KnowledgeManager({
        cfg: disabledCfg,
        db,
        baseDir: tempDir,
        agentId: "agent-1",
      });

      expect(disabledManager.isEnabled("agent-1")).toBe(false);
    });
  });
});
