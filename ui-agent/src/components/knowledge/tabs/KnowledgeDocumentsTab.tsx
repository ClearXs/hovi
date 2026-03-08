"use client";

import {
  Ellipsis,
  FileCode2,
  FileJson2,
  FileSpreadsheet,
  FileText,
  Pencil,
  Presentation,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { KnowledgeDocDetail } from "@/components/knowledge/KnowledgeDocDetail";
import { DropZone } from "@/components/knowledge/upload/DropZone";
import { UploadQueue } from "@/components/knowledge/upload/UploadQueue";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useUploadQueue } from "@/hooks/useUploadQueue";
import { uploadKnowledgeWithProgress } from "@/services/knowledgeApi";
import { useKnowledgeBaseStore } from "@/stores/knowledgeBaseStore";

interface KnowledgeDocumentsTabProps {
  activeDocumentId: string | null;
  backToListSignal?: number;
  onModeChange?: (mode: "list" | "detail") => void;
}

function resolveDocumentIcon(mimetype?: string, filename?: string) {
  const lower = filename?.toLowerCase() ?? "";
  if (mimetype?.includes("presentation") || lower.endsWith(".pptx")) return Presentation;
  if (mimetype?.includes("spreadsheet") || lower.endsWith(".xlsx")) return FileSpreadsheet;
  if (mimetype === "application/json" || lower.endsWith(".json")) return FileJson2;
  if (mimetype?.includes("wordprocessingml") || lower.endsWith(".docx") || lower.endsWith(".md")) {
    return FileText;
  }
  return FileCode2;
}

export function KnowledgeDocumentsTab({
  activeDocumentId,
  backToListSignal = 0,
  onModeChange,
}: KnowledgeDocumentsTabProps) {
  const {
    documentIds,
    documentsById,
    loadDocuments,
    offset,
    limit,
    total,
    selectDocument,
    uploadDocument,
    isUploading,
    isDeleting,
    deleteDocument,
    updateDocumentMetadata,
    activeKbId,
    rebuildDocument,
    isRebuilding,
    rebuildProgress,
  } = useKnowledgeBaseStore();
  const [mode, setMode] = useState<"list" | "detail">("list");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFilename, setEditFilename] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState("");
  const [rebuildingId, setRebuildingId] = useState<string | null>(null);

  // 监听重建完成
  useEffect(() => {
    if (!isRebuilding && rebuildingId) {
      // 延迟清理，让用户看到完成状态
      const timer = setTimeout(() => {
        setRebuildingId(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isRebuilding, rebuildingId]);

  const {
    items: uploadQueue,
    summary,
    addFiles,
    start,
    retry,
    remove,
    clearFinished,
  } = useUploadQueue({
    concurrency: 2,
    uploadFile: async (item, onProgress) => {
      if (!activeKbId) throw new Error("请先选择知识库");
      await uploadKnowledgeWithProgress(
        {
          kbId: activeKbId,
          file: item.file,
          description: item.description,
          tags: item.tags,
        },
        onProgress,
      );
    },
    onItemSuccess: () => {
      if (activeKbId) {
        void loadDocuments({ offset: 0, kbId: activeKbId });
      }
    },
  });

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  if (!activeKbId) {
    return (
      <div className="rounded-xl border border-border-light p-lg text-sm text-text-tertiary">
        请先选择知识库。
      </div>
    );
  }

  useEffect(() => {
    if (activeDocumentId) {
      setMode("detail");
    }
  }, [activeDocumentId]);

  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  useEffect(() => {
    if (backToListSignal <= 0) return;
    setMode("list");
    void selectDocument(null);
  }, [backToListSignal, selectDocument]);

  useEffect(() => {
    if (activeKbId) {
      void loadDocuments({ offset: 0, kbId: activeKbId });
      setMode("list");
    }
  }, [activeKbId, loadDocuments]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-lg">
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-[28rem]">
          <DialogHeader>
            <DialogTitle>上传文档</DialogTitle>
          </DialogHeader>
          <div className="space-y-md text-sm">
            <div>
              <div className="text-xs text-text-tertiary mb-xs">选择文件</div>
              <Input
                type="file"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) {
                    setUploadFile(files[0]);
                    addFiles(files, {
                      description: description.trim() || undefined,
                    });
                  }
                }}
              />
            </div>
            <div>
              <div className="text-xs text-text-tertiary mb-xs">描述</div>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="可选"
              />
            </div>
            {uploadError && <div className="text-xs text-error">{uploadError}</div>}
            <DropZone
              onFilesSelected={(files) => {
                addFiles(files, {
                  description: description.trim() || undefined,
                });
                if (!uploadFile && files[0]) {
                  setUploadFile(files[0]);
                }
              }}
            />
            <UploadQueue
              items={uploadQueue}
              onRetry={retry}
              onRemove={remove}
              onClearFinished={clearFinished}
            />
            {uploadQueue.length > 0 && (
              <div className="text-xs text-text-tertiary">
                队列总数 {summary.total} · 等待 {summary.pending} · 上传中 {summary.uploading} ·
                成功 {summary.success} · 失败 {summary.error}
              </div>
            )}
            <div className="flex justify-end gap-sm">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUploadOpen(false)}
                disabled={isUploading}
              >
                取消
              </Button>
              <Button
                size="sm"
                disabled={(!uploadFile && uploadQueue.length === 0) || isUploading}
                onClick={async () => {
                  setUploadError(null);
                  try {
                    if (uploadQueue.length > 0) {
                      start();
                      return;
                    }
                    if (!uploadFile) return;
                    await uploadDocument(uploadFile, description.trim() || undefined);
                    setUploadOpen(false);
                    setUploadFile(null);
                    setDescription("");
                  } catch (error) {
                    setUploadError(error instanceof Error ? error.message : "上传失败");
                  }
                }}
              >
                {isUploading ? "上传中..." : uploadQueue.length > 0 ? "开始队列上传" : "上传"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-[28rem]">
          <DialogHeader>
            <DialogTitle>编辑文档信息</DialogTitle>
          </DialogHeader>
          <div className="space-y-md text-sm">
            <div>
              <div className="mb-xs text-xs text-text-tertiary">文档名称</div>
              <Input value={editFilename} onChange={(e) => setEditFilename(e.target.value)} />
            </div>
            <div>
              <div className="mb-xs text-xs text-text-tertiary">描述</div>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="可选"
              />
            </div>
            {editError ? <div className="text-xs text-error">{editError}</div> : null}
            <div className="flex justify-end gap-sm">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(false)}
                disabled={isSavingEdit}
              >
                取消
              </Button>
              <Button
                size="sm"
                disabled={isSavingEdit || !editingId || !editFilename.trim()}
                onClick={async () => {
                  if (!editingId) return;
                  setEditError(null);
                  setIsSavingEdit(true);
                  try {
                    await updateDocumentMetadata({
                      documentId: editingId,
                      filename: editFilename.trim(),
                      description: editDescription,
                    });
                    setEditOpen(false);
                  } catch (error) {
                    setEditError(error instanceof Error ? error.message : "保存失败");
                  } finally {
                    setIsSavingEdit(false);
                  }
                }}
              >
                {isSavingEdit ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-[28rem]">
          <DialogHeader>
            <DialogTitle>删除文档</DialogTitle>
          </DialogHeader>
          <div className="space-y-md text-sm">
            <div className="text-text-secondary">确认删除 {deletingName || "该文档"} 吗？</div>
            <div className="flex justify-end gap-sm">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteOpen(false)}
                disabled={isDeleting}
              >
                取消
              </Button>
              <Button
                variant="default"
                size="sm"
                className="bg-error text-white hover:bg-error/90"
                disabled={!deletingId || isDeleting}
                onClick={async () => {
                  if (!deletingId) return;
                  await deleteDocument(deletingId);
                  setDeleteOpen(false);
                  setDeletingId(null);
                  setDeletingName("");
                }}
              >
                {isDeleting ? "删除中..." : "确认删除"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {mode === "list" ? (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">文档列表</h3>
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              上传文档
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-sm">
            {documentIds.length === 0 ? (
              <div className="col-span-full rounded-xl border border-border-light p-lg text-sm text-text-tertiary text-center">
                暂无文档，先上传一个文件吧。
              </div>
            ) : (
              documentIds.map((id) => (
                <div
                  key={id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    void selectDocument(id);
                    setMode("detail");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      void selectDocument(id);
                      setMode("detail");
                    }
                  }}
                  className="group rounded-xl border border-border-light bg-white p-md text-left transition-all hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="mb-sm flex items-start justify-between gap-sm">
                    <div className="flex min-w-0 items-start gap-sm">
                      <div className="rounded-md bg-primary/10 p-2 text-primary">
                        {(() => {
                          const doc = documentsById[id];
                          const Icon = resolveDocumentIcon(doc?.mimetype, doc?.filename);
                          return <Icon className="h-4 w-4" />;
                        })()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-text-primary">
                          {documentsById[id]?.filename}
                        </div>
                        <div className="mt-1 truncate text-[11px] text-text-tertiary">
                          {documentsById[id]?.mimetype || "未知类型"}
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="rounded-md p-1 text-text-tertiary opacity-0 transition-opacity hover:bg-background-secondary hover:text-text-primary group-hover:opacity-100"
                          onClick={(event) => event.stopPropagation()}
                          aria-label="更多操作"
                        >
                          <Ellipsis className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-36"
                        onClick={(event) => event.stopPropagation()}
                        onMouseEnter={(e) => {
                          // 让 dropdown 保持打开状态
                        }}
                      >
                        <DropdownMenuItem
                          onClick={() => {
                            setRebuildingId(id);
                            void rebuildDocument(id);
                          }}
                          disabled={isRebuilding}
                        >
                          <RefreshCw
                            className={`mr-2 h-4 w-4 ${isRebuilding && rebuildingId === id ? "animate-spin" : ""}`}
                          />
                          重建
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            const doc = documentsById[id];
                            setEditingId(id);
                            setEditFilename(doc?.filename ?? "");
                            setEditDescription(doc?.description ?? "");
                            setEditError(null);
                            setEditOpen(true);
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          编辑信息
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-error focus:text-error"
                          disabled={isDeleting}
                          onClick={() => {
                            setDeletingId(id);
                            setDeletingName(documentsById[id]?.filename || "该文档");
                            setDeleteOpen(true);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          删除文档
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="truncate text-[11px] text-text-tertiary">
                    {documentsById[id]?.indexed ? "已索引" : "索引中"} ·{" "}
                    {documentsById[id]?.size ? (documentsById[id].size / 1024).toFixed(1) : "0"} KB
                  </div>
                  {/* 重建进度显示 */}
                  {rebuildingId === id && isRebuilding && rebuildProgress && (
                    <div className="mt-1 flex items-center gap-1 text-[10px]">
                      <RefreshCw className="h-3 w-3 animate-spin text-primary" />
                      <span className="text-primary">
                        {rebuildProgress.vectorized ? "向量化完成" : "向量化中..."}
                        {rebuildProgress.graphBuilt ? " · 图谱完成" : " · 图谱构建中..."}
                      </span>
                    </div>
                  )}
                  {rebuildingId === id && isRebuilding && !rebuildProgress && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-primary">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      重建中...
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          {total > 0 && (
            <div className="flex items-center justify-between text-xs text-text-tertiary">
              <div>共 {total} 条</div>
              <div className="flex items-center gap-sm">
                <button
                  className="px-sm py-xs rounded border border-border-light hover:bg-background-secondary"
                  disabled={currentPage <= 1}
                  onClick={() => void loadDocuments({ offset: Math.max(0, offset - limit) })}
                >
                  上一页
                </button>
                <span>
                  {currentPage} / {totalPages}
                </span>
                <button
                  className="px-sm py-xs rounded border border-border-light hover:bg-background-secondary"
                  disabled={currentPage >= totalPages}
                  onClick={() => void loadDocuments({ offset: offset + limit })}
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 min-h-0">
          <KnowledgeDocDetail documentId={activeDocumentId} />
        </div>
      )}
    </div>
  );
}
