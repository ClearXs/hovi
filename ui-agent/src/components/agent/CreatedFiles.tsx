"use client";

import { Database, FileText, Image, PieChart } from "lucide-react";
import { formatFileSize } from "@/lib/fileUtils";
import { useAgentStore } from "@/stores/agentStore";
import { FileItem } from "@/types";

interface FileDisplayItem {
  id: string;
  name: string;
  size: string;
  type: "pdf" | "png" | "json" | "csv" | "other";
  isOutput: boolean;
}

const CreatedFiles = () => {
  const agent = useAgentStore((state) => state.agent);

  // Convert store files to display format or show demo data
  const displayFiles: FileDisplayItem[] = agent?.createdFiles?.length
    ? agent.createdFiles.map((file) => ({
        id: file.id,
        name: file.name,
        size: file.size ? formatFileSize(file.size) : "Unknown",
        type: file.name.endsWith(".pdf")
          ? "pdf"
          : file.name.endsWith(".png")
            ? "png"
            : file.name.endsWith(".json")
              ? "json"
              : file.name.endsWith(".csv")
                ? "csv"
                : "other",
        isOutput: true,
      }))
    : [
        {
          id: "1",
          name: "sales_report.pdf",
          size: "2.3 MB",
          type: "pdf",
          isOutput: true,
        },
        {
          id: "2",
          name: "sales_trend_chart.png",
          size: "1.1 MB",
          type: "png",
          isOutput: true,
        },
        {
          id: "3",
          name: "category_ranking.png",
          size: "980 KB",
          type: "png",
          isOutput: true,
        },
        {
          id: "4",
          name: "summary.json",
          size: "12 KB",
          type: "json",
          isOutput: true,
        },
      ];

  const getFileIcon = (type: string) => {
    switch (type) {
      case "pdf":
        return <FileText className="w-8 h-8 text-red-500" />;
      case "png":
      case "jpg":
        return <Image className="w-8 h-8 text-green-500" />;
      case "csv":
        return <Database className="w-8 h-8 text-blue-500" />;
      case "json":
        return <PieChart className="w-8 h-8 text-yellow-500" />;
      default:
        return <FileText className="w-8 h-8 text-gray-500" />;
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
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
        创建的文件
      </h4>
      <div className="space-y-2">
        {displayFiles.map((file) => (
          <div
            key={file.id}
            className="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded-lg hover:border-primary-300 hover:shadow-sm transition-all cursor-pointer group"
          >
            {getFileIcon(file.type)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate group-hover:text-primary-600">
                {file.name}
              </p>
              <p className="text-xs text-gray-500">
                {file.size} • {file.type.toUpperCase()} 文件
              </p>
            </div>
            <button className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CreatedFiles;
