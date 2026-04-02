/**
 * PageIndex 核心类型定义
 *
 * 参考 PageIndex (https://github.com/VectifyAI/PageIndex) 的数据结构和理念
 */

// 树节点
export interface PageNode {
  title: string;
  nodeId: string;
  startPage: number;
  endPage: number;
  summary?: string;
  nodes?: PageNode[];
}

// 文档索引结构
export interface PageIndexTree {
  docName: string;
  docDescription?: string;
  structure: PageNode;
}

// TOC 项目
export interface TOCItem {
  title: string;
  level: number;
  page?: number;
  physicalIndex?: number;
}

// TOC 检测结果
export interface TOCDetectionResult {
  hasTOC: boolean;
  content?: string;
  pageNumbers?: number[];
  hasPageNumbers?: boolean;
}

// TOC 转换结果
export interface TOCTransformResult {
  items: TOCItem[];
  accuracy?: number;
}

// 验证结果
export interface VerificationResult {
  accuracy: number;
  incorrectItems: TOCItem[];
  verifiedItems: TOCItem[];
}

// 搜索结果
export interface PageIndexSearchResult {
  documentId: string;
  filename: string;
  content: string;
  pageNumber: number;
  section: string;
  score: number;
  path?: string;
}

// 构建索引参数
export interface BuildIndexParams {
  filePath: string;
  sessionKey: string;
  documentId: string;
  agentId: string;
}

// 构建索引结果
export interface BuildIndexResult {
  success: boolean;
  documentId: string;
  indexPath?: string;
  error?: string;
}

// 搜索参数
export interface SearchParams {
  indexPath: string;
  query: string;
  limit?: number;
}

// Session 文档元数据
export interface SessionDocumentMeta {
  documentId: string;
  knowledgeDocumentId?: string;
  kbId?: string;
  filename: string;
  mimeType: string;
  indexPath: string | null;
  builtAt: number;
}

// Session PageIndex 元数据
export interface SessionPageIndexMeta {
  sessionKey: string;
  documents: SessionDocumentMeta[];
  updatedAt: number;
}

// 检索结果
export interface RetrievalResult {
  source: "pageindex" | "knowledge";
  documentId: string;
  filename: string;
  content: string;
  score: number;
  metadata: {
    pageNumber?: number;
    section?: string;
    chunkId?: string;
    path?: string;
  };
}

// 检索参数
export interface RetrievalParams {
  query: string;
  sessionKey: string;
  agentId: string;
  limit?: number;
}

// LLM 调用选项
export interface LLMCallOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

// PDF 解析结果
export interface PDFParseResult {
  text: string;
  toc?: TOCItem[];
  pageCount: number;
}
