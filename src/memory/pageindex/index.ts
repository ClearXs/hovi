/**
 * PageIndex 主入口
 *
 * 整合所有模块，提供统一的 API
 */

import fs from "node:fs/promises";
import path from "node:path";
import { resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import { loadConfig } from "../../config/config.js";
import { parsePDF } from "./pdf.js";
import { searchPageIndex } from "./search.js";
import { generateTOCFromText } from "./toc.js";
import { buildTree, processLargeNodes } from "./tree.js";
import type {
  PageIndexTree,
  PageIndexSearchResult,
  BuildIndexParams,
  BuildIndexResult,
  SearchParams,
  SessionPageIndexMeta,
  SessionDocumentMeta,
} from "./types.js";

/**
 * 构建 PageIndex 索引
 *
 * @param params 构建参数
 * @returns 构建结果
 */
export async function buildIndex(params: BuildIndexParams): Promise<BuildIndexResult> {
  const { filePath, sessionKey, documentId, agentId } = params;

  try {
    // 1. 解析 PDF
    console.log(`[PageIndex] Parsing PDF: ${filePath}`);
    const parseResult = await parsePDF(filePath);

    // 2. 检测 TOC
    let tocItems = parseResult.toc || [];

    if (tocItems.length === 0) {
      // 没有目录，尝试从文本生成
      console.log(`[PageIndex] No TOC found, generating from text...`);
      const generated = await generateTOCFromText(parseResult.text);
      tocItems = generated.items;
    }

    // 3. 构建树结构
    console.log(`[PageIndex] Building tree structure...`);
    const tree = buildTree(tocItems);

    // 4. 处理大节点
    const processedTree = processLargeNodes(tree, 10);

    // 5. 生成节点摘要（可选）
    // 简化实现：跳过摘要生成，直接保存

    // 6. 构建索引对象
    const pageIndexTree: PageIndexTree = {
      docName: path.basename(filePath),
      structure: processedTree,
    };

    // 7. 保存到文件
    const outputPath = await saveIndex(pageIndexTree, sessionKey, documentId, agentId);

    // 8. 更新元数据
    await updateSessionMeta(
      sessionKey,
      documentId,
      path.basename(filePath),
      outputPath,
      undefined,
      agentId,
    );

    return {
      success: true,
      documentId,
      indexPath: outputPath,
    };
  } catch (error) {
    console.error(`[PageIndex] Build failed:`, error);
    return {
      success: false,
      documentId,
      error: String(error),
    };
  }
}

/**
 * 搜索索引
 *
 * @param params 搜索参数
 * @returns 搜索结果
 */
export async function search(params: SearchParams): Promise<PageIndexSearchResult[]> {
  const { indexPath, query, limit = 5 } = params;

  try {
    // 1. 加载索引
    const tree = await loadIndex(indexPath);

    if (!tree) {
      console.error(`[PageIndex] Index not found: ${indexPath}`);
      return [];
    }

    // 2. 执行搜索
    const results = await searchPageIndex(tree, query, limit);

    return results;
  } catch (error) {
    console.error(`[PageIndex] Search failed:`, error);
    return [];
  }
}

/**
 * 保存索引到文件
 */
async function saveIndex(
  tree: PageIndexTree,
  sessionKey: string,
  documentId: string,
  agentId: string,
): Promise<string> {
  // 使用正确的方式获取 workspace 目录
  const cfg = loadConfig();
  const baseDir = resolveAgentWorkspaceDir(cfg, agentId);
  const indexDir = path.join(baseDir, "sessions", sessionKey, ".pageindex", "indices", documentId);

  await fs.mkdir(indexDir, { recursive: true });

  const indexPath = path.join(indexDir, "index.json");
  await fs.writeFile(indexPath, JSON.stringify(tree, null, 2), "utf-8");

  return indexPath;
}

/**
 * 加载索引文件
 */
async function loadIndex(indexPath: string): Promise<PageIndexTree | null> {
  try {
    const content = await fs.readFile(indexPath, "utf-8");
    return JSON.parse(content) as PageIndexTree;
  } catch {
    return null;
  }
}

/**
 * 更新 Session PageIndex 元数据
 */
export async function updateSessionMeta(
  sessionKey: string,
  documentId: string,
  filename: string,
  indexPath: string | undefined,
  options?: {
    knowledgeDocumentId?: string;
    kbId?: string;
    mimeType?: string;
  },
  agentId: string = "default",
): Promise<void> {
  const cfg = loadConfig();
  const baseDir = resolveAgentWorkspaceDir(cfg, agentId);
  const metaPath = path.join(baseDir, "sessions", sessionKey, ".pageindex", "meta.json");

  // 根据文件扩展名推断 mimeType
  const ext = filename.toLowerCase().split(".").pop();
  const mimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    csv: "text/csv",
    json: "application/json",
    txt: "text/plain",
    md: "text/markdown",
    markdown: "text/markdown",
  };
  const inferredMimeType = ext
    ? mimeTypes[ext] || "application/octet-stream"
    : "application/octet-stream";

  let meta: SessionPageIndexMeta;

  try {
    const content = await fs.readFile(metaPath, "utf-8");
    meta = JSON.parse(content);
  } catch {
    // 文件不存在，创建新的
    meta = {
      sessionKey,
      documents: [],
      updatedAt: Date.now(),
    };
  }

  // 更新或添加文档
  let existingIndex = meta.documents.findIndex((d) => d.documentId === documentId);
  if (existingIndex < 0 && options?.knowledgeDocumentId) {
    existingIndex = meta.documents.findIndex(
      (d) => d.knowledgeDocumentId && d.knowledgeDocumentId === options.knowledgeDocumentId,
    );
  }
  const existingDoc = existingIndex >= 0 ? meta.documents[existingIndex] : undefined;
  const effectiveDocumentId = existingDoc?.documentId ?? documentId;
  const docMeta = {
    documentId: effectiveDocumentId,
    knowledgeDocumentId: options?.knowledgeDocumentId ?? existingDoc?.knowledgeDocumentId,
    kbId: options?.kbId ?? existingDoc?.kbId,
    filename,
    mimeType: options?.mimeType ?? existingDoc?.mimeType ?? inferredMimeType,
    indexPath: indexPath ?? existingDoc?.indexPath ?? null,
    builtAt: Date.now(),
  };

  if (existingIndex >= 0) {
    meta.documents[existingIndex] = docMeta;
  } else {
    meta.documents.push(docMeta);
  }

  meta.updatedAt = Date.now();

  // 保存
  const metaDir = path.dirname(metaPath);
  await fs.mkdir(metaDir, { recursive: true });
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
}

export function mergeSessionDocumentsForBind(params: {
  sourceDocuments: SessionDocumentMeta[];
  targetDocuments: SessionDocumentMeta[];
}): {
  documents: SessionDocumentMeta[];
  moved: SessionDocumentMeta[];
  skipped: SessionDocumentMeta[];
} {
  const nextDocuments = [...params.targetDocuments];
  const moved: SessionDocumentMeta[] = [];
  const skipped: SessionDocumentMeta[] = [];
  const identitySet = new Set<string>();
  for (const doc of params.targetDocuments) {
    identitySet.add(`doc:${doc.documentId}`);
    if (doc.knowledgeDocumentId) {
      identitySet.add(`kdoc:${doc.knowledgeDocumentId}`);
    }
  }

  for (const doc of params.sourceDocuments) {
    const docIdentity = `doc:${doc.documentId}`;
    const knowledgeIdentity = doc.knowledgeDocumentId ? `kdoc:${doc.knowledgeDocumentId}` : null;
    if (
      identitySet.has(docIdentity) ||
      (knowledgeIdentity !== null && identitySet.has(knowledgeIdentity))
    ) {
      skipped.push(doc);
      continue;
    }
    nextDocuments.push(doc);
    moved.push(doc);
    identitySet.add(docIdentity);
    if (knowledgeIdentity) {
      identitySet.add(knowledgeIdentity);
    }
  }

  return {
    documents: nextDocuments,
    moved,
    skipped,
  };
}

async function moveDocumentIndexForSessionBind(params: {
  baseDir: string;
  sourceSessionKey: string;
  targetSessionKey: string;
  documentId: string;
}): Promise<void> {
  const sourceDir = path.join(
    params.baseDir,
    "sessions",
    params.sourceSessionKey,
    ".pageindex",
    "indices",
    params.documentId,
  );
  const targetDir = path.join(
    params.baseDir,
    "sessions",
    params.targetSessionKey,
    ".pageindex",
    "indices",
    params.documentId,
  );
  try {
    await fs.access(sourceDir);
  } catch {
    return;
  }
  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  try {
    await fs.rename(sourceDir, targetDir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code !== "EXDEV") {
      throw err;
    }
    await fs.cp(sourceDir, targetDir, { recursive: true });
    await fs.rm(sourceDir, { recursive: true, force: true });
  }
}

export async function bindSessionDocuments(params: {
  sourceSessionKey: string;
  targetSessionKey: string;
  agentId?: string;
}): Promise<{ moved: number; skipped: number; totalSource: number }> {
  const sourceSessionKey = params.sourceSessionKey.trim();
  const targetSessionKey = params.targetSessionKey.trim();
  if (!sourceSessionKey || !targetSessionKey || sourceSessionKey === targetSessionKey) {
    return { moved: 0, skipped: 0, totalSource: 0 };
  }

  const cfg = loadConfig();
  const resolvedAgentId = params.agentId ?? "default";
  const baseDir = resolveAgentWorkspaceDir(cfg, resolvedAgentId);
  const sourceMeta = await getSessionMeta(sourceSessionKey, resolvedAgentId);
  if (!sourceMeta || sourceMeta.documents.length === 0) {
    return { moved: 0, skipped: 0, totalSource: 0 };
  }
  const targetMeta =
    (await getSessionMeta(targetSessionKey, resolvedAgentId)) ??
    ({
      sessionKey: targetSessionKey,
      documents: [],
      updatedAt: Date.now(),
    } as SessionPageIndexMeta);

  const merged = mergeSessionDocumentsForBind({
    sourceDocuments: sourceMeta.documents,
    targetDocuments: targetMeta.documents,
  });

  for (const doc of merged.moved) {
    await moveDocumentIndexForSessionBind({
      baseDir,
      sourceSessionKey,
      targetSessionKey,
      documentId: doc.documentId,
    });
  }

  const now = Date.now();
  const normalizedDocs = merged.documents.map((doc) => {
    if (!doc.indexPath) {
      return doc;
    }
    return {
      ...doc,
      indexPath: path.join(
        baseDir,
        "sessions",
        targetSessionKey,
        ".pageindex",
        "indices",
        doc.documentId,
        "index.json",
      ),
    };
  });
  const targetMetaPath = path.join(
    baseDir,
    "sessions",
    targetSessionKey,
    ".pageindex",
    "meta.json",
  );
  await fs.mkdir(path.dirname(targetMetaPath), { recursive: true });
  await fs.writeFile(
    targetMetaPath,
    JSON.stringify(
      {
        sessionKey: targetSessionKey,
        documents: normalizedDocs,
        updatedAt: now,
      } satisfies SessionPageIndexMeta,
      null,
      2,
    ),
    "utf-8",
  );

  const sourcePageIndexDir = path.join(baseDir, "sessions", sourceSessionKey, ".pageindex");
  await fs.rm(sourcePageIndexDir, { recursive: true, force: true });

  return {
    moved: merged.moved.length,
    skipped: merged.skipped.length,
    totalSource: sourceMeta.documents.length,
  };
}

/**
 * 获取 Session 的 PageIndex 元数据
 */
export async function getSessionMeta(
  sessionKey: string,
  agentId: string = "default",
): Promise<SessionPageIndexMeta | null> {
  const cfg = loadConfig();
  const baseDir = resolveAgentWorkspaceDir(cfg, agentId);
  const metaPath = path.join(baseDir, "sessions", sessionKey, ".pageindex", "meta.json");

  try {
    const content = await fs.readFile(metaPath, "utf-8");
    return JSON.parse(content) as SessionPageIndexMeta;
  } catch {
    return null;
  }
}

/**
 * 检查索引是否存在
 */
export async function hasIndex(
  sessionKey: string,
  documentId: string,
  agentId: string = "default",
): Promise<boolean> {
  const cfg = loadConfig();
  const baseDir = resolveAgentWorkspaceDir(cfg, agentId);
  const indexPath = path.join(
    baseDir,
    "sessions",
    sessionKey,
    ".pageindex",
    "indices",
    documentId,
    "index.json",
  );

  try {
    await fs.access(indexPath);
    return true;
  } catch {
    return false;
  }
}

// 导出所有类型和模块
export * from "./types.js";
export * from "./pdf.js";
export * from "./llm.js";
export * from "./toc.js";
export * from "./tree.js";
export * from "./search.js";
