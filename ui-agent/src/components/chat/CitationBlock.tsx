"use client";

import { FileText, Database, Network, BookOpen } from "lucide-react";

export interface Citation {
  source: "pageindex" | "knowledge";
  documentId: string;
  filename: string;
  pageNumber?: number;
  section?: string;
  snippet: string;
  // 知识库增强字段
  kbId?: string;
  kbName?: string;
  sourceType?: "vector" | "graph_entity" | "graph_relation";
  graphEntity?: {
    id: string;
    name: string;
    type: string;
    description: string;
  };
  graphRelation?: {
    id: string;
    sourceName: string;
    targetName: string;
    keywords: string[];
  };
}

interface CitationBlockProps {
  citations: Citation[];
  onCitationClick: (citation: Citation) => void;
}

// 获取来源类型的显示信息和图标
function getSourceInfo(sourceType?: string, source?: string) {
  if (source === "pageindex") {
    return {
      label: "页面索引",
      icon: BookOpen,
      color: "bg-blue-100 text-blue-700",
    };
  }

  switch (sourceType) {
    case "graph_entity":
      return {
        label: "图谱实体",
        icon: Network,
        color: "bg-purple-100 text-purple-700",
      };
    case "graph_relation":
      return {
        label: "图谱关系",
        icon: Database,
        color: "bg-green-100 text-green-700",
      };
    case "vector":
    default:
      return {
        label: "向量检索",
        icon: FileText,
        color: "bg-gray-100 text-gray-700",
      };
  }
}

export function CitationBlock({ citations, onCitationClick }: CitationBlockProps) {
  if (!citations || citations.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 p-2 bg-primary/5 rounded border border-border-light">
      <div className="text-xs font-medium text-text-secondary mb-1">参考来源：</div>
      <div className="space-y-1">
        {citations.map((citation, index) => {
          const sourceInfo = getSourceInfo(citation.sourceType, citation.source);
          const SourceIcon = sourceInfo.icon;

          return (
            <button
              key={`${citation.documentId}-${index}`}
              onClick={() => onCitationClick(citation)}
              className="flex items-start gap-2 w-full text-left p-1 rounded hover:bg-primary/10 transition-colors"
            >
              <SourceIcon className="w-4 h-4 flex-shrink-0 mt-0.5 text-primary" />
              <div className="flex-1 min-w-0">
                {/* 标题行：文件名 + 来源badge + 知识库名 */}
                <div className="flex items-center gap-1 flex-wrap">
                  <div className="text-sm font-medium text-text-primary truncate">
                    {citation.filename}
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${sourceInfo.color}`}>
                    {sourceInfo.label}
                  </span>
                </div>

                {/* 知识库名称 */}
                {citation.kbName && (
                  <div className="text-xs text-text-tertiary">知识库: {citation.kbName}</div>
                )}

                {/* 图谱实体信息 */}
                {citation.graphEntity && (
                  <div className="text-xs text-purple-600 mt-0.5">
                    实体: {citation.graphEntity.name} ({citation.graphEntity.type})
                  </div>
                )}

                {/* 图谱关系信息 */}
                {citation.graphRelation && (
                  <div className="text-xs text-green-600 mt-0.5">
                    关系: {citation.graphRelation.sourceName} → {citation.graphRelation.targetName}
                    {citation.graphRelation.keywords.length > 0 && (
                      <span className="ml-1">({citation.graphRelation.keywords.join(", ")})</span>
                    )}
                  </div>
                )}

                {/* 页码信息 */}
                <div className="text-xs text-text-secondary">
                  {citation.pageNumber && <span>第 {citation.pageNumber} 页</span>}
                  {citation.section && <span className="ml-1">- {citation.section}</span>}
                </div>

                {/* 摘要 */}
                {citation.snippet && (
                  <div className="text-xs text-text-tertiary mt-1 line-clamp-2">
                    {citation.snippet}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
