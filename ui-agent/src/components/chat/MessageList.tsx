"use client";

import { useRef, useEffect } from "react";
import { FileItemProps } from "@/components/files/FileList";
import { useStreamingReplay } from "@/contexts/StreamingReplayContext";
import { AgentMessage, AgentMessageProps } from "../agent/AgentMessage";
import { MessageBubble } from "./MessageBubble";

export interface Message {
  id: string;
  role: "user" | "assistant" | "agent";
  content: string;
  timestamp: Date;
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
  retryPayload?: {
    message: string;
    attachments?: File[];
  };
  agentData?: AgentMessageProps;
  files?: FileItemProps[];
}

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
  autoScrollToBottom?: boolean;
  emptyState?: {
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
  };
  onRetryMessage?: (message: Message) => void;
  onEditMessage?: (message: Message) => void;
  onCopyMessage?: (message: Message) => void;
  onDeleteMessage?: (message: Message) => void;
  onStartEdit?: (message: Message) => void;
  onConfirmEdit?: (message: Message, newContent: string) => void;
  onCancelEdit?: (message: Message) => void;
  onCopy?: (content: string) => void;
  editingMessageId?: string | null;
  highlightMessageId?: string | null;
}

export function MessageList({
  messages,
  isLoading = false,
  autoScrollToBottom = true,
  emptyState,
  onRetryMessage,
  onEditMessage,
  onCopyMessage,
  onDeleteMessage,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  onCopy,
  editingMessageId,
  highlightMessageId,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const { shouldShowMessage } = useStreamingReplay();
  const prevMessageCount = useRef(0);

  // 自动滚动到底部 - 只有启用且消息增加时才滚动
  useEffect(() => {
    if (!autoScrollToBottom) return;
    // 只有当消息数量增加时才滚动（发送新消息时），不滚动的情况包括：
    // - 初始加载（消息数量从0增加）
    // - 加载历史（消息数量增加）
    if (messages.length > prevMessageCount.current) {
      // 使用 requestAnimationFrame 延迟滚动，确保 DOM 已经更新
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
    prevMessageCount.current = messages.length;
  }, [messages, autoScrollToBottom]);

  useEffect(() => {
    if (!highlightMessageId) return;
    const node = messageRefs.current[highlightMessageId];
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightMessageId]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border-light scrollbar-track-transparent px-md md:px-xl lg:px-2xl py-lg flex flex-col items-center"
    >
      <div className="w-full min-w-[300px] md:max-w-[800px] lg:max-w-[1000px]">
        {messages.length === 0 && !isLoading && emptyState && (
          <div className="flex flex-col items-center justify-center gap-sm py-2xl text-center text-text-tertiary">
            <div className="text-sm text-text-secondary">{emptyState.title}</div>
            {emptyState.description && <div className="text-xs">{emptyState.description}</div>}
            {emptyState.actionLabel && emptyState.onAction && (
              <button
                type="button"
                onClick={emptyState.onAction}
                className="mt-sm rounded-md border border-border-light px-md py-xs text-xs text-text-primary hover:bg-background-secondary"
              >
                {emptyState.actionLabel}
              </button>
            )}
          </div>
        )}
        {/* 消息列表 - 重放时过滤未到达的消息 */}
        {messages.map((message, index) => {
          // 检查消息是否应该显示
          if (!shouldShowMessage(index)) {
            return null;
          }

          if (message.role === "agent" && message.agentData) {
            return <AgentMessage key={message.id} {...message.agentData} messageIndex={index} />;
          }

          return (
            <div
              key={message.id}
              ref={(node) => {
                messageRefs.current[message.id] = node;
              }}
            >
              <MessageBubble
                role={message.role as "user" | "assistant"}
                content={message.content}
                timestamp={message.timestamp}
                files={message.files}
                usage={message.usage}
                toolCalls={message.toolCalls}
                toolResults={message.toolResults}
                status={message.status}
                isHighlighted={message.id === highlightMessageId}
                onRetry={onRetryMessage ? () => onRetryMessage(message) : undefined}
                onEditRetry={onEditMessage ? () => onEditMessage(message) : undefined}
                onCopyRetry={onCopyMessage ? () => onCopyMessage(message) : undefined}
                onDelete={onDeleteMessage ? () => onDeleteMessage(message) : undefined}
                onEdit={onStartEdit ? () => onStartEdit(message) : undefined}
                onEditConfirm={(newContent) => onConfirmEdit?.(message, newContent)}
                onEditCancel={() => onCancelEdit?.(message)}
                onCopy={onCopy ? (content: string) => onCopy(content) : undefined}
                isEditing={editingMessageId === message.id}
                messageIndex={index}
              />
            </div>
          );
        })}

        {/* 加载指示器 */}
        {isLoading && (
          <div className="flex items-center justify-center gap-sm text-text-tertiary mb-lg w-full">
            <div className="w-8 h-8 rounded-full bg-background-secondary flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
            <span className="text-sm">正在加载会话...</span>
          </div>
        )}

        {/* 自动滚动锚点 */}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
