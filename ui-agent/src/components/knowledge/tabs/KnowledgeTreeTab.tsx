"use client";

import {
  Ellipsis,
  ChevronRight,
  FileCode2,
  FolderOpen,
  GripVertical,
  Eye,
  LocateFixed,
  Network,
  RefreshCw,
  ScanSearch,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { KnowledgeChunksList } from "@/components/knowledge/KnowledgeChunksList";
import { KnowledgeDocDetail } from "@/components/knowledge/KnowledgeDocDetail";
import { DocPreview } from "@/components/knowledge/preview/DocPreview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatFileSize } from "@/lib/fileUtils";
import { cn, formatDate } from "@/lib/utils";
import { openPathInSystem } from "@/services/desktop-file-actions";
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
  renameKnowledgeTreeFile,
} from "@/services/knowledgeApi";
import { useKnowledgeBaseStore } from "@/stores/knowledgeBaseStore";
import { useToastStore } from "@/stores/toastStore";

interface KnowledgeTreeTabProps {
  activeDocumentId: string | null;
  backToListSignal?: number;
  onModeChange?: (mode: "list" | "detail") => void;
  onDetailStateChange?: (state: KnowledgeTreeDetailState | null) => void;
}

export interface KnowledgeTreeDetailState {
  title: string;
  canRebuild: boolean;
  canEdit: boolean;
  metadata?: {
    path: string;
    typeLabel: string;
    sizeLabel: string;
    createdAtLabel: string;
    permissions: string;
  };
  isBusy?: boolean;
  onRebuild: () => void;
  onEdit: () => void;
}

const MIN_DETAIL_PANEL_WIDTH = 260;
const DEFAULT_DETAIL_PANEL_WIDTH = 320;

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

function buildPathBreadcrumbs(input: string): Array<{ label: string; path: string }> {
  const raw = input.trim();
  if (!raw) return [];

  const normalized = raw.replace(/\\/g, "/").replace(/\/+$/, "");
  if (normalized === "" || normalized === "/") {
    return [{ label: "根目录", path: "/" }];
  }

  const driveMatch = normalized.match(/^[A-Za-z]:/);
  if (driveMatch) {
    const drive = driveMatch[0];
    const rest = normalized.slice(drive.length).replace(/^\/+/, "");
    const crumbs: Array<{ label: string; path: string }> = [
      { label: `${drive}\\`, path: `${drive}\\` },
    ];
    let currentPath = `${drive}\\`;
    for (const segment of rest ? rest.split("/") : []) {
      currentPath = currentPath.endsWith("\\")
        ? `${currentPath}${segment}`
        : `${currentPath}\\${segment}`;
      crumbs.push({ label: segment, path: currentPath });
    }
    return crumbs;
  }

  const segments = normalized.replace(/^\/+/, "").split("/").filter(Boolean);
  const crumbs: Array<{ label: string; path: string }> = [{ label: "根目录", path: "/" }];
  let currentPath = "";
  for (const segment of segments) {
    currentPath = `${currentPath}/${segment}`;
    crumbs.push({ label: segment, path: currentPath });
  }
  return crumbs;
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

function formatTreeValue(value?: number | null) {
  if (!value || value <= 0) return "-";
  return formatFileSize(value);
}

function formatTreeTime(value?: number | null) {
  if (!value || !Number.isFinite(value)) return "-";
  return formatDate(new Date(value));
}

function buildTreeDetailMetadata(entry: KnowledgeTreeEntry) {
  return {
    path: entry.path,
    typeLabel: entry.typeLabel,
    sizeLabel: entry.kind === "directory" ? "-" : formatTreeValue(entry.size),
    createdAtLabel: formatTreeTime(entry.createdAtMs),
    permissions: entry.permissions ?? "-",
  };
}

function replaceFilenameInPath(filePath: string, filename: string) {
  const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  if (lastSlash < 0) {
    return filename;
  }
  return `${filePath.slice(0, lastSlash + 1)}${filename}`;
}

function renderIndexState(entry: KnowledgeTreeEntry) {
  if (entry.kind === "directory") {
    return <span className="text-xs text-text-tertiary">-</span>;
  }

  return (
    <div className="flex items-center gap-1 text-[11px]">
      <span
        className={cn(
          "rounded px-1.5 py-0.5",
          entry.vectorized
            ? "bg-primary/10 text-primary"
            : "bg-background-secondary text-text-tertiary",
        )}
      >
        向量
      </span>
      <span
        className={cn(
          "rounded px-1.5 py-0.5",
          entry.graphBuilt
            ? "bg-primary/10 text-primary"
            : "bg-background-secondary text-text-tertiary",
        )}
      >
        图谱
      </span>
    </div>
  );
}

function LocalVirtualDetail({ kbId, detail }: { kbId: string; detail: KnowledgeDetail }) {
  const [panelWidth, setPanelWidth] = useState(DEFAULT_DETAIL_PANEL_WIDTH);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = Math.max(
        MIN_DETAIL_PANEL_WIDTH,
        Math.min(window.innerWidth * 0.5, event.clientX - 48),
      );
      setPanelWidth(nextWidth);
    };

    const handleMouseUp = () => setDragging(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging]);

  return (
    <div className="flex h-full min-h-0">
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden rounded-l-lg border border-border-light"
        style={{ width: panelWidth }}
      >
        <KnowledgeChunksList
          chunks={[]}
          activeChunkId={null}
          onSelectChunk={() => {}}
          emptyState={{
            title: "暂无分块数据",
          }}
        />
      </div>

      <div
        className={cn(
          "w-1 cursor-col-resize flex-shrink-0 group",
          dragging ? "bg-primary" : "bg-transparent hover:bg-border",
        )}
        onMouseDown={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
      >
        <div className="flex h-full items-center justify-center">
          <GripVertical
            className={cn(
              "h-5 w-5 transition-colors",
              dragging ? "text-white" : "text-transparent group-hover:text-text-tertiary",
            )}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 rounded-r-lg border border-l-0 border-border-light">
        <DocPreview
          detail={detail}
          treeContext={{
            kbId,
            path: detail.filepath ?? detail.filename,
          }}
        />
      </div>
    </div>
  );
}

export function KnowledgeTreeTab({
  activeDocumentId,
  backToListSignal = 0,
  onModeChange,
  onDetailStateChange,
}: KnowledgeTreeTabProps) {
  const activeKbId = useKnowledgeBaseStore((state) => state.activeKbId);
  const selectDocument = useKnowledgeBaseStore((state) => state.selectDocument);
  const loadDocuments = useKnowledgeBaseStore((state) => state.loadDocuments);
  const rebuildDocument = useKnowledgeBaseStore((state) => state.rebuildDocument);
  const updateDocumentMetadata = useKnowledgeBaseStore((state) => state.updateDocumentMetadata);
  const isRebuilding = useKnowledgeBaseStore((state) => state.isRebuilding);
  const { addToast } = useToastStore();

  const [mode, setMode] = useState<"list" | "detail">("list");
  const [roots, setRoots] = useState<KnowledgeTreeRoot[]>([]);
  const [currentRoot, setCurrentRoot] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>("/");
  const [entries, setEntries] = useState<KnowledgeTreeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<KnowledgeTreeEntry | null>(null);
  const [selectedMaterializedDocumentId, setSelectedMaterializedDocumentId] = useState<
    string | null
  >(null);
  const [selectedVirtualDetail, setSelectedVirtualDetail] = useState<KnowledgeDetail | null>(null);
  const [lastListPath, setLastListPath] = useState<string>("/");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameFilename, setRenameFilename] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);

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

  const openEntry = async (entry: KnowledgeTreeEntry) => {
    if (!activeKbId) return;

    if (entry.kind === "directory") {
      await loadChildren(entry.path);
      return;
    }

    setError(null);
    setSelectedEntry(entry);
    setLastListPath(currentPath);

    try {
      if (entry.documentId) {
        await selectDocument(entry.documentId);
        setSelectedMaterializedDocumentId(entry.documentId);
        setSelectedVirtualDetail(null);
        setMode("detail");
        return;
      }

      const file = await getKnowledgeTreeFile({
        kbId: activeKbId,
        path: entry.path,
      });

      if (file.documentId) {
        await selectDocument(file.documentId);
        setSelectedMaterializedDocumentId(file.documentId);
        setSelectedVirtualDetail(null);
      } else {
        await selectDocument(null);
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
  };

  const openRenameDialog = (entry: KnowledgeTreeEntry) => {
    setRenameFilename(entry.name);
    setRenameError(null);
    setRenameOpen(true);
  };

  const materializeEntry = async (
    entry: KnowledgeTreeEntry,
    modeValue: "vectorize" | "graphize",
    openAfter = false,
  ) => {
    if (!activeKbId) return;
    setBusyPath(entry.path);
    setError(null);
    try {
      const result = await materializeKnowledgeTreeFile({
        kbId: activeKbId,
        path: entry.path,
        mode: modeValue,
      });
      await loadDocuments({ offset: 0, kbId: activeKbId });
      await loadChildren(currentPath);

      const nextEntry: KnowledgeTreeEntry = {
        ...entry,
        materialized: true,
        vectorized: result.vectorized,
        graphBuilt: result.graphBuilt,
        documentId: result.documentId,
      };
      setSelectedEntry(nextEntry);

      if (openAfter || selectedVirtualDetail?.filepath === entry.path) {
        await selectDocument(result.documentId);
        setSelectedMaterializedDocumentId(result.documentId);
        setSelectedVirtualDetail(null);
        setMode("detail");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "处理失败");
    } finally {
      setBusyPath(null);
    }
  };

  const rebuildVirtualEntry = async (entry: KnowledgeTreeEntry) => {
    if (busyPath === entry.path) return;
    await materializeEntry(entry, "vectorize", false);
    await materializeEntry(
      {
        ...entry,
        documentId: null,
        materialized: true,
        vectorized: true,
      },
      "graphize",
      true,
    );
  };

  const renameSelectedEntry = async () => {
    if (!activeKbId || !selectedEntry) return;
    const nextFilename = renameFilename.trim();
    if (!nextFilename) {
      setRenameError("文件名不能为空");
      return;
    }

    setIsRenaming(true);
    setRenameError(null);

    try {
      if (selectedEntry.documentId) {
        const updated = await updateDocumentMetadata({
          documentId: selectedEntry.documentId,
          filename: nextFilename,
        });
        const nextPath =
          updated.filepath ?? replaceFilenameInPath(selectedEntry.path, nextFilename);
        const nextEntry: KnowledgeTreeEntry = {
          ...selectedEntry,
          name: updated.filename,
          path: nextPath,
        };
        setSelectedEntry(nextEntry);
        setSelectedMaterializedDocumentId(selectedEntry.documentId);
        setSelectedVirtualDetail(null);
        await loadChildren(currentPath);
        await selectDocument(selectedEntry.documentId);
      } else {
        const updated = await renameKnowledgeTreeFile({
          kbId: activeKbId,
          path: selectedEntry.path,
          filename: nextFilename,
        });
        const nextEntry: KnowledgeTreeEntry = {
          ...selectedEntry,
          name: updated.filename,
          path: updated.path,
          documentId: updated.documentId ?? null,
        };
        setSelectedEntry(nextEntry);
        setSelectedVirtualDetail(
          makeVirtualDetail({
            kbId: activeKbId,
            path: updated.path,
            filename: updated.filename,
            mimetype: selectedVirtualDetail?.mimetype ?? "text/plain",
          }),
        );
        await loadChildren(currentPath);
      }

      setRenameOpen(false);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "重命名失败");
    } finally {
      setIsRenaming(false);
    }
  };

  const revealEntryPath = async (entry: KnowledgeTreeEntry) => {
    const result = await openPathInSystem(entry.path);
    if (!result.ok) {
      addToast({
        title: "定位本地路径失败",
        description: result.message,
        variant: "error",
      });
    }
  };

  useEffect(() => {
    if (!activeKbId) return;
    setMode("list");
    setSelectedEntry(null);
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
    setSelectedEntry(null);
    setSelectedVirtualDetail(null);
    setSelectedMaterializedDocumentId(null);
    void selectDocument(null);
    void loadChildren(lastListPath);
  }, [backToListSignal, lastListPath, selectDocument]);

  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  useEffect(() => {
    if (mode !== "detail" || !selectedEntry) {
      onDetailStateChange?.(null);
      return;
    }

    onDetailStateChange?.({
      title: selectedEntry.name,
      canRebuild: true,
      canEdit: true,
      metadata: buildTreeDetailMetadata(selectedEntry),
      isBusy: busyPath === selectedEntry.path,
      onRebuild: () => {
        if (selectedEntry.documentId) {
          void rebuildDocument(selectedEntry.documentId);
          return;
        }
        void rebuildVirtualEntry(selectedEntry);
      },
      onEdit: () => {
        openRenameDialog(selectedEntry);
      },
    });
  }, [busyPath, mode, onDetailStateChange, rebuildDocument, selectedEntry]);

  const parentPath = useMemo(() => getParentPath(currentPath), [currentPath]);
  const pathBreadcrumbs = useMemo(() => buildPathBreadcrumbs(currentPath), [currentPath]);
  const renameDialog = (
    <Dialog
      open={renameOpen}
      onOpenChange={(open) => {
        setRenameOpen(open);
        if (!open) {
          setRenameError(null);
        }
      }}
    >
      <DialogContent className="max-w-[48rem] w-[90vw]">
        <DialogHeader>
          <DialogTitle>重命名文件</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={renameFilename}
            onChange={(event) => setRenameFilename(event.target.value)}
          />
          {renameError ? <div className="text-xs text-error">{renameError}</div> : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRenameOpen(false)}
              disabled={isRenaming}
            >
              取消
            </Button>
            <Button size="sm" onClick={() => void renameSelectedEntry()} disabled={isRenaming}>
              {isRenaming ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (!activeKbId) {
    return (
      <>
        {renameDialog}
        <div className="rounded-xl border border-border-light p-lg text-sm text-text-tertiary">
          请先选择知识库。
        </div>
      </>
    );
  }

  if (mode === "detail") {
    if (selectedMaterializedDocumentId) {
      return (
        <>
          {renameDialog}
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex-1 min-h-0">
              <KnowledgeDocDetail documentId={selectedMaterializedDocumentId} />
            </div>
          </div>
        </>
      );
    }

    if (selectedVirtualDetail && selectedEntry) {
      return (
        <>
          {renameDialog}
          <LocalVirtualDetail kbId={activeKbId} detail={selectedVirtualDetail} />
        </>
      );
    }
  }

  return (
    <>
      {renameDialog}
      <div className="flex h-full min-h-0 flex-col gap-md">
        <div className="flex flex-wrap items-center gap-sm">
          {roots.length > 1 && (
            <Select
              value={currentRoot ?? ""}
              onValueChange={(nextRoot) => {
                setCurrentRoot(nextRoot);
                void loadChildren(nextRoot);
              }}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="选择根目录" />
              </SelectTrigger>
              <SelectContent>
                {roots.map((root) => (
                  <SelectItem key={root.id} value={root.path}>
                    {root.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-xs text-text-tertiary">
            {pathBreadcrumbs.map((crumb, index) => (
              <div key={`${crumb.path}-${index}`} className="flex items-center gap-1">
                {index > 0 ? <ChevronRight className="h-3 w-3 text-text-tertiary" /> : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-text-tertiary hover:text-text-primary"
                  onClick={() => void loadChildren(crumb.path)}
                >
                  {crumb.label}
                </Button>
              </div>
            ))}
          </div>
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
            <div className="min-w-[920px]">
              <div className="sticky top-0 z-10 grid grid-cols-[minmax(280px,2.5fr)_1.3fr_0.9fr_0.8fr_1fr_0.9fr_56px] gap-sm border-b border-border-light bg-background-secondary/95 px-md py-sm text-[11px] font-medium text-text-tertiary backdrop-blur">
                <div>名称</div>
                <div>创建时间</div>
                <div>大小</div>
                <div>类型</div>
                <div>权限</div>
                <div>索引</div>
                <div className="text-right">操作</div>
              </div>
              <div className="divide-y divide-border-light">
                {entries.map((entry) => {
                  const isBusy = busyPath === entry.path;
                  const canRebuild = Boolean(entry.documentId);

                  return (
                    <div
                      key={entry.id}
                      className="group grid grid-cols-[minmax(280px,2.5fr)_1.3fr_0.9fr_0.8fr_1fr_0.9fr_56px] items-center gap-sm px-md py-sm text-sm transition-colors hover:bg-primary/5"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-sm text-left"
                        onClick={() => void openEntry(entry)}
                      >
                        <span className="rounded-md bg-primary/10 p-2 text-primary">
                          {entry.kind === "directory" ? (
                            <FolderOpen className="h-4 w-4" />
                          ) : (
                            <FileCode2 className="h-4 w-4" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-text-primary">
                            {entry.name}
                          </div>
                          <div className="truncate text-[11px] text-text-tertiary">
                            {entry.path}
                          </div>
                        </div>
                      </button>

                      <div className="truncate text-xs text-text-secondary">
                        {formatTreeTime(entry.createdAtMs)}
                      </div>
                      <div className="truncate text-xs text-text-secondary">
                        {entry.kind === "directory" ? "-" : formatTreeValue(entry.size)}
                      </div>
                      <div className="truncate text-xs text-text-secondary">{entry.typeLabel}</div>
                      <div className="truncate text-xs text-text-secondary">
                        {entry.permissions ?? "-"}
                      </div>
                      <div>{renderIndexState(entry)}</div>

                      <div className="flex justify-end">
                        <div className="flex items-center gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label="更多操作"
                                className="h-8 w-8 text-text-tertiary opacity-0 transition-opacity hover:bg-background-secondary hover:text-text-primary group-hover:opacity-100"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <Ellipsis className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-40"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <DropdownMenuItem onClick={() => void revealEntryPath(entry)}>
                                <LocateFixed className="mr-2 h-4 w-4" />
                                <span>定位到本地路径</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void openEntry(entry)}>
                                <Eye className="mr-2 h-4 w-4" />
                                <span>{entry.kind === "directory" ? "打开目录" : "查看详情"}</span>
                              </DropdownMenuItem>
                              {entry.kind === "file" ? (
                                <>
                                  <DropdownMenuItem
                                    disabled={isBusy}
                                    onClick={() => void materializeEntry(entry, "vectorize")}
                                  >
                                    <ScanSearch className="mr-2 h-4 w-4" />
                                    <span>向量化</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={isBusy}
                                    onClick={() => void materializeEntry(entry, "graphize")}
                                  >
                                    <Network className="mr-2 h-4 w-4" />
                                    <span>图谱化</span>
                                  </DropdownMenuItem>
                                  {canRebuild ? (
                                    <DropdownMenuItem
                                      disabled={isRebuilding}
                                      onClick={() => {
                                        if (!entry.documentId) return;
                                        void rebuildDocument(entry.documentId);
                                      }}
                                    >
                                      <RefreshCw className="mr-2 h-4 w-4" />
                                      <span>重建</span>
                                    </DropdownMenuItem>
                                  ) : null}
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
