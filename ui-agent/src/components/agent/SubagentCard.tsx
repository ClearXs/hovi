"use client";

import {
  Bot,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Search,
  FileText,
  Code,
  BarChart3,
  BookOpen,
} from "lucide-react";
import { useState } from "react";
import type { SubagentMessageProps, SubagentType } from "@/types";

const typeIcons: Record<SubagentType, React.ReactNode> = {
  search: <Search className="w-4 h-4" />,
  write: <FileText className="w-4 h-4" />,
  code: <Code className="w-4 h-4" />,
  analysis: <BarChart3 className="w-4 h-4" />,
  read: <BookOpen className="w-4 h-4" />,
  agent: <Bot className="w-4 h-4" />,
};

const typeLabels: Record<SubagentType, string> = {
  search: "搜索",
  write: "写作",
  code: "开发",
  analysis: "分析",
  read: "阅读",
  agent: "Agent",
};

export function SubagentCard({
  subagent,
  defaultExpanded = false,
}: {
  subagent: SubagentMessageProps;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const statusConfig = {
    running: { icon: Loader2, color: "text-primary", label: "运行中" },
    completed: { icon: CheckCircle2, color: "text-success", label: "完成" },
    failed: { icon: XCircle, color: "text-error", label: "失败" },
    timeout: { icon: XCircle, color: "text-error", label: "超时" },
  };

  const StatusIcon = statusConfig[subagent.status].icon;
  const statusColor = statusConfig[subagent.status].color;

  const formatDuration = (ms?: number) => {
    if (!ms) return "--";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const icon = subagent.type ? typeIcons[subagent.type] : <Bot className="w-4 h-4" />;
  const typeLabel = subagent.type ? typeLabels[subagent.type] : "Agent";

  return (
    <div className="border border-border-light rounded-lg bg-background-secondary overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-md py-sm bg-background-tertiary">
        <div className="flex items-center gap-sm">
          <div className="text-text-secondary">{icon}</div>
          <span className="text-sm font-medium text-text-primary">
            {subagent.label || `子${typeLabel}`}
          </span>
        </div>
        <div className={`flex items-center gap-xs text-xs ${statusColor}`}>
          {subagent.status === "running" && <Loader2 className="w-3 h-3 animate-spin" />}
          <span>{statusConfig[subagent.status].label}</span>
        </div>
      </div>

      {/* Task */}
      <div className="px-md py-sm">
        <p className="text-xs text-text-secondary line-clamp-2">{subagent.task}</p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-md py-xs border-t border-border-light">
        <span className="text-xs text-text-tertiary">
          {subagent.endedAt && subagent.startedAt
            ? formatDuration(subagent.endedAt - subagent.startedAt)
            : formatDuration(subagent.duration)}
        </span>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-xs text-xs text-text-tertiary hover:text-text-secondary"
        >
          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {isExpanded ? "收起" : "展开"}
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-md py-sm border-t border-border-light bg-background">
          {subagent.error ? (
            <div className="text-xs text-error">{subagent.error}</div>
          ) : subagent.output ? (
            <pre className="text-xs text-text-primary whitespace-pre-wrap">{subagent.output}</pre>
          ) : (
            <div className="text-xs text-text-tertiary">暂无输出</div>
          )}
        </div>
      )}
    </div>
  );
}
