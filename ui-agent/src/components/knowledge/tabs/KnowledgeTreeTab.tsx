"use client";

import { Folder, FolderOpen, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { KnowledgeDocDetail } from "@/components/knowledge/KnowledgeDocDetail";
import { DocPreview } from "@/components/knowledge/preview/DocPreview";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/fileUtils";
import type {
  KnowledgeDetail,
  KnowledgeTreeEntry,
  KnowledgeTreeRoot,
} from "@/services/knowledgeApi";
import {
  getKnowledgeTreeFile,
  listKnowledgeTreeChildren,
  listKnowledgeTreeRoots,
  materializeKnowledgeTreeFile,
} from "@/services/knowledgeApi";
import { useKnowledgeBaseStore } from "@/stores/knowledgeBaseStore";

interface KnowledgeTreeTabProps {
  activeDocumentId: string | null;
  backToListSignal?: number;
  onModeChange?: (mode: "list" | "detail") => void;
}

function getParentPath(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const normalized = raw.replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalized === "") return null;
  if (/^[A-Za-z]:$/.test(normalized)) return null;
  if (normalized === "/") return null;
  const segments = normalized.split("/");
  segments.pop();
  if (segments.length === 0) return "/";
  if (segments.length === 1 && /^[A-Za-z]:$/.test(segments[0] ?? "")) return `${segments[0]}\\`;
  return segments.join("/") || "/";
}

function makeVirtualDetail(params: {
  kbId: string;
  path: string;
  filename: string;
  mimetype: string;
}): KnowledgeDetail {
  return {
    id: `tree:${params.path}`,
    kbId: params.kbId,
    filename: params.filename,
    filepath: params.path,
    mimetype: params.mimetype,
    size: 0,
    sourceType: "local_fs",
    sourceMetadata: { sourcePath: params.path },
  };
}

export function KnowledgeTreeTab({
  activeDocumentId,
  backToListSignal = 0,
  onModeChange,
}: KnowledgeTreeTabProps) {
  const activeKbId = useKnowledgeBaseStore((state) => state.activeKbId);
  const selectDocument = useKnowledgeBaseStore((state) => state.selectDocument);
  const loadDocuments = useKnowledgeBaseStore((state) => state.loadDocuments);

  const [mode, setMode] = useState<"list" | "detail">("list");
  const [roots, setRoots] = useState<KnowledgeTreeRoot[]>([]);
  const [currentRoot, setCurrentRoot] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>("/");
  const [entries, setEntries] = useState<KnowledgeTreeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [selectedMaterializedDocumentId, setSelectedMaterializedDocumentId] = useState<
    string | null
  >(null);
  const [selectedVirtualDetail, setSelectedVirtualDetail] = useState<KnowledgeDetail | null>(null);

  const loadChildren = async (pathValue: string) => {
    if (!activeKbId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await listKnowledgeTreeChildren({
        kbId: activeKbId,
        path: pathValue,
      });
      setEntries(result.entries);
      setCurrentPath(pathValue);
    } catch (err) {
      setError(err instanceof Error ? err.message : "目录加载失败");
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!activeKbId) return;
    setMode("list");
    setSelectedVirtualDetail(null);
    setSelectedMaterializedDocumentId(null);
    const run = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await listKnowledgeTreeRoots(activeKbId);
        setRoots(result.roots);
        const firstRoot = result.roots[0]?.path;
        setCurrentRoot(firstRoot ?? null);
        if (firstRoot) {
          await loadChildren(firstRoot);
        } else {
          setEntries([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "根目录加载失败");
      } finally {
        setIsLoading(false);
      }
    };
    void run();
  }, [activeKbId]);

  useEffect(() => {
    if (!activeDocumentId) return;
    setSelectedVirtualDetail(null);
    setSelectedMaterializedDocumentId(activeDocumentId);
    setMode("detail");
  }, [activeDocumentId]);

  useEffect(() => {
    if (backToListSignal <= 0) return;
    setMode("list");
    setSelectedVirtualDetail(null);
    setSelectedMaterializedDocumentId(null);
  }, [backToListSignal]);

  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  const parentPath = useMemo(() => getParentPath(currentPath), [currentPath]);

  if (!activeKbId) {
    return (
      <div className="rounded-xl border border-border-light p-lg text-sm text-text-tertiary">
        请先选择知识库。
      </div>
    );
  }

  if (mode === "detail") {
    if (selectedMaterializedDocumentId) {
      return (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex-1 min-h-0">
            <KnowledgeDocDetail documentId={selectedMaterializedDocumentId} />
          </div>
        </div>
      );
    }
    if (selectedVirtualDetail) {
      return (
        <div className="h-full min-h-0 rounded-lg border border-border-light p-sm">
          <DocPreview
            detail={selectedVirtualDetail}
            treeContext={{
              kbId: activeKbId,
              path: selectedVirtualDetail.filepath ?? selectedVirtualDetail.filename,
            }}
          />
        </div>
      );
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-md">
      <div className="flex flex-wrap items-center gap-sm">
        {roots.length > 1 && (
          <select
            className="h-8 rounded border border-border-light bg-white px-sm text-xs"
            value={currentRoot ?? ""}
            onChange={(event) => {
              const nextRoot = event.target.value;
              setCurrentRoot(nextRoot);
              void loadChildren(nextRoot);
            }}
          >
            {roots.map((root) => (
              <option key={root.id} value={root.path}>
                {root.name}
              </option>
            ))}
          </select>
        )}
        {parentPath && (
          <Button size="sm" variant="outline" onClick={() => void loadChildren(parentPath)}>
            返回上级
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => void loadChildren(currentPath)}
          disabled={isLoading}
        >
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          刷新
        </Button>
        <div className="truncate text-xs text-text-tertiary">{currentPath}</div>
      </div>

      {error ? (
        <div className="rounded-xl border border-error/30 bg-error/5 p-md text-xs text-error">
          {error}
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-border-light">
        {entries.length === 0 ? (
          <div className="p-lg text-sm text-text-tertiary">
            {isLoading ? "加载中..." : "暂无可用文件"}
          </div>
        ) : (
          <div className="divide-y divide-border-light">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-sm p-sm">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-sm text-left"
                  onClick={() => {
                    if (entry.kind === "directory") {
                      void loadChildren(entry.path);
                      return;
                    }
                    void (async () => {
                      try {
                        const file = await getKnowledgeTreeFile({
                          kbId: activeKbId,
                          path: entry.path,
                        });
                        if (file.documentId) {
                          await selectDocument(file.documentId);
                          setSelectedMaterializedDocumentId(file.documentId);
                          setSelectedVirtualDetail(null);
                        } else {
                          setSelectedMaterializedDocumentId(null);
                          setSelectedVirtualDetail(
                            makeVirtualDetail({
                              kbId: activeKbId,
                              path: entry.path,
                              filename: file.filename,
                              mimetype: file.mimetype,
                            }),
                          );
                        }
                        setMode("detail");
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "文件打开失败");
                      }
                    })();
                  }}
                >
                  <span className="text-primary">
                    {entry.kind === "directory" ? (
                      <FolderOpen className="h-4 w-4" />
                    ) : (
                      <Folder className="h-4 w-4 opacity-0" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm text-text-primary">{entry.name}</div>
                    <div className="truncate text-[11px] text-text-tertiary">
                      {entry.kind === "directory"
                        ? "目录"
                        : `${entry.extension ?? ""} ${entry.size ? `· ${formatFileSize(entry.size)}` : ""}`}
                    </div>
                  </div>
                </button>

                {entry.kind === "file" ? (
                  <div className="flex items-center gap-xs">
                    <span className="rounded bg-background-secondary px-2 py-0.5 text-[10px] text-text-tertiary">
                      向量化 {entry.vectorized ? "✓" : "×"}
                    </span>
                    <span className="rounded bg-background-secondary px-2 py-0.5 text-[10px] text-text-tertiary">
                      图谱化 {entry.graphBuilt ? "✓" : "×"}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyPath === entry.path}
                      onClick={async (event) => {
                        event.stopPropagation();
                        setBusyPath(entry.path);
                        try {
                          await materializeKnowledgeTreeFile({
                            kbId: activeKbId,
                            path: entry.path,
                            mode: "vectorize",
                          });
                          await loadDocuments({ offset: 0, kbId: activeKbId });
                          await loadChildren(currentPath);
                        } finally {
                          setBusyPath(null);
                        }
                      }}
                    >
                      向量化
                    </Button>
                    <Button
                      size="sm"
                      disabled={busyPath === entry.path}
                      onClick={async (event) => {
                        event.stopPropagation();
                        setBusyPath(entry.path);
                        try {
                          await materializeKnowledgeTreeFile({
                            kbId: activeKbId,
                            path: entry.path,
                            mode: "graphize",
                          });
                          await loadDocuments({ offset: 0, kbId: activeKbId });
                          await loadChildren(currentPath);
                        } finally {
                          setBusyPath(null);
                        }
                      }}
                    >
                      图谱化
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
