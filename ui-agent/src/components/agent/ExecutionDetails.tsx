"use client";

import { ChevronDown, ChevronUp, Terminal, FileCode, Eye, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { AgentStep, AgentExecution } from "@/types/agent";

interface ExecutionDetailsProps {
  execution: AgentExecution | null;
}

// Helper function to format observation (can be string or object)
function formatObservation(observation: string | Record<string, unknown> | undefined): string {
  if (!observation) return "";
  if (typeof observation === "string") return observation;
  return JSON.stringify(observation, null, 2);
}

export function ExecutionDetails({ execution }: ExecutionDetailsProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  if (!execution) {
    return (
      <div className="execution-details">
        <h3 className="text-lg font-medium text-gray-900 mb-4">执行详情</h3>
        <div className="text-center text-gray-500 py-8">暂无执行详情</div>
      </div>
    );
  }

  const toggleStep = (stepNumber: number) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepNumber)) {
      newExpanded.delete(stepNumber);
    } else {
      newExpanded.add(stepNumber);
    }
    setExpandedSteps(newExpanded);
  };

  const getStatusBadge = (status: string) => {
    const classes: Record<string, string> = {
      pending: "bg-gray-100 text-gray-700",
      running: "bg-blue-100 text-blue-700",
      completed: "bg-green-100 text-green-700",
      failed: "bg-red-100 text-red-700",
    };
    const labels: Record<string, string> = {
      pending: "等待执行",
      running: "执行中",
      completed: "已完成",
      failed: "失败",
    };
    return (
      <span
        className={`px-2 py-1 text-xs font-medium rounded-full ${classes[status] || classes.pending}`}
      >
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="execution-details">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">执行详情</h3>
        {execution.error && (
          <span className="text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            执行出错
          </span>
        )}
      </div>

      {execution.status === "pending" && (
        <div className="text-center py-8 text-gray-500">任务已提交，等待开始执行...</div>
      )}

      <div className="space-y-3">
        {execution.steps.map((step, index) => (
          <div
            key={index}
            className={`rounded-lg border overflow-hidden transition-all duration-200 ${
              step.status === "running"
                ? "border-blue-300 bg-blue-50/50"
                : step.status === "failed"
                  ? "border-red-200 bg-red-50/50"
                  : "border-gray-200 bg-white"
            }`}
          >
            {/* Step Header - Always Visible */}
            <button
              onClick={() => toggleStep(step.step_number)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
                  {step.step_number}
                </span>
                <span className="text-sm font-medium text-gray-900 line-clamp-1">
                  {step.action}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(step.status)}
                {expandedSteps.has(step.step_number) ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </div>
            </button>

            {/* Expanded Content */}
            {expandedSteps.has(step.step_number) && (
              <div className="px-4 pb-4 border-t border-gray-100">
                {/* Thought */}
                {step.thought && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-yellow-700 mb-2">
                      <Eye className="w-3 h-3" />
                      AI 思考过程
                    </div>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
                      {step.thought}
                    </div>
                  </div>
                )}

                {/* Action */}
                <div className="mt-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-blue-700 mb-2">
                    <Terminal className="w-3 h-3" />
                    执行动作
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
                    {step.action}
                  </div>
                </div>

                {/* Observation/Result */}
                <div className="mt-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-green-700 mb-2">
                    <FileCode className="w-3 h-3" />
                    执行结果
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-800">
                    {formatObservation(step.observation)}
                  </div>
                </div>

                {/* Tool Calls */}
                {step.tool_calls && step.tool_calls.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-purple-700 mb-2">
                      工具调用 ({step.tool_calls.length})
                    </div>
                    <div className="space-y-2">
                      {step.tool_calls.map((tool, i) => (
                        <div
                          key={i}
                          className="bg-purple-50 border border-purple-200 rounded-md p-3"
                        >
                          <div className="font-mono text-sm text-purple-800">{tool.name}</div>
                          {tool.arguments && (
                            <pre className="mt-2 text-xs text-purple-600 overflow-x-auto whitespace-pre-wrap break-all">
                              {JSON.stringify(tool.arguments, null, 2)}
                            </pre>
                          )}
                          {tool.result && (
                            <div className="mt-2 text-sm text-purple-700">结果: {tool.result}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Files Created */}
                {step.files_created && step.files_created.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-green-700 mb-2">创建的文件</div>
                    <div className="flex flex-wrap gap-2">
                      {step.files_created.map((file, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center px-2 py-1 bg-green-100 text-green-700 rounded text-xs"
                        >
                          📄 {file}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Code Written */}
                {step.code_written && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-blue-700 mb-2">生成的代码</div>
                    <div className="bg-gray-900 rounded-md overflow-hidden">
                      <pre className="p-3 text-xs text-gray-100 overflow-x-auto whitespace-pre-wrap break-all max-h-64">
                        <code>{step.code_written}</code>
                      </pre>
                    </div>
                  </div>
                )}

                {/* Error */}
                {step.error && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-red-700 mb-2">错误信息</div>
                    <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
                      {step.error}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Final Result */}
      {execution.result && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-2">最终结果</h4>
          <p className="text-sm text-gray-600">{execution.result}</p>
        </div>
      )}
    </div>
  );
}
