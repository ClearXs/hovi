"use client";

import { ChevronLeft, FileText, Network, Pencil, RefreshCw, Search, Settings2 } from "lucide-react";
import { Loader2, Check, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { KnowledgeDocumentsTab } from "@/components/knowledge/tabs/KnowledgeDocumentsTab";
import { KnowledgeGraphTab } from "@/components/knowledge/tabs/KnowledgeGraphTab";
import { KnowledgeRetrievalTab } from "@/components/knowledge/tabs/KnowledgeRetrievalTab";
import { KnowledgeSettingsTab } from "@/components/knowledge/tabs/KnowledgeSettingsTab";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useKnowledgeBaseStore } from "@/stores/knowledgeBaseStore";

type TabKey = "documents" | "graph" | "retrieval" | "settings";

interface KnowledgeDetailProps {
  activeDocumentId: string | null;
  onBack: () => void;
}

export function KnowledgeDetail({ activeDocumentId, onBack }: KnowledgeDetailProps) {
  const [tab, setTab] = useState<TabKey>("documents");
  const [documentsMode, setDocumentsMode] = useState<"list" | "detail">("list");
  const [backToListSignal, setBackToListSignal] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editFilename, setEditFilename] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const selectDocument = useKnowledgeBaseStore((state) => state.selectDocument);
  const updateDocumentMetadata = useKnowledgeBaseStore((state) => state.updateDocumentMetadata);
  const rebuildDocument = useKnowledgeBaseStore((state) => state.rebuildDocument);
  const isRebuilding = useKnowledgeBaseStore((state) => state.isRebuilding);
  const rebuildProgress = useKnowledgeBaseStore((state) => state.rebuildProgress);
  const kbDetail = useKnowledgeBaseStore((state) => state.kbDetail);
  const currentDocument = useKnowledgeBaseStore((state) => state.detail);
  const isDocumentDetail = tab === "documents" && documentsMode === "detail";
  const canSaveEdit = useMemo(() => {
    return Boolean(currentDocument?.id && editFilename.trim());
  }, [currentDocument?.id, editFilename]);

  const handleOpenDocument = useCallback(
    (documentId: string) => {
      void selectDocument(documentId);
      setTab("documents");
    },
    [selectDocument],
  );

  const handleHeaderBack = () => {
    if (isDocumentDetail) {
      setBackToListSignal((value) => value + 1);
      return;
    }
    onBack();
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-md">
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
                disabled={isSavingEdit || !canSaveEdit}
                onClick={async () => {
                  if (!currentDocument?.id) return;
                  setEditError(null);
                  setIsSavingEdit(true);
                  try {
                    await updateDocumentMetadata({
                      documentId: currentDocument.id,
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
      <div className="p-xs">
        <div className="flex items-start justify-between gap-md">
          <div className="flex items-start gap-md">
            <button
              type="button"
              className="mt-0.5 text-text-tertiary transition-colors hover:text-text-primary"
              onClick={handleHeaderBack}
              aria-label={isDocumentDetail ? "返回文档列表" : "返回"}
              title={isDocumentDetail ? "返回文档列表" : "返回"}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 pt-0.5">
              <div className="truncate text-base font-semibold text-text-primary">
                {isDocumentDetail
                  ? currentDocument?.filename || "文档预览"
                  : kbDetail?.name || "知识库"}
              </div>
              <div className="truncate text-xs text-text-tertiary">
                {isDocumentDetail
                  ? kbDetail?.name || "知识库"
                  : kbDetail?.description || "管理该知识库的文档与检索设置"}
              </div>
            </div>
          </div>
          {isDocumentDetail && (
            <div className="flex items-center gap-xs">
              {/* Rebuild button with tooltip */}
              <div className="relative group">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-text-tertiary transition-colors hover:text-text-primary disabled:opacity-50 text-xs"
                  aria-label="重建文档"
                  disabled={isRebuilding}
                  onClick={() => {
                    if (currentDocument?.id) {
                      void rebuildDocument(currentDocument.id);
                    }
                  }}
                >
                  {isRebuilding ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  重建
                </button>
                {/* Tooltip - show only when rebuilding */}
                <div
                  className={cn(
                    "absolute right-0 top-full mt-1 w-32 rounded-md border border-border-light bg-background-secondary p-2 text-xs shadow-md z-50 transition-all",
                    isRebuilding ? "opacity-100 visible" : "opacity-0 invisible",
                  )}
                >
                  <div className="font-medium mb-1">重建进度</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-text-secondary">向量化</span>
                    {isRebuilding ? (
                      <Loader2 className="h-3 w-3 animate-spin text-text-tertiary" />
                    ) : rebuildProgress?.vectorized ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : rebuildProgress !== null ? (
                      <X className="h-3 w-3 text-text-tertiary" />
                    ) : (
                      <span className="text-text-tertiary">-</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="text-text-secondary">图谱化</span>
                    {isRebuilding ? (
                      <Loader2 className="h-3 w-3 animate-spin text-text-tertiary" />
                    ) : rebuildProgress?.graphBuilt ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : rebuildProgress !== null ? (
                      <X className="h-3 w-3 text-text-tertiary" />
                    ) : (
                      <span className="text-text-tertiary">-</span>
                    )}
                  </div>
                </div>
              </div>
              {/* Edit button */}
              <button
                type="button"
                className="text-text-tertiary transition-colors hover:text-text-primary"
                aria-label="编辑文档信息"
                title="编辑文档信息"
                onClick={() => {
                  setEditFilename(currentDocument?.filename ?? "");
                  setEditDescription(currentDocument?.description ?? "");
                  setEditError(null);
                  setEditOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {!isDocumentDetail && (
          <div className="mt-md border-b border-border-light">
            {(
              [
                { key: "documents", label: "文档", icon: FileText },
                { key: "graph", label: "图谱", icon: Network },
                { key: "retrieval", label: "检索测试", icon: Search },
                { key: "settings", label: "设置", icon: Settings2 },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  className={cn(
                    "inline-flex items-center gap-xs border-b-2 border-transparent px-4 py-2.5 text-sm transition-colors",
                    tab === item.key
                      ? "border-primary text-primary"
                      : "text-text-secondary hover:text-text-primary",
                  )}
                  onClick={() => setTab(item.key)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {tab === "documents" && (
          <KnowledgeDocumentsTab
            activeDocumentId={activeDocumentId}
            backToListSignal={backToListSignal}
            onModeChange={setDocumentsMode}
          />
        )}
        {tab === "graph" && <KnowledgeGraphTab />}
        {tab === "retrieval" && <KnowledgeRetrievalTab onOpenDocument={handleOpenDocument} />}
        {tab === "settings" && <KnowledgeSettingsTab />}
      </div>
    </div>
  );
}
