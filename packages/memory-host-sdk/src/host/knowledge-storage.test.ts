import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ensureKnowledgeSchema } from "./knowledge-schema.js";
import { KnowledgeStorageManager } from "./knowledge-storage.js";

describe("KnowledgeStorageManager", () => {
  let db: DatabaseSync;
  let tempDir: string;
  let manager: KnowledgeStorageManager;

  beforeEach(async () => {
    db = new DatabaseSync(":memory:");
    ensureKnowledgeSchema(db);

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "kb-test-"));
    manager = new KnowledgeStorageManager(tempDir, "agent-1", db);
  });

  afterEach(async () => {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("storeDocument", () => {
    it("should store document and create metadata", async () => {
      const buffer = Buffer.from("test content");
      const result = await manager.storeDocument({
        kbId: "kb-1",
        filename: "test.txt",
        buffer,
        mimetype: "text/plain",
        sourceType: "web_api",
        ownerAgentId: "agent-1",
      });

      expect(result.documentId).toBeTruthy();
      expect(result.filepath).toMatch(/^knowledge\/.*\.txt$/);
      expect(result.hash).toBeTruthy();
      expect(result.size).toBe(buffer.byteLength);

      // Verify file exists
      const absPath = path.join(tempDir, result.filepath);
      const fileContent = await fs.readFile(absPath);
      expect(fileContent.toString()).toBe("test content");

      // Verify metadata
      const doc = manager.getDocument(result.documentId);
      expect(doc).toBeTruthy();
      expect(doc?.filename).toBe("test.txt");
      expect(doc?.mimetype).toBe("text/plain");
      expect(doc?.owner_agent_id).toBe("agent-1");
    });

    it("should reject duplicate documents", async () => {
      const buffer = Buffer.from("test content");
      await manager.storeDocument({
        kbId: "kb-1",
        filename: "test1.txt",
        buffer,
        mimetype: "text/plain",
        sourceType: "web_api",
        ownerAgentId: "agent-1",
      });

      await expect(
        manager.storeDocument({
          kbId: "kb-1",
          filename: "test2.txt",
          buffer,
          mimetype: "text/plain",
          sourceType: "web_api",
          ownerAgentId: "agent-1",
        }),
      ).rejects.toThrow("already exists");
    });

    it("should allow same content for different agents", async () => {
      const buffer = Buffer.from("test content");
      const result1 = await manager.storeDocument({
        kbId: "kb-1",
        filename: "test.txt",
        buffer,
        mimetype: "text/plain",
        sourceType: "web_api",
        ownerAgentId: "agent-1",
      });

      const result2 = await manager.storeDocument({
        kbId: "kb-2",
        filename: "test.txt",
        buffer,
        mimetype: "text/plain",
        sourceType: "web_api",
        ownerAgentId: "agent-2",
      });

      expect(result1.documentId).not.toBe(result2.documentId);
      expect(result1.hash).toBe(result2.hash);
    });

    it("should store document with tags", async () => {
      const buffer = Buffer.from("test content");
      const result = await manager.storeDocument({
        kbId: "kb-1",
        filename: "test.txt",
        buffer,
        mimetype: "text/plain",
        sourceType: "web_api",
        ownerAgentId: "agent-1",
        tags: ["tag1", "tag2"],
      });

      const tags = manager.getDocumentTags(result.documentId);
      expect(tags).toEqual(["tag1", "tag2"]);
    });

    it("should store document with description and source metadata", async () => {
      const buffer = Buffer.from("test content");
      const result = await manager.storeDocument({
        kbId: "kb-1",
        filename: "test.txt",
        buffer,
        mimetype: "text/plain",
        sourceType: "chat_attachment",
        sourceMetadata: { channel: "telegram", userId: "123" },
        ownerAgentId: "agent-1",
        description: "Test document",
      });

      const doc = manager.getDocument(result.documentId);
      expect(doc?.description).toBe("Test document");
      expect(doc?.source_metadata).toBeTruthy();
      expect(JSON.parse(doc!.source_metadata!)).toEqual({
        channel: "telegram",
        userId: "123",
      });
    });

    it("should use correct file extension based on MIME type", async () => {
      const tests = [
        { mimetype: "application/pdf", ext: "pdf" },
        {
          mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ext: "docx",
        },
        { mimetype: "text/plain", ext: "txt" },
        { mimetype: "text/markdown", ext: "md" },
        { mimetype: "text/html", ext: "html" },
      ];

      for (const { mimetype, ext } of tests) {
        const buffer = Buffer.from("content");
        const result = await manager.storeDocument({
          kbId: `kb-${ext}`,
          filename: `test.${ext}`,
          buffer,
          mimetype,
          sourceType: "web_api",
          ownerAgentId: `agent-${ext}`,
        });

        expect(result.filepath).toMatch(new RegExp(`\\.${ext}$`));
      }
    });
  });

  describe("updateIndexedAt", () => {
    it("should update indexed_at timestamp", async () => {
      const buffer = Buffer.from("test content");
      const result = await manager.storeDocument({
        kbId: "kb-1",
        filename: "test.txt",
        buffer,
        mimetype: "text/plain",
        sourceType: "web_api",
        ownerAgentId: "agent-1",
      });

      const docBefore = manager.getDocument(result.documentId);
      expect(docBefore?.indexed_at).toBeNull();

      manager.updateIndexedAt(result.documentId);

      const docAfter = manager.getDocument(result.documentId);
      expect(docAfter?.indexed_at).toBeTruthy();
      expect(docAfter?.indexed_at).toBeGreaterThan(0);
    });
  });

  describe("deleteDocument", () => {
    it("should delete document and metadata", async () => {
      const buffer = Buffer.from("test content");
      const result = await manager.storeDocument({
        kbId: "kb-1",
        filename: "test.txt",
        buffer,
        mimetype: "text/plain",
        sourceType: "web_api",
        ownerAgentId: "agent-1",
        tags: ["tag1"],
      });

      const absPath = path.join(tempDir, result.filepath);
      expect(await fs.stat(absPath)).toBeTruthy();

      const deleted = await manager.deleteDocument(result.documentId);
      expect(deleted).toBe(true);

      // Verify file deleted
      await expect(fs.stat(absPath)).rejects.toThrow();

      // Verify metadata deleted
      expect(manager.getDocument(result.documentId)).toBeNull();

      // Verify tags deleted (cascade)
      expect(manager.getDocumentTags(result.documentId)).toEqual([]);
    });

    it("should return false for non-existent document", async () => {
      const deleted = await manager.deleteDocument("non-existent-id");
      expect(deleted).toBe(false);
    });
  });

  describe("listDocuments", () => {
    let doc1Id: string;
    let doc2Id: string;

    beforeEach(async () => {
      const now = Date.now();
      // Create test documents
      const doc1 = await manager.storeDocument({
        kbId: "kb-1",
        filename: "doc1.txt",
        buffer: Buffer.from("content1"),
        mimetype: "text/plain",
        sourceType: "web_api",
        ownerAgentId: "agent-1",
        tags: ["tag1"],
      });

      const doc2 = await manager.storeDocument({
        kbId: "kb-1",
        filename: "doc2.txt",
        buffer: Buffer.from("content2"),
        mimetype: "text/plain",
        sourceType: "web_api",
        ownerAgentId: "agent-1",
        tags: ["tag2"],
      });
      doc1Id = doc1.documentId;
      doc2Id = doc2.documentId;
      db.prepare(`UPDATE kb_documents SET uploaded_at = ? WHERE id = ?`).run(now - 2000, doc1Id);
      db.prepare(`UPDATE kb_documents SET uploaded_at = ? WHERE id = ?`).run(now - 1000, doc2Id);

      await manager.storeDocument({
        kbId: "kb-2",
        filename: "doc3.txt",
        buffer: Buffer.from("content3"),
        mimetype: "text/plain",
        sourceType: "web_api",
        ownerAgentId: "agent-2",
        tags: ["tag1"],
      });
    });

    it("should list documents for an agent", () => {
      const docs = manager.listDocuments({ agentId: "agent-1" });
      expect(docs.length).toBe(2);
      expect(docs[0].filename).toBe("doc2.txt"); // Most recent first
      expect(docs[1].filename).toBe("doc1.txt");
    });

    it("should filter by tags", () => {
      const docs = manager.listDocuments({ agentId: "agent-1", tags: ["tag1"] });
      expect(docs.length).toBe(1);
      expect(docs[0].filename).toBe("doc1.txt");
    });

    it("should respect limit and offset", () => {
      const docs1 = manager.listDocuments({ agentId: "agent-1", limit: 1, offset: 0 });
      expect(docs1.length).toBe(1);
      expect(docs1[0].filename).toBe("doc2.txt");

      const docs2 = manager.listDocuments({ agentId: "agent-1", limit: 1, offset: 1 });
      expect(docs2.length).toBe(1);
      expect(docs2[0].filename).toBe("doc1.txt");
    });

    it("should not return documents from other agents", () => {
      const docs = manager.listDocuments({ agentId: "agent-2" });
      expect(docs.length).toBe(1);
      expect(docs[0].filename).toBe("doc3.txt");
    });
  });

  describe("getDocumentCount", () => {
    it("should return correct count", async () => {
      expect(manager.getDocumentCount({ agentId: "agent-1" })).toBe(0);

      await manager.storeDocument({
        kbId: "kb-1",
        filename: "doc1.txt",
        buffer: Buffer.from("content1"),
        mimetype: "text/plain",
        sourceType: "web_api",
        ownerAgentId: "agent-1",
      });

      expect(manager.getDocumentCount({ agentId: "agent-1" })).toBe(1);

      await manager.storeDocument({
        kbId: "kb-1",
        filename: "doc2.txt",
        buffer: Buffer.from("content2"),
        mimetype: "text/plain",
        sourceType: "web_api",
        ownerAgentId: "agent-1",
      });

      expect(manager.getDocumentCount({ agentId: "agent-1" })).toBe(2);

      // Other agent's documents should not count
      await manager.storeDocument({
        kbId: "kb-2",
        filename: "doc3.txt",
        buffer: Buffer.from("content3"),
        mimetype: "text/plain",
        sourceType: "web_api",
        ownerAgentId: "agent-2",
      });

      expect(manager.getDocumentCount({ agentId: "agent-1" })).toBe(2);
      expect(manager.getDocumentCount({ agentId: "agent-2" })).toBe(1);
    });
  });
});
