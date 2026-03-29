"use client";

import { getKnowledgeIconOption } from "@/components/knowledge/iconRegistry";
import type { KnowledgeBase } from "@/services/knowledgeApi";

interface KnowledgeBaseCardProps {
  kb?: KnowledgeBase;
  onClick?: () => void;
}

const visibilityLabel: Record<string, string> = {
  private: "仅自己",
  team: "团队",
  public: "公开",
};

export function KnowledgeBaseCard({ kb, onClick }: KnowledgeBaseCardProps) {
  if (!kb) return null;
  const iconOption = getKnowledgeIconOption(kb.icon);
  const Icon = iconOption.Icon;
  const visibilityText = kb.visibility
    ? (visibilityLabel[kb.visibility] ?? kb.visibility)
    : "未设置权限";
  const createdText = kb.createdAt ? new Date(kb.createdAt).toLocaleDateString("zh-CN") : "未知";
  const documentCount = kb.documentCount ?? 0;
  const tags = kb.tags ?? [];

  return (
    <button
      className="cursor-pointer text-left rounded-xl border px-md py-sm transition-colors min-h-28 h-auto border-border-light bg-white hover:bg-primary/5 hover:border-primary/40 overflow-hidden"
      onClick={onClick}
    >
      <div className="flex items-center gap-sm">
        <div className="h-8 w-8 rounded-lg bg-background-secondary flex items-center justify-center text-sm text-text-secondary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate text-text-primary">{kb.name}</div>
          <div className="text-[11px] text-text-tertiary mt-0.5 truncate">
            权限：{visibilityText}
          </div>
        </div>
      </div>
      <div className="text-[11px] text-text-secondary mt-2 line-clamp-2">
        {kb.description || "暂无描述"}
      </div>
      {tags.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag.tagId}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-text-secondary"
              style={{ backgroundColor: tag.color ? `${tag.color}20` : "#f1f5f9" }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: tag.color ?? "#94a3b8" }}
              />
              {tag.name}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="text-[10px] text-text-tertiary">+{tags.length - 3}</span>
          )}
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-sm text-[10px] text-text-tertiary">
        <span>文档 {documentCount}</span>
        <span>创建于 {createdText}</span>
      </div>
    </button>
  );
}
