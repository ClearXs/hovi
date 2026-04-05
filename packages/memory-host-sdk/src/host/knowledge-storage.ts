import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { KnowledgeDocument } from "./knowledge-schema.js";

export type StoreDocumentParams = {
  kbId: string;
  filename: string;
  buffer: Buffer;
  mimetype: string;
  sourceType: "web_api" | "chat_attachment" | "local_fs" | "smb" | "s3" | "webdav";
  sourceMetadata?: Record<string, unknown>;
  ownerAgentId: string;
  description?: string;
  tags?: string[];
};

export type StoreDocumentResult = {
  documentId: string;
  filepath: string;
  hash: string;
  size: number;
};

export type UpdateDocumentParams = {
  documentId: string;
  kbId: string;
  filename: string;
  buffer: Buffer;
  mimetype: string;
  sourceType: "web_api" | "chat_attachment" | "local_fs" | "smb" | "s3" | "webdav";
  sourceMetadata?: Record<string, unknown>;
  ownerAgentId: string;
  description?: string;
  tags?: string[];
};

export type UpdateDocumentResult = {
  documentId: string;
  filepath: string;
  hash: string;
  size: number;
  updatedAt: number;
};

export type UpdateDocumentMetadataParams = {
  documentId: string;
  filename?: string;
  description?: string | null;
  tags?: string[];
};

/**
 * Manages physical storage and metadata for knowledge base documents
 */
export class KnowledgeStorageManager {
  private baseDir: string;
  private agentId: string;
  private db: DatabaseSync;

  constructor(baseDir: string, agentId: string, db: DatabaseSync) {
    this.baseDir = baseDir;
    this.agentId = agentId;
    this.db = db;
  }

  /**
   * Get the knowledge storage directory path
   */
  getStorageDir(): string {
    return path.join(this.baseDir, this.agentId, "knowledge");
  }

  /**
   * Ensure the storage directory exists
   */
  async ensureStorageDir(): Promise<void> {
    const dir = this.getStorageDir();
    await fs.mkdir(dir, { recursive: true });
  }

  /**
   * Compute SHA-256 hash of buffer
   */
  private computeHash(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Get file extension from mimetype
   */
  private getExtensionFromMime(mimetype: string): string {
    const map: Record<string, string> = {
      "application/pdf": "pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
      "application/msword": "doc",
      "text/plain": "txt",
      "text/markdown": "md",
      "text/html": "html",
    };
    return map[mimetype] || "bin";
  }

  /**
   * Check if a document with the same hash already exists for this agent
   */
  async checkDuplicate(hash: string, agentId: string): Promise<KnowledgeDocument | null> {
    const row = this.db
      .prepare(
        `SELECT id, filename, filepath, mimetype, size, hash, source_type, source_metadata,
                uploaded_at, indexed_at, owner_agent_id, description
         FROM kb_documents
         WHERE hash = ? AND owner_agent_id = ?`,
      )
      .get(hash, agentId) as KnowledgeDocument | undefined;

    return row ?? null;
  }

  /**
   * Store document to filesystem and insert metadata
   */
  async storeDocument(params: StoreDocumentParams): Promise<StoreDocumentResult> {
    const {
      kbId,
      filename,
      buffer,
      mimetype,
      sourceType,
      sourceMetadata,
      ownerAgentId,
      description,
      tags,
    } = params;

    await this.ensureStorageDir();

    const hash = this.computeHash(buffer);
    const size = buffer.byteLength;

    // Check for duplicate
    const existing = await this.checkDuplicate(hash, ownerAgentId);
    if (existing) {
      throw new Error(`Document with same content already exists: ${existing.id}`);
    }

    const documentId = randomUUID();
    const ext = this.getExtensionFromMime(mimetype);
    const filepath = `${this.agentId}/knowledge/${documentId}.${ext}`;
    const absPath = path.join(this.baseDir, filepath);

    // Write file
    await fs.writeFile(absPath, buffer);

    // Insert metadata
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO kb_documents
        (id, kb_id, filename, filepath, mimetype, size, hash, source_type, source_metadata,
         uploaded_at, owner_agent_id, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        documentId,
        kbId,
        filename,
        filepath,
        mimetype,
        size,
        hash,
        sourceType,
        sourceMetadata ? JSON.stringify(sourceMetadata) : null,
        now,
        ownerAgentId,
        description ?? null,
      );

    // Insert tags
    if (tags && tags.length > 0) {
      const insertTag = this.db.prepare(`INSERT INTO kb_tags (document_id, tag) VALUES (?, ?)`);
      for (const tag of tags) {
        insertTag.run(documentId, tag);
      }
    }

    return {
      documentId,
      filepath,
      hash,
      size,
    };
  }

  /**
   * Update indexed_at timestamp
   */
  updateIndexedAt(documentId: string): void {
    this.db
      .prepare(`UPDATE kb_documents SET indexed_at = ? WHERE id = ?`)
      .run(Date.now(), documentId);
  }

  /**
   * Get document metadata
   */
  getDocument(documentId: string): KnowledgeDocument | null {
    const row = this.db
      .prepare(
        `SELECT id, kb_id, filename, filepath, mimetype, size, hash, source_type, source_metadata,
                uploaded_at, indexed_at, owner_agent_id, description
         FROM kb_documents
         WHERE id = ?`,
      )
      .get(documentId) as KnowledgeDocument | undefined;

    return row ?? null;
  }

  async updateDocument(params: UpdateDocumentParams): Promise<UpdateDocumentResult> {
    const existing = this.getDocument(params.documentId);
    if (!existing) {
      throw new Error(`Document not found: ${params.documentId}`);
    }

    await this.ensureStorageDir();

    const hash = this.computeHash(params.buffer);
    const size = params.buffer.byteLength;
    const duplicate = await this.checkDuplicate(hash, params.ownerAgentId);
    if (duplicate && duplicate.id !== params.documentId) {
      throw new Error(`Document with same content already exists: ${duplicate.id}`);
    }

    const ext = this.getExtensionFromMime(params.mimetype);
    const filepath = `${this.agentId}/knowledge/${params.documentId}.${ext}`;
    const absPath = path.join(this.baseDir, filepath);
    const previousPath = path.join(this.baseDir, existing.filepath);

    if (existing.filepath !== filepath) {
      try {
        await fs.unlink(previousPath);
      } catch {
        // Ignore missing previous file
      }
    }

    await fs.writeFile(absPath, params.buffer);

    const updatedAt = Date.now();
    const nextDescription = params.description ?? existing.description ?? null;

    this.db
      .prepare(
        `UPDATE kb_documents
         SET kb_id = ?, filename = ?, filepath = ?, mimetype = ?, size = ?, hash = ?,
             source_type = ?, source_metadata = ?, uploaded_at = ?, indexed_at = NULL, description = ?
         WHERE id = ?`,
      )
      .run(
        params.kbId,
        params.filename,
        filepath,
        params.mimetype,
        size,
        hash,
        params.sourceType,
        params.sourceMetadata ? JSON.stringify(params.sourceMetadata) : null,
        updatedAt,
        nextDescription,
        params.documentId,
      );

    if (params.tags) {
      this.db.prepare(`DELETE FROM kb_tags WHERE document_id = ?`).run(params.documentId);
      if (params.tags.length > 0) {
        const insertTag = this.db.prepare(`INSERT INTO kb_tags (document_id, tag) VALUES (?, ?)`);
        for (const tag of params.tags) {
          insertTag.run(params.documentId, tag);
        }
      }
    }

    return {
      documentId: params.documentId,
      filepath,
      hash,
      size,
      updatedAt,
    };
  }

  updateDocumentMetadata(params: UpdateDocumentMetadataParams): void {
    const existing = this.getDocument(params.documentId);
    if (!existing) {
      throw new Error(`Document not found: ${params.documentId}`);
    }

    const nextFilename = params.filename?.trim() || existing.filename;
    if (!nextFilename) {
      throw new Error("filename is required");
    }
    const nextDescription =
      params.description === undefined ? (existing.description ?? null) : params.description;

    this.db
      .prepare(
        `UPDATE kb_documents
         SET filename = ?, description = ?
         WHERE id = ?`,
      )
      .run(nextFilename, nextDescription, params.documentId);

    if (params.tags) {
      this.db.prepare(`DELETE FROM kb_tags WHERE document_id = ?`).run(params.documentId);
      if (params.tags.length > 0) {
        const insertTag = this.db.prepare(`INSERT INTO kb_tags (document_id, tag) VALUES (?, ?)`);
        for (const tag of params.tags) {
          insertTag.run(params.documentId, tag);
        }
      }
    }
  }

  /**
   * Get document tags
   */
  getDocumentTags(documentId: string): string[] {
    const rows = this.db
      .prepare(`SELECT tag FROM kb_tags WHERE document_id = ? ORDER BY tag`)
      .all(documentId) as Array<{ tag: string }>;

    return rows.map((row) => row.tag);
  }

  /**
   * Delete document from filesystem and database
   */
  async deleteDocument(documentId: string): Promise<boolean> {
    const doc = this.getDocument(documentId);
    if (!doc) {
      return false;
    }

    const shouldDeleteOwnedFile =
      doc.source_type === "web_api" || doc.source_type === "chat_attachment";
    if (shouldDeleteOwnedFile) {
      const absPath = path.join(this.baseDir, doc.filepath);
      // Delete file (ignore errors if file doesn't exist)
      try {
        await fs.unlink(absPath);
      } catch {
        // File may have been deleted already
      }
    }

    // Delete metadata (tags will cascade)
    this.db.prepare(`DELETE FROM kb_documents WHERE id = ?`).run(documentId);

    return true;
  }

  /**
   * List documents for an agent
   */
  listDocuments(params: {
    agentId: string;
    kbId?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
  }): KnowledgeDocument[] {
    const { agentId, kbId, tags, limit = 100, offset = 0 } = params;

    let query = `
      SELECT DISTINCT d.id, d.kb_id, d.filename, d.filepath, d.mimetype, d.size, d.hash,
                      d.source_type, d.source_metadata, d.uploaded_at, d.indexed_at,
                      d.owner_agent_id, d.description
      FROM kb_documents d
    `;

    const conditions: string[] = [`d.owner_agent_id = ?`];
    const values: (string | number)[] = [agentId];

    if (kbId) {
      conditions.push(`d.kb_id = ?`);
      values.push(kbId);
    }

    if (tags && tags.length > 0) {
      query += ` INNER JOIN kb_tags t ON d.id = t.document_id`;
      conditions.push(`t.tag IN (${tags.map(() => "?").join(", ")})`);
      values.push(...tags);
    }

    query += ` WHERE ${conditions.join(" AND ")}`;
    query += ` ORDER BY d.uploaded_at DESC, d.id DESC LIMIT ? OFFSET ?`;
    values.push(limit, offset);

    const rows = this.db.prepare(query).all(...values) as KnowledgeDocument[];
    return rows;
  }

  /**
   * Get total document count for an agent
   */
  getDocumentCount(params: { agentId: string; kbId?: string }): number {
    const conditions: string[] = ["owner_agent_id = ?"];
    const values: (string | number)[] = [params.agentId];
    if (params.kbId) {
      conditions.push("kb_id = ?");
      values.push(params.kbId);
    }
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM kb_documents WHERE ${conditions.join(" AND ")}`)
      .get(...values) as { count: number };

    return row.count;
  }
}
