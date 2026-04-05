"use client";

import { FileText, Download, ExternalLink, Copy, FolderOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  renderDisplayTypeIcon,
  resolveDisplayType,
  type FileBaseType,
} from "@/components/files/file-type-registry";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToastStore } from "@/stores/toastStore";

export interface FileItemProps {
  name: string;
  path: string;
  size?: string;
  type?: FileBaseType;
  description?: string;
  source?: "generated" | "detected-path";
  rawPath?: string;
  resolvedPath?: string;
  kind?: "file" | "directory" | "unknown";
  access?: "unknown" | "ok" | "missing" | "denied" | "invalid";
  previewable?: boolean;
  previewUrl?: string;
  agentId?: string;
}

interface FileItemActionProps {
  file: FileItemProps;
  onPreviewFile?: (file: FileItemProps) => void;
  onSystemOpenFile?: (file: FileItemProps) => void;
}

function buildCardKey(file: FileItemProps): string {
  return [file.source ?? "generated", file.resolvedPath ?? file.path, file.name].join("|");
}

function isDetectedPathCard(file: FileItemProps): boolean {
  return file.source === "detected-path";
}

function toDisplayPath(path: string): string {
  if (path.length <= 56) {
    return path;
  }
  const head = path.slice(0, 22);
  const tail = path.slice(-30);
  return `${head}...${tail}`;
}

function getPathText(file: FileItemProps): string | null {
  const candidate = file.resolvedPath ?? file.rawPath ?? file.description ?? null;
  if (!candidate) {
    return null;
  }
  return candidate.trim() || null;
}

function normalizePathForSplit(path: string): string[] {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").split("/").filter(Boolean);
}

function buildParentTail(path: string, depth: number): string {
  const segments = normalizePathForSplit(path);
  if (segments.length <= 1) {
    return "";
  }
  const parentSegments = segments.slice(0, -1);
  return parentSegments.slice(Math.max(parentSegments.length - depth, 0)).join("/");
}

function buildDisplayNameMap(files: FileItemProps[]): Map<string, string> {
  const map = new Map<string, string>();
  const grouped = new Map<string, Array<{ key: string; file: FileItemProps }>>();

  for (const file of files) {
    const key = buildCardKey(file);
    const groupKey = file.name.toLowerCase();
    const list = grouped.get(groupKey) ?? [];
    list.push({ key, file });
    grouped.set(groupKey, list);
  }

  for (const group of grouped.values()) {
    if (group.length === 1) {
      const only = group[0];
      if (only) {
        map.set(only.key, only.file.name);
      }
      continue;
    }

    let depth = 1;
    const maxDepth = 6;
    let tailsByKey = new Map<string, string>();

    while (depth <= maxDepth) {
      tailsByKey = new Map(
        group.map(({ key, file }) => {
          const path = getPathText(file) ?? file.path;
          return [key, buildParentTail(path, depth)];
        }),
      );
      const unique = new Set(Array.from(tailsByKey.values()));
      if (unique.size === group.length) {
        break;
      }
      depth += 1;
    }

    group.forEach(({ key, file }, idx) => {
      const tail = tailsByKey.get(key);
      if (!tail) {
        map.set(key, `${file.name} #${idx + 1}`);
        return;
      }
      map.set(key, `${file.name} · ${tail}`);
    });
  }

  return map;
}

function usePathAccessState(files: FileItemProps[]) {
  const [statusMap, setStatusMap] = useState<Record<string, FileItemProps["access"]>>({});

  const probeTargets = useMemo(
    () =>
      files.filter(
        (file) =>
          isDetectedPathCard(file) &&
          file.previewUrl &&
          file.access !== "missing" &&
          file.access !== "denied" &&
          file.access !== "invalid",
      ),
    [files],
  );

  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      for (const file of probeTargets) {
        if (!file.previewUrl) continue;
        const key = buildCardKey(file);
        if (statusMap[key] === "ok" || statusMap[key] === "missing") continue;
        try {
          const response = await fetch(file.previewUrl, {
            method: "HEAD",
            cache: "no-store",
          });
          if (cancelled) return;
          setStatusMap((prev) => ({ ...prev, [key]: response.ok ? "ok" : "missing" }));
        } catch {
          if (cancelled) return;
          setStatusMap((prev) => ({ ...prev, [key]: "missing" }));
        }
      }
    };

    void probe();
    return () => {
      cancelled = true;
    };
  }, [probeTargets, statusMap]);

  return statusMap;
}

function FileItemAction({ file, onPreviewFile, onSystemOpenFile }: FileItemActionProps) {
  const { addToast } = useToastStore();
  const detectedPath = isDetectedPathCard(file);

  const handlePreview = () => {
    if (onPreviewFile) {
      onPreviewFile(file);
      return;
    }
    window.open(file.path, "_blank", "noopener,noreferrer");
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = file.path;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyPath = async () => {
    const text = file.resolvedPath ?? file.rawPath ?? file.path;
    try {
      await navigator.clipboard.writeText(text);
      addToast({ title: "已复制路径", description: text });
    } catch {
      addToast({ title: "复制失败", description: "当前环境不支持复制路径", variant: "error" });
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-primary"
        onClick={handlePreview}
        title="预览"
      >
        <ExternalLink className="h-4 w-4" />
      </Button>
      {detectedPath && onSystemOpenFile ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-primary"
          onClick={() => onSystemOpenFile(file)}
          title="系统打开"
        >
          <FolderOpen className="h-4 w-4" data-testid="icon-system-open" />
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-primary"
          onClick={handleDownload}
          title="下载"
        >
          <Download className="h-4 w-4" data-testid="icon-download" />
        </Button>
      )}
      {detectedPath && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-primary"
          onClick={() => {
            void handleCopyPath();
          }}
          title="复制路径"
        >
          <Copy className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

interface FileListProps {
  files: FileItemProps[];
  title?: string;
  onPreviewFile?: (file: FileItemProps) => void;
  onSystemOpenFile?: (file: FileItemProps) => void;
}

export function FileList({ files, title, onPreviewFile, onSystemOpenFile }: FileListProps) {
  const pathStatus = usePathAccessState(files);
  const displayNameMap = useMemo(() => buildDisplayNameMap(files), [files]);

  if (files.length === 0) return null;

  return (
    <div className="mt-md">
      {title && (
        <h4 className="mb-sm flex items-center gap-xs text-sm font-semibold text-text-primary">
          <FileText className="h-4 w-4" />
          {title}
        </h4>
      )}
      <div className="space-y-xs">
        {files.map((file, index) => {
          const key = buildCardKey(file);
          const displayType = resolveDisplayType(file);
          const displayName = displayNameMap.get(key) ?? file.name;
          const fullPath = getPathText(file);
          const shortPath = fullPath ? toDisplayPath(fullPath) : null;
          const access = pathStatus[key] ?? file.access ?? "unknown";
          const inaccessible = access === "missing" || access === "denied" || access === "invalid";
          return (
            <div
              key={`${key}-${index}`}
              className={`group flex items-center gap-sm rounded border p-sm transition-all ${
                inaccessible
                  ? "border-border-light/60 bg-background-secondary/70 opacity-60"
                  : "border-border-light hover:border-primary hover:bg-primary/5"
              }`}
            >
              <div className="shrink-0" data-testid={`file-icon-${displayType}`}>
                {renderDisplayTypeIcon(displayType)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-xs">
                  <span className="truncate text-sm font-medium text-text-primary">
                    {displayName}
                  </span>
                  {file.size && (
                    <span className="shrink-0 text-xs text-text-tertiary">({file.size})</span>
                  )}
                </div>
                {shortPath && (
                  <TooltipProvider delayDuration={120}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p
                          className="mt-xs cursor-help truncate text-xs text-text-tertiary"
                          title={fullPath ?? undefined}
                        >
                          {shortPath}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[70vw] break-all">{fullPath}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {isDetectedPathCard(file) && inaccessible && (
                  <p className="mt-xs text-xs text-warning">路径不可访问</p>
                )}
              </div>
              <FileItemAction
                file={file}
                onPreviewFile={onPreviewFile}
                onSystemOpenFile={onSystemOpenFile}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
