import { useConnectionStore } from "@/stores/connectionStore";
import type { ClawdbotWebSocketClient } from "./clawdbot-websocket";

// 构建 Headers（供其他组件使用）
export const buildHeaders = () => {
  const token = useConnectionStore.getState().gatewayToken;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const AGENT_ID_HEADER = process.env.NEXT_PUBLIC_AGENT_ID || "";
  if (AGENT_ID_HEADER) headers["x-openclaw-agent-id"] = AGENT_ID_HEADER;
  return headers;
};

// 错误消息
export const KNOWLEDGE_ERRORS = {
  NOT_CONNECTED: "无法连接到服务器，请刷新页面或检查网络连接",
  REQUEST_FAILED: "请求失败",
  TIMEOUT: "请求超时",
} as const;

// 获取 WebSocket 客户端
function getWsClient(): ClawdbotWebSocketClient | null {
  const store = useConnectionStore.getState();
  return store.wsClient;
}

// 检查是否已连接
function isWsConnected(): boolean {
  const client = getWsClient();
  return client?.isConnected() ?? false;
}

// 通过 WebSocket 调用知识库方法
async function callKnowledgeWs<T>(method: string, params?: Record<string, unknown>): Promise<T> {
  const client = getWsClient();
  if (!client || !client.isConnected()) {
    throw new Error(KNOWLEDGE_ERRORS.NOT_CONNECTED);
  }
  return client.sendRequest<T>(method, params);
}

// ========== 类型定义 ==========

export type KnowledgeDocument = {
  id: string;
  kbId?: string;
  filename: string;
  mimetype: string;
  size: number;
  uploadedAt: string;
  indexed?: boolean;
  tags?: string[];
  description?: string;
  sourceType?: string;
};

export type KnowledgeListResponse = {
  total: number;
  returned: number;
  offset: number;
  documents: KnowledgeDocument[];
};

export type KnowledgeDetail = {
  id: string;
  kbId?: string;
  filename: string;
  filepath?: string;
  mimetype: string;
  size: number;
  hash?: string;
  sourceType?: string;
  sourceMetadata?: unknown;
  uploadedAt?: string;
  indexedAt?: string;
  description?: string;
  tags?: string[];
};

export type KnowledgeChunk = {
  id: string;
  index: number;
  content: string; // 后端返回的字段名
  tokens?: number;
  sourcePage?: number | null;
  status?: string;
  startLine?: number;
  endLine?: number;
  // 兼容旧字段
  text?: string;
  // 额外用于 UI 展示的字段
  charCount?: number; // 字符数
  previewText?: string; // 预览文本（前200字符）
};

export type KnowledgeChunksResponse = {
  total: number;
  returned: number;
  offset: number;
  chunks: KnowledgeChunk[];
};

export type KnowledgeChunkDetailResponse = {
  chunk: KnowledgeChunk & { documentId?: string };
};

export type KnowledgeSettingsResponse = {
  vectorization: {
    enabled: boolean;
    provider: string;
    model: string;
  };
  graph: {
    enabled: boolean;
    extractor: "llm";
    provider: string;
    model: string;
    minTriples: number;
    maxTriples: number;
    triplesPerKTokens: number;
    maxDepth: number;
  };
  search?: {
    includeInMemorySearch: boolean;
  };
  updatedAt: number;
};

export type KnowledgeBase = {
  kbId: string;
  name: string;
  description?: string;
  icon?: string;
  visibility?: "private" | "team" | "public";
  tags?: KnowledgeBaseTag[];
  settings?: KnowledgeBaseRuntimeSettings;
  documentCount?: number;
  createdAt: string;
  updatedAt: string;
  stats?: {
    totalTriples?: number;
    totalEntities?: number;
  };
};

export type KnowledgeBaseTag = {
  tagId: string;
  name: string;
  color: string | null;
};

export type KnowledgeBaseTagInput = {
  name: string;
  color?: string;
};

export type KnowledgeBaseRuntimeSettings = {
  vectorization: {
    enabled: boolean;
  };
  chunk: {
    enabled: boolean;
    size: number;
    overlap: number;
    separator: "auto" | "paragraph" | "sentence";
  };
  retrieval: {
    mode: "semantic" | "keyword" | "hybrid";
    topK: number;
    minScore: number;
    hybridAlpha: number;
  };
  index: {
    mode: "high_quality" | "balanced";
  };
  graph: {
    enabled: boolean;
  };
  search?: {
    includeInMemorySearch: boolean;
  };
};

export type KnowledgeBaseListResponse = {
  total: number;
  returned: number;
  offset: number;
  kbs: KnowledgeBase[];
};

export type KnowledgeBaseCreateParams = {
  name: string;
  description?: string;
  icon?: string;
  visibility?: "private" | "team" | "public";
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

export type KnowledgeSearchResponse = {
  query: string;
  resultsCount: number;
  results: KnowledgeSearchResult[];
};

export type KnowledgeSearchResult = {
  documentId: string;
  kbId: string | null;
  filename: string;
  chunkId: string;
  snippet: string;
  score: number;
  lines: string;
};

export const getGatewayBaseUrl = () => {
  const GATEWAY_HTTP_URL = process.env.NEXT_PUBLIC_GATEWAY_HTTP_URL || "";
  if (/^https?:\/\//.test(GATEWAY_HTTP_URL)) return GATEWAY_HTTP_URL;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${GATEWAY_HTTP_URL}`;
  }
  return `http://localhost${GATEWAY_HTTP_URL}`;
};

// ========== API 函数 ==========

export async function createKnowledgeBase(
  params: KnowledgeBaseCreateParams,
): Promise<KnowledgeBase> {
  return callKnowledgeWs<KnowledgeBase>("knowledge.create", {
    name: params.name,
    description: params.description,
    icon: params.icon,
    visibility: params.visibility,
    tags: params.tags,
    settings: params.settings,
  });
}

export async function listKnowledgeBases(params: {
  limit?: number;
  offset?: number;
  search?: string;
  visibility?: "private" | "team" | "public";
  tags?: string[];
}): Promise<KnowledgeBaseListResponse> {
  return callKnowledgeWs<KnowledgeBaseListResponse>("knowledge.list", {
    limit: params.limit,
    offset: params.offset,
    search: params.search,
    visibility: params.visibility,
    tags: params.tags,
  });
}

export async function getKnowledgeBase(kbId: string): Promise<KnowledgeBase> {
  return callKnowledgeWs<KnowledgeBase>("knowledge.get", { kbId });
}

export async function updateKnowledgeBase(
  params: KnowledgeBaseUpdateParams,
): Promise<KnowledgeBase> {
  return callKnowledgeWs<KnowledgeBase>("knowledge.update", {
    kbId: params.kbId,
    name: params.name,
    description: params.description,
    icon: params.icon,
    visibility: params.visibility,
    tags: params.tags,
  });
}

export async function deleteKnowledgeBase(kbId: string): Promise<void> {
  await callKnowledgeWs("knowledge.delete", { kbId });
}

export async function listKnowledge(params: {
  kbId?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}): Promise<KnowledgeListResponse> {
  return callKnowledgeWs<KnowledgeListResponse>("knowledge.documents", {
    kbId: params.kbId,
    tags: params.tags,
    limit: params.limit,
    offset: params.offset,
  });
}

export async function getKnowledge(documentId: string, kbId?: string): Promise<KnowledgeDetail> {
  return callKnowledgeWs<KnowledgeDetail>("knowledge.documentGet", { documentId, kbId });
}

export async function deleteKnowledge(params: {
  documentId: string;
  kbId?: string;
}): Promise<void> {
  await callKnowledgeWs("knowledge.documentDelete", {
    documentId: params.documentId,
    kbId: params.kbId,
  });
}

export async function listKnowledgeChunks(params: {
  documentId: string;
  kbId?: string;
  limit?: number;
  offset?: number;
}): Promise<KnowledgeChunksResponse> {
  return callKnowledgeWs<KnowledgeChunksResponse>("knowledge.chunks", {
    documentId: params.documentId,
    kbId: params.kbId,
    limit: params.limit,
    offset: params.offset,
  });
}

export async function getKnowledgeChunk(
  chunkId: string,
  kbId?: string,
): Promise<KnowledgeChunkDetailResponse> {
  return callKnowledgeWs<KnowledgeChunkDetailResponse>("knowledge.chunk.get", { chunkId, kbId });
}

export async function getKnowledgeSettings(): Promise<KnowledgeSettingsResponse> {
  return callKnowledgeWs<KnowledgeSettingsResponse>("knowledge.settings.get", {});
}

export async function getKnowledgeBaseSettings(
  kbId: string,
): Promise<{ kbId: string; settings: KnowledgeBaseRuntimeSettings }> {
  return callKnowledgeWs<{ kbId: string; settings: KnowledgeBaseRuntimeSettings }>(
    "knowledge.settings.get",
    { kbId },
  );
}

export async function updateKnowledgeBaseSettings(params: {
  kbId: string;
  settings: Partial<KnowledgeBaseRuntimeSettings>;
}): Promise<{ kbId: string; settings: KnowledgeBaseRuntimeSettings }> {
  return callKnowledgeWs<{ kbId: string; settings: KnowledgeBaseRuntimeSettings }>(
    "knowledge.settings.update",
    { kbId: params.kbId, settings: params.settings },
  );
}

export async function listKnowledgeTags(): Promise<{ tags: KnowledgeBaseTag[] }> {
  return callKnowledgeWs<{ tags: KnowledgeBaseTag[] }>("knowledge.tags.list", {});
}

export async function createKnowledgeTag(params: {
  name: string;
  color?: string;
}): Promise<KnowledgeBaseTag> {
  return callKnowledgeWs<KnowledgeBaseTag>("knowledge.tags.create", {
    name: params.name,
    color: params.color,
  });
}

export async function updateKnowledgeTag(params: {
  tagId: string;
  name?: string;
  color?: string;
}): Promise<KnowledgeBaseTag> {
  return callKnowledgeWs<KnowledgeBaseTag>("knowledge.tags.update", {
    tagId: params.tagId,
    name: params.name,
    color: params.color,
  });
}

export async function deleteKnowledgeTag(tagId: string): Promise<{ success: boolean }> {
  return callKnowledgeWs<{ success: boolean }>("knowledge.tags.delete", { tagId });
}

export async function updateKnowledgeSettings(params: {
  kbId?: string;
  vectorization?: Partial<KnowledgeSettingsResponse["vectorization"]>;
  graph?: Partial<KnowledgeSettingsResponse["graph"]>;
}): Promise<KnowledgeSettingsResponse> {
  return callKnowledgeWs<KnowledgeSettingsResponse>("knowledge.settings.update", {
    kbId: params.kbId,
    settings: {
      vectorization: params.vectorization,
      graph: params.graph,
    },
  });
}

export async function knowledgeSearch(params: {
  query: string;
  limit?: number;
  sessionKey?: string;
  kbId?: string | null;
}): Promise<KnowledgeSearchResponse> {
  return callKnowledgeWs<KnowledgeSearchResponse>("knowledge.search", {
    query: params.query,
    limit: params.limit,
    kbId: params.kbId ?? undefined,
  });
}

// 文件上传使用 WebSocket RPC
export async function uploadKnowledge(params: {
  kbId: string;
  file: File;
  description?: string;
  tags?: string[];
}): Promise<{ documentId: string; filename: string; size: number; indexed?: boolean }> {
  // Read file as base64
  const arrayBuffer = await params.file.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ""),
  );

  // Determine mime type
  const mimeType = params.file.type || "application/octet-stream";

  // Call via WebSocket RPC
  const result = await callKnowledgeWs<{
    documentId: string;
    filename: string;
    size: number;
    indexed: boolean;
  }>("knowledge.upload", {
    kbId: params.kbId,
    filename: params.file.name,
    content: base64,
    mimeType,
    description: params.description,
    tags: params.tags,
  });

  return result;
}

export async function updateKnowledge(params: {
  kbId: string;
  documentId: string;
  file: File;
  description?: string;
  tags?: string[];
}): Promise<{
  documentId: string;
  filename: string;
  size: number;
  indexed?: boolean;
  updatedAt?: string;
}> {
  // Read file as base64
  const arrayBuffer = await params.file.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ""),
  );

  // Determine mime type
  const mimeType = params.file.type || "application/octet-stream";

  // Call via WebSocket RPC
  const result = await callKnowledgeWs<{
    documentId: string;
    filename: string;
    size: number;
    indexed: boolean;
    updatedAt: string;
  }>("knowledge.upload", {
    kbId: params.kbId,
    documentId: params.documentId,
    filename: params.file.name,
    content: base64,
    mimeType,
    description: params.description,
    tags: params.tags,
  });

  return result;
}

export async function updateKnowledgeMetadata(params: {
  kbId: string;
  documentId: string;
  filename?: string;
  description?: string;
  tags?: string[];
}): Promise<KnowledgeDetail> {
  return callKnowledgeWs<KnowledgeDetail>("knowledge.documentUpdate", {
    kbId: params.kbId,
    documentId: params.documentId,
    filename: params.filename,
    description: params.description,
    tags: params.tags,
  });
}

export async function updateKnowledgeDocumentContent(params: {
  kbId: string;
  documentId: string;
  content: string;
}): Promise<{ success: boolean; updatedAt: string }> {
  return callKnowledgeWs<{ success: boolean; updatedAt: string }>(
    "knowledge.documentContentUpdate",
    {
      kbId: params.kbId,
      documentId: params.documentId,
      content: params.content,
    },
  );
}

export async function uploadKnowledgeWithProgress(
  params: {
    kbId: string;
    file: File;
    description?: string;
    tags?: string[];
  },
  onProgress?: (progress: number) => void,
): Promise<{ documentId: string; filename: string; size: number; indexed?: boolean }> {
  // Read file as base64
  const arrayBuffer = await params.file.arrayBuffer();

  // Report progress for reading file
  if (onProgress) onProgress(30);

  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ""),
  );

  if (onProgress) onProgress(60);

  // Determine mime type
  const mimeType = params.file.type || "application/octet-stream";

  // Call via WebSocket RPC
  const result = await callKnowledgeWs<{
    documentId: string;
    filename: string;
    size: number;
    indexed: boolean;
  }>("knowledge.upload", {
    kbId: params.kbId,
    filename: params.file.name,
    content: base64,
    mimeType,
    description: params.description,
    tags: params.tags,
  });

  if (onProgress) onProgress(100);

  return result;
}

// ============================================================
// Knowledge Graph API
// ============================================================

export type KnowledgeGraphStats = {
  totalEntities: number;
  totalRelations: number;
  entityTypes: Record<string, number>;
  topKeywords: string[];
  topEntities: Array<{ name: string; degree: number }>;
};

export type KnowledgeGraphBuildTask = {
  id: string;
  kb_id: string;
  document_id: string;
  status: "pending" | "running" | "success" | "failed";
  progress: number;
  total_chunks: number;
  processed_chunks: number;
  entities_count: number;
  relations_count: number;
  error?: string;
  started_at?: number;
  completed_at?: number;
  created_at: number;
};

export type KnowledgeGraphSearchResult = {
  entities: Array<{
    id: string;
    name: string;
    type: string | null;
    description: string | null;
    score: number;
  }>;
  relations: Array<{
    id: string;
    sourceName: string;
    targetName: string;
    keywords: string[];
    description: string | null;
  }>;
  chunks: Array<{
    id: string;
    documentId: string;
    text: string;
    score: number;
  }>;
};

/**
 * 构建知识图谱
 */
export async function buildKnowledgeGraph(params: {
  kbId: string;
  documentId: string;
}): Promise<{ taskId: string }> {
  return callKnowledgeWs("knowledge.graph.build", params);
}

/**
 * 批量构建知识图谱（构建KB中所有文档）
 */
export async function buildAllKnowledgeGraphs(params: {
  kbId: string;
}): Promise<{ taskIds: string[]; documentCount: number }> {
  return callKnowledgeWs("knowledge.graph.buildAll", params);
}

/**
 * 获取图谱构建状态
 */
export async function getKnowledgeGraphStatus(params: {
  taskId: string;
}): Promise<KnowledgeGraphBuildTask> {
  return callKnowledgeWs("knowledge.graph.status", params);
}

/**
 * 获取图谱统计信息
 */
export async function getKnowledgeGraphStats(params: {
  kbId: string;
}): Promise<KnowledgeGraphStats> {
  return callKnowledgeWs("knowledge.graph.stats", params);
}

/**
 * 搜索知识图谱
 */
export async function searchKnowledgeGraph(params: {
  kbId?: string;
  query: string;
  mode?: "local" | "global" | "hybrid" | "naive";
  topK?: number;
}): Promise<KnowledgeGraphSearchResult> {
  return callKnowledgeWs("knowledge.graph.search", params);
}

/**
 * 清空知识图谱
 */
export async function clearKnowledgeGraph(params: { kbId: string }): Promise<{ success: boolean }> {
  return callKnowledgeWs("knowledge.graph.clear", params);
}

/**
 * 获取图谱数据（用于可视化）
 */
export type KnowledgeGraphData = {
  nodes: Array<{
    id: string;
    name: string;
    type: string | null;
    description?: string;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    keywords: string[];
  }>;
};

export async function getKnowledgeGraphData(params: {
  kbId: string;
  limit?: number;
}): Promise<KnowledgeGraphData> {
  return callKnowledgeWs("knowledge.graph.data", params);
}

/**
 * Get entity details with related document chunks
 */
export type EntityDetails = {
  id: string;
  name: string;
  type: string | null;
  description: string | null;
  chunks: Array<{
    id: string;
    text: string;
    documentName: string;
    score: number;
  }>;
};

export async function getEntityDetails(params: {
  kbId: string;
  entityId: string;
}): Promise<EntityDetails> {
  return callKnowledgeWs("knowledge.graph.entityDetails", params);
}

/**
 * Rebuild document: re-vectorize and re-build graph
 */
export type RebuildDocumentResult = {
  success: boolean;
  vectorized: boolean;
  graphBuilt: boolean;
};

export async function rebuildKnowledgeDocument(params: {
  kbId: string;
  documentId: string;
}): Promise<RebuildDocumentResult> {
  return callKnowledgeWs<RebuildDocumentResult>("knowledge.rebuild", params);
}
