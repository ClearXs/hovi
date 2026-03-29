/**
 * PageIndex 前端 API
 *
 * 提供 PageIndex 相关的 API 调用
 */

import { useConnectionStore } from "@/stores/connectionStore";
import type { ClawdbotWebSocketClient } from "./clawdbot-websocket";

// ========== 类型定义 ==========

export interface PageIndexDocument {
  id: string;
  knowledgeDocumentId?: string;
  kbId?: string;
  filename: string;
  mimeType: string;
  uploadedAt: string;
  pageIndexReady: boolean;
}

export interface PageIndexSearchResult {
  documentId: string;
  filename: string;
  content: string;
  pageNumber: number;
  section: string;
  score: number;
}

export interface PageIndexUploadResponse {
  success: boolean;
  documentId: string;
  knowledgeDocumentId?: string;
  kbId?: string;
  indexed: boolean;
  pageIndexBuilt: boolean;
  message?: string;
}

export interface PageIndexSearchResponse {
  results: PageIndexSearchResult[];
}

export interface PageIndexCheckResponse {
  pandocAvailable: boolean;
  openaiApiKey: boolean;
}

export interface PageIndexBindResponse {
  success: boolean;
  moved: number;
  skipped: number;
  totalSource: number;
}

// ========== WebSocket 客户端 ==========

function getWsClient(): ClawdbotWebSocketClient | null {
  const store = useConnectionStore.getState();
  return store.wsClient;
}

function isWsConnected(): boolean {
  const client = getWsClient();
  return client?.isConnected() ?? false;
}

async function callPageIndexWs<T>(method: string, params?: Record<string, unknown>): Promise<T> {
  const client = getWsClient();
  if (!client || !client.isConnected()) {
    throw new Error("无法连接到服务器，请刷新页面或检查网络连接");
  }
  return client.sendRequest<T>(method, params);
}

// ========== API 函数 ==========

/**
 * 上传 Session 文档
 */
export async function uploadSessionDocument(params: {
  sessionKey: string;
  file: File;
}): Promise<PageIndexUploadResponse> {
  // 读取文件为 Base64
  const arrayBuffer = await params.file.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ""),
  );

  // 检测 MIME 类型
  const mimeType = params.file.type || "application/octet-stream";

  return callPageIndexWs<PageIndexUploadResponse>("pageindex.document.upload", {
    sessionKey: params.sessionKey,
    filename: params.file.name,
    mimeType,
    content: base64,
  });
}

/**
 * 获取 Session 文档列表
 */
export async function listSessionDocuments(
  sessionKey: string,
): Promise<{ documents: PageIndexDocument[] }> {
  return callPageIndexWs<{ documents: PageIndexDocument[] }>("pageindex.document.list", {
    sessionKey,
  });
}

export async function resolveSessionKnowledgeDocumentRef(params: {
  sessionKey: string;
  documentId?: string;
  filename?: string;
  knowledgeDocumentId?: string;
  kbId?: string;
  maxAttempts?: number;
  intervalMs?: number;
}): Promise<{ knowledgeDocumentId: string; kbId?: string }> {
  if (params.knowledgeDocumentId) {
    return {
      knowledgeDocumentId: params.knowledgeDocumentId,
      kbId: params.kbId,
    };
  }

  const attempts = Math.max(1, params.maxAttempts ?? 12);
  const intervalMs = Math.max(100, params.intervalMs ?? 400);

  for (let i = 0; i < attempts; i += 1) {
    const list = await listSessionDocuments(params.sessionKey);
    const byDocumentId = params.documentId
      ? list.documents.find((doc) => doc.id === params.documentId && doc.knowledgeDocumentId)
      : undefined;
    const byFilename = params.filename
      ? list.documents
          .filter((doc) => doc.filename === params.filename && doc.knowledgeDocumentId)
          .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0]
      : undefined;
    const resolved = byDocumentId ?? byFilename;
    if (resolved?.knowledgeDocumentId) {
      return {
        knowledgeDocumentId: resolved.knowledgeDocumentId,
        kbId: resolved.kbId ?? params.kbId,
      };
    }
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error("文件上传成功，但可预览文档仍在处理中，请稍后重试。");
}

/**
 * 搜索 PageIndex
 */
export async function searchPageIndex(params: {
  sessionKey: string;
  query: string;
  limit?: number;
}): Promise<PageIndexSearchResponse> {
  return callPageIndexWs<PageIndexSearchResponse>("pageindex.search", {
    sessionKey: params.sessionKey,
    query: params.query,
    limit: params.limit ?? 5,
  });
}

export async function bindSessionDocuments(params: {
  sourceSessionKey: string;
  targetSessionKey: string;
}): Promise<PageIndexBindResponse> {
  return callPageIndexWs<PageIndexBindResponse>("pageindex.document.bind", {
    sourceSessionKey: params.sourceSessionKey,
    targetSessionKey: params.targetSessionKey,
  });
}

/**
 * 检查 PageIndex 环境
 */
export async function checkPageIndex(): Promise<PageIndexCheckResponse> {
  return callPageIndexWs<PageIndexCheckResponse>("pageindex.check", {});
}

/**
 * 判断文件是否支持 PageIndex
 */
export function isPageIndexSupported(filename: string): boolean {
  const ext = filename.toLowerCase().split(".").pop();
  return [
    ".pdf",
    ".docx",
    ".doc",
    ".xlsx",
    ".xls",
    ".csv",
    ".txt",
    ".md",
    ".markdown",
    ".json",
  ].includes(`.${ext}`);
}
