"use client";

import {
  Search,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  X,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { KnowledgeChunk } from "@/services/knowledgeApi";

interface KnowledgeChunksListProps {
  chunks: KnowledgeChunk[];
  activeChunkId: string | null;
  onSelectChunk: (chunkId: string) => void;
  isLoading?: boolean;
  // 分页相关
  total?: number;
  offset?: number;
  limit?: number;
  onGoToPage?: (page: number) => void;
  // 用于批量操作
  selectedChunkIds?: Set<string>;
  onSelectionChange?: (selectedIds: Set<string>) => void;
}

const PREVIEW_LENGTH = 150; // 预览字符数

export function KnowledgeChunksList({
  chunks,
  activeChunkId,
  onSelectChunk,
  isLoading,
  total,
  offset = 0,
  limit = 50,
  onGoToPage,
  selectedChunkIds,
  onSelectionChange,
}: KnowledgeChunksListProps) {
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // 获取 chunk 文本内容
  const getChunkText = (chunk: KnowledgeChunk) => {
    const text = chunk.content || chunk.text || "";
    return text;
  };

  // 过滤 chunks
  const filteredChunks = useMemo(() => {
    if (!searchQuery.trim()) return chunks;
    const query = searchQuery.toLowerCase();
    return chunks.filter(
      (chunk) =>
        getChunkText(chunk).toLowerCase().includes(query) || chunk.id.toLowerCase().includes(query),
    );
  }, [chunks, searchQuery]);

  // 格式化字节数
  const formatCharCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  // 获取预览文本
  const getPreviewText = (text: string) => {
    const cleaned = text.replace(/\n+/g, " ").trim();
    if (cleaned.length <= PREVIEW_LENGTH) {
      return cleaned;
    }
    return cleaned.substring(0, PREVIEW_LENGTH) + "...";
  };

  // 切换展开/收起
  const toggleExpand = (chunkId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(chunkId)) {
        next.delete(chunkId);
      } else {
        next.add(chunkId);
      }
      return next;
    });
  };

  // 切换选择
  const toggleSelect = (chunkId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedChunkIds || !onSelectionChange) return;
    const next = new Set(selectedChunkIds);
    if (next.has(chunkId)) {
      next.delete(chunkId);
    } else {
      next.add(chunkId);
    }
    onSelectionChange(next);
  };

  // 全选
  const selectAll = () => {
    if (!onSelectionChange) return;
    if (selectedChunkIds?.size === filteredChunks.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(filteredChunks.map((c) => c.id)));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-xs">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="rounded-md border border-border-light px-sm py-xs text-xs text-text-secondary animate-pulse"
          >
            <div className="h-4 w-20 bg-border-light rounded mb-1" />
            <div className="h-3 w-full bg-border-light rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (chunks.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border-light px-sm text-xs text-text-tertiary">
        暂无分块数据
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 搜索和操作栏 */}
      <div className="mb-2 space-y-1">
        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="搜索 chunk 内容..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-border-light bg-background-secondary py-1.5 pl-7 pr-7 text-xs placeholder:text-text-tertiary focus:border-primary/50 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* 操作栏 */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-tertiary">
            {filteredChunks.length} / {chunks.length} 个 chunks
          </span>
          {onSelectionChange && (
            <button
              onClick={() => setSelectMode(!selectMode)}
              className={cn(
                "text-xs transition-colors",
                selectMode ? "text-primary" : "text-text-tertiary hover:text-text-primary",
              )}
            >
              {selectMode ? "取消选择" : "批量选择"}
            </button>
          )}
        </div>

        {/* 选择模式下的全选按钮 */}
        {selectMode && (
          <button
            onClick={selectAll}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
          >
            {selectedChunkIds?.size === filteredChunks.length ? (
              <CheckSquare className="h-3.5 w-3.5" />
            ) : (
              <Square className="h-3.5 w-3.5" />
            )}
            全选 ({filteredChunks.length})
          </button>
        )}
      </div>

      {/* Chunk 列表 */}
      <div className="flex-1 space-y-4 overflow-auto pr-xs scrollbar-narrow">
        {filteredChunks.map((chunk) => {
          const chunkText = getChunkText(chunk);
          const isExpanded = expandedChunks.has(chunk.id);
          const isActive = activeChunkId === chunk.id;
          const isSelected = selectedChunkIds?.has(chunk.id);
          const charCount = chunkText.length;
          const previewText = getPreviewText(chunkText);

          return (
            <div
              key={chunk.id}
              className={cn(
                "rounded-md border border-border-light transition-all",
                isActive
                  ? "border-primary/40 bg-primary/5"
                  : isSelected
                    ? "border-primary/30 bg-primary/5"
                    : "hover:border-border hover:bg-gray-50",
                selectMode && "cursor-pointer",
              )}
              onClick={() => {
                if (selectMode) {
                  toggleSelect(chunk.id, {} as React.MouseEvent);
                } else {
                  onSelectChunk(chunk.id);
                }
              }}
            >
              {/* Chunk 头部 */}
              <div className="flex items-start gap-1 px-2 py-1.5">
                {/* 展开/收起按钮 */}
                <button
                  onClick={(e) => toggleExpand(chunk.id, e)}
                  className="mt-0.5 flex-shrink-0 text-text-tertiary hover:text-text-primary"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>

                {/* 选择框（批量选择模式） */}
                {selectMode && (
                  <button
                    onClick={(e) => toggleSelect(chunk.id, e)}
                    className="mt-0.5 flex-shrink-0 text-text-tertiary hover:text-primary"
                  >
                    {isSelected ? (
                      <CheckSquare className="h-3.5 w-3.5" />
                    ) : (
                      <Square className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}

                {/* Chunk 信息 */}
                <div className="min-w-0 flex-1">
                  {/* 第一行：Chunk 编号 + 元信息 */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium text-text-primary">Chunk {chunk.index}</span>
                    <span className="text-text-tertiary">{formatCharCount(charCount)} 字符</span>
                    {chunk.startLine && chunk.endLine && (
                      <span className="text-text-tertiary">
                        第 {chunk.startLine}-{chunk.endLine} 行
                      </span>
                    )}
                    {chunk.tokens && (
                      <span className="text-text-tertiary">~{chunk.tokens} tokens</span>
                    )}
                  </div>

                  {/* 第二行：预览文本（收起状态） */}
                  {!isExpanded && (
                    <div className="mt-0.5 text-[11px] text-text-secondary line-clamp-2">
                      {previewText}
                    </div>
                  )}
                </div>
              </div>

              {/* 展开状态：显示完整内容 */}
              {isExpanded && (
                <div className="border-t border-border-light px-3 py-3 text-[11px] text-text-secondary bg-background-secondary/30">
                  <pre className="whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {chunkText}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 空搜索结果 */}
      {filteredChunks.length === 0 && searchQuery && (
        <div className="py-4 text-center text-xs text-text-tertiary">没有找到匹配的 chunk</div>
      )}

      {/* 分页控件 */}
      {total !== undefined && total > limit && onGoToPage && (
        <div className="mt-2 flex items-center justify-between border-t border-border-light pt-2">
          <span className="text-xs text-text-tertiary">
            {offset + 1}-{Math.min(offset + limit, total)} / {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onGoToPage(Math.floor(offset / limit) + 1 - 1)}
              disabled={offset < limit}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="上一页"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs text-text-tertiary px-2 min-w-[40px] text-center">
              {Math.floor(offset / limit) + 1}
            </span>
            <button
              onClick={() => onGoToPage(Math.floor(offset / limit) + 1 + 1)}
              disabled={offset + limit >= total}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="下一页"
            >
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
