import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { OpenClawConfig } from "../../../../src/config/config.js";
import * as knowledgeGraphModule from "./knowledge-graph.js";
import { KnowledgeManager } from "./knowledge-manager.js";
import { ensureKnowledgeSchema } from "./knowledge-schema.js";
import { ensureMemoryIndexSchema } from "./memory-schema.js";

describe("KnowledgeManager", () => {
  let db: DatabaseSync;
  let tempDir: string;
  let manager: KnowledgeManager;
  let cfg: OpenClawConfig;
  let baseCounter: number;

  const createBase = (agentId: string, name = "Base") => {
    baseCounter += 1;
    return manager.createBase({
      agentId,
      name: `${name}-${baseCounter}`,
      visibility: "private",
    });
  };

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

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-manager-test-"));

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
                autoIndex: false, // Disable auto-index for most tests
                includeInMemorySearch: false,
              },
            },
          },
        },
      },
    } as OpenClawConfig;

    manager = new KnowledgeManager({ cfg, db, baseDir: tempDir, agentId: "test-agent" });
    baseCounter = 0;
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("isEnabled", () => {
    it("should return true when knowledge base is enabled", () => {
      expect(manager.isEnabled("agent-1")).toBe(true);
    });

    it("should return false when knowledge base is disabled", () => {
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
        agentId: "test-agent",
      });

      expect(disabledManager.isEnabled("agent-1")).toBe(false);
    });
  });

  describe("settings", () => {
    it("stores and merges knowledge settings overrides", () => {
      const defaults = manager.getSettings("agent-1");
      expect(defaults.vectorization.enabled).toBe(false);
      expect(defaults.graph.enabled).toBe(false);

      const updated = manager.updateSettings("agent-1", {
        vectorization: {
          enabled: true,
          provider: "openai",
          model: "text-embedding-3-small",
        },
        graph: {
          enabled: true,
          minTriples: 10,
        },
      });

      expect(updated.vectorization.enabled).toBe(true);
      expect(updated.vectorization.model).toBe("text-embedding-3-small");
      expect(updated.graph.enabled).toBe(true);
      expect(updated.graph.minTriples).toBe(10);

      const reloaded = manager.getSettings("agent-1");
      expect(reloaded.vectorization.provider).toBe("openai");
      expect(reloaded.graph.enabled).toBe(true);
      expect(reloaded.graph.maxTriples).toBeGreaterThan(0);
    });
  });

  describe("base", () => {
    it("creates, reads, updates, and deletes a base", () => {
      const created = manager.createBase({
        agentId: "agent-1",
        name: "Base A",
        visibility: "private",
      });
      expect(created.name).toBe("Base A");
      const fetched = manager.getBase("agent-1", created.id);
      expect(fetched?.id).toBe(created.id);
      const updated = manager.updateBase({
        agentId: "agent-1",
        kbId: created.id,
        name: "Base B",
        visibility: "team",
      });
      expect(updated.name).toBe("Base B");
      expect(updated.visibility).toBe("team");
      const list = manager.listBases({ agentId: "agent-1" });
      expect(list.total).toBe(2);
      expect(list.kbs.some((item) => item.id === created.id)).toBe(true);
      const deleted = manager.deleteBase({ agentId: "agent-1", kbId: created.id });
      expect(deleted.success).toBe(true);
    });

    it("persists base settings and tags on create", () => {
      const created = manager.createBase({
        agentId: "agent-1",
        name: "Policy Hub",
        tags: [
          { name: "HR", color: "#22c55e" },
          { name: "制度", color: "#0ea5e9" },
        ],
        settings: {
          chunk: { enabled: true, size: 900, overlap: 150, separator: "paragraph" },
          retrieval: { mode: "hybrid", topK: 8, minScore: 0.4, hybridAlpha: 0.6 },
          index: { mode: "high_quality" },
          graph: {
            enabled: true,
            minTriples: 3,
            maxTriples: 50,
            triplesPerKTokens: 10,
            maxDepth: 3,
          },
        },
      });

      expect(created.tags.map((item) => item.name).toSorted()).toEqual(["HR", "制度"].toSorted());
      expect(created.settings.chunk.size).toBe(900);
      expect(created.settings.graph.enabled).toBe(true);
    });

    it("supports filtering bases by tags", () => {
      manager.createBase({
        agentId: "agent-1",
        name: "KB-HR",
        tags: [{ name: "HR", color: "#22c55e" }],
      });
      manager.createBase({
        agentId: "agent-1",
        name: "KB-IT",
        tags: [{ name: "IT", color: "#6366f1" }],
      });

      const list = manager.listBases({ agentId: "agent-1", tags: ["HR"] });
      expect(list.total).toBe(1);
      expect(list.kbs[0]?.name).toBe("KB-HR");
    });
  });

  describe("source lifecycle", () => {
    it("keeps graphize independent from vectorize for local tree files", async () => {
      const base = manager.createBase({
        agentId: "agent-1",
        name: "Local Source",
        visibility: "private",
        sourceType: "local_fs",
      });
      const sourceFile = path.join(tempDir, "graph-only.txt");
      await fs.writeFile(sourceFile, "alpha beta gamma", "utf8");

      const result = await manager.materializeTreeFile({
        agentId: "agent-1",
        kbId: base.id,
        path: sourceFile,
        mode: "graphize",
      });

      expect(result.vectorized).toBe(false);
      const doc = manager.getDocument({
        agentId: "agent-1",
        kbId: base.id,
        documentId: result.documentId,
      });
      expect(doc).not.toBeNull();
      expect(doc?.indexed_at ?? null).toBeNull();
    });

    it("deletes source config and local source documents without deleting the base", async () => {
      const base = manager.createBase({
        agentId: "agent-1",
        name: "Local Delete Source",
        visibility: "private",
        sourceType: "local_fs",
      });
      const sourceFile = path.join(tempDir, "to-remove.txt");
      await fs.writeFile(sourceFile, "remove me", "utf8");

      const materialized = await manager.materializeTreeFile({
        agentId: "agent-1",
        kbId: base.id,
        path: sourceFile,
        mode: "vectorize",
      });
      expect(
        manager.getDocument({
          agentId: "agent-1",
          kbId: base.id,
          documentId: materialized.documentId,
        }),
      ).not.toBeNull();

      const deleted = await manager.deleteSource({ agentId: "agent-1", kbId: base.id });
      expect(deleted.success).toBe(true);
      expect(deleted.deletedDocuments).toBe(1);

      const stillThere = manager.getBase("agent-1", base.id);
      expect(stillThere).not.toBeNull();
      expect(stillThere?.source_status).toBe("paused");
      expect(stillThere?.source_config ?? null).toBeNull();
      expect(
        manager.getDocument({
          agentId: "agent-1",
          kbId: base.id,
          documentId: materialized.documentId,
        }),
      ).toBeNull();
    });
  });

  describe("graph query", () => {
    it("filters subgraph by documentIds, relation, and minDegree", () => {
      const kbId = createBase("agent-1", "Graph").id;
      const now = Date.now();
      db.prepare(
        `INSERT INTO kb_documents
         (id, kb_id, filename, filepath, mimetype, size, hash, source_type, source_metadata,
          uploaded_at, owner_agent_id, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "doc-1",
        kbId,
        "doc-1.txt",
        "knowledge/doc-1.txt",
        "text/plain",
        1,
        "hash-1",
        "web_api",
        null,
        now,
        "agent-1",
        null,
      );
      db.prepare(
        `INSERT INTO kb_documents
         (id, kb_id, filename, filepath, mimetype, size, hash, source_type, source_metadata,
          uploaded_at, owner_agent_id, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "doc-2",
        kbId,
        "doc-2.txt",
        "knowledge/doc-2.txt",
        "text/plain",
        1,
        "hash-2",
        "web_api",
        null,
        now,
        "agent-1",
        null,
      );
      db.prepare(
        `INSERT INTO knowledge_graph_triples (id, kb_id, document_id, h, r, t, props_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("t1", kbId, "doc-1", "Alpha", "rel", "Beta", null, now);
      db.prepare(
        `INSERT INTO knowledge_graph_triples (id, kb_id, document_id, h, r, t, props_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("t2", kbId, "doc-2", "Alpha", "other", "Gamma", null, now);
      db.prepare(
        `INSERT INTO knowledge_graph_triples (id, kb_id, document_id, h, r, t, props_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("t3", kbId, "doc-1", "Beta", "rel", "Delta", null, now);

      const result = manager.queryGraphSubgraph({
        agentId: "agent-1",
        keyword: "",
        kbId,
        documentIds: ["doc-1"],
        relation: "rel",
        minDegree: 1,
        maxDepth: 1,
        maxTriples: 10,
      });

      expect(result.edges.length).toBe(2);
      const names = result.nodes.map((node) => node.name).toSorted();
      expect(names).toEqual(["Alpha", "Beta", "Delta"].toSorted());
    });
  });

  describe("chunks", () => {
    it("lists chunks for a document and fetches chunk detail", async () => {
      const kbId = createBase("agent-1", "Chunks").id;
      const buffer = Buffer.from("Chunked content\nSecond line");
      const result = await manager.uploadDocument({
        kbId,
        filename: "chunks.txt",
        buffer,
        mimetype: "text/plain",
        sourceType: "web_api",
        agentId: "agent-1",
      });
      const pathKey = `knowledge/${result.documentId}`;
      db.prepare(
        `INSERT INTO chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "chunk-1",
        pathKey,
        "knowledge",
        1,
        2,
        "hash",
        "mock-model",
        "Chunked content\nSecond line",
        "[]",
        Date.now(),
      );
      const list = await manager.listChunks({
        agentId: "agent-1",
        documentId: result.documentId,
        kbId,
      });
      expect(list.total).toBe(1);
      expect(list.chunks[0]?.id).toBe("chunk-1");
      const detail = manager.getChunk({ agentId: "agent-1", chunkId: "chunk-1", kbId });
      expect(detail?.documentId).toBe(result.documentId);
      expect(detail?.startLine).toBe(1);
    });
  });

  describe("uploadDocument", () => {
    it("should upload and store a text document", async () => {
      const kbId = createBase("agent-1", "Upload").id;
      const buffer = Buffer.from("Test content for knowledge base");
      const result = await manager.uploadDocument({
        kbId,
        filename: "test.txt",
        buffer,
        mimetype: "text/plain",
        sourceType: "web_api",
        agentId: "agent-1",
      });

      expect(result.documentId).toBeTruthy();
      expect(result.indexed).toBe(false); // Auto-index disabled

      const doc = manager.getDocument({
        documentId: result.documentId,
        agentId: "agent-1",
        kbId,
      });
      expect(doc).toBeTruthy();
      expect(doc?.filename).toBe("test.txt");
      expect(doc?.mimetype).toBe("text/plain");
    });

    it("should upload document with tags and description", async () => {
      const kbId = createBase("agent-1", "Upload").id;
      const buffer = Buffer.from("Content with metadata");
      const result = await manager.uploadDocument({
        kbId,
        filename: "doc.txt",
        buffer,
        mimetype: "text/plain",
        sourceType: "chat_attachment",
        agentId: "agent-1",
        description: "Test document",
        tags: ["test", "sample"],
      });

      const doc = manager.getDocument({
        documentId: result.documentId,
        agentId: "agent-1",
        kbId,
      });
      expect(doc?.description).toBe("Test document");
      expect(doc?.tags).toEqual(["sample", "test"]); // Sorted
    });

    it("should reject file exceeding size limit", async () => {
      const kbId = createBase("agent-1", "Upload").id;
      const largeBuffer = Buffer.alloc(2 * 1024 * 1024); // 2MB

      await expect(
        manager.uploadDocument({
          kbId,
          filename: "large.txt",
          buffer: largeBuffer,
          mimetype: "text/plain",
          sourceType: "web_api",
          agentId: "agent-1",
        }),
      ).rejects.toThrow("File too large");
    });

    it("should reject when document limit is reached", async () => {
      const kbId = createBase("agent-1", "Upload").id;
      const buffer = Buffer.from("content");

      // Upload 10 documents (the limit)
      for (let i = 0; i < 10; i++) {
        await manager.uploadDocument({
          kbId,
          filename: `doc${i}.txt`,
          buffer: Buffer.from(`content${i}`),
          mimetype: "text/plain",
          sourceType: "web_api",
          agentId: "agent-1",
        });
      }

      // 11th should fail
      await expect(
        manager.uploadDocument({
          kbId,
          filename: "doc11.txt",
          buffer,
          mimetype: "text/plain",
          sourceType: "web_api",
          agentId: "agent-1",
        }),
      ).rejects.toThrow("Document limit reached");
    });

    it("should reject unsupported MIME types", async () => {
      const kbId = createBase("agent-1", "Upload").id;
      const buffer = Buffer.from("content");

      await expect(
        manager.uploadDocument({
          kbId,
          filename: "data.bin",
          buffer,
          mimetype: "application/octet-stream",
          sourceType: "web_api",
          agentId: "agent-1",
        }),
      ).rejects.toThrow("Unsupported document type");
    });

    it("should allow preview-only types without indexing", async () => {
      const kbId = createBase("agent-1", "Preview").id;
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xdb]);

      const result = await manager.uploadDocument({
        kbId,
        filename: "image.jpg",
        buffer,
        mimetype: "image/jpeg",
        sourceType: "web_api",
        agentId: "agent-1",
      });

      expect(result.documentId).toBeTruthy();
      expect(result.indexed).toBe(false);
      const doc = manager.getDocument({
        documentId: result.documentId,
        agentId: "agent-1",
        kbId,
      });
      expect(doc?.mimetype).toBe("image/jpeg");
    });

    it("should support store-only uploads without text extraction", async () => {
      const localManager = new KnowledgeManager({
        cfg,
        db,
        baseDir: tempDir,
        agentId: "agent-1",
      });
      const kbId = localManager.createBase({
        agentId: "agent-1",
        name: "Preview-store-only",
        visibility: "private",
      }).id;
      const buffer = Buffer.from("   \n\t   ");

      const result = await localManager.uploadDocument({
        kbId,
        filename: "blank.txt",
        buffer,
        mimetype: "text/plain",
        sourceType: "chat_attachment",
        agentId: "agent-1",
        processingMode: "store_only",
      });

      expect(result.documentId).toBeTruthy();
      expect(result.indexed).toBe(false);
      const doc = localManager.getDocument({
        documentId: result.documentId,
        agentId: "agent-1",
        kbId,
      });
      expect(doc?.filename).toBe("blank.txt");
    });

    it("should reject disabled document formats", async () => {
      const disabledFormatCfg = {
        agents: {
          defaults: {
            tools: {
              knowledgeBase: {
                enabled: true,
                formats: {
                  pdf: { enabled: false },
                  docx: { enabled: true },
                  txt: { enabled: true },
                  html: { enabled: true },
                },
              },
            },
          },
        },
      } as OpenClawConfig;

      const disabledFormatManager = new KnowledgeManager({
        cfg: disabledFormatCfg,
        db,
        baseDir: tempDir,
        agentId: "test-agent",
      });
      const disabledBase = disabledFormatManager.createBase({
        agentId: "agent-1",
        name: "Disabled-1",
        visibility: "private",
      });

      await expect(
        disabledFormatManager.uploadDocument({
          kbId: disabledBase.id,
          filename: "test.pdf",
          buffer: Buffer.from("%PDF-1.4"),
          mimetype: "application/pdf",
          sourceType: "web_api",
          agentId: "agent-1",
        }),
      ).rejects.toThrow("Document type disabled");
    });

    it("should reject when knowledge base is disabled", async () => {
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
        agentId: "test-agent",
      });

      await expect(
        disabledManager.uploadDocument({
          filename: "test.txt",
          buffer: Buffer.from("content"),
          mimetype: "text/plain",
          sourceType: "web_api",
          agentId: "agent-1",
        }),
      ).rejects.toThrow("Knowledge base is disabled");
    });
  });

  describe("updateDocument", () => {
    it("should overwrite a document and keep the same documentId", async () => {
      const kbId = createBase("agent-1", "Update").id;
      const upload = await manager.uploadDocument({
        kbId,
        filename: "original.txt",
        buffer: Buffer.from("original content"),
        mimetype: "text/plain",
        sourceType: "web_api",
        agentId: "agent-1",
        description: "original",
        tags: ["one"],
      });

      const result = await manager.updateDocument({
        kbId,
        documentId: upload.documentId,
        filename: "updated.txt",
        buffer: Buffer.from("updated content"),
        mimetype: "text/plain",
        sourceType: "web_api",
        agentId: "agent-1",
        description: "updated",
        tags: ["two", "three"],
      });

      expect(result.documentId).toBe(upload.documentId);
      expect(result.filename).toBe("updated.txt");
      expect(result.indexed).toBe(false);

      const doc = manager.getDocument({
        documentId: upload.documentId,
        agentId: "agent-1",
        kbId,
      });
      expect(doc?.filename).toBe("updated.txt");
      expect(doc?.description).toBe("updated");
      expect(doc?.tags).toEqual(["three", "two"]);
    });
  });

  describe("updateDocumentMetadata", () => {
    it("renames the underlying local file for local_fs documents", async () => {
      const kbId = createBase("agent-1", "Local Rename").id;
      const sourceFile = path.join(tempDir, "original-name.txt");
      await fs.writeFile(sourceFile, "rename me", "utf8");

      const materialized = await manager.materializeTreeFile({
        agentId: "agent-1",
        kbId,
        path: sourceFile,
        mode: "vectorize",
      });

      const updated = await manager.updateDocumentMetadata({
        documentId: materialized.documentId,
        agentId: "agent-1",
        kbId,
        filename: "renamed-name.txt",
      });

      expect(updated.filename).toBe("renamed-name.txt");
      expect(updated.filepath).toBe(path.join(tempDir, "renamed-name.txt"));
      await expect(fs.stat(path.join(tempDir, "renamed-name.txt"))).resolves.toBeTruthy();
      await expect(fs.stat(sourceFile)).rejects.toThrow();
    });

    it("renames an unmaterialized local tree file", async () => {
      const kbId = createBase("agent-1", "Local Virtual Rename").id;
      const sourceFile = path.join(tempDir, "tree-original.txt");
      await fs.writeFile(sourceFile, "rename me too", "utf8");

      const updated = await manager.renameTreeFile({
        agentId: "agent-1",
        kbId,
        path: sourceFile,
        filename: "tree-renamed.txt",
      });

      expect(updated.filename).toBe("tree-renamed.txt");
      expect(updated.path).toBe(path.join(tempDir, "tree-renamed.txt"));
      expect(updated.documentId).toBeNull();
      await expect(fs.stat(path.join(tempDir, "tree-renamed.txt"))).resolves.toBeTruthy();
      await expect(fs.stat(sourceFile)).rejects.toThrow();
    });
  });

  describe("rebuildDocument", () => {
    it("does not report graph success when extraction returns zero triples", async () => {
      const extractSpy = vi.spyOn(knowledgeGraphModule, "extractTriplesViaLlm").mockResolvedValue({
        entities: [],
        relations: [],
        triples: [],
        targetTriples: 0,
        rawText: "Request timed out before a response was generated.",
      });

      const base = manager.createBase({
        agentId: "agent-1",
        name: "Graph Rebuild",
        visibility: "private",
        settings: {
          vectorization: { enabled: false },
          graph: {
            enabled: true,
            minTriples: 3,
            maxTriples: 50,
            triplesPerKTokens: 10,
            maxDepth: 3,
          },
        },
      });

      const uploaded = await manager.uploadDocument({
        kbId: base.id,
        filename: "graph.txt",
        buffer: Buffer.from("alpha beta gamma"),
        mimetype: "text/plain",
        sourceType: "web_api",
        agentId: "agent-1",
      });

      const result = await manager.rebuildDocument({
        agentId: "agent-1",
        kbId: base.id,
        documentId: uploaded.documentId,
      });

      expect(result.graphBuilt).toBe(false);
      const run = db
        .prepare(
          `SELECT status, error
           FROM knowledge_graph_runs
           WHERE kb_id = ? AND document_id = ?`,
        )
        .get(base.id, uploaded.documentId) as { status: string; error: string | null } | undefined;
      expect(run?.status).toBe("failed");
      expect(run?.error).toContain("No graph triples extracted");

      extractSpy.mockRestore();
    });
  });

  describe("deleteDocument", () => {
    it("should delete a document", async () => {
      const kbId = createBase("agent-1", "Delete").id;
      const buffer = Buffer.from("content to delete");
      const uploadResult = await manager.uploadDocument({
        kbId,
        filename: "delete-me.txt",
        buffer,
        mimetype: "text/plain",
        sourceType: "web_api",
        agentId: "agent-1",
      });

      const deleteResult = await manager.deleteDocument({
        documentId: uploadResult.documentId,
        agentId: "agent-1",
        kbId,
      });

      expect(deleteResult.success).toBe(true);

      const doc = manager.getDocument({
        documentId: uploadResult.documentId,
        agentId: "agent-1",
        kbId,
      });
      expect(doc).toBeNull();
    });

    it("should return false for non-existent document", async () => {
      const result = await manager.deleteDocument({
        documentId: "non-existent-id",
        agentId: "agent-1",
      });

      expect(result.success).toBe(false);
    });

    it("should reject deleting another agent's document", async () => {
      const kbId = createBase("agent-2", "Delete").id;
      const buffer = Buffer.from("agent-2 content");
      const uploadResult = await manager.uploadDocument({
        kbId,
        filename: "owned-by-agent2.txt",
        buffer,
        mimetype: "text/plain",
        sourceType: "web_api",
        agentId: "agent-2",
      });

      await expect(
        manager.deleteDocument({
          documentId: uploadResult.documentId,
          agentId: "agent-1",
        }),
      ).rejects.toThrow("does not belong to this agent");
    });
  });

  describe("listDocuments", () => {
    beforeEach(async () => {
      const kbId = createBase("agent-1", "List").id;
      const kbId2 = createBase("agent-2", "List").id;
      // Create test documents
      await manager.uploadDocument({
        kbId,
        filename: "doc1.txt",
        buffer: Buffer.from("content1"),
        mimetype: "text/plain",
        sourceType: "web_api",
        agentId: "agent-1",
        tags: ["tag1"],
      });

      await manager.uploadDocument({
        kbId,
        filename: "doc2.txt",
        buffer: Buffer.from("content2"),
        mimetype: "text/plain",
        sourceType: "web_api",
        agentId: "agent-1",
        tags: ["tag2"],
      });

      await manager.uploadDocument({
        kbId: kbId2,
        filename: "doc3.txt",
        buffer: Buffer.from("content3"),
        mimetype: "text/plain",
        sourceType: "web_api",
        agentId: "agent-2",
      });
    });

    it("should list documents for an agent", () => {
      const docs = manager.listDocuments({ agentId: "agent-1" });
      expect(docs.length).toBe(2);
      const names = docs.map((doc) => doc.filename).toSorted();
      expect(names).toEqual(["doc1.txt", "doc2.txt"]);
    });

    it("should filter by tags", () => {
      const docs = manager.listDocuments({ agentId: "agent-1", tags: ["tag1"] });
      expect(docs.length).toBe(1);
      expect(docs[0].filename).toBe("doc1.txt");
    });

    it("should respect pagination", () => {
      const page1 = manager.listDocuments({ agentId: "agent-1", limit: 1, offset: 0 });
      expect(page1.length).toBe(1);

      const page2 = manager.listDocuments({ agentId: "agent-1", limit: 1, offset: 1 });
      expect(page2.length).toBe(1);
      const pagedNames = [...page1, ...page2].map((doc) => doc.filename).toSorted();
      expect(pagedNames).toEqual(["doc1.txt", "doc2.txt"]);
    });

    it("should not return documents from other agents", () => {
      const docs = manager.listDocuments({ agentId: "agent-2" });
      expect(docs.length).toBe(1);
      expect(docs[0].filename).toBe("doc3.txt");
    });
  });

  describe("getDocumentCount", () => {
    it("should return correct count", async () => {
      const kbId = createBase("agent-1", "Count").id;
      const kbId2 = createBase("agent-2", "Count").id;
      expect(manager.getDocumentCount({ agentId: "agent-1" })).toBe(0);

      await manager.uploadDocument({
        kbId,
        filename: "doc1.txt",
        buffer: Buffer.from("content1"),
        mimetype: "text/plain",
        sourceType: "web_api",
        agentId: "agent-1",
      });

      expect(manager.getDocumentCount({ agentId: "agent-1" })).toBe(1);

      await manager.uploadDocument({
        kbId: kbId2,
        filename: "doc2.txt",
        buffer: Buffer.from("content2"),
        mimetype: "text/plain",
        sourceType: "web_api",
        agentId: "agent-2",
      });

      expect(manager.getDocumentCount({ agentId: "agent-1" })).toBe(1);
      expect(manager.getDocumentCount({ agentId: "agent-2" })).toBe(1);
    });

    it("should return 0 when knowledge base is disabled", () => {
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
        agentId: "test-agent",
      });

      expect(disabledManager.getDocumentCount({ agentId: "agent-1" })).toBe(0);
    });
  });
});
