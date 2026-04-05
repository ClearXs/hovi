"use client";

import { FileText, ChevronUp } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ComputerTriggerBarProps {
  fileCount: number;
  isOpen?: boolean;
  compact?: boolean; // 是否紧凑模式
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; // 可选的点击处理器,接受事件对象
}

export const ComputerTriggerBar = forwardRef<HTMLButtonElement, ComputerTriggerBarProps>(
  function ComputerTriggerBar(
    { fileCount, isOpen = false, compact = false, onClick, ...props },
    ref,
  ) {
    // 仅在有文件时显示
    if (fileCount === 0) return null;

    return (
      <button
        ref={ref}
        {...props}
        onClick={onClick}
        className={cn(
          "inline-flex transition-all cursor-pointer",
          "items-center gap-xs",
          "hover:opacity-80",
          "px-md py-xs rounded-md bg-background-tertiary border border-border",
        )}
        aria-label="查看文件列表"
      >
        <FileText className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-medium text-text-primary whitespace-nowrap">文件列表</span>
        <span className="text-xs text-text-tertiary">{fileCount}</span>
        <ChevronUp
          className={cn(
            "w-3 h-3 text-text-secondary transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>
    );
  },
);
