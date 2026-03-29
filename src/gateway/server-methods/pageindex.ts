/**
 * PageIndex RPC 处理器
 *
 * 提供 PageIndex 相关的 RPC 接口
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../../agents/agent-scope.js";
import { loadConfig } from "../../config/config.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { KnowledgeManager } from "../../memory/knowledge-manager.js";
import { isPandocAvailable } from "../../memory/pageindex/converter.js";
import {
  bindSessionDocuments,
  buildIndex,
  search,
  getSessionMeta,
} from "../../memory/pageindex/index.js";
import { requireNodeSqlite } from "../../memory/sqlite.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

const log = createSubsystemLogger("pageindex-ws");
const PREVIEW_UPLOAD_SESSION_KEY_PREFIX = "__preview_upload__";

// Shared database instance
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
  let db: InstanceType<typeof DB>;
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
interface PageIndexUploadParams {
  sessionKey: string;
  filename: string;
  mimeType: string;
  content: string; // Base64 编码的文件内容
}

interface PageIndexSearchParams {
  sessionKey: string;
  query: string;
  limit?: number;
}

interface PageIndexBindParams {
  sourceSessionKey: string;
  targetSessionKey: string;
}

// 工具函数：Base64 解码
function base64ToBuffer(base64: string): Buffer {
  // 移除 data URL 前缀
  const base64Data = base64.replace(/^data:[^;]+;base64,/, "");
  return Buffer.from(base64Data, "base64");
}

// 获取 workspace 目录
function getWorkspaceDir(agentId: string): string {
  const cfg = loadConfig();
  return resolveAgentWorkspaceDir(cfg, agentId);
}

function shouldDeferKnowledgeRebuild(mimeType: string, ext: string): boolean {
  if (
    mimeType === "application/pdf" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "text/csv" ||
    mimeType === "application/csv" ||
    mimeType === "application/json" ||
    mimeType === "application/ld+json" ||
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    mimeType === "text/html"
  ) {
    return true;
  }
  return [
    ".pdf",
    ".docx",
    ".doc",
    ".xlsx",
    ".xls",
    ".csv",
    ".json",
    ".txt",
    ".md",
    ".markdown",
    ".html",
    ".htm",
  ].includes(ext);
}

function parseExistingDocumentIdFromError(err: unknown): string | undefined {
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/^Document with same content already exists:\s*(.+)$/i);
  const documentId = match?.[1]?.trim();
  return documentId && documentId.length > 0 ? documentId : undefined;
}

// PageIndex RPC 处理器
export const pageIndexHandlers: GatewayRequestHandlers = {
  // 上传文档并构建 PageIndex
  "pageindex.document.upload": async ({ params, respond }) => {
    try {
      const agentId = resolveDefaultAgentId(params);
      const p = params as unknown as PageIndexUploadParams;

      if (!p.sessionKey || !p.filename || !p.content) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少必要参数"));
        return;
      }

      log.info(`Uploading document: ${p.filename} for session: ${p.sessionKey}`);

      // 1. 解析文件内容
      const buffer = base64ToBuffer(p.content);
      const ext = path.extname(p.filename).toLowerCase();

      // 2. 保存文件到临时目录
      const workspaceDir = getWorkspaceDir(agentId);
      const tempDir = path.join(workspaceDir, "sessions", p.sessionKey, ".pageindex", "temp");
      await fs.mkdir(tempDir, { recursive: true });
      const tempFilePath = path.join(tempDir, p.filename);
      await fs.writeFile(tempFilePath, buffer);

      const shouldBuildPageIndex = ext === ".pdf";

      // 4. 获取或创建默认知识库
      const manager = getKnowledgeManager(agentId);
      let defaultKbId: string | undefined;

      // 查找默认知识库
      const bases = manager.listBases({ agentId });
      const defaultKb = bases.kbs.find(
        (kb) => kb.name === "默认知识库" || kb.name === "Default Knowledge",
      );

      if (defaultKb) {
        defaultKbId = defaultKb.id;
      } else {
        // 创建默认知识库
        const newKb = manager.createBase({
          agentId,
          name: "默认知识库",
          description: "自动创建的系统默认知识库",
          visibility: "private",
        });
        defaultKbId = newKb.id;
        log.info(`Created default knowledge base: ${defaultKbId}`);
      }

      // 5. 存入默认知识库
      const kbId = defaultKbId;
      const documentId = `pageindex_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      let knowledgeDocumentId: string | undefined;
      let kbUploadErrorMessage: string | undefined;

      try {
        // 使用知识库管理器上传文档
        const uploadResult = await manager.uploadDocument({
          agentId,
          kbId,
          buffer,
          filename: p.filename,
          mimetype: p.mimeType || "application/octet-stream",
          sourceType: "chat_attachment",
          processingMode: "store_only",
        });

        knowledgeDocumentId = uploadResult.documentId;
        log.info(`Document uploaded to knowledge base: ${uploadResult.documentId}`);

        // Keep preview upload fast while preserving eventual indexing/graph extraction.
        if (kbId && shouldDeferKnowledgeRebuild(p.mimeType || "", ext)) {
          void manager
            .rebuildDocument({
              agentId,
              kbId,
              documentId: uploadResult.documentId,
            })
            .then((rebuild) => {
              log.info(
                `Deferred rebuild completed for ${uploadResult.documentId}: vectorized=${rebuild.vectorized}, graphBuilt=${rebuild.graphBuilt}`,
              );
            })
            .catch((rebuildErr) => {
              log.warn(
                `Deferred rebuild failed for ${uploadResult.documentId}: ${String(rebuildErr)}`,
              );
            });
        }
      } catch (kbError) {
        const existingDocId = parseExistingDocumentIdFromError(kbError);
        if (existingDocId) {
          knowledgeDocumentId = existingDocId;
          log.info(`Reusing existing knowledge document for duplicate upload: ${existingDocId}`);
        } else {
          kbUploadErrorMessage = kbError instanceof Error ? kbError.message : String(kbError);
          log.error(`Failed to upload to knowledge base: ${String(kbError)}`);
        }
        // 知识库上传失败不影响 PageIndex 构建
      }

      // 6. 构建 PageIndex（仅对 PDF）
      let pageIndexBuilt = false;
      let indexPath: string | undefined;
      if (shouldBuildPageIndex) {
        const buildResult = await buildIndex({
          filePath: tempFilePath,
          sessionKey: p.sessionKey,
          documentId,
          agentId,
        });

        if (buildResult.success) {
          pageIndexBuilt = true;
          indexPath = buildResult.indexPath;
          log.info(`PageIndex built successfully for ${p.filename}`);
        } else {
          log.warn(`PageIndex build failed: ${buildResult.error}`);
        }
      }

      // 7. 保存文档到 session meta（所有文件类型）
      try {
        const { updateSessionMeta } = await import("../../memory/pageindex/index.js");
        await updateSessionMeta(
          p.sessionKey,
          documentId,
          p.filename,
          indexPath,
          {
            knowledgeDocumentId,
            kbId,
            mimeType: p.mimeType || "application/octet-stream",
          },
          agentId,
        );
        log.info(`Document meta saved for ${p.filename}`);
      } catch (metaError) {
        log.warn(`Failed to save document meta: ${String(metaError)}`);
      }

      // 8. 清理临时文件
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // 忽略删除错误
      }

      respond(true, {
        success: true,
        documentId,
        knowledgeDocumentId,
        kbId,
        indexed: true, // 存入知识库
        pageIndexBuilt,
        message: knowledgeDocumentId
          ? pageIndexBuilt
            ? "文档上传成功，PageIndex 已构建"
            : shouldBuildPageIndex
              ? "文档已存入知识库，PageIndex 构建失败"
              : "文档已存入知识库，可直接预览"
          : kbUploadErrorMessage || "文档上传成功，但未返回可预览文档 ID。",
      });
    } catch (err) {
      log.error(`pageindex.document.upload failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `文档上传失败: ${String(err)}`),
      );
    }
  },

  // 搜索 PageIndex
  "pageindex.search": async ({ params, respond }) => {
    try {
      const agentId = resolveDefaultAgentId(params);
      const p = params as unknown as PageIndexSearchParams;

      if (!p.sessionKey || !p.query) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少必要参数"));
        return;
      }

      const workspaceDir = getWorkspaceDir(agentId);
      const meta = await getSessionMeta(p.sessionKey, agentId);

      if (!meta || meta.documents.length === 0) {
        respond(true, { results: [] });
        return;
      }

      const results = [];
      const limit = p.limit ?? 5;

      for (const doc of meta.documents) {
        const indexPath = path.join(
          workspaceDir,
          "sessions",
          p.sessionKey,
          ".pageindex",
          "indices",
          doc.documentId,
          "index.json",
        );

        const docResults = await search({
          indexPath,
          query: p.query,
          limit: Math.ceil(limit / meta.documents.length),
        });

        results.push(
          ...docResults.map((r) => ({
            ...r,
            documentId: doc.documentId,
          })),
        );
      }

      // 按分数排序并限制数量
      results.sort((a, b) => b.score - a.score);
      const finalResults = results.slice(0, limit);

      respond(true, { results: finalResults });
    } catch (err) {
      log.error(`pageindex.search failed: ${String(err)}`);
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `搜索失败: ${String(err)}`));
    }
  },

  // 获取 Session 文档列表
  "pageindex.document.list": async ({ params, respond }) => {
    try {
      const agentId = resolveDefaultAgentId(params);
      const sessionKey = params.sessionKey as string;

      if (!sessionKey) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "缺少 sessionKey"));
        return;
      }

      const meta = await getSessionMeta(sessionKey, agentId);

      if (!meta) {
        respond(true, { documents: [] });
        return;
      }

      respond(true, {
        documents: meta.documents.map((doc) => ({
          id: doc.documentId,
          knowledgeDocumentId: doc.knowledgeDocumentId,
          kbId: doc.kbId,
          filename: doc.filename,
          mimeType: doc.mimeType,
          uploadedAt: new Date(doc.builtAt).toISOString(),
          pageIndexReady: true,
        })),
      });
    } catch (err) {
      log.error(`pageindex.document.list failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `获取文档列表失败: ${String(err)}`),
      );
    }
  },

  "pageindex.document.bind": async ({ params, respond }) => {
    try {
      const agentId = resolveDefaultAgentId(params);
      const p = params as unknown as PageIndexBindParams;
      if (!p.sourceSessionKey || !p.targetSessionKey) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "缺少 sourceSessionKey 或 targetSessionKey"),
        );
        return;
      }
      if (!p.sourceSessionKey.startsWith(PREVIEW_UPLOAD_SESSION_KEY_PREFIX)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "sourceSessionKey 必须是预上传会话 key"),
        );
        return;
      }
      const result = await bindSessionDocuments({
        sourceSessionKey: p.sourceSessionKey,
        targetSessionKey: p.targetSessionKey,
        agentId,
      });
      respond(true, {
        success: true,
        ...result,
      });
    } catch (err) {
      log.error(`pageindex.document.bind failed: ${String(err)}`);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `绑定会话文档失败: ${String(err)}`),
      );
    }
  },

  // 检查 Pandoc 是否可用
  "pageindex.check": async ({ respond }) => {
    try {
      const available = await isPandocAvailable();
      respond(true, {
        pandocAvailable: available,
        openaiApiKey: !!process.env.OPENAI_API_KEY,
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },
};
