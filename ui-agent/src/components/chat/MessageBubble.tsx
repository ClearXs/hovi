"use client";

import { User, ChevronDown, ChevronUp, Copy, Pencil, Check, X } from "lucide-react";
import { useMemo, useState, useRef, useEffect } from "react";
import { FormattedContent } from "@/components/agent/FormattedContent";
import type { Message } from "@/components/chat/MessageList";
import { FileList, FileItemProps } from "@/components/files/FileList";
import { useStreamingReplay } from "@/contexts/StreamingReplayContext";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  files?: FileItemProps[];
  usage?: {
    input?: number;
    output?: number;
    total?: number;
  };
  toolCalls?: Array<{
    id?: string;
    name?: string;
    arguments?: unknown;
    status?: "running" | "done";
    durationMs?: number;
  }>;
  toolResults?: Array<{
    toolCallId?: string;
    toolName?: string;
    content?: string;
    isError?: boolean;
    durationMs?: number;
  }>;
  status?: "sending" | "failed" | "waiting";
  isHighlighted?: boolean;
  onRetry?: () => void;
  onEditRetry?: () => void;
  onCopyRetry?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onEditConfirm?: (newContent: string) => void;
  onEditCancel?: () => void;
  onCopy?: (content: string) => void;
  isEditing?: boolean;
  messageIndex?: number; // Index of this message in the list
}

export function MessageBubble({
  role,
  content,
  timestamp,
  files,
  usage,
  toolCalls = [],
  toolResults = [],
  status,
  isHighlighted = false,
  onRetry,
  onEditRetry,
  onCopyRetry,
  onDelete,
  onEdit,
  onEditConfirm,
  onEditCancel,
  onCopy,
  isEditing = false,
  messageIndex = 0,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const isWaiting = status === "waiting";
  const { isStreaming, getDisplayedText, currentMessageIndex } = useStreamingReplay();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [editContent, setEditContent] = useState("");
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // 当进入编辑模式时，加载原内容
  useEffect(() => {
    if (isEditing) {
      setEditContent(content);
    }
  }, [isEditing, content]);

  // Get displayed content (full for non-streaming or user messages, streamed for assistant during replay)
  const displayedContent =
    isUser || !isStreaming ? content : getDisplayedText(messageIndex, "summary", content);

  // Hide assistant messages that haven't been reached yet during streaming
  if (!isUser && isStreaming && messageIndex > currentMessageIndex) {
    return null;
  }

  // Hide files until message content is fully displayed
  const isFullyDisplayed = !isStreaming || displayedContent.length === content.length;
  const shouldShowFiles = isFullyDisplayed;
  const shouldShowMeta = isFullyDisplayed;
  const hasToolInfo = toolCalls.length > 0 || toolResults.length > 0;
  const formatDuration = (durationMs?: number) => {
    if (durationMs == null) return null;
    if (durationMs < 1000) return `${durationMs}ms`;
    return `${(durationMs / 1000).toFixed(1)}s`;
  };

  const usageLabel = useMemo(() => {
    if (!usage) return null;
    const input = usage.input ?? undefined;
    const output = usage.output ?? undefined;
    const total = usage.total ?? undefined;
    if (input != null || output != null) {
      const parts = [];
      if (input != null) parts.push(`输入 ${input}`);
      if (output != null) parts.push(`输出 ${output}`);
      if (total != null) parts.push(`总计 ${total}`);
      return parts.join(" · ");
    }
    if (total != null) return `总计 ${total}`;
    return null;
  }, [usage]);

  return (
    <div className={`flex w-full mb-lg ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        style={{ minWidth: "200px" }}
        className={`flex gap-sm max-w-[90%] md:max-w-[680px] lg:max-w-[800px] transition-shadow ${
          isUser ? "flex-row-reverse" : "flex-row"
        } ${isHighlighted ? "rounded-xl ring-2 ring-primary/40 shadow-[0_0_0_6px_rgba(99,102,241,0.15)] animate-attention" : ""}`}
      >
        {/* 头像 */}
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center overflow-hidden ${
            isUser ? "bg-primary" : "bg-background-secondary"
          }`}
        >
          {isUser ? (
            <User className="w-4 h-4 text-white" />
          ) : (
            <img src="/img/logo.png" alt="Hovi" className="w-full h-full object-contain" />
          )}
        </div>

        {/* 消息内容 */}
        <div className="flex flex-col gap-xs min-w-[150px]">
          <div
            className={`px-lg py-md rounded-lg ${
              isUser
                ? "bg-primary text-white rounded-tr-sm"
                : "bg-surface text-text-primary rounded-tl-sm"
            }`}
          >
            {isWaiting ? (
              <div className="flex items-center gap-sm text-sm text-text-tertiary">
                <span className="animate-pulse">...</span>
              </div>
            ) : isEditing && isUser ? (
              <textarea
                ref={editInputRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-w-[300px] bg-transparent text-sm text-white resize-none outline-none scrollbar-thin scrollbar-thumb-white/30 scrollbar-track-transparent"
                rows={Math.max(2, editContent.split("\n").length)}
                autoFocus
              />
            ) : isUser ? (
              <p className="text-sm whitespace-pre-wrap leading-relaxed break-all min-w-[100px]">
                {displayedContent}
              </p>
            ) : (
              <FormattedContent
                content={displayedContent}
                className="text-sm max-w-full"
                enableMarkdown={true}
              />
            )}
          </div>

          {/* 文件列表 - 只在内容完全显示后才显示 */}
          {files && files.length > 0 && shouldShowFiles && (
            <FileList files={files} title="生成的文档" />
          )}

          {shouldShowMeta && !isUser && hasToolInfo && (
            <div className="flex flex-col gap-xs text-xs text-text-tertiary">
              {hasToolInfo && (
                <button
                  type="button"
                  onClick={() => setToolsOpen((prev) => !prev)}
                  className="inline-flex w-fit items-center gap-xs text-text-secondary hover:text-text-primary"
                >
                  <span>工具调用 ({toolCalls.length + toolResults.length})</span>
                  {toolsOpen ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
              )}
              {hasToolInfo && toolsOpen && (
                <div className="rounded-md border border-border-light bg-background-secondary p-sm text-[11px] text-text-secondary">
                  {toolCalls.map((call, index) => (
                    <div key={`call-${call.id ?? index}`} className="mb-xs">
                      <div className="font-medium text-text-primary">
                        {call.name ?? "tool"} {call.id ? `(${call.id})` : ""}
                        {call.status && (
                          <span className="ml-xs text-[10px] text-text-tertiary">
                            {call.status === "running" ? "进行中" : "完成"}
                          </span>
                        )}
                        {call.durationMs != null && (
                          <span className="ml-xs text-[10px] text-text-tertiary">
                            {formatDuration(call.durationMs)}
                          </span>
                        )}
                      </div>
                      {call.arguments != null && (
                        <pre className="whitespace-pre-wrap break-words text-[10px] text-text-tertiary">
                          {JSON.stringify(call.arguments, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                  {toolResults.map((result, index) => (
                    <div key={`result-${result.toolCallId ?? index}`} className="mb-xs">
                      <div
                        className={`font-medium ${result.isError ? "text-red-500" : "text-text-primary"}`}
                      >
                        结果 {result.toolName ?? "tool"}{" "}
                        {result.toolCallId ? `(${result.toolCallId})` : ""}
                        {result.durationMs != null && (
                          <span className="ml-xs text-[10px] text-text-tertiary">
                            {formatDuration(result.durationMs)}
                          </span>
                        )}
                      </div>
                      {result.content && <ToolResultContent content={result.content} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 功能按钮 */}
          <div
            className={`flex items-center gap-xs text-xs ${isUser ? "justify-end" : "justify-end"}`}
          >
            {/* 助手消息：复制按钮 */}
            {!isUser && !isWaiting && content && onCopy && (
              <button
                type="button"
                onClick={() => onCopy?.(content)}
                className="p-xs text-text-tertiary hover:text-text-primary rounded hover:bg-background-secondary cursor-pointer"
                title="复制"
              >
                <Copy className="h-3 w-3" />
              </button>
            )}
            {/* 用户消息：复制按钮 */}
            {isUser && !status && !isEditing && onCopy && (
              <button
                type="button"
                onClick={() => onCopy?.(content)}
                className="p-xs text-text-tertiary hover:text-text-primary rounded hover:bg-background-secondary cursor-pointer"
                title="复制"
              >
                <Copy className="h-3 w-3" />
              </button>
            )}
            {/* 用户消息：编辑按钮 */}
            {isUser && !status && !isEditing && onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="p-xs text-text-tertiary hover:text-text-primary rounded hover:bg-background-secondary cursor-pointer"
                title="编辑"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {/* 用户消息：编辑中显示取消和确认按钮 */}
            {isUser && isEditing && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditContent(content);
                    onEditCancel?.();
                  }}
                  className="p-xs text-text-tertiary hover:text-text-primary rounded hover:bg-background-secondary cursor-pointer"
                  title="取消"
                >
                  <X className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onEditConfirm?.(editContent)}
                  className="p-xs text-text-tertiary hover:text-text-primary rounded hover:bg-background-secondary cursor-pointer"
                  title="确认发送"
                >
                  <Check className="h-3 w-3" />
                </button>
              </>
            )}
          </div>

          {/* 时间戳 */}
          {timestamp && (
            <span className={`text-xs text-text-tertiary ${isUser ? "text-right" : "text-left"}`}>
              {timestamp.toLocaleString("zh-CN", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          )}
          {isUser && status && (
            <div className="flex items-center gap-sm text-xs text-text-tertiary">
              <span className={status === "failed" ? "text-error" : ""}>
                {status === "sending" ? "发送中..." : "发送失败"}
              </span>
              {status === "failed" && onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded border border-error/40 px-sm py-[2px] text-[10px] text-error hover:bg-error/10"
                >
                  重试
                </button>
              )}
              {status === "failed" && onEditRetry && (
                <button
                  type="button"
                  onClick={onEditRetry}
                  className="rounded border border-border-light px-sm py-[2px] text-[10px] text-text-secondary hover:bg-background-secondary"
                >
                  编辑后重试
                </button>
              )}
              {status === "failed" && onCopyRetry && (
                <button
                  type="button"
                  onClick={onCopyRetry}
                  className="rounded border border-border-light px-sm py-[2px] text-[10px] text-text-secondary hover:bg-background-secondary"
                >
                  复制并回填
                </button>
              )}
              {status === "failed" && onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="rounded border border-border-light px-sm py-[2px] text-[10px] text-text-secondary hover:bg-background-secondary"
                >
                  删除
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolResultContent({ content }: { content: string }) {
  const limit = 600;
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > limit;
  const display = expanded || !isLong ? content : `${content.slice(0, limit)}...`;

  return (
    <div className="text-[10px] text-text-tertiary">
      <div className="whitespace-pre-wrap break-words">{display}</div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-xs text-[10px] text-text-secondary hover:text-text-primary"
        >
          {expanded ? "收起" : "展开更多"}
        </button>
      )}
    </div>
  );
}
