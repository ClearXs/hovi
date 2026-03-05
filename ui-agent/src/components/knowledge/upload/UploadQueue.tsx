"use client";

import { CheckCircle2, Loader2, RotateCcw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UploadQueueItem } from "@/hooks/useUploadQueue";

interface UploadQueueProps {
  items: UploadQueueItem[];
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onClearFinished: () => void;
}

export function UploadQueue({ items, onRetry, onRemove, onClearFinished }: UploadQueueProps) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border border-border-light p-md">
      <div className="mb-sm flex items-center justify-between">
        <div className="text-sm font-semibold text-text-primary">上传队列</div>
        <Button size="sm" variant="ghost" onClick={onClearFinished}>
          清理已完成
        </Button>
      </div>
      <div className="space-y-xs">
        {items.map((item) => (
          <div key={item.id} className="rounded-md border border-border-light p-sm">
            <div className="flex items-center justify-between gap-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-text-primary">
                  {item.file.name}
                </div>
                <div className="mt-[2px] text-[11px] text-text-tertiary">
                  {(item.file.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
              <div className="flex items-center gap-xs">
                {item.status === "uploading" && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                {item.status === "success" && <CheckCircle2 className="h-4 w-4 text-success" />}
                {item.status === "error" && <XCircle className="h-4 w-4 text-error" />}
                {item.status === "error" && (
                  <Button size="sm" variant="outline" onClick={() => onRetry(item.id)}>
                    <RotateCcw className="mr-xs h-3.5 w-3.5" />
                    重试
                  </Button>
                )}
                {item.status !== "uploading" && (
                  <Button size="sm" variant="ghost" onClick={() => onRemove(item.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-xs h-1.5 w-full overflow-hidden rounded bg-background-secondary">
              <div
                className={`h-full transition-all ${item.status === "error" ? "bg-error" : "bg-primary"}`}
                style={{ width: `${item.progress}%` }}
              />
            </div>
            {item.error && <div className="mt-xs text-[11px] text-error">{item.error}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
