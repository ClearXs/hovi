"use client";

import {
  AlertCircle,
  CheckSquare,
  Download,
  FileText,
  FolderOpen,
  Globe,
  Loader2,
  Plus,
  Puzzle,
  RefreshCcw,
  Search,
  Square,
  Trash2,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useConnectionStore } from "@/stores/connectionStore";
import { useToastStore } from "@/stores/toastStore";

type PluginOrigin = "bundled" | "global" | "workspace" | "config";

interface PluginStatusEntry {
  id: string;
  name: string;
  description?: string;
  version?: string;
  source: string;
  origin?: PluginOrigin;
  status: "loaded" | "disabled" | "error";
  enabled: boolean;
  error?: string;
}

interface PluginStatusReport {
  workspaceDir?: string;
  plugins: PluginStatusEntry[];
  diagnostics?: Array<{ level: string; pluginId?: string; message: string }>;
}

interface PluginBatchSummary {
  total: number;
  success: number;
  failed: number;
}

interface PluginBatchResponse {
  ok: boolean;
  summary?: PluginBatchSummary;
}

interface PluginInspectReport {
  workspaceDir?: string;
  plugin: PluginStatusEntry;
  shape?: string;
  capabilityMode?: string;
  capabilityCount?: number;
  capabilities?: Array<{ kind: string; ids: string[] }>;
  typedHooks?: Array<{ name: string; priority?: number }>;
  customHooks?: Array<{ name: string; events: string[] }>;
  tools?: Array<{ names: string[]; optional: boolean }>;
  commands?: string[];
  cliCommands?: string[];
  services?: string[];
  gatewayMethods?: string[];
  diagnostics?: Array<{ level: string; pluginId?: string; message: string }>;
}

interface ClawHubPluginItem {
  name: string;
  displayName?: string;
  summary?: string;
  family?: string;
  channel?: string;
  latestVersion?: string;
  score?: number;
}

interface ClawHubSearchResponse {
  items?: ClawHubPluginItem[];
}

const CLAWHUB_DEFAULT_RETRY_SECONDS = 30;
const CLAWHUB_SEARCH_DEBOUNCE_MS = 2000;

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败";
}

function parseRetryAfterSeconds(message: string): number | null {
  const match = message.match(/retry after\s+(\d+)s/i);
  if (!match?.[1]) {
    return null;
  }
  const seconds = Number.parseInt(match[1], 10);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return seconds;
}

function isRateLimitError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("rate limit") || lower.includes("(429)") || lower.includes(" 429");
}

function resolveRetryAfterSeconds(message: string): number | null {
  return (
    parseRetryAfterSeconds(message) ??
    (isRateLimitError(message) ? CLAWHUB_DEFAULT_RETRY_SECONDS : null)
  );
}

function sourceBadge(params: { source: string; origin?: PluginOrigin }) {
  const normalizedSource = params.source.trim().toLowerCase();
  const sourceLooksLikePath =
    params.source.startsWith("/") ||
    params.source.startsWith("~/") ||
    params.source.includes(":\\");
  const key = params.origin ?? (sourceLooksLikePath ? "path" : normalizedSource);

  const variants: Record<string, { label: string; cls: string }> = {
    bundled: { label: "内置", cls: "bg-blue-100 text-blue-700" },
    workspace: { label: "工作区", cls: "bg-green-100 text-green-700" },
    global: { label: "全局", cls: "bg-purple-100 text-purple-700" },
    config: { label: "配置", cls: "bg-gray-100 text-gray-700" },
    path: { label: "本地路径", cls: "bg-amber-100 text-amber-700" },
    npm: { label: "NPM", cls: "bg-violet-100 text-violet-700" },
    clawhub: { label: "ClawHub", cls: "bg-cyan-100 text-cyan-700" },
    marketplace: { label: "市场", cls: "bg-indigo-100 text-indigo-700" },
  };
  const picked = variants[key] ?? { label: params.source, cls: "bg-gray-100 text-gray-700" };
  return (
    <span
      className={`inline-flex max-w-[56vw] items-center rounded px-1.5 py-0.5 text-[10px] sm:max-w-[16rem] md:max-w-[20rem] ${picked.cls}`}
      title={picked.label || params.source}
    >
      <span className="min-w-0 truncate">{picked.label}</span>
    </span>
  );
}

function statusBadge(status: PluginStatusEntry["status"]) {
  const variants: Record<PluginStatusEntry["status"], string> = {
    loaded: "bg-green-100 text-green-700",
    disabled: "bg-gray-100 text-gray-700",
    error: "bg-red-100 text-red-700",
  };
  const label = status === "loaded" ? "已加载" : status === "disabled" ? "已禁用" : "错误";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${variants[status]}`}>{label}</span>;
}

function DetailDialog({
  open,
  onClose,
  loading,
  error,
  detail,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  detail: PluginInspectReport | null;
}) {
  const formatList = (items: string[] | undefined): string => {
    if (!items || items.length === 0) {
      return "-";
    }
    return items.join(", ");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[56rem] h-[82vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            插件详情
          </DialogTitle>
          <DialogDescription>查看插件的能力、Hook、工具与网关方法。</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto rounded-md border border-border-light bg-surface-subtle p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <AlertCircle className="h-7 w-7 text-error" />
              <p className="text-sm text-text-primary">加载详情失败</p>
              <p className="text-xs text-text-tertiary">{error}</p>
            </div>
          ) : detail ? (
            <div className="space-y-4 text-xs text-text-secondary">
              <div className="space-y-1">
                <div className="text-sm font-medium text-text-primary">{detail.plugin.name}</div>
                <div className="text-text-tertiary">{detail.plugin.id}</div>
                {detail.plugin.description ? <div>{detail.plugin.description}</div> : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-text-tertiary">能力模式</div>
                  <div className="text-text-primary">{detail.capabilityMode ?? "-"}</div>
                </div>
                <div>
                  <div className="mb-1 text-text-tertiary">能力数量</div>
                  <div className="text-text-primary">{detail.capabilityCount ?? 0}</div>
                </div>
                <div>
                  <div className="mb-1 text-text-tertiary">命令</div>
                  <div className="break-all text-text-primary">{formatList(detail.commands)}</div>
                </div>
                <div>
                  <div className="mb-1 text-text-tertiary">网关方法</div>
                  <div className="break-all text-text-primary">
                    {formatList(detail.gatewayMethods)}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-1 text-text-tertiary">工具</div>
                <div className="break-all text-text-primary">
                  {detail.tools && detail.tools.length > 0
                    ? detail.tools.map((t) => t.names.join(", ")).join(" | ")
                    : "-"}
                </div>
              </div>

              <div>
                <div className="mb-1 text-text-tertiary">Hooks</div>
                <div className="break-all text-text-primary">
                  {detail.typedHooks && detail.typedHooks.length > 0
                    ? detail.typedHooks.map((h) => h.name).join(", ")
                    : "-"}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-text-tertiary">
              暂无详情
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PluginsTab() {
  const wsClient = useConnectionStore((s) => s.wsClient);
  const { addToast } = useToastStore();

  const [status, setStatus] = useState<PluginStatusReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [batchMode, setBatchMode] = useState(false);
  const [selectedPluginIds, setSelectedPluginIds] = useState<string[]>([]);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [confirmUninstallOpen, setConfirmUninstallOpen] = useState(false);

  const [pathDialogOpen, setPathDialogOpen] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [isPathInstalling, setIsPathInstalling] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PluginInspectReport | null>(null);

  const [clawhubDialogOpen, setClawhubDialogOpen] = useState(false);
  const [clawhubQuery, setClawhubQuery] = useState("openclaw");
  const [clawhubItems, setClawhubItems] = useState<ClawHubPluginItem[]>([]);
  const [isClawhubLoading, setIsClawhubLoading] = useState(false);
  const [clawhubError, setClawhubError] = useState<string | null>(null);
  const [clawhubGlobalCooldownUntil, setClawhubGlobalCooldownUntil] = useState<number>(0);
  const [clawhubCooldownUntilByName, setClawhubCooldownUntilByName] = useState<
    Record<string, number>
  >({});
  const [nowMs, setNowMs] = useState(Date.now());
  const clawhubSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!clawhubDialogOpen) {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [clawhubDialogOpen]);

  const loadPlugins = useCallback(async () => {
    if (!wsClient) {
      setError("未连接到网关");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await wsClient.sendRequest<PluginStatusReport>("plugins.status", {});
      setStatus(result);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setIsLoading(false);
    }
  }, [wsClient]);

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  useEffect(() => {
    const available = new Set((status?.plugins ?? []).map((plugin) => plugin.id));
    setSelectedPluginIds((prev) => prev.filter((pluginId) => available.has(pluginId)));
  }, [status]);

  const filteredPlugins = useMemo(() => {
    const source = status?.plugins ?? [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return source;
    }
    return source.filter((plugin) => {
      const id = plugin.id.toLowerCase();
      const name = plugin.name.toLowerCase();
      const desc = (plugin.description ?? "").toLowerCase();
      return id.includes(query) || name.includes(query) || desc.includes(query);
    });
  }, [searchQuery, status]);

  const selectedCount = useMemo(
    () => filteredPlugins.filter((plugin) => selectedPluginIds.includes(plugin.id)).length,
    [filteredPlugins, selectedPluginIds],
  );
  const clawhubGlobalRemainingSeconds =
    clawhubGlobalCooldownUntil > nowMs
      ? Math.max(1, Math.ceil((clawhubGlobalCooldownUntil - nowMs) / 1000))
      : 0;
  const clawhubGlobalInCooldown = clawhubGlobalRemainingSeconds > 0;

  const togglePlugin = useCallback(
    async (pluginId: string, enabled: boolean) => {
      if (!wsClient) {
        return;
      }
      try {
        await wsClient.sendRequest("plugins.toggle", {
          pluginId,
          enabled,
          timeoutMs: 120000,
        });
        addToast({
          title: enabled ? "插件已启用" : "插件已禁用",
          description: pluginId,
          variant: "success",
        });
        void loadPlugins();
      } catch (err) {
        addToast({
          title: "切换失败",
          description: normalizeError(err),
          variant: "error",
        });
      }
    },
    [addToast, loadPlugins, wsClient],
  );

  const updatePlugin = useCallback(
    async (pluginId: string) => {
      if (!wsClient) {
        return;
      }
      try {
        await wsClient.sendRequest("plugins.update", {
          pluginId,
          timeoutMs: 180000,
        });
        addToast({
          title: "更新完成",
          description: pluginId,
          variant: "success",
        });
        void loadPlugins();
      } catch (err) {
        addToast({
          title: "更新失败",
          description: normalizeError(err),
          variant: "error",
        });
      }
    },
    [addToast, loadPlugins, wsClient],
  );

  const showPluginDetail = useCallback(
    async (pluginId: string) => {
      if (!wsClient) {
        return;
      }
      setDetailOpen(true);
      setDetailLoading(true);
      setDetailError(null);
      setDetail(null);
      try {
        const result = await wsClient.sendRequest<PluginInspectReport>("plugins.inspect", {
          pluginId,
        });
        setDetail(result);
      } catch (err) {
        setDetailError(normalizeError(err));
      } finally {
        setDetailLoading(false);
      }
    },
    [wsClient],
  );

  const installFromPath = useCallback(async () => {
    if (!wsClient || !pathInput.trim()) {
      return;
    }
    setIsPathInstalling(true);
    try {
      await wsClient.sendRequest("plugins.install", {
        source: "path",
        path: pathInput.trim(),
        timeoutMs: 180000,
      });
      addToast({
        title: "安装成功",
        description: `已从本地路径安装: ${pathInput.trim()}`,
        variant: "success",
      });
      setPathDialogOpen(false);
      setPathInput("");
      void loadPlugins();
    } catch (err) {
      addToast({
        title: "安装失败",
        description: normalizeError(err),
        variant: "error",
      });
    } finally {
      setIsPathInstalling(false);
    }
  }, [addToast, loadPlugins, pathInput, wsClient]);

  const searchClawHub = useCallback(
    async (rawQuery?: string) => {
      const query = (rawQuery ?? clawhubQuery).trim();
      if (!wsClient || !query) {
        setClawhubItems([]);
        setClawhubError(null);
        return;
      }

      if (clawhubGlobalCooldownUntil > Date.now()) {
        const seconds = Math.max(1, Math.ceil((clawhubGlobalCooldownUntil - Date.now()) / 1000));
        setClawhubError(`ClawHub 请求过于频繁，请在 ${seconds}s 后重试`);
        return;
      }

      setIsClawhubLoading(true);
      setClawhubError(null);
      try {
        const result = await wsClient.sendRequest<ClawHubSearchResponse>("plugins.clawhub.search", {
          query,
          limit: 24,
          timeoutMs: 120000,
        });
        setClawhubItems(result.items ?? []);
        setClawhubGlobalCooldownUntil(0);
      } catch (err) {
        const message = normalizeError(err);
        const retryAfter = resolveRetryAfterSeconds(message);
        if (retryAfter) {
          setClawhubGlobalCooldownUntil(Date.now() + retryAfter * 1000);
          setClawhubError(`ClawHub 请求过于频繁，请在 ${retryAfter}s 后重试`);
        } else {
          setClawhubError(message);
        }
        setClawhubItems([]);
      } finally {
        setIsClawhubLoading(false);
      }
    },
    [clawhubGlobalCooldownUntil, clawhubQuery, wsClient],
  );

  useEffect(() => {
    if (!clawhubDialogOpen) {
      if (clawhubSearchTimerRef.current) {
        clearTimeout(clawhubSearchTimerRef.current);
        clawhubSearchTimerRef.current = null;
      }
      return;
    }
    if (clawhubSearchTimerRef.current) {
      clearTimeout(clawhubSearchTimerRef.current);
      clawhubSearchTimerRef.current = null;
    }

    clawhubSearchTimerRef.current = setTimeout(() => {
      void searchClawHub(clawhubQuery);
      clawhubSearchTimerRef.current = null;
    }, CLAWHUB_SEARCH_DEBOUNCE_MS);

    return () => {
      if (clawhubSearchTimerRef.current) {
        clearTimeout(clawhubSearchTimerRef.current);
        clawhubSearchTimerRef.current = null;
      }
    };
  }, [clawhubDialogOpen, clawhubQuery, searchClawHub]);

  const installFromClawHub = useCallback(
    async (item: ClawHubPluginItem) => {
      if (!wsClient) {
        return;
      }
      if (clawhubGlobalCooldownUntil > Date.now()) {
        const seconds = Math.max(1, Math.ceil((clawhubGlobalCooldownUntil - Date.now()) / 1000));
        addToast({
          title: "请稍后重试",
          description: `ClawHub 限流中，${seconds}s 后可重试`,
          variant: "warning",
        });
        return;
      }
      const cooldownUntil = clawhubCooldownUntilByName[item.name] ?? 0;
      if (cooldownUntil > Date.now()) {
        const seconds = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
        addToast({
          title: "请稍后重试",
          description: `ClawHub 限流中，${seconds}s 后可重试 ${item.name}`,
          variant: "warning",
        });
        return;
      }

      const spec = `clawhub:${item.name}${item.latestVersion ? `@${item.latestVersion}` : ""}`;
      try {
        await wsClient.sendRequest("plugins.install", {
          source: "clawhub",
          spec,
          timeoutMs: 180000,
        });
        addToast({
          title: "安装成功",
          description: spec,
          variant: "success",
        });
        setClawhubDialogOpen(false);
        void loadPlugins();
      } catch (err) {
        const message = normalizeError(err);
        const retryAfter = resolveRetryAfterSeconds(message);
        if (retryAfter) {
          setClawhubCooldownUntilByName((prev) => ({
            ...prev,
            [item.name]: Date.now() + retryAfter * 1000,
          }));
          setClawhubGlobalCooldownUntil(Date.now() + retryAfter * 1000);
          addToast({
            title: "ClawHub 限流",
            description: `${item.name} 需要 ${retryAfter}s 后重试`,
            variant: "warning",
          });
          return;
        }
        addToast({
          title: "安装失败",
          description: message,
          variant: "error",
        });
      }
    },
    [addToast, clawhubCooldownUntilByName, clawhubGlobalCooldownUntil, loadPlugins, wsClient],
  );

  const runBatch = useCallback(
    async (action: "enable" | "disable" | "update" | "uninstall") => {
      if (!wsClient || selectedPluginIds.length === 0) {
        return;
      }
      setIsBatchRunning(true);
      try {
        let result: PluginBatchResponse | undefined;
        if (action === "enable" || action === "disable") {
          result = await wsClient.sendRequest<PluginBatchResponse>("plugins.batchToggle", {
            pluginIds: selectedPluginIds,
            enabled: action === "enable",
            timeoutMs: 180000,
          });
        } else if (action === "update") {
          result = await wsClient.sendRequest<PluginBatchResponse>("plugins.batchUpdate", {
            pluginIds: selectedPluginIds,
            timeoutMs: 180000,
          });
        } else {
          result = await wsClient.sendRequest<PluginBatchResponse>("plugins.batchUninstall", {
            pluginIds: selectedPluginIds,
            deleteFiles: true,
            timeoutMs: 180000,
          });
        }

        const summary = result?.summary;
        addToast({
          title: "批量操作完成",
          description: summary
            ? `成功 ${summary.success} / ${summary.total}${summary.failed > 0 ? `，失败 ${summary.failed}` : ""}`
            : "执行成功",
          variant: summary && summary.failed > 0 ? "warning" : "success",
        });
        if (action === "uninstall") {
          setConfirmUninstallOpen(false);
        }
        setSelectedPluginIds([]);
        setBatchMode(false);
        void loadPlugins();
      } catch (err) {
        addToast({
          title: "批量操作失败",
          description: normalizeError(err),
          variant: "error",
        });
      } finally {
        setIsBatchRunning(false);
      }
    },
    [addToast, loadPlugins, selectedPluginIds, wsClient],
  );

  if (isLoading && !status) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center">
        <Loader2 className="mb-3 h-8 w-8 animate-spin text-text-tertiary" />
        <p className="text-sm text-text-tertiary">正在加载插件状态...</p>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
        <AlertCircle className="mb-3 h-10 w-10 text-error" />
        <p className="mb-1 text-sm text-text-primary">加载插件失败</p>
        <p className="mb-4 text-xs text-text-tertiary">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void loadPlugins()}>
          <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-[24rem] sm:flex-1">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索插件..."
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => void loadPlugins()}
          >
            <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            刷新
          </Button>

          {batchMode ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={selectedPluginIds.length === 0 || isBatchRunning}
                onClick={() => void runBatch("enable")}
              >
                批量启用
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={selectedPluginIds.length === 0 || isBatchRunning}
                onClick={() => void runBatch("disable")}
              >
                批量禁用
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={selectedPluginIds.length === 0 || isBatchRunning}
                onClick={() => void runBatch("update")}
              >
                批量更新
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs"
                disabled={selectedPluginIds.length === 0 || isBatchRunning}
                onClick={() => setConfirmUninstallOpen(true)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                批量卸载
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => {
                  setBatchMode(false);
                  setSelectedPluginIds([]);
                }}
              >
                退出批量
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setBatchMode(true)}
              >
                批量操作
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="h-8 text-xs">
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    添加插件
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setPathDialogOpen(true)}>
                    <FolderOpen className="mr-2 h-4 w-4" />
                    从本地路径安装
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setClawhubDialogOpen(true)}>
                    <Globe className="mr-2 h-4 w-4" />从 ClawHub 安装
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-text-tertiary">
        <span>插件总数 {status?.plugins.length ?? 0}</span>
        <span>已启用 {status?.plugins.filter((plugin) => plugin.enabled).length ?? 0}</span>
        {batchMode && <span>已选中 {selectedCount} 个</span>}
      </div>

      {filteredPlugins.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Puzzle className="mb-3 h-10 w-10 text-text-tertiary" />
          <p className="mb-1 text-sm text-text-primary">
            {searchQuery ? "未找到匹配插件" : "暂无插件"}
          </p>
          <p className="text-xs text-text-tertiary">
            {searchQuery ? "请尝试其他关键词" : "点击“添加插件”从本地或 ClawHub 安装"}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredPlugins.map((plugin) => {
            const selected = selectedPluginIds.includes(plugin.id);
            return (
              <Card key={plugin.id} className="border-border-light">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
                        <span
                          className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary"
                          title={plugin.name}
                        >
                          {plugin.name}
                        </span>
                        {statusBadge(plugin.status)}
                        <span className="shrink-0 whitespace-nowrap text-[10px] text-text-tertiary">
                          {plugin.version ? `v${plugin.version}` : "未标记版本"}
                        </span>
                      </div>
                      <div className="mb-1 max-w-full">
                        {sourceBadge({ source: plugin.source, origin: plugin.origin })}
                      </div>
                      <p className="truncate text-xs text-text-tertiary" title={plugin.id}>
                        {plugin.id}
                      </p>
                      {plugin.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                          {plugin.description}
                        </p>
                      )}
                      {plugin.error && (
                        <p className="mt-2 text-xs text-error">加载错误: {plugin.error}</p>
                      )}
                    </div>

                    <div className="flex w-full items-center justify-end gap-1.5 sm:w-auto">
                      {batchMode && (
                        <Button
                          size="sm"
                          variant={selected ? "default" : "outline"}
                          className="h-7 w-7 p-0"
                          title={selected ? "取消选择" : "选择插件"}
                          aria-label={selected ? "取消选择" : "选择插件"}
                          onClick={() =>
                            setSelectedPluginIds((prev) =>
                              selected
                                ? prev.filter((id) => id !== plugin.id)
                                : [...prev, plugin.id],
                            )
                          }
                        >
                          {selected ? (
                            <CheckSquare className="h-3.5 w-3.5" />
                          ) : (
                            <Square className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        title="查看详情"
                        aria-label="查看详情"
                        onClick={() => void showPluginDetail(plugin.id)}
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                      {!batchMode && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0"
                            title="更新插件"
                            aria-label="更新插件"
                            onClick={() => void updatePlugin(plugin.id)}
                          >
                            <Wrench className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      <Switch
                        checked={plugin.enabled}
                        onCheckedChange={(checked) => void togglePlugin(plugin.id, checked)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={pathDialogOpen} onOpenChange={(open) => !open && setPathDialogOpen(false)}>
        <DialogContent className="max-w-[30rem]">
          <DialogHeader>
            <DialogTitle>从本地路径安装插件</DialogTitle>
            <DialogDescription>输入插件目录、压缩包或单文件路径。</DialogDescription>
          </DialogHeader>
          <Input
            value={pathInput}
            onChange={(event) => setPathInput(event.target.value)}
            placeholder="/path/to/plugin"
            className="h-9 text-sm"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPathDialogOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => void installFromPath()}
              disabled={!pathInput.trim() || isPathInstalling}
            >
              {isPathInstalling ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  安装中...
                </>
              ) : (
                <>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  安装
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={clawhubDialogOpen}
        onOpenChange={(open) => !open && setClawhubDialogOpen(false)}
      >
        <DialogContent className="w-[94vw] max-w-[58rem] h-[82vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>从 ClawHub 安装插件</DialogTitle>
            <DialogDescription>通过网关插件接口搜索并安装 ClawHub 插件。</DialogDescription>
          </DialogHeader>

          <div className="flex-1 flex min-h-0 flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" />
                <Input
                  value={clawhubQuery}
                  onChange={(event) => setClawhubQuery(event.target.value)}
                  placeholder="搜索 ClawHub 插件..."
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs sm:min-w-[6rem]"
                disabled={clawhubGlobalInCooldown}
                onClick={() => {
                  if (clawhubSearchTimerRef.current) {
                    clearTimeout(clawhubSearchTimerRef.current);
                    clawhubSearchTimerRef.current = null;
                  }
                  void searchClawHub(clawhubQuery);
                }}
              >
                <Search className="mr-1.5 h-3.5 w-3.5" />
                {clawhubGlobalInCooldown ? `冷却 ${clawhubGlobalRemainingSeconds}s` : "搜索"}
              </Button>
            </div>
            {clawhubGlobalInCooldown && (
              <p className="text-[11px] text-amber-700">
                ClawHub 全局限流中，请在 {clawhubGlobalRemainingSeconds}s 后重试。
              </p>
            )}

            <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border-light bg-surface-subtle p-3">
              {isClawhubLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
                </div>
              ) : clawhubError ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center p-4">
                  <AlertCircle className="h-7 w-7 text-error" />
                  <p className="text-sm text-text-primary">加载失败</p>
                  <p className="text-xs text-text-tertiary">{clawhubError}</p>
                </div>
              ) : clawhubItems.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <Globe className="h-8 w-8 text-text-tertiary" />
                  <p className="text-sm text-text-primary">未找到插件</p>
                  <p className="text-xs text-text-tertiary">尝试其他关键词</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {clawhubItems.map((item) => {
                    const cooldownUntil = clawhubCooldownUntilByName[item.name] ?? 0;
                    const remainingSeconds =
                      cooldownUntil > nowMs
                        ? Math.max(1, Math.ceil((cooldownUntil - nowMs) / 1000))
                        : 0;
                    const inCooldown = remainingSeconds > 0;
                    return (
                      <Card key={item.name} className="border-border-light">
                        <CardContent className="p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className="min-w-0 flex-1 truncate text-sm text-text-primary"
                                  title={item.displayName || item.name}
                                >
                                  {item.displayName || item.name}
                                </span>
                                <span className="shrink-0 text-[10px] text-text-tertiary">
                                  {item.channel || "unknown"}
                                </span>
                                {item.latestVersion ? (
                                  <span className="shrink-0 text-[10px] text-text-tertiary">
                                    v{item.latestVersion}
                                  </span>
                                ) : null}
                              </div>
                              <p className="truncate text-xs text-text-tertiary" title={item.name}>
                                {item.name}
                              </p>
                              {item.summary ? (
                                <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                                  {item.summary}
                                </p>
                              ) : null}
                            </div>
                            <Button
                              size="sm"
                              className="h-7 w-full text-xs sm:w-auto"
                              disabled={inCooldown || clawhubGlobalInCooldown}
                              onClick={() => void installFromClawHub(item)}
                            >
                              <Download className="mr-1.5 h-3.5 w-3.5" />
                              {clawhubGlobalInCooldown
                                ? `重试 ${clawhubGlobalRemainingSeconds}s`
                                : inCooldown
                                  ? `重试 ${remainingSeconds}s`
                                  : "安装"}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmUninstallOpen}
        onOpenChange={(open) => !open && setConfirmUninstallOpen(false)}
      >
        <DialogContent className="max-w-[28rem]">
          <DialogHeader>
            <DialogTitle>确认批量卸载?</DialogTitle>
            <DialogDescription>
              即将卸载 {selectedPluginIds.length} 个插件，包含配置清理和文件删除操作。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmUninstallOpen(false)}
              disabled={isBatchRunning}
            >
              取消
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => void runBatch("uninstall")}
              disabled={isBatchRunning}
            >
              {isBatchRunning ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  执行中...
                </>
              ) : (
                "确认卸载"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DetailDialog
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        loading={detailLoading}
        error={detailError}
        detail={detail}
      />
    </div>
  );
}
