"use client";

import { GripVertical } from "lucide-react";
import { useEffect, useRef, useMemo, useState } from "react";
import { KnowledgeChunksList } from "@/components/knowledge/KnowledgeChunksList";
import { DocPreview } from "@/components/knowledge/preview/DocPreview";
import { useKnowledgeBaseStore } from "@/stores/knowledgeBaseStore";

interface KnowledgeDocDetailProps {
  documentId: string | null;
}

const MIN_CHUNK_PANEL_WIDTH = 200;
const DEFAULT_CHUNK_PANEL_WIDTH = 320;

export function KnowledgeDocDetail({ documentId }: KnowledgeDocDetailProps) {
  const {
    detail,
    isLoadingDetail,
    selectDocument,
    loadChunks,
    chunkIds,
    chunksById,
    activeChunkId,
    selectChunk,
    isLoadingChunks,
    targetChunkId,
    searchHighlightKeywords,
    clearTargetChunk,
  } = useKnowledgeBaseStore();

  const chunkRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const [chunkPanelWidth, setChunkPanelWidth] = useState(DEFAULT_CHUNK_PANEL_WIDTH);
  const [isDragging, setIsDragging] = useState(false);

  // 将 chunkIds 转换为 chunks 数组
  const chunks = useMemo(() => {
    return chunkIds.map((id) => chunksById[id]).filter(Boolean);
  }, [chunkIds, chunksById]);

  useEffect(() => {
    if (documentId) {
      void selectDocument(documentId);
      void loadChunks(documentId, { offset: 0 });
    }
  }, [documentId, selectDocument, loadChunks]);

  useEffect(() => {
    if (!targetChunkId) return;
    const targetElement = chunkRefs.current[targetChunkId];
    if (!targetElement) return;

    selectChunk(targetChunkId);
    const scrollTimer = window.setTimeout(() => {
      targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);

    const clearTimer = window.setTimeout(() => {
      clearTargetChunk();
    }, 1000);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [targetChunkId, selectChunk, clearTargetChunk]);

  // 拖动处理
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      const clampedWidth = Math.max(
        MIN_CHUNK_PANEL_WIDTH,
        Math.min(newWidth, containerRect.width - MIN_CHUNK_PANEL_WIDTH),
      );
      setChunkPanelWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  if (!documentId) {
    return <div className="text-sm text-text-tertiary">请选择文档</div>;
  }

  return (
    <div className="h-full min-h-0">
      {isLoadingDetail ? (
        <div className="flex-1 rounded-lg border border-border-light bg-background-secondary/40 animate-pulse" />
      ) : (
        <div ref={containerRef} className="flex h-full min-h-0">
          {/* Chunk 列表面板 */}
          <div
            className="flex h-full min-h-0 flex-col rounded-l-lg border border-r-0 border-border-light overflow-hidden flex-shrink-0"
            style={{ width: chunkPanelWidth }}
          >
            <KnowledgeChunksList
              chunks={chunks}
              activeChunkId={activeChunkId}
              onSelectChunk={selectChunk}
              isLoading={isLoadingChunks}
            />
          </div>

          {/* 拖动分隔栏 */}
          <div
            className={`w-1 cursor-col-resize flex-shrink-0 group ${
              isDragging ? "bg-primary" : "bg-transparent hover:bg-border"
            }`}
            onMouseDown={handleMouseDown}
          >
            <div className="flex h-full items-center justify-center">
              <GripVertical
                className={`h-5 w-5 transition-colors ${
                  isDragging ? "text-white" : "text-transparent group-hover:text-text-tertiary"
                }`}
              />
            </div>
          </div>

          {/* 预览面板 */}
          <div className="flex-1 h-full min-h-0 rounded-r-lg border border-l-0 border-border-light">
            <DocPreview detail={detail} highlightKeywords={searchHighlightKeywords} />
          </div>
        </div>
      )}
    </div>
  );
}
