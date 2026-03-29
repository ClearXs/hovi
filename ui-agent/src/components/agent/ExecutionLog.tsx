"use client";

import { useAgentStore } from "@/stores/agentStore";
import { LogEntry } from "@/types";

interface LogDisplayEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warning" | "error" | "code" | "debug";
  message: string;
}

interface ExecutionLogProps {
  maxHeight?: string;
}

const ExecutionLog = ({ maxHeight = "200px" }: ExecutionLogProps) => {
  const agent = useAgentStore((state) => state.agent);

  // Convert store logs to display format or show demo data
  const displayLogs: LogDisplayEntry[] = agent?.executionLog?.length
    ? agent.executionLog.map((log) => ({
        id: log.id,
        timestamp: log.timestamp.toLocaleTimeString("zh-CN", { hour12: false }),
        level: log.level as LogDisplayEntry["level"],
        message: log.message,
      }))
    : [
        {
          id: "1",
          timestamp: "14:30:45",
          level: "info",
          message: "开始执行任务",
        },
        {
          id: "2",
          timestamp: "14:30:46",
          level: "info",
          message: "创建 Docker 容器",
        },
        {
          id: "3",
          timestamp: "14:30:48",
          level: "success",
          message: "容器启动成功",
        },
        {
          id: "4",
          timestamp: "14:30:50",
          level: "code",
          message: "执行代码: pandas.read_csv",
        },
        {
          id: "5",
          timestamp: "14:30:55",
          level: "success",
          message: "文件读取成功",
        },
        {
          id: "6",
          timestamp: "14:31:02",
          level: "code",
          message: "执行代码: data.describe()",
        },
        {
          id: "7",
          timestamp: "14:31:10",
          level: "info",
          message: "生成图表中...",
        },
      ];

  const getLevelStyles = (level: string) => {
    switch (level) {
      case "success":
        return { icon: "✅", text: "text-green-300", bg: "text-green-400", label: "SUCCESS" };
      case "warning":
        return { icon: "⚠️", text: "text-yellow-300", bg: "text-yellow-400", label: "WARN" };
      case "error":
        return { icon: "❌", text: "text-red-300", bg: "text-red-400", label: "ERROR" };
      case "code":
        return { icon: "📝", text: "text-yellow-300", bg: "text-yellow-400", label: "CODE" };
      default:
        return { icon: "ℹ️", text: "text-blue-300", bg: "text-blue-400", label: "INFO" };
    }
  };

  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
        <svg
          className="w-4 h-4 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        执行日志
      </h4>
      <div
        className="bg-gray-900 rounded-lg p-3 font-mono text-xs overflow-y-auto scrollbar-default"
        style={{ maxHeight }}
      >
        <div className="space-y-1">
          {displayLogs.map((log) => {
            const styles = getLevelStyles(log.level);
            return (
              <div key={log.id} className="flex items-start gap-2">
                <span className="text-gray-500 whitespace-nowrap">{log.timestamp}</span>
                <span className={`${styles.bg} whitespace-nowrap`}>{styles.label}</span>
                <span className={styles.text}>{log.message}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ExecutionLog;
