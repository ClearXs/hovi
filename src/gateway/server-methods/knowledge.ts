import type { DatabaseSync } from "node:sqlite";
import {
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../../agents/agent-scope.js";
import { readStringParam, readNumberParam } from "../../agents/tools/common.js";
import { loadConfig } from "../../config/config.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { KnowledgeManager } from "../../memory/knowledge-manager.js";
import { requireNodeSqlite } from "../../memory/sqlite.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

const log = createSubsystemLogger("knowledge-ws");

// Shared database instance (与 knowledge-http.ts 共用)
const dbByAgent = new Map<string, DatabaseSync>();

function getDatabase(agentId: string): DatabaseSync {
  const existing = dbByAgent.get(agentId);
  if (existing) {
    return existing;
  }
  const { DatabaseSync: DB } = requireNodeSqlite();
  const cfg = loadConfig();
  const agentDir = resolveAgentDir(cfg, agentId);
  const dbPath = `${agentDir}/memory.db`;
  let db: DB;
  try {
    db = new DB(dbPath);
  } catch (err) {
    log.error(`failed to open knowledge db at ${dbPath}: ${String(err)}`);
    throw err;
  }
  dbByAgent.set(agentId, db);
  return db;
}

function getKnowledgeManager(agentId: string): KnowledgeManager {
  const cfg = loadConfig();
  const db = getDatabase(agentId);
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  return new KnowledgeManager({ cfg, db, baseDir: workspaceDir, agentId });
}

// 类型定义
interface KnowledgeListParams {
  kbId?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  search?: string;
  visibility?: "private" | "team" | "public";
}

interface KnowledgeCreateParams {
  name: string;
  description?: string;
  icon?: string;
  visibility?: "private" | "team" | "public";
  tags?: Array<{ name: string; color?: string }>;
  settings?: Record<string, unknown>;
}

interface KnowledgeUpdateParams {
  kbId: string;
  name?: string;
  description?: string;
  icon?: string;
  visibility?: "private" | "team" | "public";
  tags?: Array<{ name: string; color?: string }>;
}

interface KnowledgeDeleteParams {
  kbId: string;
}

interface KnowledgeGetParams {
  kbId: string;
}

interface KnowledgeDocumentsParams {
  kbId: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

interface KnowledgeDocumentDeleteParams {
  documentId: string;
  kbId?: string;
}

interface KnowledgeDocumentGetParams {
  documentId: string;
  kbId?: string;
}

interface KnowledgeDocumentUpdateParams {
  documentId: string;
  kbId: string;
  filename?: string;
  description?: string;
  tags?: string[];
}

interface KnowledgeChunksParams {
  documentId: string;
  kbId?: string;
  limit?: number;
  offset?: number;
}

interface KnowledgeSearchParams {
  query: string;
  kbId?: string;
  limit?: number;
}

// 辅助函数：解析 agentId
function resolveAgentId(params: Record<string, unknown>, _context: { req?: unknown }): string {
  // 首先尝试从 params 获取
  if (params.agentId && typeof params.agentId === "string" && params.agentId.trim()) {
    return params.agentId.trim();
  }
  // 然后尝试从 header 获取（WebSocket 场景）
  // 最后使用默认 agentId
  const cfg = loadConfig();
  const defaultId = resolveDefaultAgentId(cfg);
  if (!defaultId) {
    throw new Error("无法解析 agentId");
  }
  return defaultId;
}

// 辅助函数：解析知识库列表参数
function parseListParams(params: KnowledgeListParams) {
  const limit = typeof params.limit === "number" && params.limit > 0 ? params.limit : 20;
  const offset = typeof params.offset === "number" && params.offset >= 0 ? params.offset : 0;
  const tags = Array.isArray(params.tags) ? params.tags : undefined;
  const search = typeof params.search === "string" ? params.search : undefined;
  const visibility =
    params.visibility === "private" ||
    params.visibility === "team" ||
    params.visibility === "public"
      ? params.visibility
      : undefined;
  return { limit, offset, tags, search, visibility };
}

// 辅助函数：格式化知识库返回
function formatKnowledgeBase(base: {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  visibility: "private" | "team" | "public";
  created_at: number;
  updated_at: number;
  tags?: Array<{ tagId: string; name: string; color: string | null }>;
  settings?: Record<string, unknown>;
  documentCount?: number;
}) {
  return {
    kbId: base.id,
    name: base.name,
    description: base.description ?? null,
    icon: base.icon ?? null,
    visibility: base.visibility,
    tags: base.tags ?? [],
    settings: base.settings,
    documentCount: base.documentCount ?? 0,
    createdAt: new Date(base.created_at).toISOString(),
    updatedAt: new Date(base.updated_at).toISOString(),
  };
}

// 辅助函数：格式化文档返回
function formatDocument(doc: {
  id: string;
  kb_id?: string | null;
  filename: string;
  mimetype: string;
  size: number;
  uploaded_at: number;
  indexed_at: number | null;
  tags?: string[];
  description?: string | null;
  source_type?: string | null;
}) {
  return {
    id: doc.id,
    kbId: doc.kb_id ?? null,
    filename: doc.filename,
    mimetype: doc.mimetype,
    size: doc.size,
    uploadedAt: new Date(doc.uploaded_at).toISOString(),
    indexed: doc.indexed_at !== null,
    tags: doc.tags ?? [],
    description: doc.description ?? null,
    sourceType: doc.source_type ?? null,
  };
}

// 辅助函数：格式化 chunk 返回
function formatChunk(chunk: {
  id: string;
  index: number;
  text: string;
  tokens?: number | null;
  source_page?: number | null;
  status?: string | null;
  start_line?: number | null;
  end_line?: number | null;
}) {
  return {
    id: chunk.id,
    index: chunk.index,
    content: chunk.text,
    tokens: chunk.tokens ?? null,
    sourcePage: chunk.source_page ?? null,
    status: chunk.status ?? null,
    startLine: chunk.start_line ?? null,
    endLine: chunk.end_line ?? null,
  };
}

// 辅助函数：格式化标签返回
function formatTag(tag: { tagId: string; name: string; color: string | null }) {
  return {
    tagId: tag.tagId,
    name: tag.name,
    color: tag.color,
  };
}

// 知识库 WebSocket 处理器
export const knowledgeHandlers: GatewayRequestHandlers = {
  // 知识库列表
  "knowledge.list": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const { limit, offset, tags, search, visibility } = parseListParams(
        params as KnowledgeListParams,
      );

      const result = manager.listBases({ agentId, tags, limit, offset, search, visibility });

      respond(true, {
        total: result.total,
        returned: result.returned,
        offset: result.offset,
        kbs: result.kbs.map((kb) => formatKnowledgeBase(kb)),
      });
    } catch (err) {
      log.error(`knowledge.list failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `知识库列表加载失败: ${String(err)}`),
      );
    }
  },

  // 知识库创建
  "knowledge.create": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as KnowledgeCreateParams;
      if (!p.name || typeof p.name !== "string" || !p.name.trim()) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "知识库名称不能为空"));
        return;
      }

      const kb = manager.createBase({
        agentId,
        name: p.name.trim(),
        description: p.description,
        icon: p.icon,
        visibility: p.visibility ?? "private",
        tags: p.tags,
        settings: p.settings as Record<string, unknown>,
      });

      respond(true, formatKnowledgeBase(kb));
    } catch (err) {
      log.error(`knowledge.create failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `知识库创建失败: ${String(err)}`),
      );
    }
  },

  // 知识库更新
  "knowledge.update": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as KnowledgeUpdateParams;
      if (!p.kbId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 kbId 参数"));
        return;
      }

      const kb = manager.updateBase({
        agentId,
        kbId: p.kbId,
        name: p.name?.trim(),
        description: p.description,
        icon: p.icon,
        visibility: p.visibility,
        tags: p.tags,
      });

      if (!kb) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "知识库不存在"));
        return;
      }

      respond(true, formatKnowledgeBase(kb));
    } catch (err) {
      log.error(`knowledge.update failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `知识库更新失败: ${String(err)}`),
      );
    }
  },

  // 知识库删除
  "knowledge.delete": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as KnowledgeDeleteParams;
      if (!p.kbId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 kbId 参数"));
        return;
      }

      const result = manager.deleteBase({ agentId, kbId: p.kbId });

      if (!result.success) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "知识库不存在"));
        return;
      }

      respond(true, { success: true });
    } catch (err) {
      log.error(`knowledge.delete failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `知识库删除失败: ${String(err)}`),
      );
    }
  },

  // 知识库详情
  "knowledge.get": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as KnowledgeGetParams;
      if (!p.kbId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 kbId 参数"));
        return;
      }

      const kb = manager.getBase(agentId, p.kbId);

      if (!kb) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "知识库不存在"));
        return;
      }

      respond(true, formatKnowledgeBase(kb));
    } catch (err) {
      log.error(`knowledge.get failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `知识库详情加载失败: ${String(err)}`),
      );
    }
  },

  // 文档列表
  "knowledge.documents": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as KnowledgeDocumentsParams;
      if (!p.kbId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 kbId 参数"));
        return;
      }

      const limit = typeof p.limit === "number" && p.limit > 0 ? p.limit : 20;
      const offset = typeof p.offset === "number" && p.offset >= 0 ? p.offset : 0;
      const tags = Array.isArray(p.tags) ? p.tags : undefined;

      const documents = manager.listDocuments({
        agentId,
        kbId: p.kbId,
        tags,
        limit,
        offset,
      });
      const total = manager.getDocumentCount({ agentId, kbId: p.kbId });

      respond(true, {
        total,
        returned: documents.length,
        offset,
        documents: documents.map(formatDocument),
      });
    } catch (err) {
      log.error(`knowledge.documents failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `文档列表加载失败: ${String(err)}`),
      );
    }
  },

  // 文档上传 (base64 content)
  "knowledge.upload": async ({ params, respond }) => {
    try {
      log.info(
        `knowledge.upload received params: ${JSON.stringify({ ...params, content: params.content?.substring(0, 50) })}`,
      );

      const agentId = resolveAgentId(params, {});
      log.info(`knowledge.upload agentId: ${agentId}`);

      const manager = getKnowledgeManager(agentId);
      log.info(`knowledge.upload manager created`);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as {
        kbId: string;
        filename: string;
        mimeType?: string;
        content: string;
        description?: string;
        tags?: string[];
      };

      log.info(
        `knowledge.upload parsed params: kbId=${p.kbId}, filename=${p.filename}, mimeType=${p.mimeType}, contentLen=${p.content?.length}`,
      );

      if (!p.kbId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 kbId 参数"));
        return;
      }
      if (!p.filename) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 filename 参数"));
        return;
      }
      if (!p.content) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 content 参数"));
        return;
      }

      // Decode base64 content
      let fileBuffer: Buffer;
      try {
        fileBuffer = Buffer.from(p.content, "base64");
      } catch {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "无效的 base64 内容"));
        return;
      }

      // Determine mimetype (ensure it's never undefined)
      const mimeType =
        p.mimeType && p.mimeType.trim() ? p.mimeType.trim() : "application/octet-stream";

      // Upload through manager
      const result = await manager.uploadDocument({
        agentId,
        kbId: p.kbId,
        buffer: fileBuffer,
        filename: p.filename,
        mimetype: mimeType,
        description: p.description,
        tags: p.tags,
        sourceType: "web_api",
      });

      respond(true, {
        documentId: result.documentId,
        filename: result.filename,
        size: result.size,
        indexed: result.indexed,
      });
    } catch (err) {
      const error = err as Error;
      log.error(`knowledge.upload failed: ${error.message}, stack: ${error.stack}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `文档上传失败: ${error.message}`),
      );
    }
  },

  // 文档删除
  "knowledge.documentDelete": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as KnowledgeDocumentDeleteParams;
      if (!p.documentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 documentId 参数"));
        return;
      }

      const result = await manager.deleteDocument({
        documentId: p.documentId,
        agentId,
        kbId: p.kbId,
      });

      if (!result.success) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "文档不存在"));
        return;
      }

      respond(true, { success: true, documentId: p.documentId });
    } catch (err) {
      log.error(`knowledge.documentDelete failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `文档删除失败: ${String(err)}`),
      );
    }
  },

  // 文档详情
  "knowledge.documentGet": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as KnowledgeDocumentGetParams;
      if (!p.documentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 documentId 参数"));
        return;
      }

      const doc = manager.getDocument({
        documentId: p.documentId,
        agentId,
        kbId: p.kbId,
      });

      if (!doc) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "文档不存在"));
        return;
      }

      respond(true, formatDocument(doc));
    } catch (err) {
      log.error(`knowledge.documentGet failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `文档详情加载失败: ${String(err)}`),
      );
    }
  },

  // 文档元数据更新
  "knowledge.documentUpdate": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as KnowledgeDocumentUpdateParams;
      if (!p.documentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 documentId 参数"));
        return;
      }
      if (!p.kbId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 kbId 参数"));
        return;
      }

      const doc = manager.updateDocumentMetadata({
        documentId: p.documentId,
        agentId,
        kbId: p.kbId,
        filename: p.filename,
        description: p.description,
        tags: p.tags,
      });

      respond(true, formatDocument(doc));
    } catch (err) {
      log.error(`knowledge.documentUpdate failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `文档更新失败: ${String(err)}`),
      );
    }
  },

  // 文档内容更新
  "knowledge.documentContentUpdate": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as { documentId: string; kbId?: string; content: string };
      if (!p.documentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 documentId 参数"));
        return;
      }
      if (!p.kbId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 kbId 参数"));
        return;
      }
      if (typeof p.content !== "string") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 content 参数"));
        return;
      }

      const result = await manager.updateDocumentContent({
        documentId: p.documentId,
        agentId,
        kbId: p.kbId,
        content: p.content,
      });

      respond(true, result);
    } catch (err) {
      log.error(`knowledge.documentContentUpdate failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `文档内容更新失败: ${String(err)}`),
      );
    }
  },

  // 分块列表
  "knowledge.chunks": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as KnowledgeChunksParams;
      if (!p.documentId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 documentId 参数"));
        return;
      }

      const limit = typeof p.limit === "number" && p.limit > 0 ? p.limit : 50;
      const offset = typeof p.offset === "number" && p.offset >= 0 ? p.offset : 0;

      const payload = await manager.listChunks({
        agentId,
        documentId: p.documentId,
        kbId: p.kbId,
        limit,
        offset,
      });

      respond(true, {
        total: payload.total,
        returned: payload.returned,
        offset: payload.offset,
        chunks: payload.chunks.map(formatChunk),
      });
    } catch (err) {
      log.error(`knowledge.chunks failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `分块列表加载失败: ${String(err)}`),
      );
    }
  },

  // 检索
  "knowledge.search": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as KnowledgeSearchParams;
      if (!p.query || typeof p.query !== "string" || !p.query.trim()) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 query 参数"));
        return;
      }

      const query = p.query.trim();
      const kbId = typeof p.kbId === "string" ? p.kbId : undefined;
      const limit = typeof p.limit === "number" && p.limit > 0 ? p.limit : 5;

      // Get base settings for retrieval config
      const baseSettings = kbId
        ? manager.getBaseSettings({ agentId, kbId })
        : {
            retrieval: { mode: "hybrid" as const, topK: 5, minScore: 0.35, hybridAlpha: 0.5 },
          };

      const maxResults = Math.max(1, Math.min(limit, baseSettings.retrieval.topK));

      // Use MemoryIndexManager for search
      const { MemoryIndexManager } = await import("../../memory/manager.js");
      const memoryManager = await MemoryIndexManager.get({
        cfg: loadConfig(),
        agentId,
      });

      if (!memoryManager) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "内存索引未配置"));
        return;
      }

      const rawResults = await memoryManager.search(query, {
        maxResults: Math.max(maxResults, baseSettings.retrieval.topK),
        minScore: 0,
      });

      // Filter and format results
      const formattedResults = rawResults
        .filter((result) => result.source === "knowledge")
        .map((result) => {
          const documentId = result.path.replace(/^knowledge\//, "");
          const doc = manager.getDocument({ documentId, agentId });
          if (kbId && doc?.kb_id !== kbId) {
            return null;
          }
          return {
            documentId,
            kbId: doc?.kb_id ?? null,
            filename: doc?.filename ?? documentId,
            chunkId: result.id,
            snippet: result.snippet,
            score: result.score,
            lines: `${result.startLine}-${result.endLine}`,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

      respond(true, {
        query,
        resultsCount: formattedResults.length,
        results: formattedResults,
      });
    } catch (err) {
      log.error(`knowledge.search failed: ${String(err)}`);
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `检索失败: ${String(err)}`));
    }
  },

  // ========== 标签管理 ==========

  // 标签列表
  "knowledge.tags.list": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const tags = manager.listTags(agentId);

      respond(true, { tags });
    } catch (err) {
      log.error(`knowledge.tags.list failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `标签列表加载失败: ${String(err)}`),
      );
    }
  },

  // 创建标签
  "knowledge.tags.create": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as { name: string; color?: string };
      if (!p.name || typeof p.name !== "string" || !p.name.trim()) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "标签名称不能为空"));
        return;
      }

      const tag = manager.createTag({
        agentId,
        name: p.name.trim(),
        color: p.color,
      });

      respond(true, formatTag(tag));
    } catch (err) {
      log.error(`knowledge.tags.create failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `标签创建失败: ${String(err)}`),
      );
    }
  },

  // 更新标签
  "knowledge.tags.update": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as { tagId: string; name?: string; color?: string };
      if (!p.tagId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 tagId 参数"));
        return;
      }

      const tag = manager.updateTag({
        agentId,
        tagId: p.tagId,
        name: p.name?.trim(),
        color: p.color,
      });

      respond(true, formatTag(tag));
    } catch (err) {
      log.error(`knowledge.tags.update failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `标签更新失败: ${String(err)}`),
      );
    }
  },

  // 删除标签
  "knowledge.tags.delete": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as { tagId: string };
      if (!p.tagId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 tagId 参数"));
        return;
      }

      const result = manager.deleteTag({
        agentId,
        tagId: p.tagId,
      });

      respond(true, result);
    } catch (err) {
      log.error(`knowledge.tags.delete failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `标签删除失败: ${String(err)}`),
      );
    }
  },

  // ========== 设置管理 ==========

  // 获取设置
  "knowledge.settings.get": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as { kbId?: string };

      // If kbId is provided, return base-level settings for that knowledge base
      if (p.kbId) {
        const baseSettings = manager.getBaseSettings({ agentId, kbId: p.kbId });
        respond(true, { kbId: p.kbId, settings: baseSettings });
      } else {
        // Otherwise return agent-level settings
        const settings = manager.getSettings(agentId);
        respond(true, settings);
      }
    } catch (err) {
      log.error(`knowledge.settings.get failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `设置加载失败: ${String(err)}`),
      );
    }
  },

  // 更新设置
  "knowledge.settings.update": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as { kbId?: string; settings: Record<string, unknown> };
      if (!p.settings || typeof p.settings !== "object") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 settings 参数"));
        return;
      }

      log.info(
        `knowledge.settings.update received: ${JSON.stringify({ agentId, kbId: p.kbId, settings: p.settings })}`,
      );

      // If kbId is provided, update both base-level and agent-level settings
      if (p.kbId) {
        const settings = p.settings;

        // Extract base-level settings (graph.enabled and vectorization.enabled)
        const baseSettingsPart: Record<string, unknown> = {};
        if (settings.graph && typeof settings.graph === "object") {
          const graphSettings = settings.graph as Record<string, unknown>;
          if (graphSettings.enabled !== undefined) {
            baseSettingsPart.graph = { enabled: graphSettings.enabled as boolean };
          }
        }
        if (settings.vectorization && typeof settings.vectorization === "object") {
          const vectorizationSettings = settings.vectorization as Record<string, unknown>;
          if (vectorizationSettings.enabled !== undefined) {
            baseSettingsPart.vectorization = { enabled: vectorizationSettings.enabled as boolean };
          }
        }

        log.info(`knowledge.settings.update baseSettingsPart: ${JSON.stringify(baseSettingsPart)}`);

        // Update base settings if any base-level setting is present
        if (Object.keys(baseSettingsPart).length > 0) {
          manager.updateBaseSettings({
            agentId,
            kbId: p.kbId,
            settings: baseSettingsPart as Parameters<
              typeof manager.updateBaseSettings
            >[0]["settings"],
          });
          log.info(`knowledge.settings.update base settings updated for kb ${p.kbId}`);
        }

        // Always update agent-level settings
        const agentSettings = manager.updateSettings(agentId, p.settings);
        respond(true, { kbId: p.kbId, settings: agentSettings });
      } else {
        // Otherwise update agent-level settings only
        const settings = manager.updateSettings(agentId, p.settings);
        respond(true, settings);
      }
    } catch (err) {
      log.error(`knowledge.settings.update failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `设置更新失败: ${String(err)}`),
      );
    }
  },

  // ============================================================
  // Knowledge Graph Methods (Enhanced)
  // ============================================================

  // 图谱构建
  "knowledge.graph.build": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as { kbId: string; documentId: string };
      if (!p.kbId || !p.documentId) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "缺少 kbId 或 documentId 参数"),
        );
        return;
      }

      const result = manager.buildKnowledgeGraph({
        agentId,
        kbId: p.kbId,
        documentId: p.documentId,
      });

      respond(true, result);
    } catch (err) {
      log.error(`knowledge.graph.build failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `图谱构建失败: ${String(err)}`),
      );
    }
  },

  // 批量构建知识图谱（构建KB中所有文档）
  "knowledge.graph.buildAll": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const kbId = readStringParam(params, "kbId", { required: true });
      if (!kbId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 kbId 参数"));
        return;
      }

      const result = manager.buildAllKnowledgeGraphs({
        agentId,
        kbId,
      });

      respond(true, result);
    } catch (err) {
      log.error(`knowledge.graph.buildAll failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `批量图谱构建失败: ${String(err)}`),
      );
    }
  },

  // 图谱构建状态
  "knowledge.graph.status": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as { taskId: string };
      if (!p.taskId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 taskId 参数"));
        return;
      }

      const task = manager.getGraphBuildStatus({ taskId: p.taskId });

      if (!task) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "任务不存在"));
        return;
      }

      respond(true, task);
    } catch (err) {
      log.error(`knowledge.graph.status failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `获取状态失败: ${String(err)}`),
      );
    }
  },

  // 图谱统计
  "knowledge.graph.stats": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as { kbId: string };
      if (!p.kbId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 kbId 参数"));
        return;
      }

      const stats = manager.getKnowledgeGraphStats({ agentId, kbId: p.kbId });

      respond(true, stats);
    } catch (err) {
      log.error(`knowledge.graph.stats failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `获取统计失败: ${String(err)}`),
      );
    }
  },

  // 图谱搜索
  "knowledge.graph.search": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as {
        kbId?: string;
        query: string;
        mode?: "local" | "global" | "hybrid" | "naive";
        topK?: number;
      };

      if (!p.query) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 query 参数"));
        return;
      }

      const resolvedKbId = p.kbId ?? manager.getBase(agentId)?.id;

      if (!resolvedKbId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "未指定知识库"));
        return;
      }

      const result = await manager.searchKnowledgeGraph({
        agentId,
        kbId: resolvedKbId,
        query: p.query,
        mode: p.mode || "hybrid",
        topK: p.topK || 10,
      });

      respond(true, result);
    } catch (err) {
      log.error(`knowledge.graph.search failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `图谱搜索失败: ${String(err)}`),
      );
    }
  },

  // 清空图谱
  "knowledge.graph.clear": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "知识库功能未启用"));
        return;
      }

      const p = params as { kbId: string };
      if (!p.kbId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 kbId 参数"));
        return;
      }

      manager.clearGraph({ agentId, kbId: p.kbId });

      respond(true, { success: true });
    } catch (err) {
      log.error(`knowledge.graph.clear failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `清空图谱失败: ${String(err)}`),
      );
    }
  },

  /**
   * Get graph data for visualization
   */
  "knowledge.graph.data": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const kbId = readStringParam(params, "kbId", { required: true });
      const limit = readNumberParam(params, "limit", { integer: true }) || 500;

      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.KB_NOT_ENABLED, "知识库未启用"));
        return;
      }

      const graphData = manager.getKnowledgeGraphData({
        agentId,
        kbId,
        limit,
      });

      respond(true, graphData);
    } catch (err) {
      log.error(`knowledge.graph.data failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `获取图谱数据失败: ${String(err)}`),
      );
    }
  },

  /**
   * Get entity details with related document chunks
   */
  "knowledge.graph.entityDetails": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const kbId = readStringParam(params, "kbId", { required: true });
      const entityId = readStringParam(params, "entityId", { required: true });

      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.KB_NOT_ENABLED, "知识库未启用"));
        return;
      }

      const details = manager.getEntityDetails({
        agentId,
        kbId,
        entityId,
      });

      respond(true, details);
    } catch (err) {
      log.error(`knowledge.graph.entityDetails failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `获取实体详情失败: ${String(err)}`),
      );
    }
  },

  /**
   * Rebuild document: re-vectorize and re-build graph
   */
  "knowledge.rebuild": async ({ params, respond }) => {
    try {
      const agentId = resolveAgentId(params, {});
      const kbId = readStringParam(params, "kbId", { required: true });
      const documentId = readStringParam(params, "documentId", { required: true });

      const manager = getKnowledgeManager(agentId);

      if (!manager.isEnabled(agentId)) {
        respond(false, undefined, errorShape(ErrorCodes.KB_NOT_ENABLED, "知识库未启用"));
        return;
      }

      const result = await manager.rebuildDocument({
        agentId,
        kbId,
        documentId,
      });

      respond(true, result);
    } catch (err) {
      log.error(`knowledge.rebuild failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `重建文档失败: ${String(err)}`),
      );
    }
  },
};
