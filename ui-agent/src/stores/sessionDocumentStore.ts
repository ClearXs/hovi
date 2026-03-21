/**
 * Session Document Store
 *
 * 管理会话中上传的文档状态
 */

import { create } from "zustand";
import type { PageIndexDocument, PageIndexSearchResult } from "@/services/pageindexApi";
import {
  uploadSessionDocument,
  listSessionDocuments,
  searchPageIndex,
} from "@/services/pageindexApi";

interface SessionDocumentState {
  // 文档列表
  documents: PageIndexDocument[];
  isLoadingDocuments: boolean;
  documentsError: string | null;

  // 上传状态
  uploadingFiles: Map<string, number>; // filename -> progress
  uploadError: string | null;

  // 预览状态
  previewDocumentId: string | null;
  previewHighlightPage: number | null;
  previewHighlightText: string | null;
  isPreviewOpen: boolean;

  // 搜索结果
  searchResults: PageIndexSearchResult[];
  isSearching: boolean;
  searchError: string | null;

  // Actions
  loadDocuments: (sessionKey: string) => Promise<void>;
  uploadDocument: (sessionKey: string, file: File) => Promise<void>;
  deleteDocument: (sessionKey: string, documentId: string) => Promise<void>;

  // 预览 Actions
  openPreview: (documentId: string, page?: number, highlightText?: string) => void;
  closePreview: () => void;

  // 搜索 Actions
  search: (sessionKey: string, query: string) => Promise<void>;
  clearSearchResults: () => void;
}

export const useSessionDocumentStore = create<SessionDocumentState>((set, get) => ({
  // Initial state
  documents: [],
  isLoadingDocuments: false,
  documentsError: null,

  uploadingFiles: new Map(),
  uploadError: null,

  previewDocumentId: null,
  previewHighlightPage: null,
  previewHighlightText: null,
  isPreviewOpen: false,

  searchResults: [],
  isSearching: false,
  searchError: null,

  // Load documents
  loadDocuments: async (sessionKey: string) => {
    set({ isLoadingDocuments: true, documentsError: null });
    try {
      const response = await listSessionDocuments(sessionKey);
      set({ documents: response.documents, isLoadingDocuments: false });
    } catch (error) {
      set({
        documentsError: error instanceof Error ? error.message : "加载文档失败",
        isLoadingDocuments: false,
      });
    }
  },

  // Upload document
  uploadDocument: async (sessionKey: string, file: File) => {
    const { uploadingFiles } = get();
    const newUploading = new Map(uploadingFiles);
    newUploading.set(file.name, 0);
    set({ uploadingFiles: newUploading, uploadError: null });

    try {
      const result = await uploadSessionDocument({ sessionKey, file });

      if (result.success) {
        // 重新加载文档列表
        await get().loadDocuments(sessionKey);
      }

      set({
        uploadError: result.success ? undefined : result.message || "上传失败",
      });
    } catch (error) {
      set({
        uploadError: error instanceof Error ? error.message : "上传失败",
      });
    } finally {
      const { uploadingFiles: current } = get();
      const updated = new Map(current);
      updated.delete(file.name);
      set({ uploadingFiles: updated });
    }
  },

  // Delete document
  deleteDocument: async (_sessionKey: string, _documentId: string) => {
    // TODO: 实现删除功能
  },

  // Open preview
  openPreview: (documentId: string, page?: number, highlightText?: string) => {
    set({
      previewDocumentId: documentId,
      previewHighlightPage: page ?? null,
      previewHighlightText: highlightText ?? null,
      isPreviewOpen: true,
    });
  },

  // Close preview
  closePreview: () => {
    set({
      isPreviewOpen: false,
      previewDocumentId: null,
      previewHighlightPage: null,
      previewHighlightText: null,
    });
  },

  // Search
  search: async (sessionKey: string, query: string) => {
    set({ isSearching: true, searchError: null });
    try {
      const response = await searchPageIndex({ sessionKey, query });
      set({ searchResults: response.results, isSearching: false });
    } catch (error) {
      set({
        searchError: error instanceof Error ? error.message : "搜索失败",
        isSearching: false,
      });
    }
  },

  // Clear search results
  clearSearchResults: () => {
    set({ searchResults: [], searchError: null });
  },
}));
