import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { MemoryIndexManager } from "../../../../extensions/memory-core/src/memory/manager.js";
import { resolveAgentDir } from "../../../../src/agents/agent-scope.js";
import { resolveKnowledgeConfig } from "../../../../src/agents/knowledge-config.js";
import type { OpenClawConfig } from "../../../../src/config/config.js";
import { createSubsystemLogger } from "../../../../src/logging/subsystem.js";
import { hashText } from "./internal.js";
import {
  KnowledgeGraphBuilder,
  KnowledgeGraphSearcher,
  clearKnowledgeGraph,
  getGraphBuildTask,
} from "./knowledge-graph-builder.js";
import {
  type KnowledgeGraphSettings,
  extractTriplesViaLlm,
  hashTripleKey,
  writeTriplesJsonl,
  type KnowledgeGraphTripleInput,
} from "./knowledge-graph.js";
import { ProcessorRegistry, type ProcessorOptions } from "./knowledge-processor.js";
import type {
  KnowledgeBaseEntry,
  KnowledgeBaseGraphConfig,
  KnowledgeBaseRuntimeSettings,
  KnowledgeBaseSettingsEntry,
  KnowledgeBaseSettings,
  KnowledgeChunkConfig,
  KnowledgeDocument,
  KnowledgeGraphRun,
  KnowledgeGraphBuildTask,
  KnowledgeGraphSearchResult,
  KnowledgeGraphStats,
  KnowledgeIndexConfig,
  KnowledgeRetrievalConfig,
} from "./knowledge-schema.js";
import { ensureKnowledgeSchema } from "./knowledge-schema.js";
import { KnowledgeStorageManager } from "./knowledge-storage.js";
import { ensureMemoryIndexSchema } from "./memory-schema.js";

const log = createSubsystemLogger("knowledge");

export type UploadKnowledgeDocumentParams = {
  kbId?: string;
  filename: string;
  buffer: Buffer;
  mimetype: string;
  sourceType: "web_api" | "chat_attachment" | "local_fs" | "smb" | "s3" | "webdav";
  sourceMetadata?: Record<string, unknown>;
  agentId: string;
  description?: string;
  tags?: string[];
  processingMode?: "full" | "store_only";
};

export type UploadKnowledgeDocumentResult = {
  documentId: string;
  indexed: boolean;
};

export type UpdateKnowledgeDocumentParams = {
  kbId: string;
  documentId: string;
  filename: string;
  buffer: Buffer;
  mimetype: string;
  sourceType: "web_api" | "chat_attachment" | "local_fs" | "smb" | "s3" | "webdav";
  sourceMetadata?: Record<string, unknown>;
  agentId: string;
  description?: string;
  tags?: string[];
};

export type UpdateKnowledgeDocumentResult = {
  documentId: string;
  filename: string;
  size: number;
  indexed: boolean;
  updatedAt: string;
};

export type UpdateKnowledgeDocumentMetadataParams = {
  kbId: string;
  documentId: string;
  agentId: string;
  filename?: string;
  description?: string | null;
  tags?: string[];
};

export type RenameKnowledgeTreeFileParams = {
  kbId: string;
  agentId: string;
  path: string;
  filename: string;
};

export type DeleteKnowledgeDocumentResult = {
  success: boolean;
};

export type ListKnowledgeDocumentsParams = {
  agentId: string;
  kbId?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
};

export type KnowledgeDocumentWithTags = KnowledgeDocument & {
  tags: string[];
};

export type KnowledgeChunk = {
  id: string;
  index: number;
  text: string;
  tokens: number;
  sourcePage: number | null;
  status: "enabled";
};

export type KnowledgeChunkDetail = KnowledgeChunk & {
  documentId: string;
  startLine: number;
  endLine: number;
};

export type KnowledgeBaseCreateParams = {
  name: string;
  description?: string;
  icon?: string;
  visibility?: "private" | "team" | "public";
  sourceType?: KnowledgeSourceType;
  sourceStatus?: KnowledgeSourceStatus;
  sourceConfig?: KnowledgeSourceConfig;
  pinned?: boolean;
  tags?: KnowledgeBaseTagInput[];
  settings?: Partial<KnowledgeBaseRuntimeSettings>;
};

export type KnowledgeBaseUpdateParams = {
  kbId: string;
  name?: string;
  description?: string;
  icon?: string;
  visibility?: "private" | "team" | "public";
  tags?: KnowledgeBaseTagInput[];
};

export type KnowledgeBaseTagInput = {
  name: string;
  color?: string;
};

export type KnowledgeBaseTag = {
  tagId: string;
  name: string;
  color: string | null;
};

export type KnowledgeBaseWithMeta = KnowledgeBaseEntry & {
  tags: KnowledgeBaseTag[];
  settings: KnowledgeBaseRuntimeSettings;
  documentCount: number;
};

export type KnowledgeBaseDeleteResult = {
  success: boolean;
};

export type KnowledgeSourceType = "external" | "local_fs" | "smb" | "s3" | "webdav";
export type KnowledgeSourceStatus = "connected" | "paused" | "syncing" | "error";

export type KnowledgeSourceConfig = {
  protocol?: "smb" | "s3" | "webdav";
  endpoint?: string;
  bucket?: string;
  rootPath?: string;
  username?: string;
  region?: string;
};

export type KnowledgeTreeEntry = {
  id: string;
  name: string;
  path: string;
  kind: "file" | "directory";
  extension?: string | null;
  typeLabel: string;
  size?: number | null;
  createdAtMs?: number | null;
  mtimeMs?: number | null;
  permissions?: string | null;
  sourceType: "local_fs";
  materialized: boolean;
  vectorized: boolean;
  graphBuilt: boolean;
  documentId?: string | null;
};

export type KnowledgeVectorizationSettings = {
  enabled: boolean;
  provider?: "openai" | "gemini" | "local" | "auto";
  model?: string;
};

export type KnowledgeGraphSettingsState = KnowledgeBaseGraphConfig;

export type KnowledgeSearchSettingsState = {
  includeInMemorySearch: boolean;
};

export type KnowledgeSettings = {
  vectorization: KnowledgeVectorizationSettings;
  graph: KnowledgeGraphSettingsState;
  search: KnowledgeSearchSettingsState;
  updatedAt?: number;
};

export type UpdateKnowledgeSettingsParams = {
  vectorization?: Partial<KnowledgeVectorizationSettings>;
  graph?: Partial<KnowledgeGraphSettingsState>;
  search?: Partial<KnowledgeSearchSettingsState>;
};

const DEFAULT_CHUNK_CONFIG: KnowledgeChunkConfig = {
  enabled: true,
  size: 800,
  overlap: 120,
  separator: "auto",
};

const DEFAULT_RETRIEVAL_CONFIG: KnowledgeRetrievalConfig = {
  mode: "hybrid",
  topK: 5,
  minScore: 0.35,
  hybridAlpha: 0.5,
};

const DEFAULT_INDEX_CONFIG: KnowledgeIndexConfig = {
  mode: "balanced",
};

const DEFAULT_BASE_GRAPH_CONFIG = {
  enabled: false,
  minTriples: 3,
  maxTriples: 50,
  triplesPerKTokens: 10,
  maxDepth: 3,
} as const;

const DEFAULT_BASE_VECTORIZATION_CONFIG = {
  enabled: true,
} as const;

const DEFAULT_TAG_COLOR = "#64748b";
const DEFAULT_LOCAL_KB_NAME = "本地知识库";
const DEFAULT_LOCAL_KB_DESCRIPTION = "默认本机目录知识库（目录树）";

/**
 * High-level knowledge base manager coordinating storage, processing, and indexing
 */
export class KnowledgeManager {
  private cfg: OpenClawConfig;
  private db: DatabaseSync;
  private baseDir: string;
  private agentId: string;
  private storage: KnowledgeStorageManager;
  private processorRegistry: ProcessorRegistry;
  private readonly embeddingCacheTable = "embedding_cache";
  private readonly ftsTable = "chunks_fts";

  constructor(params: { cfg: OpenClawConfig; db: DatabaseSync; baseDir: string; agentId: string }) {
    this.cfg = params.cfg;
    this.db = params.db;
    this.baseDir = params.baseDir;
    this.agentId = params.agentId;

    // Ensure schema exists
    ensureKnowledgeSchema(this.db);

    this.storage = new KnowledgeStorageManager(this.baseDir, this.agentId, this.db);
    this.processorRegistry = new ProcessorRegistry();
  }

  private ensureChunksSchema() {
    ensureMemoryIndexSchema({
      db: this.db,
      embeddingCacheTable: this.embeddingCacheTable,
      ftsTable: this.ftsTable,
      ftsEnabled: false,
      cacheEnabled: false,
    });
  }

  /**
   * Get knowledge configuration for an agent
   */
  getConfig(agentId: string) {
    return resolveKnowledgeConfig(this.cfg, agentId);
  }

  /**
   * Check if knowledge base is enabled for an agent
   */
  isEnabled(agentId: string): boolean {
    return this.getConfig(agentId) !== null;
  }

  createBase(params: { agentId: string } & KnowledgeBaseCreateParams): KnowledgeBaseWithMeta {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }
    const name = params.name.trim();
    if (!name) {
      throw new Error("name is required");
    }
    const visibility = params.visibility ?? "private";
    if (!isVisibility(visibility)) {
      throw new Error("visibility is invalid");
    }
    if (this.baseNameExists(params.agentId, name)) {
      throw new Error("Knowledge base name already exists");
    }
    const now = Date.now();
    const sourceType = params.sourceType ?? "external";
    const sourceStatus = params.sourceStatus ?? "connected";
    const sourceConfig = params.sourceConfig ? JSON.stringify(params.sourceConfig) : null;
    const pinned = params.pinned ? 1 : 0;
    const kbId = hashText(`${params.agentId}:${name}:${now}`);
    this.db
      .prepare(
        `INSERT INTO kb_bases
         (id, owner_agent_id, name, description, icon, visibility, source_type, source_config, source_status, pinned, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        kbId,
        params.agentId,
        name,
        params.description ?? null,
        params.icon ?? null,
        visibility,
        sourceType,
        sourceConfig,
        sourceStatus,
        pinned,
        now,
        now,
      );
    this.upsertBaseSettings({
      agentId: params.agentId,
      kbId,
      settings: params.settings,
    });
    this.setBaseTags(params.agentId, kbId, params.tags ?? []);
    return this.getBaseWithMetaById(params.agentId, kbId) as KnowledgeBaseWithMeta;
  }

  listBases(params: {
    agentId: string;
    limit?: number;
    offset?: number;
    search?: string;
    visibility?: "private" | "team" | "public";
    tags?: string[];
  }): { total: number; returned: number; offset: number; kbs: KnowledgeBaseWithMeta[] } {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }
    this.ensureDefaultLocalBase(params.agentId);
    const rows = this.listBaseEntries({
      agentId: params.agentId,
      search: params.search,
      visibility: params.visibility,
      tags: params.tags,
    });
    const offset = Math.max(0, params.offset ?? 0);
    const limit = Math.max(1, params.limit ?? 50);
    const paged = rows
      .slice(offset, offset + limit)
      .map((row) => this.getBaseWithMetaById(params.agentId, row.id))
      .filter(Boolean) as KnowledgeBaseWithMeta[];
    return {
      total: rows.length,
      returned: paged.length,
      offset,
      kbs: paged,
    };
  }

  getBase(agentId: string, kbId?: string): KnowledgeBaseWithMeta | null {
    this.ensureDefaultLocalBase(agentId);
    if (kbId) {
      return this.getBaseWithMetaById(agentId, kbId);
    }
    const bases = this.listBaseEntries({ agentId });
    return bases.length === 1 ? this.getBaseWithMetaById(agentId, bases[0].id) : null;
  }

  getBaseById(agentId: string, kbId: string): KnowledgeBaseEntry | null {
    const row = this.db
      .prepare(
        `SELECT id, owner_agent_id, name, description, icon, visibility,
                source_type, source_config, source_status, pinned,
                created_at, updated_at
         FROM kb_bases WHERE owner_agent_id = ? AND id = ?`,
      )
      .get(agentId, kbId) as KnowledgeBaseEntry | undefined;
    return row ?? null;
  }

  updateBase(params: { agentId: string } & KnowledgeBaseUpdateParams): KnowledgeBaseWithMeta {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }
    const base = this.getBaseById(params.agentId, params.kbId);
    if (!base) {
      throw new Error("Knowledge base not found");
    }
    if (params.visibility && !isVisibility(params.visibility)) {
      throw new Error("visibility is invalid");
    }
    const name = params.name?.trim() ?? base.name;
    if (!name) {
      throw new Error("name is required");
    }
    if (name !== base.name && this.baseNameExists(params.agentId, name, base.id)) {
      throw new Error("Knowledge base name already exists");
    }
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE kb_bases
         SET name = ?, description = ?, icon = ?, visibility = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        name,
        params.description ?? base.description ?? null,
        params.icon ?? base.icon ?? null,
        params.visibility ?? base.visibility,
        now,
        base.id,
      );
    if (params.tags) {
      this.setBaseTags(params.agentId, params.kbId, params.tags);
    }
    return this.getBaseWithMetaById(params.agentId, params.kbId) as KnowledgeBaseWithMeta;
  }

  deleteBase(params: { agentId: string; kbId: string }): KnowledgeBaseDeleteResult {
    const base = this.getBaseById(params.agentId, params.kbId);
    if (!base) {
      return { success: false };
    }
    this.db.prepare(`DELETE FROM kb_bases WHERE id = ?`).run(base.id);
    return { success: true };
  }

  getBaseSettings(params: { agentId: string; kbId: string }): KnowledgeBaseRuntimeSettings {
    this.resolveBaseIdForAgent({ agentId: params.agentId, kbId: params.kbId });
    return this.getBaseSettingsById(params.agentId, params.kbId);
  }

  updateBaseSettings(params: {
    agentId: string;
    kbId: string;
    settings: Partial<KnowledgeBaseRuntimeSettings>;
  }): KnowledgeBaseRuntimeSettings {
    this.resolveBaseIdForAgent({ agentId: params.agentId, kbId: params.kbId });
    this.upsertBaseSettings({
      agentId: params.agentId,
      kbId: params.kbId,
      settings: params.settings,
    });
    return this.getBaseSettingsById(params.agentId, params.kbId);
  }

  listTags(agentId: string): KnowledgeBaseTag[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, color
         FROM kb_tag_defs
         WHERE owner_agent_id = ?
         ORDER BY name COLLATE NOCASE ASC`,
      )
      .all(agentId) as Array<{ id: string; name: string; color?: string | null }>;
    return rows.map((row) => ({
      tagId: row.id,
      name: row.name,
      color: row.color ?? null,
    }));
  }

  createTag(params: { agentId: string; name: string; color?: string }): KnowledgeBaseTag {
    const normalizedName = params.name.trim();
    if (!normalizedName) {
      throw new Error("tag name is required");
    }
    const existing = this.getTagByName(params.agentId, normalizedName);
    if (existing) {
      throw new Error("tag already exists");
    }
    const now = Date.now();
    const tagId = hashText(`${params.agentId}:tag:${normalizedName}:${now}`);
    this.db
      .prepare(
        `INSERT INTO kb_tag_defs (id, owner_agent_id, name, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(tagId, params.agentId, normalizedName, normalizeTagColor(params.color), now, now);
    return {
      tagId,
      name: normalizedName,
      color: normalizeTagColor(params.color),
    };
  }

  updateTag(params: {
    agentId: string;
    tagId: string;
    name?: string;
    color?: string;
  }): KnowledgeBaseTag {
    const row = this.db
      .prepare(
        `SELECT id, name, color
         FROM kb_tag_defs
         WHERE id = ? AND owner_agent_id = ?`,
      )
      .get(params.tagId, params.agentId) as
      | { id: string; name: string; color?: string | null }
      | undefined;
    if (!row) {
      throw new Error("tag not found");
    }
    const nextName = params.name?.trim() || row.name;
    if (!nextName) {
      throw new Error("tag name is required");
    }
    const duplicate = this.getTagByName(params.agentId, nextName);
    if (duplicate && duplicate.id !== row.id) {
      throw new Error("tag already exists");
    }
    const nextColor =
      params.color === undefined ? (row.color ?? null) : normalizeTagColor(params.color);
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE kb_tag_defs
         SET name = ?, color = ?, updated_at = ?
         WHERE id = ? AND owner_agent_id = ?`,
      )
      .run(nextName, nextColor, now, params.tagId, params.agentId);
    return {
      tagId: params.tagId,
      name: nextName,
      color: nextColor,
    };
  }

  deleteTag(params: { agentId: string; tagId: string }): { success: boolean } {
    const exists = this.db
      .prepare(`SELECT id FROM kb_tag_defs WHERE id = ? AND owner_agent_id = ?`)
      .get(params.tagId, params.agentId) as { id: string } | undefined;
    if (!exists) {
      return { success: false };
    }
    this.db
      .prepare(`DELETE FROM kb_tag_defs WHERE id = ? AND owner_agent_id = ?`)
      .run(params.tagId, params.agentId);
    return { success: true };
  }

  bindTagsToBase(params: { agentId: string; kbId: string; tagIds: string[] }): KnowledgeBaseTag[] {
    this.resolveBaseIdForAgent({ agentId: params.agentId, kbId: params.kbId });
    const uniqueTagIds = Array.from(
      new Set(params.tagIds.map((item) => item.trim()).filter(Boolean)),
    );
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO kb_base_tags (kb_id, tag_id, owner_agent_id, created_at)
       VALUES (?, ?, ?, ?)`,
    );
    const now = Date.now();
    for (const tagId of uniqueTagIds) {
      this.assertTagOwnership(params.agentId, tagId);
      insert.run(params.kbId, tagId, params.agentId, now);
    }
    return this.getBaseTags(params.agentId, params.kbId);
  }

  unbindTagsFromBase(params: {
    agentId: string;
    kbId: string;
    tagIds: string[];
  }): KnowledgeBaseTag[] {
    this.resolveBaseIdForAgent({ agentId: params.agentId, kbId: params.kbId });
    const uniqueTagIds = Array.from(
      new Set(params.tagIds.map((item) => item.trim()).filter(Boolean)),
    );
    const del = this.db.prepare(
      `DELETE FROM kb_base_tags
       WHERE kb_id = ? AND owner_agent_id = ? AND tag_id = ?`,
    );
    for (const tagId of uniqueTagIds) {
      del.run(params.kbId, params.agentId, tagId);
    }
    return this.getBaseTags(params.agentId, params.kbId);
  }

  getSettings(agentId: string): KnowledgeSettings {
    const config = this.getConfig(agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${agentId}`);
    }
    const row = this.db
      .prepare(
        `SELECT owner_agent_id, vector_config, graph_config, updated_at
         FROM kb_settings WHERE owner_agent_id = ?`,
      )
      .get(agentId) as KnowledgeBaseSettings | undefined;
    const vectorOverrides = row?.vector_config
      ? (JSON.parse(row.vector_config) as Partial<KnowledgeVectorizationSettings>)
      : {};
    const graphOverrides = row?.graph_config
      ? (JSON.parse(row.graph_config) as Partial<KnowledgeGraphSettingsState>)
      : {};
    const vectorization: KnowledgeVectorizationSettings = {
      ...config.vectorization,
      ...vectorOverrides,
    };
    const graph: KnowledgeGraphSettingsState = {
      ...config.graph,
      ...graphOverrides,
      extractor: graphOverrides.extractor ?? "llm",
      minTriples: graphOverrides.minTriples ?? 3,
      maxTriples: graphOverrides.maxTriples ?? 50,
      triplesPerKTokens: graphOverrides.triplesPerKTokens ?? 10,
      maxDepth: graphOverrides.maxDepth ?? 3,
    };
    const search: KnowledgeSearchSettingsState = {
      includeInMemorySearch: config.search.includeInMemorySearch,
    };
    return {
      vectorization,
      graph,
      search,
      updatedAt: row?.updated_at,
    };
  }

  updateSettings(agentId: string, params: UpdateKnowledgeSettingsParams): KnowledgeSettings {
    const config = this.getConfig(agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${agentId}`);
    }
    const row = this.db
      .prepare(
        `SELECT owner_agent_id, vector_config, graph_config, search_config, updated_at
         FROM kb_settings WHERE owner_agent_id = ?`,
      )
      .get(agentId) as (KnowledgeBaseSettings & { search_config?: string }) | undefined;
    const vectorOverrides = row?.vector_config
      ? (JSON.parse(row.vector_config) as Partial<KnowledgeVectorizationSettings>)
      : {};
    const graphOverrides = row?.graph_config
      ? (JSON.parse(row.graph_config) as Partial<KnowledgeGraphSettingsState>)
      : {};
    const searchOverrides = row?.search_config
      ? (JSON.parse(row.search_config) as Partial<KnowledgeSearchSettingsState>)
      : {};
    const nextVector = { ...vectorOverrides, ...params.vectorization };
    const nextGraph = { ...graphOverrides, ...params.graph };
    const nextSearch = { ...searchOverrides, ...params.search };
    if (nextGraph.extractor && nextGraph.extractor !== "llm") {
      throw new Error("graph extractor is invalid, only 'llm' is supported");
    }
    const updatedAt = Date.now();
    this.db
      .prepare(
        `INSERT INTO kb_settings (owner_agent_id, vector_config, graph_config, search_config, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(owner_agent_id) DO UPDATE SET
           vector_config=excluded.vector_config,
           graph_config=excluded.graph_config,
           search_config=excluded.search_config,
           updated_at=excluded.updated_at`,
      )
      .run(
        agentId,
        Object.keys(nextVector).length ? JSON.stringify(nextVector) : null,
        Object.keys(nextGraph).length ? JSON.stringify(nextGraph) : null,
        Object.keys(nextSearch).length ? JSON.stringify(nextSearch) : null,
        updatedAt,
      );
    return this.getSettings(agentId);
  }

  /**
   * Upload and index a knowledge document
   */
  async uploadDocument(
    params: UploadKnowledgeDocumentParams,
  ): Promise<UploadKnowledgeDocumentResult> {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }
    const kbId = this.resolveBaseIdForAgent({
      agentId: params.agentId,
      kbId: params.kbId,
    });

    // Validate file size
    if (params.buffer.byteLength > config.storage.maxFileSize) {
      throw new Error(
        `File too large: ${params.buffer.byteLength} bytes (limit: ${config.storage.maxFileSize} bytes)`,
      );
    }

    // Check document count limit
    const currentCount = this.storage.getDocumentCount({ agentId: params.agentId });
    if (currentCount >= config.storage.maxDocuments) {
      throw new Error(
        `Document limit reached: ${currentCount}/${config.storage.maxDocuments} documents`,
      );
    }

    // Validate MIME type
    const processor = this.processorRegistry.getProcessor(params.mimetype);
    const isPreviewOnly = !processor && isPreviewOnlyMimeType(params.mimetype);
    if (!processor && !isPreviewOnly) {
      throw new Error(`Unsupported document type: ${params.mimetype}`);
    }
    if (
      processor &&
      ((params.mimetype === "application/pdf" && !config.formats.pdf.enabled) ||
        (params.mimetype ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
          !config.formats.docx.enabled) ||
        (params.mimetype === "application/msword" && !config.formats.docx.enabled) ||
        (params.mimetype === "text/plain" && !config.formats.txt.enabled) ||
        (params.mimetype === "text/markdown" && !config.formats.txt.enabled) ||
        (params.mimetype === "text/html" && !config.formats.html.enabled))
    ) {
      throw new Error(`Document type disabled by configuration: ${params.mimetype}`);
    }

    // Store document
    const storeResult = await this.storage.storeDocument({
      kbId,
      filename: params.filename,
      buffer: params.buffer,
      mimetype: params.mimetype,
      sourceType: params.sourceType,
      sourceMetadata: params.sourceMetadata,
      ownerAgentId: params.agentId,
      description: params.description,
      tags: params.tags,
    });

    log.info(
      `knowledge: stored document ${params.filename} (${storeResult.documentId}) for agent ${params.agentId}`,
    );

    // Preview-first uploads only need persistent document ID/path.
    // Skip extraction/index/graph to avoid blocking interactive flows.
    const processingMode = params.processingMode ?? "full";
    if (processingMode === "store_only") {
      return {
        documentId: storeResult.documentId,
        indexed: false,
      };
    }

    // Extract text from document (if supported)
    let extractedText = "";
    if (processor) {
      try {
        const processorOptions: ProcessorOptions = {};
        if (params.mimetype === "application/pdf" && config.formats.pdf.maxPages) {
          processorOptions.maxPages = config.formats.pdf.maxPages;
        }

        extractedText = await processor.extract(params.buffer, processorOptions);
      } catch (err) {
        log.warn(`knowledge: failed to extract text from ${params.filename}: ${String(err)}`);
        throw new Error(`Failed to extract text from document: ${String(err)}`, {
          cause: err,
        });
      }

      if (!extractedText || extractedText.trim().length === 0) {
        log.warn(`knowledge: no text extracted from ${params.filename}`);
        throw new Error("No text content could be extracted from the document");
      }
    }

    // Index document if auto-indexing is enabled
    let indexed = false;
    const settings = this.getSettings(params.agentId);
    const baseSettings = this.getBaseSettingsById(params.agentId, kbId);
    if (config.search.autoIndex && extractedText) {
      if (
        config.search.includeInMemorySearch &&
        settings.vectorization.enabled &&
        baseSettings.vectorization.enabled
      ) {
        try {
          const memoryManager = await MemoryIndexManager.get({
            cfg: this.cfg,
            agentId: params.agentId,
            overrides: {
              provider: settings.vectorization.provider,
              model: settings.vectorization.model,
            },
          });

          if (memoryManager) {
            await memoryManager.ingestKnowledgeDocument({
              documentId: storeResult.documentId,
              filename: params.filename,
              content: extractedText,
            });
            indexed = true;
          } else {
            log.warn(
              `knowledge: memory index unavailable for agent ${params.agentId}, skipping indexing`,
            );
          }
        } catch (err) {
          log.warn(
            `knowledge: failed to index document ${storeResult.documentId} for agent ${params.agentId}: ${String(
              err,
            )}`,
          );
        }
      }
      if (indexed) {
        this.storage.updateIndexedAt(storeResult.documentId);
      }
    }

    if (baseSettings.graph.enabled && extractedText) {
      try {
        await this.extractGraphForDocument({
          agentId: params.agentId,
          documentId: storeResult.documentId,
          content: extractedText,
          settings: settings.graph,
          kbId,
        });
      } catch (err) {
        log.warn(
          `knowledge: graph extraction failed for ${storeResult.documentId}: ${String(err)}`,
        );
      }
    }

    return {
      documentId: storeResult.documentId,
      indexed,
    };
  }

  /**
   * Update (overwrite) a knowledge document while preserving its documentId
   */
  async updateDocument(
    params: UpdateKnowledgeDocumentParams,
  ): Promise<UpdateKnowledgeDocumentResult> {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }
    const kbId = this.resolveBaseIdForAgent({
      agentId: params.agentId,
      kbId: params.kbId,
    });

    const doc = this.storage.getDocument(params.documentId);
    if (!doc) {
      throw new Error(`Document not found: ${params.documentId}`);
    }
    if (doc.owner_agent_id !== params.agentId) {
      throw new Error("Document does not belong to this agent");
    }
    if (doc.kb_id && doc.kb_id !== kbId) {
      throw new Error("Document does not belong to this knowledge base");
    }

    if (params.buffer.byteLength > config.storage.maxFileSize) {
      throw new Error(
        `File too large: ${params.buffer.byteLength} bytes (limit: ${config.storage.maxFileSize} bytes)`,
      );
    }

    const processor = this.processorRegistry.getProcessor(params.mimetype);
    const isPreviewOnly = !processor && isPreviewOnlyMimeType(params.mimetype);
    if (!processor && !isPreviewOnly) {
      throw new Error(`Unsupported document type: ${params.mimetype}`);
    }
    if (
      processor &&
      ((params.mimetype === "application/pdf" && !config.formats.pdf.enabled) ||
        (params.mimetype ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
          !config.formats.docx.enabled) ||
        (params.mimetype === "application/msword" && !config.formats.docx.enabled) ||
        (params.mimetype === "text/plain" && !config.formats.txt.enabled) ||
        (params.mimetype === "text/markdown" && !config.formats.txt.enabled) ||
        (params.mimetype === "text/html" && !config.formats.html.enabled))
    ) {
      throw new Error(`Document type disabled by configuration: ${params.mimetype}`);
    }

    const storeResult = await this.storage.updateDocument({
      kbId,
      documentId: params.documentId,
      filename: params.filename,
      buffer: params.buffer,
      mimetype: params.mimetype,
      sourceType: params.sourceType,
      sourceMetadata: params.sourceMetadata,
      ownerAgentId: params.agentId,
      description: params.description,
      tags: params.tags,
    });

    log.info(
      `knowledge: updated document ${params.filename} (${params.documentId}) for agent ${params.agentId}`,
    );

    let extractedText = "";
    if (processor) {
      try {
        const processorOptions: ProcessorOptions = {};
        if (params.mimetype === "application/pdf" && config.formats.pdf.maxPages) {
          processorOptions.maxPages = config.formats.pdf.maxPages;
        }
        extractedText = await processor.extract(params.buffer, processorOptions);
      } catch (err) {
        log.warn(`knowledge: failed to extract text from ${params.filename}: ${String(err)}`);
        throw new Error(`Failed to extract text from document: ${String(err)}`, {
          cause: err,
        });
      }

      if (!extractedText || extractedText.trim().length === 0) {
        log.warn(`knowledge: no text extracted from ${params.filename}`);
        throw new Error("No text content could be extracted from the document");
      }
    }

    if (config.search.includeInMemorySearch) {
      try {
        const memoryManager = await MemoryIndexManager.get({
          cfg: this.cfg,
          agentId: params.agentId,
          overrides: {
            provider: this.getSettings(params.agentId).vectorization.provider,
            model: this.getSettings(params.agentId).vectorization.model,
          },
        });
        if (memoryManager && typeof memoryManager.deleteKnowledgeDocument === "function") {
          void memoryManager.deleteKnowledgeDocument({ documentId: params.documentId });
        }
      } catch (err) {
        log.warn(
          `knowledge: failed to remove document from index for agent ${params.agentId}: ${String(err)}`,
        );
      }
    }

    this.deleteGraphEntries({ agentId: params.agentId, documentId: params.documentId, kbId });

    let indexed = false;
    const settings = this.getSettings(params.agentId);
    const baseSettings = this.getBaseSettingsById(params.agentId, kbId);
    if (config.search.autoIndex && extractedText) {
      if (
        config.search.includeInMemorySearch &&
        settings.vectorization.enabled &&
        baseSettings.vectorization.enabled
      ) {
        try {
          const memoryManager = await MemoryIndexManager.get({
            cfg: this.cfg,
            agentId: params.agentId,
            overrides: {
              provider: settings.vectorization.provider,
              model: settings.vectorization.model,
            },
          });

          if (memoryManager) {
            await memoryManager.ingestKnowledgeDocument({
              documentId: params.documentId,
              filename: params.filename,
              content: extractedText,
            });
            indexed = true;
          } else {
            log.warn(
              `knowledge: memory index unavailable for agent ${params.agentId}, skipping indexing`,
            );
          }
        } catch (err) {
          log.warn(
            `knowledge: failed to index document ${params.documentId} for agent ${params.agentId}: ${String(
              err,
            )}`,
          );
        }
      }
      if (indexed) {
        this.storage.updateIndexedAt(params.documentId);
      }
    }

    if (baseSettings.graph.enabled && extractedText) {
      try {
        await this.extractGraphForDocument({
          agentId: params.agentId,
          documentId: params.documentId,
          content: extractedText,
          settings: settings.graph,
          kbId,
        });
      } catch (err) {
        log.warn(`knowledge: graph extraction failed for ${params.documentId}: ${String(err)}`);
      }
    }

    return {
      documentId: params.documentId,
      filename: params.filename,
      size: storeResult.size,
      indexed,
      updatedAt: new Date(storeResult.updatedAt).toISOString(),
    };
  }

  async updateDocumentMetadata(
    params: UpdateKnowledgeDocumentMetadataParams,
  ): Promise<KnowledgeDocumentWithTags> {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }
    const kbId = this.resolveBaseIdForAgent({
      agentId: params.agentId,
      kbId: params.kbId,
    });

    const doc = this.storage.getDocument(params.documentId);
    if (!doc) {
      throw new Error(`Document not found: ${params.documentId}`);
    }
    if (doc.owner_agent_id !== params.agentId) {
      throw new Error("Document does not belong to this agent");
    }
    if (doc.kb_id && doc.kb_id !== kbId) {
      throw new Error("Document does not belong to this knowledge base");
    }

    let nextFilepath: string | undefined;
    let nextSourceMetadata: Record<string, unknown> | null | undefined;
    const requestedFilename = params.filename?.trim();

    if (doc.source_type === "local_fs" && requestedFilename && requestedFilename !== doc.filename) {
      const sourcePath = normalizeTreePath(extractSourcePath(doc.source_metadata) ?? doc.filepath);
      const renamedPath = await this.renameLocalFileSource({
        currentPath: sourcePath,
        filename: requestedFilename,
      });
      nextFilepath = renamedPath;
      nextSourceMetadata = {
        ...parseSourceMetadataRecord(doc.source_metadata),
        sourcePath: renamedPath,
      };
    }

    this.storage.updateDocumentMetadata({
      documentId: params.documentId,
      filename: params.filename,
      description: params.description,
      tags: params.tags,
      filepath: nextFilepath,
      sourceMetadata: nextSourceMetadata,
    });

    const updated = this.storage.getDocument(params.documentId);
    if (!updated) {
      throw new Error(`Document not found after update: ${params.documentId}`);
    }

    return {
      ...updated,
      tags: this.storage.getDocumentTags(updated.id),
    };
  }

  /**
   * Update document content
   */
  async updateDocumentContent(params: {
    documentId: string;
    agentId: string;
    kbId?: string;
    content: string;
  }): Promise<{ success: boolean; updatedAt: string }> {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }

    const kbId = this.resolveBaseIdForAgent({
      agentId: params.agentId,
      kbId: params.kbId,
    });

    const doc = this.storage.getDocument(params.documentId);
    if (!doc) {
      throw new Error(`Document not found: ${params.documentId}`);
    }
    if (doc.owner_agent_id !== params.agentId) {
      throw new Error("Document does not belong to this agent");
    }
    if (doc.kb_id && doc.kb_id !== kbId) {
      throw new Error("Document does not belong to this knowledge base");
    }

    // Get the file path and write content
    const resolved = this.resolveDocumentPath({
      agentId: params.agentId,
      documentId: params.documentId,
      kbId: params.kbId,
    });

    const fsPromises = await import("fs/promises");
    await fsPromises.writeFile(resolved.absPath, params.content, "utf-8");

    return { success: true, updatedAt: new Date().toISOString() };
  }

  /**
   * Delete a knowledge document
   */
  async deleteDocument(params: {
    documentId: string;
    agentId: string;
    kbId?: string;
  }): Promise<DeleteKnowledgeDocumentResult> {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }

    const doc = this.storage.getDocument(params.documentId);
    if (!doc) {
      return { success: false };
    }

    // Verify ownership against shared storage agent
    if (doc.owner_agent_id !== params.agentId) {
      throw new Error("Document does not belong to this agent");
    }
    if (params.kbId && doc.kb_id && params.kbId !== doc.kb_id) {
      throw new Error("Document does not belong to this knowledge base");
    }

    // Remove from index
    if (config.search.includeInMemorySearch) {
      try {
        const memoryManager = await MemoryIndexManager.get({
          cfg: this.cfg,
          agentId: params.agentId,
          overrides: {
            provider: this.getSettings(params.agentId).vectorization.provider,
            model: this.getSettings(params.agentId).vectorization.model,
          },
        });

        if (memoryManager && typeof memoryManager.deleteKnowledgeDocument === "function") {
          void memoryManager.deleteKnowledgeDocument({ documentId: params.documentId });
        }
      } catch (err) {
        log.warn(
          `knowledge: failed to remove document from index for agent ${params.agentId}: ${String(err)}`,
        );
        // Continue with deletion even if index removal fails
      }
    }

    // Delete from storage
    await this.storage.deleteDocument(params.documentId);
    this.deleteGraphEntries({
      agentId: params.agentId,
      documentId: params.documentId,
      kbId: doc.kb_id ?? params.kbId ?? undefined,
    });

    log.info(`knowledge: deleted document ${params.documentId} for agent ${params.agentId}`);

    return { success: true };
  }

  /**
   * List knowledge documents for an agent
   */
  listDocuments(params: ListKnowledgeDocumentsParams): KnowledgeDocumentWithTags[] {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }
    if (params.kbId) {
      this.resolveBaseIdForAgent({ agentId: params.agentId, kbId: params.kbId });
    }

    const documents = this.storage.listDocuments({
      agentId: params.agentId,
      kbId: params.kbId,
      tags: params.tags,
      limit: params.limit,
      offset: params.offset,
    });

    return documents.map((doc) => ({
      ...doc,
      tags: this.storage.getDocumentTags(doc.id),
    }));
  }

  getGraphRun(params: {
    agentId: string;
    documentId: string;
    kbId?: string;
  }): KnowledgeGraphRun | null {
    const kbId = this.resolveDocumentKbId({
      agentId: params.agentId,
      documentId: params.documentId,
      kbId: params.kbId,
    });
    const row = this.db
      .prepare(
        `SELECT id, kb_id, document_id, status, triples_path, extractor, model, error,
                created_at, updated_at
         FROM knowledge_graph_runs WHERE kb_id = ? AND document_id = ?`,
      )
      .get(kbId, params.documentId) as KnowledgeGraphRun | undefined;
    return row ?? null;
  }

  getGraphStats(params: { agentId: string; kbId?: string }): {
    totalTriples: number;
    totalEntities: number;
  } {
    const kbId = this.resolveBaseIdForAgent({
      agentId: params.agentId,
      kbId: params.kbId,
    });
    const triplesRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM knowledge_graph_triples WHERE kb_id = ?`)
      .get(kbId) as { count: number };
    const entitiesRow = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM (
           SELECT h as name FROM knowledge_graph_triples WHERE kb_id = ?
           UNION
           SELECT t as name FROM knowledge_graph_triples WHERE kb_id = ?
         )`,
      )
      .get(kbId, kbId) as { count: number };
    return {
      totalTriples: triplesRow?.count ?? 0,
      totalEntities: entitiesRow?.count ?? 0,
    };
  }

  queryGraphSubgraph(params: {
    agentId: string;
    keyword: string;
    kbId?: string;
    documentIds?: string[];
    relation?: string;
    entityPrefix?: string;
    createdAfter?: number;
    createdBefore?: number;
    minDegree?: number;
    maxDepth?: number;
    maxTriples?: number;
  }): {
    nodes: Array<{ id: string; name: string }>;
    edges: Array<{ id: string; source: string; target: string; type: string; score?: number }>;
  } {
    const kbId = this.resolveGraphKbId({
      agentId: params.agentId,
      kbId: params.kbId,
      documentIds: params.documentIds,
    });
    const keyword = params.keyword.trim();
    if (!keyword && !(params.documentIds?.length || params.relation || params.entityPrefix)) {
      return { nodes: [], edges: [] };
    }
    const maxDepth = Math.max(1, params.maxDepth ?? 2);
    const maxTriples = Math.max(10, params.maxTriples ?? 200);
    const filter = buildGraphFilter({
      kbId,
      keyword,
      documentIds: params.documentIds,
      relation: params.relation,
      entityPrefix: params.entityPrefix,
      createdAfter: params.createdAfter,
      createdBefore: params.createdBefore,
    });
    const seedTriples = this.fetchSeedTriples({
      filter,
      keyword,
      limit: maxTriples,
    });
    const triples: Array<{ h: string; r: string; t: string; score?: number }> = [...seedTriples];
    let frontier = new Set<string>();
    for (const triple of seedTriples) {
      frontier.add(triple.h);
      frontier.add(triple.t);
    }
    for (let depth = 1; depth < maxDepth; depth++) {
      if (frontier.size === 0 || triples.length >= maxTriples) {
        break;
      }
      const entities = Array.from(frontier);
      frontier = new Set<string>();
      const placeholders = entities.map(() => "?").join(", ");
      const rows = this.db
        .prepare(
          `SELECT h, r, t FROM knowledge_graph_triples
         WHERE kb_id = ? AND (h IN (${placeholders}) OR t IN (${placeholders}))
         ${filter.extraSqlTriples}
         LIMIT ?`,
        )
        .all(kbId, ...entities, ...entities, ...filter.extraParams, maxTriples) as Array<{
        h: string;
        r: string;
        t: string;
      }>;
      for (const row of rows) {
        if (triples.length >= maxTriples) {
          break;
        }
        triples.push(row);
        frontier.add(row.h);
        frontier.add(row.t);
      }
    }
    const minDegree = Math.max(0, params.minDegree ?? 0);
    const degreeMap = new Map<string, number>();
    for (const triple of triples) {
      degreeMap.set(triple.h, (degreeMap.get(triple.h) ?? 0) + 1);
      degreeMap.set(triple.t, (degreeMap.get(triple.t) ?? 0) + 1);
    }
    const nodesMap = new Map<string, { id: string; name: string }>();
    const edges: Array<{
      id: string;
      source: string;
      target: string;
      type: string;
      score?: number;
    }> = [];
    for (const triple of triples) {
      if ((degreeMap.get(triple.h) ?? 0) < minDegree) {
        continue;
      }
      if ((degreeMap.get(triple.t) ?? 0) < minDegree) {
        continue;
      }
      const hId = hashText(triple.h);
      const tId = hashText(triple.t);
      nodesMap.set(triple.h, { id: hId, name: triple.h });
      nodesMap.set(triple.t, { id: tId, name: triple.t });
      edges.push({
        id: hashText(`${triple.h}::${triple.r}::${triple.t}`),
        source: hId,
        target: tId,
        type: triple.r,
        score: triple.score,
      });
    }
    return { nodes: Array.from(nodesMap.values()), edges };
  }

  private async extractGraphForDocument(params: {
    agentId: string;
    documentId: string;
    content: string;
    settings: KnowledgeGraphSettingsState;
    kbId: string;
  }): Promise<number> {
    const kbId = params.kbId;
    const runId = hashText(`${kbId}:${params.documentId}`);
    const now = Date.now();
    this.deleteGraphEntries({
      agentId: params.agentId,
      documentId: params.documentId,
      kbId,
    });
    this.db
      .prepare(
        `INSERT INTO knowledge_graph_runs
         (id, kb_id, document_id, status, extractor, model, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status=excluded.status,
           updated_at=excluded.updated_at`,
      )
      .run(
        runId,
        kbId,
        params.documentId,
        "running",
        params.settings.extractor ?? "llm",
        params.settings.model ?? null,
        now,
        now,
      );
    try {
      log.info(`knowledge: extractGraphForDocument content length: ${params.content.length}`);
      const extractResult = await extractTriplesViaLlm({
        text: params.content,
        settings: params.settings as KnowledgeGraphSettings,
        cfg: this.cfg,
        agentId: params.agentId,
        workspaceDir: this.baseDir,
        agentDir: resolveAgentDir(this.cfg, params.agentId),
      });
      log.info(
        `knowledge: extractGraphForDocument got ${extractResult.triples.length} triples, rawText length: ${extractResult.rawText.length}`,
      );
      const triples = extractResult.triples
        .map((triple) => normalizeTripleOrNull(triple))
        .filter((triple): triple is KnowledgeGraphTripleInput => Boolean(triple));
      const triplesPath = path.join(
        this.baseDir,
        "knowledge",
        "graphs",
        kbId,
        "triples",
        `${params.documentId}.jsonl`,
      );
      await writeTriplesJsonl({ filePath: triplesPath, triples });
      if (triples.length === 0) {
        this.db
          .prepare(
            `UPDATE knowledge_graph_runs
             SET status = ?, error = ?, triples_path = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run("failed", "No graph triples extracted", triplesPath, Date.now(), runId);
        return 0;
      }
      const insertTriple = this.db.prepare(
        `INSERT INTO knowledge_graph_triples (id, kb_id, document_id, h, r, t, props_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertFts = this.buildGraphFtsInsert();

      // Prepare kg_entities and kg_relations inserts
      const insertEntity = this.db.prepare(
        `INSERT OR IGNORE INTO kg_entities (id, kb_id, document_id, name, type, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertRelation = this.db.prepare(
        `INSERT INTO kg_relations (id, kb_id, document_id, source_entity_id, target_entity_id, keywords, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );

      // Track entities we've seen to avoid duplicates
      const entityIds = new Set<string>();
      const now = Date.now();

      for (const triple of triples) {
        const h = typeof triple.h === "string" ? triple.h : triple.h.name;
        const t = typeof triple.t === "string" ? triple.t : triple.t.name;
        const r = typeof triple.r === "string" ? triple.r : triple.r.type;
        const props = JSON.stringify({
          h: typeof triple.h === "string" ? undefined : triple.h,
          r: typeof triple.r === "string" ? undefined : triple.r,
          t: typeof triple.t === "string" ? undefined : triple.t,
        });
        const tripleId = hashTripleKey(triple);
        insertTriple.run(tripleId, kbId, params.documentId, h, r, t, props, now);
        if (insertFts) {
          insertFts.run([h, r, t].join(" "), tripleId, kbId, params.documentId, h, r, t);
        }

        // Insert entities into kg_entities
        const hId = `entity:${kbId}:${h}`;
        if (!entityIds.has(hId)) {
          entityIds.add(hId);
          const hDesc =
            typeof triple.h === "string"
              ? undefined
              : typeof triple.h.description === "string"
                ? triple.h.description
                : (JSON.stringify(triple.h.description) ?? undefined);
          insertEntity.run({
            id: hId,
            kb_id: kbId,
            document_id: params.documentId,
            name: h,
            type: "实体",
            description: hDesc || null,
            created_at: now,
            updated_at: now,
          });
        }
        const tId = `entity:${kbId}:${t}`;
        if (!entityIds.has(tId)) {
          entityIds.add(tId);
          const tDesc =
            typeof triple.t === "string"
              ? undefined
              : typeof triple.t.description === "string"
                ? triple.t.description
                : (JSON.stringify(triple.t.description) ?? undefined);
          insertEntity.run({
            id: tId,
            kb_id: kbId,
            document_id: params.documentId,
            name: t,
            type: "实体",
            description: tDesc || null,
            created_at: now,
            updated_at: now,
          });
        }

        // Insert relation into kg_relations
        const relId = `rel:${tripleId}`;
        insertRelation.run(relId, kbId, params.documentId, hId, tId, r, now);
      }
      this.db
        .prepare(
          `UPDATE knowledge_graph_runs
           SET status = ?, triples_path = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run("success", triplesPath, Date.now(), runId);
      return triples.length;
    } catch (err) {
      this.db
        .prepare(
          `UPDATE knowledge_graph_runs
           SET status = ?, error = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run("failed", String(err), Date.now(), runId);
      throw err;
    }
  }

  private deleteGraphEntries(params: { agentId: string; documentId: string; kbId?: string }): void {
    const kbId =
      params.kbId ??
      this.resolveDocumentKbId({
        agentId: params.agentId,
        documentId: params.documentId,
        kbId: params.kbId,
      });

    // Delete legacy graph data
    this.db
      .prepare(`DELETE FROM knowledge_graph_triples WHERE kb_id = ? AND document_id = ?`)
      .run(kbId, params.documentId);
    this.db
      .prepare(`DELETE FROM knowledge_graph_runs WHERE kb_id = ? AND document_id = ?`)
      .run(kbId, params.documentId);
    if (this.hasGraphFts()) {
      this.db
        .prepare(`DELETE FROM knowledge_graph_fts WHERE kb_id = ? AND document_id = ?`)
        .run(kbId, params.documentId);
    }

    // Delete enhanced graph data (kg_entities, kg_relations, etc.)
    this.db
      .prepare(`DELETE FROM kg_relations WHERE kb_id = ? AND document_id = ?`)
      .run(kbId, params.documentId);
    this.db
      .prepare(`DELETE FROM kg_entity_descriptions WHERE kb_id = ? AND document_id = ?`)
      .run(kbId, params.documentId);
    this.db
      .prepare(`DELETE FROM kg_entities WHERE kb_id = ? AND document_id = ?`)
      .run(kbId, params.documentId);
    this.db
      .prepare(`DELETE FROM kg_build_tasks WHERE kb_id = ? AND document_id = ?`)
      .run(kbId, params.documentId);
  }

  private hasGraphFts(): boolean {
    const row = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE name = 'knowledge_graph_fts'`)
      .get() as { name?: string } | undefined;
    return Boolean(row?.name);
  }

  private buildGraphFtsInsert() {
    if (!this.hasGraphFts()) {
      return null;
    }
    return this.db.prepare(
      `INSERT INTO knowledge_graph_fts (content, triple_id, kb_id, document_id, h, r, t)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
  }

  private fetchSeedTriples(params: {
    filter: GraphFilter;
    keyword: string;
    limit: number;
  }): Array<{ h: string; r: string; t: string; score?: number }> {
    const { filter, keyword, limit } = params;
    if (keyword && this.hasGraphFts()) {
      const rows = this.db
        .prepare(
          `SELECT t.h as h, t.r as r, t.t as t, bm25(knowledge_graph_fts) as rank
           FROM knowledge_graph_fts f
           JOIN knowledge_graph_triples t ON t.id = f.triple_id
           WHERE f.kb_id = ? AND knowledge_graph_fts MATCH ? ${filter.docFilterSql}
           ${filter.extraSqlJoin}
           ORDER BY rank ASC
           LIMIT ?`,
        )
        .all(
          filter.kbId,
          keyword,
          ...filter.docFilterParams,
          ...filter.extraParams,
          limit,
        ) as Array<{ h: string; r: string; t: string; rank: number }>;
      return rows.map((row) => ({
        h: row.h,
        r: row.r,
        t: row.t,
        score: 1 / (1 + Math.max(0, row.rank)),
      }));
    }
    const like = `%${keyword}%`;
    const rows = this.db
      .prepare(
        `SELECT h, r, t FROM knowledge_graph_triples
         WHERE kb_id = ? AND (h LIKE ? OR t LIKE ? OR r LIKE ?)
         ${filter.extraSqlTriples}
         LIMIT ?`,
      )
      .all(filter.kbId, like, like, like, ...filter.extraParams, limit) as Array<{
      h: string;
      r: string;
      t: string;
    }>;
    return rows.map((row) => ({
      h: row.h,
      r: row.r,
      t: row.t,
      score: scoreTextMatch({ h: row.h, r: row.r, t: row.t }, keyword),
    }));
  }

  async listChunks(params: {
    agentId: string;
    documentId: string;
    kbId?: string;
    limit?: number;
    offset?: number;
  }) {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }
    this.ensureChunksSchema();
    const doc = this.storage.getDocument(params.documentId);
    if (!doc) {
      throw new Error(`Document not found: ${params.documentId}`);
    }
    if (doc.owner_agent_id !== params.agentId) {
      throw new Error("Document does not belong to this agent");
    }
    if (params.kbId && doc.kb_id && params.kbId !== doc.kb_id) {
      throw new Error("Document does not belong to this knowledge base");
    }
    const limit = Math.max(1, params.limit ?? 50);
    const offset = Math.max(0, params.offset ?? 0);
    const pathKey = `knowledge/${params.documentId}`;

    // Get chunks from MemoryIndexManager's database (where chunks are actually stored)
    let memoryDb;
    try {
      const memoryManager = await MemoryIndexManager.get({
        cfg: this.cfg,
        agentId: params.agentId,
      });
      if (memoryManager) {
        memoryDb = (
          memoryManager as unknown as {
            db: {
              prepare: (sql: string) => {
                get: (path: string) => { count: number };
                all: (
                  path: string,
                  limit: number,
                  offset: number,
                ) => Array<{ id: string; text: string; start_line: number; end_line: number }>;
              };
            };
          }
        ).db;
      }
    } catch (err) {
      log.warn(`listChunks: failed to get memory manager: ${String(err)}`);
    }

    // Try to get from memory database first
    let total = 0;
    let rows: Array<{ id: string; text: string; start_line: number; end_line: number }> = [];

    if (memoryDb) {
      try {
        const totalRow = memoryDb
          .prepare(`SELECT COUNT(*) as count FROM chunks WHERE path = ? AND source = 'knowledge'`)
          .get(pathKey) as { count: number } | undefined;
        total = totalRow?.count ?? 0;
        rows = memoryDb
          .prepare(
            `SELECT id, text, start_line, end_line
             FROM chunks
             WHERE path = ? AND source = 'knowledge'
             ORDER BY start_line ASC
             LIMIT ? OFFSET ?`,
          )
          .all(pathKey, limit, offset) as typeof rows;
      } catch (err) {
        log.warn(`listChunks: failed to read from memory db: ${String(err)}`);
      }
    }

    // Fallback to local db if memory db not available
    if (!memoryDb || rows.length === 0) {
      const totalRow = this.db
        .prepare(`SELECT COUNT(*) as count FROM chunks WHERE path = ? AND source = 'knowledge'`)
        .get(pathKey) as { count: number };
      total = totalRow?.count ?? 0;
      rows = this.db
        .prepare(
          `SELECT id, text, start_line, end_line
           FROM chunks
           WHERE path = ? AND source = 'knowledge'
           ORDER BY start_line ASC
           LIMIT ? OFFSET ?`,
        )
        .all(pathKey, limit, offset) as typeof rows;
    }

    const chunks = rows.map((row, idx) => ({
      id: row.id,
      index: offset + idx + 1,
      text: row.text,
      tokens: estimateTokens(row.text),
      sourcePage: null,
      status: "enabled" as const,
    }));
    return {
      total,
      returned: chunks.length,
      offset,
      chunks,
    };
  }

  getChunk(params: {
    agentId: string;
    chunkId: string;
    kbId?: string;
  }): KnowledgeChunkDetail | null {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }
    this.ensureChunksSchema();
    const row = this.db
      .prepare(
        `SELECT id, path, text, start_line, end_line
         FROM chunks
         WHERE id = ? AND source = 'knowledge'`,
      )
      .get(params.chunkId) as
      | { id: string; path: string; text: string; start_line: number; end_line: number }
      | undefined;
    if (!row) {
      return null;
    }
    const documentId = row.path.replace(/^knowledge\//, "");
    const doc = this.storage.getDocument(documentId);
    if (!doc) {
      return null;
    }
    if (doc.owner_agent_id !== params.agentId) {
      throw new Error("Document does not belong to this agent");
    }
    if (params.kbId && doc.kb_id && params.kbId !== doc.kb_id) {
      throw new Error("Document does not belong to this knowledge base");
    }
    const indexRow = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM chunks
         WHERE path = ? AND source = 'knowledge' AND start_line <= ?`,
      )
      .get(row.path, row.start_line) as { count: number };
    return {
      id: row.id,
      documentId,
      index: indexRow?.count ?? 0,
      text: row.text,
      tokens: estimateTokens(row.text),
      sourcePage: null,
      status: "enabled",
      startLine: row.start_line,
      endLine: row.end_line,
    };
  }

  /**
   * Get a single document with tags
   */
  getDocument(params: {
    documentId: string;
    agentId: string;
    kbId?: string;
  }): KnowledgeDocumentWithTags | null {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }

    const doc = this.storage.getDocument(params.documentId);
    if (!doc) {
      return null;
    }

    // Verify ownership against shared storage agent
    if (doc.owner_agent_id !== params.agentId) {
      throw new Error("Document does not belong to this agent");
    }
    if (params.kbId && doc.kb_id && params.kbId !== doc.kb_id) {
      throw new Error("Document does not belong to this knowledge base");
    }

    return {
      ...doc,
      tags: this.storage.getDocumentTags(doc.id),
    };
  }

  /**
   * Get document count for an agent
   */
  getDocumentCount(params: { agentId: string; kbId?: string }): number {
    const config = this.getConfig(params.agentId);
    if (!config) {
      return 0;
    }

    return this.storage.getDocumentCount({ agentId: params.agentId, kbId: params.kbId });
  }

  updateSourceConfig(params: {
    agentId: string;
    kbId: string;
    sourceType: KnowledgeSourceType;
    sourceConfig?: KnowledgeSourceConfig;
  }): KnowledgeBaseWithMeta {
    this.resolveBaseIdForAgent({ agentId: params.agentId, kbId: params.kbId });
    this.db
      .prepare(
        `UPDATE kb_bases
         SET source_type = ?, source_config = ?, source_status = ?, updated_at = ?
         WHERE owner_agent_id = ? AND id = ?`,
      )
      .run(
        params.sourceType,
        params.sourceConfig ? JSON.stringify(params.sourceConfig) : null,
        "connected",
        Date.now(),
        params.agentId,
        params.kbId,
      );
    return this.getBaseWithMetaById(params.agentId, params.kbId) as KnowledgeBaseWithMeta;
  }

  async testSource(params: {
    agentId: string;
    kbId: string;
  }): Promise<{ success: boolean; message: string }> {
    const base = this.getBaseById(params.agentId, params.kbId);
    if (!base) {
      throw new Error("Knowledge base not found");
    }
    const sourceType = base.source_type ?? "external";
    if (sourceType === "local_fs") {
      const roots = await this.listTreeRoots(params);
      if (roots.length === 0) {
        return { success: false, message: "未发现可访问的本机根目录" };
      }
      try {
        await fs.access(roots[0].path);
        return { success: true, message: "本地目录可访问" };
      } catch {
        return { success: false, message: "本地目录不可访问" };
      }
    }
    if (sourceType === "external") {
      return { success: true, message: "外部知识库无需连接测试" };
    }
    const parsedConfig = safeParseSourceConfig(base.source_config);
    if (
      !parsedConfig ||
      (!parsedConfig.endpoint && !parsedConfig.bucket && !parsedConfig.rootPath)
    ) {
      return { success: false, message: "缺少远程源配置" };
    }
    return {
      success: false,
      message: `${sourceType} 数据源连接测试暂未实现，请先完成目录树适配`,
    };
  }

  async syncSource(params: { agentId: string; kbId: string }): Promise<{
    success: boolean;
    startedAt: string;
    checkedDocuments?: number;
    removedDocuments?: number;
    message?: string;
  }> {
    this.resolveBaseIdForAgent({ agentId: params.agentId, kbId: params.kbId });
    const base = this.getBaseById(params.agentId, params.kbId);
    if (!base) {
      throw new Error("Knowledge base not found");
    }
    const startedAt = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE kb_bases
         SET source_status = ?, updated_at = ?
         WHERE owner_agent_id = ? AND id = ?`,
      )
      .run("syncing", Date.now(), params.agentId, params.kbId);
    const sourceType = base.source_type ?? "external";

    if (sourceType === "external") {
      this.db
        .prepare(
          `UPDATE kb_bases
           SET source_status = ?, updated_at = ?
           WHERE owner_agent_id = ? AND id = ?`,
        )
        .run("connected", Date.now(), params.agentId, params.kbId);
      return { success: true, startedAt, message: "外部知识库无需同步目录源" };
    }

    if (sourceType !== "local_fs") {
      this.db
        .prepare(
          `UPDATE kb_bases
           SET source_status = ?, updated_at = ?
           WHERE owner_agent_id = ? AND id = ?`,
        )
        .run("error", Date.now(), params.agentId, params.kbId);
      return {
        success: false,
        startedAt,
        message: `${sourceType} 数据源同步暂未实现，请先完成目录树适配`,
      };
    }

    const docs = this.db
      .prepare(
        `SELECT id, filepath, source_metadata
         FROM kb_documents
         WHERE owner_agent_id = ? AND kb_id = ? AND source_type = 'local_fs'`,
      )
      .all(params.agentId, params.kbId) as Array<{
      id: string;
      filepath: string;
      source_metadata?: string | null;
    }>;

    let removedDocuments = 0;
    for (const doc of docs) {
      const rawPath = extractSourcePath(doc.source_metadata ?? undefined) ?? doc.filepath;
      try {
        await fs.access(normalizeTreePath(rawPath));
      } catch {
        const removed = await this.deleteDocument({
          documentId: doc.id,
          agentId: params.agentId,
          kbId: params.kbId,
        });
        if (removed.success) {
          removedDocuments += 1;
        }
      }
    }

    this.db
      .prepare(
        `UPDATE kb_bases
         SET source_status = ?, updated_at = ?
         WHERE owner_agent_id = ? AND id = ?`,
      )
      .run("connected", Date.now(), params.agentId, params.kbId);

    return {
      success: true,
      startedAt,
      checkedDocuments: docs.length,
      removedDocuments,
      message:
        removedDocuments > 0
          ? `同步完成，已移除 ${removedDocuments} 个失效文件`
          : "同步完成，未发现失效文件",
    };
  }

  pauseSource(params: { agentId: string; kbId: string }): { success: boolean } {
    this.resolveBaseIdForAgent({ agentId: params.agentId, kbId: params.kbId });
    this.db
      .prepare(
        `UPDATE kb_bases
         SET source_status = ?, updated_at = ?
         WHERE owner_agent_id = ? AND id = ?`,
      )
      .run("paused", Date.now(), params.agentId, params.kbId);
    return { success: true };
  }

  resumeSource(params: { agentId: string; kbId: string }): { success: boolean } {
    this.resolveBaseIdForAgent({ agentId: params.agentId, kbId: params.kbId });
    this.db
      .prepare(
        `UPDATE kb_bases
         SET source_status = ?, updated_at = ?
         WHERE owner_agent_id = ? AND id = ?`,
      )
      .run("connected", Date.now(), params.agentId, params.kbId);
    return { success: true };
  }

  async deleteSource(params: {
    agentId: string;
    kbId: string;
  }): Promise<{ success: boolean; deletedDocuments: number }> {
    this.resolveBaseIdForAgent({ agentId: params.agentId, kbId: params.kbId });
    const base = this.getBaseById(params.agentId, params.kbId);
    if (!base) {
      throw new Error("Knowledge base not found");
    }
    const sourceType = base.source_type ?? "external";
    let deletedDocuments = 0;
    if (sourceType !== "external") {
      const docs = this.db
        .prepare(
          `SELECT id
           FROM kb_documents
           WHERE owner_agent_id = ? AND kb_id = ? AND source_type = ?`,
        )
        .all(params.agentId, params.kbId, sourceType) as Array<{ id: string }>;
      for (const doc of docs) {
        const result = await this.deleteDocument({
          documentId: doc.id,
          agentId: params.agentId,
          kbId: params.kbId,
        });
        if (result.success) {
          deletedDocuments += 1;
        }
      }
    }
    this.db
      .prepare(
        `UPDATE kb_bases
         SET source_config = ?, source_status = ?, updated_at = ?
         WHERE owner_agent_id = ? AND id = ?`,
      )
      .run(null, "paused", Date.now(), params.agentId, params.kbId);
    return { success: true, deletedDocuments };
  }

  async listTreeRoots(params: {
    agentId: string;
    kbId: string;
  }): Promise<Array<{ id: string; name: string; path: string; sourceType: "local_fs" }>> {
    const base = this.getBaseById(params.agentId, params.kbId);
    if (!base) {
      throw new Error("Knowledge base not found");
    }
    const sourceType = base.source_type ?? "external";
    if (sourceType !== "local_fs") {
      return [];
    }
    if (process.platform !== "win32") {
      return [{ id: "/", name: "/", path: "/", sourceType: "local_fs" }];
    }
    const roots: Array<{ id: string; name: string; path: string; sourceType: "local_fs" }> = [];
    for (let code = 65; code <= 90; code += 1) {
      const letter = String.fromCharCode(code);
      const drive = `${letter}:\\`;
      try {
        await fs.access(drive);
        roots.push({ id: drive, name: drive, path: drive, sourceType: "local_fs" });
      } catch {
        // ignore inaccessible drives
      }
    }
    return roots;
  }

  async listTreeChildren(params: {
    agentId: string;
    kbId: string;
    path: string;
  }): Promise<KnowledgeTreeEntry[]> {
    const base = this.getBaseById(params.agentId, params.kbId);
    if (!base) {
      throw new Error("Knowledge base not found");
    }
    if ((base.source_type ?? "external") !== "local_fs") {
      return [];
    }
    const targetPath = normalizeTreePath(params.path);
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    const materializedMap = this.getLocalMaterializedDocumentMap(params.agentId, params.kbId);
    const graphBuiltSet = this.getGraphBuiltDocumentSet(params.kbId);

    const result: KnowledgeTreeEntry[] = [];
    for (const entry of entries) {
      const absPath = path.join(targetPath, entry.name);
      let stat;
      try {
        stat = await fs.stat(absPath);
      } catch {
        continue;
      }
      const isDirectory = entry.isDirectory();
      const extension = isDirectory ? null : path.extname(entry.name).toLowerCase() || null;
      if (!isDirectory && !isSupportedTreeFile(absPath)) {
        continue;
      }
      const materialized = materializedMap.get(absPath);
      result.push({
        id: absPath,
        name: entry.name,
        path: absPath,
        kind: isDirectory ? "directory" : "file",
        extension,
        typeLabel: isDirectory ? "目录" : getTreeEntryTypeLabel(extension),
        size: isDirectory ? null : stat.size,
        createdAtMs: Number.isFinite(stat.birthtimeMs) ? stat.birthtimeMs : stat.ctimeMs,
        mtimeMs: stat.mtimeMs,
        permissions: formatTreePermissions(stat.mode),
        sourceType: "local_fs",
        materialized: Boolean(materialized),
        vectorized: Boolean(materialized?.indexed_at),
        graphBuilt: materialized ? graphBuiltSet.has(materialized.id) : false,
        documentId: materialized?.id ?? null,
      });
    }

    return result.toSorted((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name, "zh-Hans-CN");
    });
  }

  async getTreeFile(params: {
    agentId: string;
    kbId: string;
    path: string;
  }): Promise<{ content: string; mimetype: string; filename: string; documentId?: string | null }> {
    this.resolveBaseIdForAgent({ agentId: params.agentId, kbId: params.kbId });
    const filePath = normalizeTreePath(params.path);
    const buffer = await fs.readFile(filePath);
    const existingDoc = this.getLocalMaterializedDocumentByPath(
      params.agentId,
      params.kbId,
      filePath,
    );
    return {
      content: buffer.toString("base64"),
      mimetype: inferMimeFromPath(filePath),
      filename: path.basename(filePath),
      documentId: existingDoc?.id ?? null,
    };
  }

  async saveTreeFile(params: {
    agentId: string;
    kbId: string;
    path: string;
    content: string;
  }): Promise<{ success: boolean; updatedAt: string; documentId?: string | null }> {
    this.resolveBaseIdForAgent({ agentId: params.agentId, kbId: params.kbId });
    const filePath = normalizeTreePath(params.path);
    await fs.writeFile(filePath, params.content, "utf-8");

    const existingDoc = this.getLocalMaterializedDocumentByPath(
      params.agentId,
      params.kbId,
      filePath,
    );
    if (existingDoc) {
      this.db.prepare(`UPDATE kb_documents SET indexed_at = NULL WHERE id = ?`).run(existingDoc.id);
      this.deleteGraphEntries({
        agentId: params.agentId,
        kbId: params.kbId,
        documentId: existingDoc.id,
      });
      try {
        const memoryManager = await MemoryIndexManager.get({
          cfg: this.cfg,
          agentId: params.agentId,
        });
        if (memoryManager && typeof memoryManager.deleteKnowledgeDocument === "function") {
          void memoryManager.deleteKnowledgeDocument({ documentId: existingDoc.id });
        }
      } catch (err) {
        log.warn(`knowledge: failed to clear vector index for local file save: ${String(err)}`);
      }
    }

    return {
      success: true,
      updatedAt: new Date().toISOString(),
      documentId: existingDoc?.id ?? null,
    };
  }

  async renameTreeFile(
    params: RenameKnowledgeTreeFileParams,
  ): Promise<{ filename: string; path: string; documentId: string | null }> {
    this.resolveBaseIdForAgent({ agentId: params.agentId, kbId: params.kbId });
    const currentPath = normalizeTreePath(params.path);
    const existingDoc = this.getLocalMaterializedDocumentByPath(
      params.agentId,
      params.kbId,
      currentPath,
    );
    const nextPath = await this.renameLocalFileSource({
      currentPath,
      filename: params.filename,
    });

    if (existingDoc) {
      this.storage.updateDocumentMetadata({
        documentId: existingDoc.id,
        filename: path.basename(nextPath),
        filepath: nextPath,
        sourceMetadata: {
          ...parseSourceMetadataRecord(existingDoc.source_metadata),
          sourcePath: nextPath,
        },
      });
    }

    return {
      filename: path.basename(nextPath),
      path: nextPath,
      documentId: existingDoc?.id ?? null,
    };
  }

  async materializeTreeFile(params: {
    agentId: string;
    kbId: string;
    path: string;
    mode: "vectorize" | "graphize";
  }): Promise<{ documentId: string; vectorized: boolean; graphBuilt: boolean }> {
    this.resolveBaseIdForAgent({ agentId: params.agentId, kbId: params.kbId });
    const filePath = normalizeTreePath(params.path);
    if (!isSupportedTreeFile(filePath)) {
      throw new Error("当前文件类型不支持入库");
    }

    const buffer = await fs.readFile(filePath);
    const stat = await fs.stat(filePath);
    const filename = path.basename(filePath);
    const mimetype = inferMimeFromPath(filePath);
    const existingDoc = this.getLocalMaterializedDocumentByPath(
      params.agentId,
      params.kbId,
      filePath,
    );
    const documentId =
      existingDoc?.id ?? hashText(`local:${params.agentId}:${params.kbId}:${filePath}`);
    const now = Date.now();
    const hash = createHash("sha256").update(buffer).update("\n").update(filePath).digest("hex");

    this.db
      .prepare(
        `INSERT INTO kb_documents
         (id, kb_id, filename, filepath, mimetype, size, hash, source_type, source_metadata, uploaded_at, indexed_at, owner_agent_id, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           filename = excluded.filename,
           filepath = excluded.filepath,
           mimetype = excluded.mimetype,
           size = excluded.size,
           hash = excluded.hash,
           source_type = excluded.source_type,
           source_metadata = excluded.source_metadata,
           uploaded_at = excluded.uploaded_at`,
      )
      .run(
        documentId,
        params.kbId,
        filename,
        filePath,
        mimetype,
        stat.size,
        hash,
        "local_fs",
        JSON.stringify({ sourcePath: filePath }),
        now,
        null,
        params.agentId,
        null,
      );

    const extractedText = await this.extractTextForMaterialize({
      mimetype,
      buffer,
      filePath,
    });
    const settings = this.getSettings(params.agentId);
    const persistedDoc = this.storage.getDocument(documentId);
    let vectorized = Boolean(persistedDoc?.indexed_at);
    let graphBuilt = this.getGraphBuiltDocumentSet(params.kbId).has(documentId);

    if (params.mode === "vectorize" && extractedText) {
      try {
        const memoryManager = await MemoryIndexManager.get({
          cfg: this.cfg,
          agentId: params.agentId,
          overrides: {
            provider: settings.vectorization.provider,
            model: settings.vectorization.model,
          },
        });
        if (memoryManager) {
          await memoryManager.ingestKnowledgeDocument({
            documentId,
            filename,
            content: extractedText,
          });
          this.storage.updateIndexedAt(documentId);
          vectorized = true;
        }
      } catch (err) {
        log.warn(`knowledge: tree vectorization failed for ${filePath}: ${String(err)}`);
      }
    }

    if (params.mode === "graphize" && extractedText) {
      graphBuilt = false;
      try {
        this.deleteGraphEntries({
          agentId: params.agentId,
          kbId: params.kbId,
          documentId,
        });
      } catch {
        // ignore cleanup errors
      }
      try {
        const tripleCount = await this.extractGraphForDocument({
          agentId: params.agentId,
          documentId,
          content: extractedText,
          settings: settings.graph,
          kbId: params.kbId,
        });
        graphBuilt = tripleCount > 0;
      } catch (err) {
        log.warn(`knowledge: tree graphization failed for ${filePath}: ${String(err)}`);
      }
    }

    return { documentId, vectorized, graphBuilt };
  }

  private async renameLocalFileSource(params: {
    currentPath: string;
    filename: string;
  }): Promise<string> {
    const nextFilename = normalizeLocalFilename(params.filename);
    const nextPath = path.join(path.dirname(params.currentPath), nextFilename);

    if (normalizeTreePath(nextPath) === normalizeTreePath(params.currentPath)) {
      return normalizeTreePath(params.currentPath);
    }

    try {
      await fs.access(nextPath);
      throw new Error("目标文件已存在");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }

    await fs.rename(params.currentPath, nextPath);
    return normalizeTreePath(nextPath);
  }

  private async extractTextForMaterialize(params: {
    mimetype: string;
    buffer: Buffer;
    filePath: string;
  }): Promise<string> {
    const processor = this.processorRegistry.getProcessor(params.mimetype);
    if (processor) {
      const extracted = await processor.extract(params.buffer, {});
      return extracted?.trim() ?? "";
    }
    if (
      params.mimetype.startsWith("text/") ||
      params.mimetype === "application/json" ||
      params.mimetype === "application/csv" ||
      params.mimetype === "text/csv"
    ) {
      return params.buffer.toString("utf-8");
    }
    return "";
  }

  private getLocalMaterializedDocumentByPath(
    agentId: string,
    kbId: string,
    sourcePath: string,
  ): KnowledgeDocument | null {
    const normalizedPath = normalizeTreePath(sourcePath);
    const docs = this.db
      .prepare(
        `SELECT id, kb_id, filename, filepath, mimetype, size, hash, source_type, source_metadata,
                uploaded_at, indexed_at, owner_agent_id, description
         FROM kb_documents
         WHERE owner_agent_id = ? AND kb_id = ? AND source_type = 'local_fs'`,
      )
      .all(agentId, kbId) as KnowledgeDocument[];
    for (const doc of docs) {
      const sourceMetaPath = extractSourcePath(doc.source_metadata);
      if (sourceMetaPath && normalizeTreePath(sourceMetaPath) === normalizedPath) {
        return doc;
      }
      if (normalizeTreePath(doc.filepath) === normalizedPath) {
        return doc;
      }
    }
    return null;
  }

  private getLocalMaterializedDocumentMap(
    agentId: string,
    kbId: string,
  ): Map<string, KnowledgeDocument> {
    const docs = this.db
      .prepare(
        `SELECT id, kb_id, filename, filepath, mimetype, size, hash, source_type, source_metadata,
                uploaded_at, indexed_at, owner_agent_id, description
         FROM kb_documents
         WHERE owner_agent_id = ? AND kb_id = ? AND source_type = 'local_fs'`,
      )
      .all(agentId, kbId) as KnowledgeDocument[];
    const map = new Map<string, KnowledgeDocument>();
    for (const doc of docs) {
      const sourceMetaPath = extractSourcePath(doc.source_metadata);
      if (sourceMetaPath) {
        map.set(normalizeTreePath(sourceMetaPath), doc);
      } else {
        map.set(normalizeTreePath(doc.filepath), doc);
      }
    }
    return map;
  }

  private getGraphBuiltDocumentSet(kbId: string): Set<string> {
    const rows = this.db
      .prepare(
        `SELECT document_id
         FROM knowledge_graph_runs
         WHERE kb_id = ? AND status = 'success'`,
      )
      .all(kbId) as Array<{ document_id: string }>;
    return new Set(rows.map((row) => row.document_id));
  }

  resolveDocumentPath(params: { agentId: string; documentId: string; kbId?: string }): {
    absPath: string;
    mimetype: string;
  } {
    const doc = this.getDocument({
      agentId: params.agentId,
      documentId: params.documentId,
      kbId: params.kbId,
    });
    if (!doc) {
      throw new Error(`Document not found: ${params.documentId}`);
    }
    const absPath = path.isAbsolute(doc.filepath)
      ? doc.filepath
      : path.join(this.baseDir, doc.filepath);
    return {
      absPath,
      mimetype: doc.mimetype,
    };
  }

  private ensureDefaultLocalBase(agentId: string): void {
    const existing = this.db
      .prepare(
        `SELECT id
         FROM kb_bases
         WHERE owner_agent_id = ? AND source_type = 'local_fs'
         ORDER BY pinned DESC, created_at ASC
         LIMIT 1`,
      )
      .get(agentId) as { id: string } | undefined;
    if (existing?.id) {
      return;
    }
    const now = Date.now();
    const kbId = hashText(`${agentId}:local:${now}`);
    this.db
      .prepare(
        `INSERT INTO kb_bases
         (id, owner_agent_id, name, description, icon, visibility, source_type, source_config, source_status, pinned, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        kbId,
        agentId,
        DEFAULT_LOCAL_KB_NAME,
        DEFAULT_LOCAL_KB_DESCRIPTION,
        "lucide:folder-open",
        "private",
        "local_fs",
        JSON.stringify({ mode: "host_root" }),
        "connected",
        1,
        now,
        now,
      );
    this.upsertBaseSettings({
      agentId,
      kbId,
      settings: {
        vectorization: { enabled: true },
        graph: {
          enabled: false,
          minTriples: 3,
          maxTriples: 50,
          triplesPerKTokens: 10,
          maxDepth: 3,
        },
      },
    });
  }

  private baseNameExists(agentId: string, name: string, excludeId?: string): boolean {
    const row = this.db
      .prepare(`SELECT id FROM kb_bases WHERE owner_agent_id = ? AND name = ? LIMIT 1`)
      .get(agentId, name) as { id: string } | undefined;
    if (!row) {
      return false;
    }
    return excludeId ? row.id !== excludeId : true;
  }

  private listBaseEntries(params: {
    agentId: string;
    search?: string;
    visibility?: "private" | "team" | "public";
    tags?: string[];
  }): KnowledgeBaseEntry[] {
    const conditions: string[] = ["b.owner_agent_id = ?"];
    const values: (string | number)[] = [params.agentId];
    const joins: string[] = [];
    if (params.visibility) {
      conditions.push("b.visibility = ?");
      values.push(params.visibility);
    }
    if (params.search) {
      conditions.push("(b.name LIKE ? OR b.description LIKE ?)");
      const like = `%${params.search}%`;
      values.push(like, like);
    }
    if (params.tags && params.tags.length > 0) {
      const normalizedTags = Array.from(
        new Set(params.tags.map((tag) => tag.trim()).filter(Boolean)),
      );
      if (normalizedTags.length > 0) {
        joins.push(`INNER JOIN kb_base_tags bt ON b.id = bt.kb_id`);
        joins.push(
          `INNER JOIN kb_tag_defs td ON td.id = bt.tag_id AND td.owner_agent_id = b.owner_agent_id`,
        );
        const placeholders = normalizedTags.map(() => "?").join(", ");
        conditions.push(`td.name IN (${placeholders})`);
        values.push(...normalizedTags);
      }
    }
    const rows = this.db
      .prepare(
        `SELECT DISTINCT b.id, b.owner_agent_id, b.name, b.description, b.icon, b.visibility,
                         b.source_type, b.source_config, b.source_status, b.pinned,
                         b.created_at, b.updated_at
         FROM kb_bases b
         ${joins.join("\n")}
         WHERE ${conditions.join(" AND ")}
         ORDER BY b.pinned DESC, CASE WHEN b.source_type = 'local_fs' THEN 0 ELSE 1 END ASC, b.updated_at DESC`,
      )
      .all(...values) as KnowledgeBaseEntry[];
    return rows;
  }

  private getBaseWithMetaById(agentId: string, kbId: string): KnowledgeBaseWithMeta | null {
    const base = this.getBaseById(agentId, kbId);
    if (!base) {
      return null;
    }
    // 计算该知识库的文档数量
    const docCountRow = this.db
      .prepare("SELECT COUNT(*) as count FROM kb_documents WHERE kb_id = ? AND owner_agent_id = ?")
      .get(kbId, agentId) as { count: number } | undefined;
    return {
      ...base,
      tags: this.getBaseTags(agentId, kbId),
      settings: this.getBaseSettingsById(agentId, kbId),
      documentCount: docCountRow?.count ?? 0,
    };
  }

  private getBaseTags(agentId: string, kbId: string): KnowledgeBaseTag[] {
    const rows = this.db
      .prepare(
        `SELECT td.id, td.name, td.color
         FROM kb_base_tags bt
         INNER JOIN kb_tag_defs td ON td.id = bt.tag_id
         WHERE bt.owner_agent_id = ? AND bt.kb_id = ?
         ORDER BY td.name COLLATE NOCASE ASC`,
      )
      .all(agentId, kbId) as Array<{ id: string; name: string; color?: string | null }>;
    return rows.map((row) => ({
      tagId: row.id,
      name: row.name,
      color: row.color ?? null,
    }));
  }

  private getBaseSettingsById(agentId: string, kbId: string): KnowledgeBaseRuntimeSettings {
    const row = this.db
      .prepare(
        `SELECT kb_id, owner_agent_id, vectorization_config, chunk_config, retrieval_config, index_config, graph_config, created_at, updated_at
         FROM kb_base_settings
         WHERE owner_agent_id = ? AND kb_id = ?`,
      )
      .get(agentId, kbId) as KnowledgeBaseSettingsEntry | undefined;
    const vectorization = row?.vectorization_config
      ? mergeBaseVectorizationConfig(
          parseJson<Partial<{ enabled: boolean }>>(row.vectorization_config),
        )
      : DEFAULT_BASE_VECTORIZATION_CONFIG;
    const chunk = row?.chunk_config
      ? mergeChunkConfig(parseJson<Partial<KnowledgeChunkConfig>>(row.chunk_config))
      : DEFAULT_CHUNK_CONFIG;
    const retrieval = row?.retrieval_config
      ? mergeRetrievalConfig(parseJson<Partial<KnowledgeRetrievalConfig>>(row.retrieval_config))
      : DEFAULT_RETRIEVAL_CONFIG;
    const index = row?.index_config
      ? mergeIndexConfig(parseJson<Partial<KnowledgeIndexConfig>>(row.index_config))
      : DEFAULT_INDEX_CONFIG;
    const graph = row?.graph_config
      ? mergeBaseGraphConfig(parseJson<Partial<{ enabled: boolean }>>(row.graph_config))
      : DEFAULT_BASE_GRAPH_CONFIG;
    return {
      vectorization,
      chunk,
      retrieval,
      index,
      graph,
    };
  }

  private upsertBaseSettings(params: {
    agentId: string;
    kbId: string;
    settings?: Partial<KnowledgeBaseRuntimeSettings>;
  }): void {
    const current = this.getBaseSettingsById(params.agentId, params.kbId);
    const vectorization = mergeBaseVectorizationConfig(
      params.settings?.vectorization ?? current.vectorization,
    );
    const chunk = mergeChunkConfig(params.settings?.chunk ?? current.chunk);
    const retrieval = mergeRetrievalConfig(params.settings?.retrieval ?? current.retrieval);
    const index = mergeIndexConfig(params.settings?.index ?? current.index);
    const graph = mergeBaseGraphConfig(params.settings?.graph ?? current.graph);
    validateChunkConfig(chunk);
    validateRetrievalConfig(retrieval);
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO kb_base_settings
         (kb_id, owner_agent_id, vectorization_config, chunk_config, retrieval_config, index_config, graph_config, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(kb_id) DO UPDATE SET
           vectorization_config = excluded.vectorization_config,
           chunk_config = excluded.chunk_config,
           retrieval_config = excluded.retrieval_config,
           index_config = excluded.index_config,
           graph_config = excluded.graph_config,
           updated_at = excluded.updated_at`,
      )
      .run(
        params.kbId,
        params.agentId,
        JSON.stringify(vectorization),
        JSON.stringify(chunk),
        JSON.stringify(retrieval),
        JSON.stringify(index),
        JSON.stringify(graph),
        now,
        now,
      );
  }

  private setBaseTags(agentId: string, kbId: string, tags: KnowledgeBaseTagInput[]): void {
    const normalized = normalizeTagInputs(tags);
    const desiredTagIds: string[] = [];
    for (const tag of normalized) {
      const tagId = this.ensureTagDef(agentId, tag);
      desiredTagIds.push(tagId);
    }

    const existingRows = this.db
      .prepare(
        `SELECT tag_id
         FROM kb_base_tags
         WHERE owner_agent_id = ? AND kb_id = ?`,
      )
      .all(agentId, kbId) as Array<{ tag_id: string }>;
    const existing = new Set(existingRows.map((row) => row.tag_id));
    const desired = new Set(desiredTagIds);

    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO kb_base_tags (kb_id, tag_id, owner_agent_id, created_at)
       VALUES (?, ?, ?, ?)`,
    );
    const remove = this.db.prepare(
      `DELETE FROM kb_base_tags
       WHERE kb_id = ? AND owner_agent_id = ? AND tag_id = ?`,
    );
    const now = Date.now();
    for (const tagId of desired) {
      if (!existing.has(tagId)) {
        insert.run(kbId, tagId, agentId, now);
      }
    }
    for (const tagId of existing) {
      if (!desired.has(tagId)) {
        remove.run(kbId, agentId, tagId);
      }
    }
  }

  private ensureTagDef(agentId: string, tag: KnowledgeBaseTagInput): string {
    const existing = this.getTagByName(agentId, tag.name);
    if (existing) {
      const nextColor = normalizeTagColor(tag.color) ?? existing.color ?? DEFAULT_TAG_COLOR;
      if ((existing.color ?? null) !== nextColor) {
        this.db
          .prepare(
            `UPDATE kb_tag_defs
             SET color = ?, updated_at = ?
             WHERE id = ? AND owner_agent_id = ?`,
          )
          .run(nextColor, Date.now(), existing.id, agentId);
      }
      return existing.id;
    }
    const now = Date.now();
    const tagId = hashText(`${agentId}:tag:${tag.name}:${now}`);
    this.db
      .prepare(
        `INSERT INTO kb_tag_defs (id, owner_agent_id, name, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(tagId, agentId, tag.name, normalizeTagColor(tag.color) ?? DEFAULT_TAG_COLOR, now, now);
    return tagId;
  }

  private getTagByName(
    agentId: string,
    tagName: string,
  ): { id: string; name: string; color?: string | null } | undefined {
    return this.db
      .prepare(
        `SELECT id, name, color
         FROM kb_tag_defs
         WHERE owner_agent_id = ? AND name = ?`,
      )
      .get(agentId, tagName) as { id: string; name: string; color?: string | null } | undefined;
  }

  private assertTagOwnership(agentId: string, tagId: string): void {
    const row = this.db
      .prepare(`SELECT id FROM kb_tag_defs WHERE id = ? AND owner_agent_id = ?`)
      .get(tagId, agentId) as { id: string } | undefined;
    if (!row) {
      throw new Error(`tag not found: ${tagId}`);
    }
  }

  private resolveBaseIdForAgent(params: { agentId: string; kbId?: string | null }): string {
    this.ensureDefaultLocalBase(params.agentId);
    if (params.kbId) {
      const base = this.getBaseById(params.agentId, params.kbId);
      if (!base) {
        throw new Error("Knowledge base not found");
      }
      return base.id;
    }
    const bases = this.listBaseEntries({ agentId: params.agentId });
    if (bases.length === 1) {
      return bases[0].id;
    }
    if (bases.length === 0) {
      throw new Error("Knowledge base not found");
    }
    throw new Error("kbId is required");
  }

  private resolveDocumentKbId(params: {
    agentId: string;
    documentId: string;
    kbId?: string;
  }): string {
    const doc = this.storage.getDocument(params.documentId);
    if (!doc) {
      throw new Error(`Document not found: ${params.documentId}`);
    }
    if (doc.owner_agent_id !== params.agentId) {
      throw new Error("Document does not belong to this agent");
    }
    if (params.kbId && doc.kb_id && params.kbId !== doc.kb_id) {
      throw new Error("Document does not belong to this knowledge base");
    }
    return doc.kb_id ?? params.kbId ?? this.resolveBaseIdForAgent({ agentId: params.agentId });
  }

  private resolveGraphKbId(params: {
    agentId: string;
    kbId?: string;
    documentIds?: string[];
  }): string {
    if (params.kbId) {
      this.resolveBaseIdForAgent({ agentId: params.agentId, kbId: params.kbId });
      if (params.documentIds?.length) {
        for (const documentId of params.documentIds) {
          const doc = this.storage.getDocument(documentId);
          if (!doc) {
            throw new Error(`Document not found: ${documentId}`);
          }
          if (doc.owner_agent_id !== params.agentId) {
            throw new Error("Document does not belong to this agent");
          }
          if (doc.kb_id && doc.kb_id !== params.kbId) {
            throw new Error("Document does not belong to this knowledge base");
          }
        }
      }
      return params.kbId;
    }
    if (params.documentIds?.length) {
      let resolved: string | undefined;
      for (const documentId of params.documentIds) {
        const doc = this.storage.getDocument(documentId);
        if (!doc) {
          throw new Error(`Document not found: ${documentId}`);
        }
        if (doc.owner_agent_id !== params.agentId) {
          throw new Error("Document does not belong to this agent");
        }
        if (doc.kb_id) {
          if (!resolved) {
            resolved = doc.kb_id;
          } else if (resolved !== doc.kb_id) {
            throw new Error("Documents belong to different knowledge bases");
          }
        }
      }
      if (resolved) {
        return resolved;
      }
    }
    return this.resolveBaseIdForAgent({ agentId: params.agentId });
  }

  // ============================================================
  // Knowledge Graph Methods (Enhanced)
  // ============================================================

  /**
   * Build knowledge graph for a document
   */
  buildKnowledgeGraph(params: { agentId: string; kbId: string; documentId: string }): {
    taskId: string;
  } {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }

    // Check if graph extraction is enabled (use KB-specific settings)
    const baseSettings = this.getBaseSettings({ agentId: params.agentId, kbId: params.kbId });
    if (!baseSettings.graph.enabled) {
      throw new Error("Graph extraction is not enabled for this knowledge base");
    }

    // Get agent-level settings for extraction parameters
    const settings = this.getSettings(params.agentId);

    const builder = new KnowledgeGraphBuilder({
      db: this.db,
      kbId: params.kbId,
      documentId: params.documentId,
      agentId: params.agentId,
      maxEntities: settings.graph.maxEntities,
      extractionTimeout: settings.graph.extractionTimeout,
      cfg: this.cfg,
      workspaceDir: this.baseDir,
      agentDir: resolveAgentDir(this.cfg, params.agentId),
      settings: settings.graph as KnowledgeGraphSettings,
    });

    // Build in background (fire and forget)
    builder.build().catch((err) => {
      log.error(`Graph build failed for document ${params.documentId}: ${err}`);
    });

    return { taskId: builder.getTaskStatus().id };
  }

  /**
   * Build knowledge graph for all documents in a knowledge base
   */
  buildAllKnowledgeGraphs(params: { agentId: string; kbId: string }): {
    taskIds: string[];
    documentCount: number;
  } {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }

    // Check if graph extraction is enabled (use KB-specific settings)
    const baseSettings = this.getBaseSettings({ agentId: params.agentId, kbId: params.kbId });
    if (!baseSettings.graph.enabled) {
      throw new Error("Graph extraction is not enabled for this knowledge base");
    }

    // Get agent-level settings for extraction parameters
    const settings = this.getSettings(params.agentId);

    // Get all documents in the KB
    const documents = this.listDocuments({
      agentId: params.agentId,
      kbId: params.kbId,
      limit: 1000,
    });

    const taskIds: string[] = [];

    // Build graph for each document
    for (const doc of documents) {
      const builder = new KnowledgeGraphBuilder({
        db: this.db,
        kbId: params.kbId,
        documentId: doc.id,
        agentId: params.agentId,
        maxEntities: settings.graph.maxEntities,
        extractionTimeout: settings.graph.extractionTimeout,
        cfg: this.cfg,
        workspaceDir: this.baseDir,
        agentDir: resolveAgentDir(this.cfg, params.agentId),
        settings: settings.graph as KnowledgeGraphSettings,
      });

      // Build in background
      builder.build().catch((err) => {
        log.error(`Graph build failed for document ${doc.id}: ${err}`);
      });

      taskIds.push(builder.getTaskStatus().id);
    }

    return { taskIds, documentCount: documents.length };
  }

  /**
   * Get knowledge graph build task status
   */
  getGraphBuildStatus(params: { taskId: string }): KnowledgeGraphBuildTask | null {
    return getGraphBuildTask(this.db, params.taskId);
  }

  /**
   * Search knowledge graph
   */
  searchKnowledgeGraph(params: {
    agentId: string;
    kbId: string;
    query: string;
    mode?: "local" | "global" | "hybrid" | "naive";
    topK?: number;
  }): Promise<KnowledgeGraphSearchResult> {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }

    const searcher = new KnowledgeGraphSearcher(this.db, params.kbId);
    return searcher.hybridSearch(params.query, {
      mode: params.mode || "hybrid",
      topK: params.topK || 10,
      rrfK: 60, // Default RRF k value
    });
  }

  /**
   * Get knowledge graph statistics
   */
  getKnowledgeGraphStats(params: { agentId: string; kbId: string }): KnowledgeGraphStats {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }

    const searcher = new KnowledgeGraphSearcher(this.db, params.kbId);
    return searcher.getStats();
  }

  /**
   * Clear all graph data for a knowledge base
   */
  clearGraph(params: { agentId: string; kbId: string }): void {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }

    clearKnowledgeGraph(this.db, params.kbId);
  }

  /**
   * Get all graph data (nodes and edges) for visualization
   */
  getKnowledgeGraphData(params: { agentId: string; kbId: string; limit?: number }): {
    nodes: Array<{ id: string; name: string; type: string | null; description?: string }>;
    edges: Array<{ id: string; source: string; target: string; keywords: string[] }>;
  } {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }

    const limit = params.limit || 500;

    // Get entities (nodes)
    const entities = this.db
      .prepare(
        `SELECT e.id, e.name, e.type, d.description
         FROM kg_entities e
         LEFT JOIN kg_entity_descriptions d ON e.id = d.entity_id
         WHERE e.kb_id = ?
         ORDER BY e.name
         LIMIT ?`,
      )
      .all(params.kbId, limit) as Array<{
      id: string;
      name: string;
      type: string | null;
      description?: string;
    }>;

    // Get relations (edges)
    const relations = this.db
      .prepare(
        `SELECT r.id, r.source_entity_id, r.target_entity_id, r.keywords
         FROM kg_relations r
         WHERE r.kb_id = ?
         ORDER BY r.keywords
         LIMIT ?`,
      )
      .all(params.kbId, limit) as Array<{
      id: string;
      source_entity_id: string;
      target_entity_id: string;
      keywords: string;
    }>;

    return {
      nodes: entities.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        description: e.description,
      })),
      edges: relations.map((r) => ({
        id: r.id,
        source: r.source_entity_id,
        target: r.target_entity_id,
        keywords: r.keywords ? r.keywords.split(",").filter(Boolean) : [],
      })),
    };
  }

  /**
   * Get entity details with related document chunks
   */
  getEntityDetails(params: { agentId: string; kbId: string; entityId: string }): {
    id: string;
    name: string;
    type: string | null;
    description: string | null;
    chunks: Array<{ id: string; text: string; documentName: string; score: number }>;
  } {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }

    // Get entity info
    const entity = this.db
      .prepare(
        `SELECT e.id, e.name, e.type, d.description
         FROM kg_entities e
         LEFT JOIN kg_entity_descriptions d ON e.id = d.entity_id
         WHERE e.id = ? AND e.kb_id = ?`,
      )
      .get(params.entityId, params.kbId) as
      | {
          id: string;
          name: string;
          type: string | null;
          description: string | null;
        }
      | undefined;

    if (!entity) {
      throw new Error(`Entity not found: ${params.entityId}`);
    }

    // Get related chunks (from the same document that contains this entity)
    const chunks = this.db
      .prepare(
        `SELECT c.id, c.text, c.path, c.start_line,
           (CASE WHEN c.text LIKE ? THEN 1.5 ELSE 1.0 END) as score
         FROM chunks c
         WHERE c.path LIKE ? AND c.source = 'knowledge'
         ORDER BY score DESC
         LIMIT 10`,
      )
      .all(`%${entity.name}%`, `%${params.kbId}%`) as Array<{
      id: string;
      text: string;
      path: string;
      start_line: number;
      score: number;
    }>;

    // Extract document names from path
    // path format: knowledge/{documentId}.txt
    const docMap = new Map<string, string>();
    for (const c of chunks) {
      const docId = c.path.split("/").pop()?.replace(".txt", "") || "";
      if (!docMap.has(docId)) {
        // Use document ID as name (or extract from path)
        docMap.set(docId, docId.slice(0, 8) + "...");
      }
    }

    return {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      description: entity.description,
      chunks: chunks.map((c) => {
        const docId = c.path.split("/").pop()?.replace(".txt", "") || "";
        return {
          id: c.id,
          text: c.text.slice(0, 300) + (c.text.length > 300 ? "..." : ""),
          documentName: docMap.get(docId) || "未知文档",
          score: c.score,
        };
      }),
    };
  }

  /**
   * Rebuild document: re-vectorize and re-build graph based on current settings
   */
  async rebuildDocument(params: {
    agentId: string;
    kbId: string;
    documentId: string;
  }): Promise<{ success: boolean; vectorized: boolean; graphBuilt: boolean }> {
    const config = this.getConfig(params.agentId);
    if (!config) {
      throw new Error(`Knowledge base is disabled for agent ${params.agentId}`);
    }

    const kbId = this.resolveBaseIdForAgent({
      agentId: params.agentId,
      kbId: params.kbId,
    });

    const doc = this.storage.getDocument(params.documentId);
    if (!doc) {
      throw new Error(`Document not found: ${params.documentId}`);
    }

    // Get the file path and read content
    const resolved = this.resolveDocumentPath({
      agentId: params.agentId,
      documentId: doc.id,
      kbId,
    });

    log.info(
      `knowledge: rebuild resolving document path: ${JSON.stringify({ absPath: resolved.absPath, mimetype: resolved.mimetype, docId: doc.id, docFilename: doc.filename })}`,
    );

    const fsPromises = await import("fs/promises");
    const fileBuffer = await fsPromises.readFile(resolved.absPath);
    log.info(`knowledge: rebuild read file buffer, size: ${fileBuffer.byteLength}`);

    // Extract text using processor
    const processor = this.processorRegistry.getProcessor(resolved.mimetype);
    log.info(
      `knowledge: rebuild processor for ${resolved.mimetype}: ${processor ? "found" : "NOT FOUND"}`,
    );
    let extractedText = "";
    if (processor) {
      try {
        extractedText = await processor.extract(fileBuffer, {});
        log.info(`knowledge: rebuild extracted text length: ${extractedText.length}`);
      } catch (err) {
        log.error(`knowledge: rebuild processor.extract failed: ${String(err)}`);
        throw new Error(`Failed to extract text from document: ${String(err)}`, { cause: err });
      }
    }

    if (!extractedText || extractedText.trim().length === 0) {
      log.error(
        `knowledge: rebuild no text extracted, mimetype: ${resolved.mimetype}, processor: ${processor ? "yes" : "no"}, fileSize: ${fileBuffer.byteLength}`,
      );
      throw new Error("No text content could be extracted from the document");
    }

    // Ensure chunks schema exists before vectorization
    this.ensureChunksSchema();

    const settings = this.getSettings(params.agentId);
    const baseSettings = this.getBaseSettingsById(params.agentId, kbId);
    log.info(`knowledge: rebuild baseSettings raw: ${JSON.stringify(baseSettings)}`);

    let vectorized = false;
    let graphBuilt = false;

    // Delete old vector index - wrapped in try-catch to not fail entire rebuild
    if (config.search.includeInMemorySearch) {
      try {
        const memoryManager = await MemoryIndexManager.get({
          cfg: this.cfg,
          agentId: params.agentId,
        });
        if (memoryManager) {
          log.info(`knowledge: rebuild deleting vector index for doc ${doc.id}`);
          // Skip actual deletion as method may not exist - just log
          // memoryManager.deleteKnowledgeDocument(doc.id);
        }
      } catch (err) {
        log.warn(`knowledge: failed to get memory manager for vector deletion: ${String(err)}`);
      }
    }

    // Delete old graph entries
    const docKbId = doc.kb_id;
    const finalKbId = typeof docKbId === "string" && docKbId ? docKbId : kbId;
    log.info(
      `knowledge: rebuild deleting graph entries for doc ${doc.id}, kbId=${finalKbId}, doc.kb_id=${docKbId}`,
    );
    if (!finalKbId || typeof finalKbId !== "string") {
      throw new Error(`Invalid kbId: ${finalKbId}, doc.kb_id: ${docKbId}`);
    }
    try {
      this.deleteGraphEntries({
        agentId: params.agentId,
        documentId: doc.id,
        kbId: finalKbId,
      });
    } catch (err) {
      log.error(`knowledge: failed to delete graph entries: ${String(err)}`);
      throw err;
    }

    // Re-vectorize if enabled (only check baseSettings, ignore agent-level settings)
    log.info(
      `knowledge: rebuild vectorization check - baseSettings.vectorization.enabled: ${baseSettings.vectorization.enabled}, hasText: ${!!extractedText}`,
    );
    if (baseSettings.vectorization.enabled && extractedText) {
      try {
        const memoryManager = await MemoryIndexManager.get({
          cfg: this.cfg,
          agentId: params.agentId,
          overrides: {
            provider: settings.vectorization.provider,
            model: settings.vectorization.model,
          },
        });

        if (memoryManager) {
          await memoryManager.ingestKnowledgeDocument({
            documentId: doc.id,
            filename: doc.filename,
            content: extractedText,
          });
          vectorized = true;
          this.storage.updateIndexedAt(doc.id);
          log.info(`knowledge: rebuild vectorization succeeded for doc ${doc.id}`);
        } else {
          log.warn(`knowledge: rebuild memoryManager is null, skipping vectorization`);
        }
      } catch (err) {
        log.warn(
          `knowledge: failed to re-vectorize document: ${String(err)}, stack: ${(err as Error).stack}`,
        );
      }
    } else {
      log.info(`knowledge: rebuild skipping vectorization due to settings`);
    }

    // Re-build graph if enabled
    log.info(
      `knowledge: rebuild graph check - baseSettings.graph.enabled: ${baseSettings.graph.enabled}, hasText: ${!!extractedText}`,
    );
    if (baseSettings.graph.enabled && extractedText) {
      try {
        const tripleCount = await this.extractGraphForDocument({
          agentId: params.agentId,
          documentId: doc.id,
          content: extractedText,
          settings: settings.graph,
          kbId,
        });
        graphBuilt = tripleCount > 0;
        log.info(
          `knowledge: rebuild graph extraction ${graphBuilt ? "succeeded" : "produced no triples"} for doc ${doc.id}`,
        );
      } catch (err) {
        log.warn(`knowledge: failed to re-build graph: ${String(err)}`);
      }
    } else {
      log.info(`knowledge: rebuild skipping graph due to settings`);
    }

    return {
      success: true,
      vectorized,
      graphBuilt,
    };
  }
}

function normalizeTreePath(inputPath: string): string {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    throw new Error("path is required");
  }
  return path.resolve(trimmed);
}

function extractSourcePath(sourceMetadata?: string): string | null {
  if (!sourceMetadata) {
    return null;
  }
  try {
    const parsed = JSON.parse(sourceMetadata) as { sourcePath?: unknown };
    return typeof parsed.sourcePath === "string" ? parsed.sourcePath : null;
  } catch {
    return null;
  }
}

function parseSourceMetadataRecord(sourceMetadata?: string): Record<string, unknown> {
  if (!sourceMetadata) {
    return {};
  }
  try {
    const parsed = JSON.parse(sourceMetadata) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeLocalFilename(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) {
    throw new Error("filename is required");
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error("文件名不能包含路径分隔符");
  }
  if (path.basename(trimmed) !== trimmed) {
    throw new Error("文件名不合法");
  }
  return trimmed;
}

function safeParseSourceConfig(sourceConfig?: string | null): KnowledgeSourceConfig | null {
  if (!sourceConfig) {
    return null;
  }
  try {
    return JSON.parse(sourceConfig) as KnowledgeSourceConfig;
  } catch {
    return null;
  }
}

function isSupportedTreeFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) {
    return false;
  }
  const supported = new Set([
    ".txt",
    ".md",
    ".markdown",
    ".html",
    ".htm",
    ".json",
    ".csv",
    ".pdf",
    ".docx",
    ".doc",
    ".xlsx",
    ".xls",
    ".ppt",
    ".pptx",
    ".pptm",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".mp3",
    ".wav",
    ".m4a",
    ".mp4",
    ".mov",
  ]);
  return supported.has(ext);
}

function inferMimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeByExt: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".html": "text/html",
    ".htm": "text/html",
    ".json": "application/json",
    ".csv": "text/csv",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".pptm": "application/vnd.ms-powerpoint.presentation.macroenabled.12",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
  };
  return mimeByExt[ext] ?? "application/octet-stream";
}

function formatTreePermissions(mode: number): string {
  const masks = [0o400, 0o200, 0o100, 0o040, 0o020, 0o010, 0o004, 0o002, 0o001];
  const symbols = ["r", "w", "x", "r", "w", "x", "r", "w", "x"];
  return masks.map((mask, index) => (mode & mask ? symbols[index] : "-")).join("");
}

function getTreeEntryTypeLabel(extension?: string | null): string {
  if (!extension) {
    return "文件";
  }
  return extension.replace(/^\./, "").toLowerCase();
}

function normalizeTripleOrNull(
  triple: KnowledgeGraphTripleInput,
): KnowledgeGraphTripleInput | null {
  const h = typeof triple.h === "string" ? { name: triple.h } : triple.h;
  const t = typeof triple.t === "string" ? { name: triple.t } : triple.t;
  const r = typeof triple.r === "string" ? { type: triple.r } : triple.r;
  if (!h?.name || !t?.name || !r?.type) {
    return null;
  }
  return { h, r, t };
}

function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return Math.max(1, Math.ceil(text.length / 4));
}

function isVisibility(value: string): value is "private" | "team" | "public" {
  return value === "private" || value === "team" || value === "public";
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function mergeChunkConfig(input: Partial<KnowledgeChunkConfig>): KnowledgeChunkConfig {
  return {
    enabled: input.enabled ?? DEFAULT_CHUNK_CONFIG.enabled,
    size: input.size ?? DEFAULT_CHUNK_CONFIG.size,
    overlap: input.overlap ?? DEFAULT_CHUNK_CONFIG.overlap,
    separator: input.separator ?? DEFAULT_CHUNK_CONFIG.separator,
  };
}

function mergeRetrievalConfig(input: Partial<KnowledgeRetrievalConfig>): KnowledgeRetrievalConfig {
  return {
    mode: input.mode ?? DEFAULT_RETRIEVAL_CONFIG.mode,
    topK: input.topK ?? DEFAULT_RETRIEVAL_CONFIG.topK,
    minScore: input.minScore ?? DEFAULT_RETRIEVAL_CONFIG.minScore,
    hybridAlpha: input.hybridAlpha ?? DEFAULT_RETRIEVAL_CONFIG.hybridAlpha,
  };
}

function mergeIndexConfig(input: Partial<KnowledgeIndexConfig>): KnowledgeIndexConfig {
  return {
    mode: input.mode ?? DEFAULT_INDEX_CONFIG.mode,
  };
}

function mergeBaseGraphConfig(input: Partial<KnowledgeBaseGraphConfig>): KnowledgeBaseGraphConfig {
  return {
    enabled: input.enabled ?? DEFAULT_BASE_GRAPH_CONFIG.enabled,
    minTriples: input.minTriples ?? DEFAULT_BASE_GRAPH_CONFIG.minTriples,
    maxTriples: input.maxTriples ?? DEFAULT_BASE_GRAPH_CONFIG.maxTriples,
    triplesPerKTokens: input.triplesPerKTokens ?? DEFAULT_BASE_GRAPH_CONFIG.triplesPerKTokens,
    maxDepth: input.maxDepth ?? DEFAULT_BASE_GRAPH_CONFIG.maxDepth,
  };
}

function mergeBaseVectorizationConfig(input: Partial<{ enabled: boolean }>): { enabled: boolean } {
  return {
    enabled: input.enabled ?? DEFAULT_BASE_VECTORIZATION_CONFIG.enabled,
  };
}

function validateChunkConfig(chunk: KnowledgeChunkConfig): void {
  if (chunk.size < 200 || chunk.size > 4000) {
    throw new Error("chunk.size must be between 200 and 4000");
  }
  if (chunk.overlap < 0 || chunk.overlap > 1000) {
    throw new Error("chunk.overlap must be between 0 and 1000");
  }
  if (chunk.overlap >= chunk.size) {
    throw new Error("chunk.overlap must be less than chunk.size");
  }
  if (!["auto", "paragraph", "sentence"].includes(chunk.separator)) {
    throw new Error("chunk.separator is invalid");
  }
}

function validateRetrievalConfig(retrieval: KnowledgeRetrievalConfig): void {
  if (!["semantic", "keyword", "hybrid"].includes(retrieval.mode)) {
    throw new Error("retrieval.mode is invalid");
  }
  if (retrieval.topK < 1 || retrieval.topK > 20) {
    throw new Error("retrieval.topK must be between 1 and 20");
  }
  if (retrieval.minScore < 0 || retrieval.minScore > 1) {
    throw new Error("retrieval.minScore must be between 0 and 1");
  }
  if (retrieval.hybridAlpha < 0 || retrieval.hybridAlpha > 1) {
    throw new Error("retrieval.hybridAlpha must be between 0 and 1");
  }
}

function normalizeTagInputs(tags: KnowledgeBaseTagInput[]): KnowledgeBaseTagInput[] {
  const dedup = new Map<string, KnowledgeBaseTagInput>();
  for (const tag of tags) {
    const name = tag.name.trim();
    if (!name) {
      continue;
    }
    dedup.set(name, { name, color: normalizeTagColor(tag.color) ?? DEFAULT_TAG_COLOR });
  }
  return Array.from(dedup.values());
}

function normalizeTagColor(value?: string): string | null {
  if (value === undefined) {
    return null;
  }
  const color = value.trim();
  if (!color) {
    return null;
  }
  const match = color.match(/^#([0-9a-fA-F]{6})$/);
  if (!match) {
    throw new Error("tag color must be in #RRGGBB format");
  }
  return `#${match[1].toLowerCase()}`;
}

type GraphFilter = {
  kbId: string;
  keyword: string;
  extraSqlTriples: string;
  extraSqlJoin: string;
  extraParams: Array<string | number>;
  docFilterSql: string;
  docFilterParams: Array<string>;
};

function buildGraphFilter(params: {
  kbId: string;
  keyword: string;
  documentIds?: string[];
  relation?: string;
  entityPrefix?: string;
  createdAfter?: number;
  createdBefore?: number;
}): GraphFilter {
  const extraTriples: string[] = [];
  const extraJoin: string[] = [];
  const extraParams: Array<string | number> = [];
  if (params.documentIds && params.documentIds.length > 0) {
    const placeholders = params.documentIds.map(() => "?").join(", ");
    extraTriples.push(`document_id IN (${placeholders})`);
    extraJoin.push(`t.document_id IN (${placeholders})`);
    extraParams.push(...params.documentIds);
  }
  if (params.relation) {
    extraTriples.push(`r = ?`);
    extraJoin.push(`t.r = ?`);
    extraParams.push(params.relation);
  }
  if (params.entityPrefix) {
    extraTriples.push(`(h LIKE ? OR t LIKE ?)`);
    extraJoin.push(`(t.h LIKE ? OR t.t LIKE ?)`);
    extraParams.push(`${params.entityPrefix}%`, `${params.entityPrefix}%`);
  }
  if (typeof params.createdAfter === "number") {
    extraTriples.push(`created_at >= ?`);
    extraJoin.push(`t.created_at >= ?`);
    extraParams.push(params.createdAfter);
  }
  if (typeof params.createdBefore === "number") {
    extraTriples.push(`created_at <= ?`);
    extraJoin.push(`t.created_at <= ?`);
    extraParams.push(params.createdBefore);
  }
  const extraSqlTriples = extraTriples.length ? `AND ${extraTriples.join(" AND ")}` : "";
  const extraSqlJoin = extraJoin.length ? `AND ${extraJoin.join(" AND ")}` : "";
  const docFilterSql =
    params.documentIds && params.documentIds.length
      ? `AND f.document_id IN (${params.documentIds.map(() => "?").join(", ")})`
      : "";
  const docFilterParams = params.documentIds ?? [];
  return {
    kbId: params.kbId,
    keyword: params.keyword,
    extraSqlTriples,
    extraSqlJoin,
    extraParams,
    docFilterSql,
    docFilterParams,
  };
}

function scoreTextMatch(triple: { h: string; r: string; t: string }, keyword: string): number {
  const needle = keyword.toLowerCase();
  const text = `${triple.h} ${triple.r} ${triple.t}`.toLowerCase();
  if (text === needle) {
    return 1;
  }
  if (text.includes(needle)) {
    return 0.7;
  }
  return 0.3;
}

function isPreviewOnlyMimeType(mimetype: string): boolean {
  if (mimetype.startsWith("image/")) {
    return true;
  }
  if (mimetype.startsWith("audio/")) {
    return true;
  }
  if (mimetype.startsWith("video/")) {
    return true;
  }
  return (
    mimetype === "text/csv" ||
    mimetype === "application/csv" ||
    mimetype === "application/json" ||
    mimetype === "application/vnd.ms-powerpoint" ||
    mimetype === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mimetype === "application/vnd.openxmlformats-officedocument.presentationml.slideshow" ||
    mimetype === "application/vnd.ms-powerpoint.presentation.macroenabled.12" ||
    mimetype === "application/vnd.ms-excel" ||
    mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimetype === "application/vnd.ms-excel.sheet.macroenabled.12"
  );
}
