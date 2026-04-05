"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { DiscoverSettings, DiscoverSource, DiscoverSourceHealth } from "./types";

type DiscoverSettingsPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: DiscoverSettings;
  sources: DiscoverSource[];
  sourceHealthById?: Record<string, DiscoverSourceHealth>;
  saving?: boolean;
  onSave: (settings: DiscoverSettings) => Promise<void>;
  onToggleSource: (sourceId: string, enabled: boolean) => Promise<void>;
  onBatchToggleSources: (enabled: boolean) => Promise<void>;
  onPreviewImport: (
    lines: string,
    strategy: "upsert" | "skip",
  ) => Promise<{
    totalInput: number;
    valid: number;
    added: number;
    updated: number;
    skipped: number;
  } | null>;
  onBulkImport: (lines: string, strategy: "upsert" | "skip") => Promise<void>;
  onExportFailedSources: (
    format: "csv",
  ) => Promise<{ totalFailed: number; content: string } | null>;
  onExportSourcesSnapshot: () => Promise<{ totalSources: number; content: string } | null>;
  onImportSourcesSnapshot: (
    content: string,
    mode: "replace" | "merge",
  ) => Promise<{ imported: number; updated?: number; total: number } | null>;
};

export function DiscoverSettingsPanel({
  open,
  onOpenChange,
  settings,
  sources,
  sourceHealthById = {},
  saving = false,
  onSave,
  onToggleSource,
  onBatchToggleSources,
  onPreviewImport,
  onBulkImport,
  onExportFailedSources,
  onExportSourcesSnapshot,
  onImportSourcesSnapshot,
}: DiscoverSettingsPanelProps) {
  const [draft, setDraft] = useState<DiscoverSettings>(settings);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [snapshotExporting, setSnapshotExporting] = useState(false);
  const [snapshotImporting, setSnapshotImporting] = useState(false);
  const [conflictStrategy, setConflictStrategy] = useState<"upsert" | "skip">("upsert");
  const [snapshotMode, setSnapshotMode] = useState<"replace" | "merge">("replace");
  const [preview, setPreview] = useState<{
    totalInput: number;
    valid: number;
    added: number;
    updated: number;
    skipped: number;
  } | null>(null);
  const [failedExport, setFailedExport] = useState<{ totalFailed: number; content: string } | null>(
    null,
  );
  const [snapshotText, setSnapshotText] = useState("");
  const [snapshotResult, setSnapshotResult] = useState<{
    imported: number;
    updated?: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(settings);
    }
  }, [open, settings]);

  const sourceCountLabel = useMemo(() => {
    const enabledCount = sources.filter((source) => source.enabled).length;
    return `${enabledCount} / ${sources.length}`;
  }, [sources]);

  const formatTime = (value?: string) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "--";
    }
    return date.toLocaleString("zh-CN", { hour12: false });
  };

  const statusClassName = (status?: string) => {
    switch (status) {
      case "error":
        return "bg-red-100 text-red-700 border-red-200";
      case "warning":
        return "bg-amber-100 text-amber-700 border-amber-200";
      default:
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[100100] max-h-[85vh] w-[calc(100vw-40px)] max-w-[1080px] overflow-y-auto"
        overlayClassName="z-[100000] bg-black/50"
      >
        <DialogHeader>
          <DialogTitle>来源配置</DialogTitle>
          <DialogDescription>
            私有化模式默认仅使用本地维护来源，不自动开启外部抓取。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3 rounded-lg border border-border-light p-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="allow-external-fetch">允许外部抓取</Label>
              <Switch
                id="allow-external-fetch"
                checked={draft.allowExternalFetch}
                onCheckedChange={(checked) =>
                  setDraft((prev) => ({ ...prev, allowExternalFetch: checked }))
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="discover-update-interval">更新间隔（分钟）</Label>
                <Input
                  id="discover-update-interval"
                  type="number"
                  min={5}
                  max={1440}
                  value={draft.updateIntervalMinutes}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      updateIntervalMinutes: Number.parseInt(event.target.value || "0", 10) || 5,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discover-max-items">单次条目上限</Label>
                <Input
                  id="discover-max-items"
                  type="number"
                  min={5}
                  max={100}
                  value={draft.maxItemsPerFeed}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      maxItemsPerFeed: Number.parseInt(event.target.value || "0", 10) || 5,
                    }))
                  }
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                className="cursor-pointer"
                onClick={() => onSave(draft)}
                disabled={saving}
              >
                保存设置
              </Button>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-border-light p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">来源列表</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-tertiary">{sourceCountLabel} 已启用</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 cursor-pointer px-2 text-xs"
                  onClick={() => void onBatchToggleSources(true)}
                >
                  全开
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 cursor-pointer px-2 text-xs"
                  onClick={() => void onBatchToggleSources(false)}
                >
                  全关
                </Button>
              </div>
            </div>
            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {sources.map((source) => (
                <div key={source.id} className="rounded-md border border-border-light px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-text-primary">{source.name}</p>
                      <p className="truncate text-xs text-text-tertiary">{source.url}</p>
                    </div>
                    <Switch
                      checked={source.enabled}
                      onCheckedChange={(checked) => onToggleSource(source.id, checked)}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${statusClassName(sourceHealthById[source.id]?.status)}`}
                    >
                      {sourceHealthById[source.id]?.status ?? "healthy"}
                    </span>
                    <span>失败 {sourceHealthById[source.id]?.failCount ?? 0}</span>
                    <span>最近 {formatTime(sourceHealthById[source.id]?.lastFetchAt)}</span>
                    <span>下次 {formatTime(sourceHealthById[source.id]?.nextFetchAt)}</span>
                  </div>
                  {sourceHealthById[source.id]?.lastError ? (
                    <p className="mt-1 truncate text-[11px] text-red-600">
                      {sourceHealthById[source.id]?.lastError}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-border-light p-4">
            <h3 className="text-sm font-semibold text-text-primary">批量导入来源</h3>
            <p className="text-xs text-text-tertiary">
              每行一条，格式：来源名称,URL,类型（可选）。
            </p>
            <Textarea
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setPreview(null);
              }}
              placeholder="Reuters World,https://www.reuters.com/world/,global-media"
              className="min-h-[120px]"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="discover-conflict-strategy">冲突策略</Label>
                <Select
                  value={conflictStrategy}
                  onValueChange={(value) => setConflictStrategy(value as "upsert" | "skip")}
                >
                  <SelectTrigger id="discover-conflict-strategy" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upsert">覆盖已有（upsert）</SelectItem>
                    <SelectItem value="skip">跳过冲突（skip）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer"
                  disabled={exporting}
                  onClick={async () => {
                    setExporting(true);
                    try {
                      const result = await onExportFailedSources("csv");
                      setFailedExport(result);
                    } finally {
                      setExporting(false);
                    }
                  }}
                >
                  导出失败来源
                </Button>
              </div>
            </div>
            {preview ? (
              <div className="rounded-md border border-border-light bg-muted/30 px-3 py-2 text-xs text-text-secondary">
                预检：输入 {preview.totalInput} 条，有效 {preview.valid} 条，新增 {preview.added}{" "}
                条， 覆盖 {preview.updated} 条，跳过 {preview.skipped} 条
              </div>
            ) : null}
            {failedExport ? (
              <div className="space-y-2 rounded-md border border-border-light bg-muted/30 px-3 py-2">
                <p className="text-xs text-text-secondary">
                  失败来源 {failedExport.totalFailed} 条（CSV）
                </p>
                <Textarea value={failedExport.content} readOnly className="min-h-[120px]" />
              </div>
            ) : null}
            <div className="space-y-2 rounded-md border border-border-light p-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="discover-snapshot-mode">来源回放模式</Label>
                <Select
                  value={snapshotMode}
                  onValueChange={(value) => setSnapshotMode(value as "replace" | "merge")}
                >
                  <SelectTrigger id="discover-snapshot-mode" className="h-8 w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="replace">覆盖回放（replace）</SelectItem>
                    <SelectItem value="merge">合并回放（merge）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                value={snapshotText}
                onChange={(event) => setSnapshotText(event.target.value)}
                placeholder='{"version":1,"sources":[...]}'
                className="min-h-[120px]"
              />
              {snapshotResult ? (
                <p className="text-xs text-text-secondary">
                  回放结果：导入 {snapshotResult.imported} 条
                  {typeof snapshotResult.updated === "number"
                    ? `，更新 ${snapshotResult.updated} 条`
                    : ""}
                  ，当前总数 {snapshotResult.total}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer"
                  disabled={snapshotExporting}
                  onClick={async () => {
                    setSnapshotExporting(true);
                    try {
                      const result = await onExportSourcesSnapshot();
                      if (result?.content) {
                        setSnapshotText(result.content);
                      }
                    } finally {
                      setSnapshotExporting(false);
                    }
                  }}
                >
                  导出全部来源
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer"
                  disabled={snapshotImporting || !snapshotText.trim()}
                  onClick={async () => {
                    setSnapshotImporting(true);
                    try {
                      const result = await onImportSourcesSnapshot(snapshotText, snapshotMode);
                      setSnapshotResult(result);
                    } finally {
                      setSnapshotImporting(false);
                    }
                  }}
                >
                  回放导入
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                className="mr-2 cursor-pointer"
                disabled={previewing || importing || !importText.trim()}
                onClick={async () => {
                  setPreviewing(true);
                  try {
                    const result = await onPreviewImport(importText, conflictStrategy);
                    setPreview(result);
                  } finally {
                    setPreviewing(false);
                  }
                }}
              >
                预检导入
              </Button>
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer"
                disabled={importing || !importText.trim()}
                onClick={async () => {
                  setImporting(true);
                  try {
                    await onBulkImport(importText, conflictStrategy);
                    setImportText("");
                    setPreview(null);
                  } finally {
                    setImporting(false);
                  }
                }}
              >
                导入来源
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
