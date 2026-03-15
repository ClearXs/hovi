"use client";

import { Bot, RotateCw } from "lucide-react";
import { useStreamingReplay } from "@/contexts/StreamingReplayContext";
import type { SubagentMessageProps } from "@/types";
import { StepItem, StepItemProps } from "./StepItem";
import { SubagentList } from "./SubagentList";

export type AgentStatus = "thinking" | "executing" | "completed" | "failed";

export interface AgentMessageProps {
  id: string;
  status: AgentStatus;
  summary?: string;
  steps: StepItemProps[];
  subagents?: SubagentMessageProps[];
  timestamp?: Date;
  messageIndex?: number; // Index of this agent message in the list
}

export function AgentMessage({
  id,
  status,
  summary,
  steps,
  subagents,
  timestamp,
  messageIndex = 0,
}: AgentMessageProps) {
  const { isStreaming, getDisplayedText } = useStreamingReplay();

  // 状态文本
  const statusText = {
    thinking: "思考中...",
    executing: "执行中...",
    completed: "完成",
    failed: "失败",
  }[status];

  // 状态颜色
  const statusColor = {
    thinking: "text-primary",
    executing: "text-primary",
    completed: "text-success",
    failed: "text-error",
  }[status];

  return (
    <div className="flex w-full mb-lg">
      <div className="flex gap-sm w-full max-w-[90%] md:max-w-[680px] lg:max-w-[800px]">
        {/* Agent头像 */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-background-secondary flex items-center justify-center">
          <Bot className="w-4 h-4 text-text-secondary" />
        </div>

        {/* Agent消息卡片 */}
        <div className="flex-1 bg-surface rounded-lg rounded-tl-sm shadow-sm">
          {/* 卡片头部 */}
          <div className="px-lg py-md border-b border-border-light">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-sm">
                <span className="text-sm font-medium text-text-primary">Hovi</span>
                <span className={`flex items-center gap-xs text-xs ${statusColor}`}>
                  {(status === "thinking" || status === "executing") && (
                    <RotateCw className="w-3 h-3 animate-spin" />
                  )}
                  {statusText}
                </span>
              </div>

              <div className="flex items-center gap-sm">
                {timestamp && (
                  <span className="text-xs text-text-tertiary">
                    {timestamp.toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
            </div>

            {/* 摘要已移除 - 合并到步骤中 */}
          </div>

          {/* 步骤列表 */}
          {steps.length > 0 && (
            <div className="px-lg py-md space-y-md">
              {steps.map((step, stepIndex) => (
                <StepItem
                  key={step.id}
                  {...step}
                  messageIndex={messageIndex}
                  stepIndex={stepIndex}
                  defaultExpanded={true}
                />
              ))}
            </div>
          )}

          {/* 子 Agent 列表 */}
          <SubagentList subagents={subagents || []} />
        </div>
      </div>
    </div>
  );
}
