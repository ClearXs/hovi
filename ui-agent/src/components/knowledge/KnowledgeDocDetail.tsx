"use client";

import { useEffect, useRef } from "react";
import { DocPreview } from "@/components/knowledge/preview/DocPreview";
import { cn } from "@/lib/utils";
import { useKnowledgeBaseStore } from "@/stores/knowledgeBaseStore";

interface KnowledgeDocDetailProps {
  documentId: string | null;
}

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

  if (!documentId) {
    return <div className="text-sm text-text-tertiary">请选择文档</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-sm">
      {isLoadingDetail ? (
        <div className="flex-1 rounded-lg border border-border-light bg-background-secondary/40 animate-pulse" />
      ) : (
        <div className="grid flex-1 min-h-0 grid-cols-12 gap-sm">
          <div className="col-span-4 flex h-full min-h-0 flex-col rounded-lg border border-border-light p-sm">
            {isLoadingChunks ? (
              <div className="space-y-xs">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="rounded-md border border-border-light px-sm py-xs text-xs text-text-secondary animate-pulse"
                  >
                    Chunk {index + 1}
                  </div>
                ))}
              </div>
            ) : chunkIds.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border-light px-sm text-xs text-text-tertiary">
                暂无分块数据
              </div>
            ) : (
              <div className="flex-1 space-y-1 overflow-auto pr-xs">
                {chunkIds.map((id) => (
                  <button
                    key={id}
                    onClick={() => selectChunk(id)}
                    ref={(element) => {
                      chunkRefs.current[id] = element;
                    }}
                    className={cn(
                      "w-full rounded-md border px-xs py-1 text-left text-[11px] transition-colors",
                      activeChunkId === id
                        ? "border-primary/40 bg-primary/5 text-text-primary"
                        : "border-border-light text-text-secondary hover:bg-background-secondary",
                    )}
                  >
                    Chunk {chunksById[id]?.index ?? id}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="col-span-8 flex h-full min-h-0 flex-col">
            <div className="flex-1 h-full min-h-0 overflow-hidden">
              <DocPreview detail={detail} highlightKeywords={searchHighlightKeywords} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
