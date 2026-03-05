"use client";

import { Play, Square, RefreshCw, ChevronDown, ChevronUp, MessageCircle } from "lucide-react";
import { useState } from "react";
import { AgentExecution, AgentTask } from "@/types/agent";
import { ExecutionDetails } from "./ExecutionDetails";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { TodoList } from "./TodoList";

interface AgentPanelProps {
  execution: AgentExecution | null;
  isExecuting: boolean;
  isThinking: boolean;
  onExecute: (task: AgentTask) => void;
  onCancel: () => void;
  onRetry: () => void;
  onToggleConversation?: () => void;
  showConversation?: boolean;
}

export function AgentPanel({
  execution,
  isExecuting,
  isThinking,
  onExecute,
  onCancel,
  onRetry,
  onToggleConversation,
  showConversation = true,
}: AgentPanelProps) {
  const currentStep = execution?.steps.find((s) => s.status === "running");
  const completedSteps = execution?.steps.filter((s) => s.status === "completed").length || 0;
  const totalSteps = execution?.steps.length || 0;

  // Collapsible sections
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(true);
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(true);

  return (
    <div className="agent-panel flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900">Agent 执行</h2>
            {/* Conversation toggle */}
            {onToggleConversation && (
              <button
                onClick={onToggleConversation}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  showConversation
                    ? "bg-[#10a37f] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <MessageCircle className="w-3 h-3" />
                {showConversation ? "对话" : "隐藏"}
              </button>
            )}
          </div>
          {execution && (
            <div className="flex items-center gap-2">
              {execution.status === "completed" && (
                <button
                  onClick={onRetry}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  重试
                </button>
              )}
              {isExecuting && (
                <button
                  onClick={onCancel}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Square className="w-4 h-4" />
                  停止
                </button>
              )}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {execution && totalSteps > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>执行进度</span>
              <span>
                {completedSteps}/{totalSteps} 步骤
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-[#10a37f] h-2 rounded-full transition-all duration-300"
                style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4">
        {/* Thinking Indicator */}
        <ThinkingIndicator
          isThinking={isThinking}
          status="正在规划任务..."
          isExpanded={isThinkingExpanded}
          onToggle={() => setIsThinkingExpanded(!isThinkingExpanded)}
        />

        {/* Execution Status */}
        {execution && (
          <div
            className={`p-3 rounded-lg border ${
              execution.status === "running"
                ? "bg-blue-50 border-blue-200"
                : execution.status === "completed"
                  ? "bg-green-50 border-green-200"
                  : execution.status === "failed"
                    ? "bg-red-50 border-red-200"
                    : "bg-gray-50 border-gray-200"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  execution.status === "running"
                    ? "bg-blue-500 animate-pulse"
                    : execution.status === "completed"
                      ? "bg-green-500"
                      : execution.status === "failed"
                        ? "bg-red-500"
                        : "bg-gray-400"
                }`}
              />
              <span
                className={`text-sm font-medium ${
                  execution.status === "running"
                    ? "text-blue-700"
                    : execution.status === "completed"
                      ? "text-green-700"
                      : execution.status === "failed"
                        ? "text-red-700"
                        : "text-gray-700"
                }`}
              >
                {execution.status === "pending"
                  ? "等待执行"
                  : execution.status === "running"
                    ? "执行中..."
                    : execution.status === "completed"
                      ? "执行完成"
                      : "执行失败"}
              </span>
            </div>
            {execution.error && <p className="mt-2 text-xs text-red-600">{execution.error}</p>}
          </div>
        )}

        {/* TODO List */}
        <TodoList steps={execution?.steps || []} currentStep={currentStep} />

        {/* Collapsible Execution Details */}
        {execution && execution.steps.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <span className="text-sm font-medium text-gray-700">执行详情</span>
              {isDetailsExpanded ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {isDetailsExpanded && (
              <div className="p-4">
                <ExecutionDetails execution={execution} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
