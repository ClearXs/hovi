"use client";

import { ChevronDown, CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { useState } from "react";
import { FaBrain, FaTools, FaEye } from "react-icons/fa";
import { useStreamingReplay } from "@/contexts/StreamingReplayContext";
import { FormattedContent } from "./FormattedContent";
import { HumanConfirmationCard } from "./HumanConfirmationCard";
import { RetrievalBadge } from "./RetrievalBadge";
import { ToolCallList } from "./ToolCallList";

export type StepStatus = "pending" | "in_progress" | "completed" | "failed";

// 扩展DetailType以支持知识库检索
export type DetailType = "thought" | "action" | "observation" | "retrieval";

// 知识库检索元数据
export interface RetrievalMetadata {
  source: "knowledge_base" | "web" | "file";
  matches?: number; // 匹配到的文档数
  relevance?: number; // 相关度 0-1
  query?: string; // 查询内容
}

export interface StepDetail {
  type: DetailType;
  content: string;
  toolName?: string; // MCP工具名称，如"创建文件"、"搜索"等
  metadata?: RetrievalMetadata; // 检索元数据（仅retrieval类型）
}

// 并行工具调用
export interface ToolCall {
  id: string;
  tool: string; // 工具名称，如 "浏览网页"
  action: string; // 具体操作，如 "访问文档页面"
  url?: string; // 如果是网页工具，包含URL
  status: "pending" | "running" | "success" | "failed";
  timestamp?: Date;
  result?: string; // 简短结果描述
}

// 用户确认选项
export interface ConfirmationOption {
  label: string;
  value: string;
  checked?: boolean;
}

// 人机交互确认
export type ConfirmationType = "choice" | "confirm" | "input";

export interface HumanConfirmation {
  id: string;
  type: ConfirmationType;
  question: string;
  options?: ConfirmationOption[]; // choice类型
  userResponse?: string; // input/confirm类型
  status: "waiting" | "answered";
  timestamp?: Date;
}

export interface StepItemProps {
  id: string;
  title: string;
  description?: string;
  status: StepStatus;
  details?: StepDetail[];
  defaultExpanded?: boolean;
  messageIndex?: number; // Index of the parent agent message
  stepIndex?: number; // Index of this step in the message
  toolCalls?: ToolCall[]; // 并行工具调用列表
  confirmation?: HumanConfirmation; // 用户确认请求
}

export function StepItem({
  id,
  title,
  description,
  status,
  details = [],
  defaultExpanded = false,
  messageIndex = 0,
  stepIndex = 0,
  toolCalls = [],
  confirmation,
}: StepItemProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const {
    isStreaming,
    getDisplayedText,
    shouldShowDetail,
    getDisplayedDetailText,
    shouldShowToolCall,
    getConfirmationStatus,
  } = useStreamingReplay();

  // Get displayed title (full or empty during streaming)
  const displayedTitle = getDisplayedText(messageIndex, stepIndex, title);
  const displayedDescription = description
    ? getDisplayedText(messageIndex, stepIndex, description)
    : "";

  // If no content to show yet, don't render
  if (!displayedTitle) {
    return null;
  }

  // 状态图标
  const StatusIcon = {
    pending: Circle,
    in_progress: Loader2,
    completed: CheckCircle2,
    failed: XCircle,
  }[status];

  // 状态颜色
  const statusColor = {
    pending: "text-text-tertiary",
    in_progress: "text-primary",
    completed: "text-success",
    failed: "text-error",
  }[status];

  const hasDetails = details.length > 0;

  return (
    <div className="border-l-2 border-dashed border-border pl-md py-xs relative">
      {/* 完成标记 - 在左侧边框上 */}
      {status === "completed" && (
        <div className="absolute -left-[9px] top-[6px] bg-background rounded-full">
          <CheckCircle2 className="w-4 h-4 text-success fill-background" />
        </div>
      )}

      <div className="flex items-start gap-sm">
        {/* 状态图标 - 仅在未完成时显示 */}
        {status !== "completed" && (
          <div className={`flex-shrink-0 mt-xs ${statusColor}`}>
            <StatusIcon className={`w-3 h-3 ${status === "in_progress" ? "animate-spin" : ""}`} />
          </div>
        )}

        {/* 步骤内容 */}
        <div className={`flex-1 min-w-0 ${status === "completed" ? "ml-[20px]" : ""}`}>
          <div className="flex items-center justify-between gap-sm">
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-text-primary">{displayedTitle}</h4>
              {displayedDescription && (
                <p className="text-xs text-text-tertiary mt-xs leading-relaxed">
                  {displayedDescription}
                </p>
              )}
            </div>

            {/* 展开按钮 */}
            {hasDetails && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex-shrink-0 p-xs rounded hover:bg-background-secondary text-text-tertiary transition-colors"
                aria-label={isExpanded ? "折叠详情" : "展开详情"}
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                />
              </button>
            )}
          </div>

          {/* 详情内容 - 展开时显示 */}
          {isExpanded && hasDetails && (
            <div className="mt-md space-y-md">
              {details.map((detail, index) => {
                // Check if this detail should be visible
                const shouldShow = shouldShowDetail(messageIndex, stepIndex, index);
                if (!shouldShow) {
                  return null;
                }

                // Get displayed content for this detail (word-by-word streaming)
                const displayedContent = getDisplayedDetailText(
                  messageIndex,
                  stepIndex,
                  index,
                  detail.content,
                );

                // Don't render if no content yet
                if (!displayedContent) {
                  return null;
                }

                // 获取对应的图标和标题
                const getTypeInfo = () => {
                  switch (detail.type) {
                    case "thought":
                      return {
                        icon: <FaBrain className="w-4 h-4" />,
                        label: "思考",
                      };
                    case "action":
                      return {
                        icon: <FaTools className="w-4 h-4" />,
                        label: "行动",
                      };
                    case "observation":
                      return {
                        icon: <FaEye className="w-4 h-4" />,
                        label: "观察",
                      };
                    case "retrieval":
                      // Retrieval类型在后续任务中会添加专用组件处理
                      return {
                        icon: <FaEye className="w-4 h-4" />,
                        label: "检索",
                      };
                    default:
                      return {
                        icon: <FaEye className="w-4 h-4" />,
                        label: "信息",
                      };
                  }
                };

                const typeInfo = getTypeInfo();

                // 提取工具调用的第一行（如 "Creating file: xxx" 或 "Running xxx"）
                const firstLine = displayedContent.split("\n")[0];
                const showToolInline = detail.type === "action" && detail.toolName;
                const isRetrieval = detail.type === "retrieval";

                return (
                  <div
                    key={index}
                    className="rounded-lg bg-background-tertiary px-md py-sm border border-border-light max-w-full overflow-hidden"
                  >
                    {/* MCP工具标签和执行目标（单独一行） */}
                    {showToolInline && (
                      <div className="flex items-center gap-xs mb-xs">
                        <span className="inline-flex items-center gap-xs px-sm py-xs bg-background text-text-secondary rounded text-xs font-medium border border-border">
                          <FaTools className="w-3 h-3" />
                          {detail.toolName}
                        </span>
                        <span className="text-xs text-text-secondary break-all">{firstLine}</span>
                      </div>
                    )}

                    {/* 知识库检索标签（retrieval类型专用） */}
                    {isRetrieval && detail.metadata && (
                      <div className="mb-xs">
                        <RetrievalBadge metadata={detail.metadata} />
                      </div>
                    )}

                    {/* 标题行：类型标签(仅在非工具调用且非检索时显示) */}
                    {!showToolInline && !isRetrieval && (
                      <div className="flex items-center gap-sm mb-xs">
                        <div className="flex items-center gap-xs text-text-secondary">
                          {typeInfo.icon}
                          <span className="text-xs font-medium">{typeInfo.label}</span>
                        </div>
                      </div>
                    )}

                    {/* 内容区域 - with streaming text */}
                    <FormattedContent
                      content={displayedContent}
                      className="text-xs text-text-primary leading-relaxed max-w-full"
                    />
                  </div>
                );
              })}

              {/* 并行工具调用列表 */}
              {toolCalls.length > 0 && (
                <ToolCallList
                  toolCalls={toolCalls.filter((_, index) =>
                    shouldShowToolCall(messageIndex, stepIndex, index),
                  )}
                  className="mt-md"
                />
              )}

              {/* Phase 3: Human-in-the-loop confirmation card */}
              {confirmation &&
                (() => {
                  const confirmStatus = getConfirmationStatus(messageIndex, stepIndex);
                  if (confirmStatus === "hidden") return null;

                  return (
                    <HumanConfirmationCard
                      confirmation={{
                        ...confirmation,
                        status: confirmStatus,
                      }}
                      className="mt-md"
                    />
                  );
                })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
