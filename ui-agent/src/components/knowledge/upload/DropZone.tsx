"use client";

import { UploadCloud } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export function DropZone({ onFilesSelected, disabled }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={cn(
        "rounded-xl border-2 border-dashed p-lg text-center transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-border-light bg-background-secondary/30",
        disabled && "pointer-events-none opacity-60",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
        const files = Array.from(event.dataTransfer.files || []);
        if (files.length > 0) {
          onFilesSelected(files);
        }
      }}
    >
      <div className="mx-auto mb-sm w-fit rounded-full bg-white p-sm shadow-sm">
        <UploadCloud className="h-5 w-5 text-primary" />
      </div>
      <div className="text-sm font-medium text-text-primary">拖拽文件到这里上传</div>
      <div className="mt-xs text-xs text-text-tertiary">支持批量拖拽，系统将自动加入上传队列</div>
    </div>
  );
}
