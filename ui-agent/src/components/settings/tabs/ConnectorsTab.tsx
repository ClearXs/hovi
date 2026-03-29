"use client";

import {
  Calendar,
  Check,
  ChevronDown,
  ExternalLink,
  FolderOpen,
  Github,
  Link2,
  Plus,
  Plug,
  Search,
  Slack,
  Unplug,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getConnectorOAuthCallbackUrl,
  getConnectorOAuthMessageOrigins,
} from "@/lib/runtime/desktop-env";
import { getMcpSoDetail, importMcpSo, searchMcpSo as searchMcpSoCatalog } from "@/services/mcpso";
import { useConnectionStore } from "@/stores/connectionStore";
import { useToastStore } from "@/stores/toastStore";

// Map of built-in connector IDs to their icons
const CONNECTOR_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  github: Github,
  gmail: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  ),
  "google-calendar": Calendar,
  "google-drive": FolderOpen,
  slack: Slack,
  notion: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.886l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.454-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM2.828 1.602C1.921 2.441 1.921 3.48 2.641 4.208c.747.747 1.685.7 2.48.606l14.937-.933c.84-.046.981-.514.981-1.073V2.295c0-.606-.233-.933-.933-.886l-15.458.933c-.7.047-.88.327-.88.746z" />
    </svg>
  ),
  browser: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
};

function getConnectorIcon(iconName?: string) {
  if (!iconName) return Plug;
  return CONNECTOR_ICONS[iconName] || Plug;
}

type ConnectorType = "app" | "custom_api" | "custom_mcp";
type ConnectorStatus = "connected" | "disconnected" | "error" | "draft";

type ConnectorItem = {
  id: string;
  type: ConnectorType;
  name: string;
  description?: string;
  icon?: string;
  status: ConnectorStatus;
  builtin?: boolean;
  enabled?: boolean;
  authMode?: "none" | "api_key" | "oauth";
  oauthProvider?: string;
  oauthProviderConfig?: {
    authorizeUrl?: string;
    tokenUrl?: string;
    clientId?: string;
    clientSecret?: string;
    scopes?: string[];
    extraAuthorizeParams?: Record<string, string>;
    extraTokenParams?: Record<string, string>;
  };
  config?: Record<string, unknown>;
};

type AddDialogMode = "custom_api" | "custom_mcp";

type OAuthCallbackMessage = {
  type: "openclaw.connector.oauth";
  payload: {
    id: string;
    code: string;
    state: string;
    callbackUrl: string;
    error?: string;
  };
};

type McpSoItem = {
  name: string;
  title: string;
  description?: string;
  authorName?: string;
  repoUrl?: string;
  serverPageUrl?: string;
};

type McpSoDetailItem = {
  title: string;
  description?: string;
  summary?: string;
  content?: string;
  serverConfigText?: string;
  authorName?: string;
  repoUrl?: string;
  serverPageUrl?: string;
};

const OAUTH_MESSAGE_TYPE = "openclaw.connector.oauth";

function statusClass(status: ConnectorStatus): string {
  if (status === "connected") return "text-green-600";
  if (status === "error") return "text-red-600";
  if (status === "draft") return "text-amber-600";
  return "text-text-tertiary";
}

export function ConnectorsTab() {
  const wsClient = useConnectionStore((state) => state.wsClient);
  const { addToast } = useToastStore();

  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | ConnectorType>("all");
  const [items, setItems] = useState<ConnectorItem[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<AddDialogMode>("custom_api");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [transport, setTransport] = useState("http");
  const [serverUrl, setServerUrl] = useState("");
  const [headersText, setHeadersText] = useState("");
  const [secretName, setSecretName] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [oauthPendingId, setOauthPendingId] = useState<string | null>(null);
  const [oauthConfigSaving, setOauthConfigSaving] = useState(false);
  const [oauthAuthorizeUrl, setOauthAuthorizeUrl] = useState("");
  const [oauthTokenUrl, setOauthTokenUrl] = useState("");
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [oauthScopesText, setOauthScopesText] = useState("");
  const [isMcpImporting, setIsMcpImporting] = useState(false);
  const [mcpSoQuery, setMcpSoQuery] = useState("");
  const [mcpSoItems, setMcpSoItems] = useState<McpSoItem[]>([]);
  const [mcpSoLoading, setMcpSoLoading] = useState(false);
  const [mcpSoPage, setMcpSoPage] = useState(1);
  const [mcpSoHasMore, setMcpSoHasMore] = useState(false);
  const [mcpSoPickerOpen, setMcpSoPickerOpen] = useState(false);
  const [mcpSoDetailOpen, setMcpSoDetailOpen] = useState(false);
  const [mcpSoDetailLoading, setMcpSoDetailLoading] = useState(false);
  const [mcpSoDetailItem, setMcpSoDetailItem] = useState<McpSoDetailItem | null>(null);

  // Detail dialog state
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState<ConnectorItem | null>(null);

  const openExternalPage = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const load = useCallback(async () => {
    if (!wsClient) return;
    setLoading(true);
    try {
      const result = await wsClient.sendRequest<{ items?: ConnectorItem[] }>("connectors.list", {});
      setItems(result?.items ?? []);
    } catch (error) {
      addToast({
        title: "加载连接器失败",
        description: error instanceof Error ? error.message : "connectors.list failed",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [addToast, wsClient]);

  // Handle connector row click to show detail
  const handleConnectorClick = useCallback((item: ConnectorItem) => {
    setSelectedConnector(item);
    setDetailOpen(true);
  }, []);

  useEffect(() => {
    if (!selectedConnector || selectedConnector.authMode !== "oauth") {
      setOauthAuthorizeUrl("");
      setOauthTokenUrl("");
      setOauthClientId("");
      setOauthClientSecret("");
      setOauthScopesText("");
      return;
    }
    const config = selectedConnector.oauthProviderConfig;
    setOauthAuthorizeUrl(config?.authorizeUrl ?? "");
    setOauthTokenUrl(config?.tokenUrl ?? "");
    setOauthClientId(config?.clientId ?? "");
    setOauthClientSecret(config?.clientSecret ?? "");
    setOauthScopesText((config?.scopes ?? []).join(", "));
  }, [selectedConnector]);

  // Handle disconnect
  const handleDisconnect = useCallback(async () => {
    if (!wsClient || !selectedConnector) return;
    try {
      await wsClient.sendRequest("connectors.delete", { id: selectedConnector.id });
      addToast({ title: "已断开连接", variant: "success" });
      await load();
      setDetailOpen(false);
    } catch (error) {
      addToast({
        title: "断开连接失败",
        description: error instanceof Error ? error.message : "disconnect failed",
        variant: "error",
      });
    }
  }, [addToast, load, selectedConnector, wsClient]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (kind !== "all" && item.type !== kind) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        (item.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, kind, search]);

  const existingCustomMcpNameSet = useMemo(() => {
    return new Set(
      items
        .filter((item) => item.type === "custom_mcp")
        .map((item) => item.name.trim().toLowerCase())
        .filter((item) => item.length > 0),
    );
  }, [items]);

  const openAddDialog = (mode: AddDialogMode) => {
    setDialogMode(mode);
    setDialogOpen(true);
    setName("");
    setDescription("");
    setTransport("http");
    setServerUrl("");
    setHeadersText("");
    setSecretName("");
    setSecretValue("");
  };

  const saveCustomConnector = useCallback(async () => {
    if (!wsClient) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      addToast({ title: "名称不能为空", variant: "error" });
      return;
    }

    setIsSaving(true);
    try {
      const id = `custom-${dialogMode}-${trimmedName.toLowerCase().replace(/\s+/g, "-")}`;
      if (dialogMode === "custom_api") {
        const secrets: Record<string, string> = {};
        if (secretName.trim() && secretValue.trim()) {
          secrets[secretName.trim()] = secretValue.trim();
        }
        await wsClient.sendRequest("connectors.upsert", {
          id,
          type: "custom_api",
          name: trimmedName,
          description: description.trim(),
          authMode: "api_key",
          config: {
            note: description.trim(),
            secrets,
          },
        });
      } else {
        let headers: Record<string, string> = {};
        if (headersText.trim()) {
          try {
            const parsed = JSON.parse(headersText) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              headers = Object.fromEntries(
                Object.entries(parsed as Record<string, unknown>)
                  .filter(([, value]) => typeof value === "string")
                  .map(([key, value]) => [key, String(value)]),
              );
            }
          } catch {
            addToast({ title: "Headers 不是有效 JSON", variant: "error" });
            return;
          }
        }

        await wsClient.sendRequest("connectors.upsert", {
          id,
          type: "custom_mcp",
          name: trimmedName,
          description: description.trim(),
          authMode: "none",
          config: {
            transport,
            serverUrl: serverUrl.trim(),
            headers,
            note: description.trim(),
          },
        });
      }

      setDialogOpen(false);
      addToast({ title: "连接器已保存", variant: "success" });
      await load();
    } catch (error) {
      addToast({
        title: "保存连接器失败",
        description: error instanceof Error ? error.message : "connectors.upsert failed",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    addToast,
    description,
    dialogMode,
    headersText,
    load,
    name,
    secretName,
    secretValue,
    serverUrl,
    transport,
    wsClient,
  ]);

  const removeConnector = useCallback(
    async (id: string) => {
      if (!wsClient) return;
      try {
        await wsClient.sendRequest("connectors.delete", { id });
        addToast({ title: "连接器已删除", variant: "success" });
        await load();
      } catch (error) {
        addToast({
          title: "删除连接器失败",
          description: error instanceof Error ? error.message : "connectors.delete failed",
          variant: "error",
        });
      }
    },
    [addToast, load, wsClient],
  );

  const importMcpFromMcpSo = useCallback(
    async (sourceUrl: string, expectedName?: string) => {
      if (!wsClient) return;
      const url = sourceUrl.trim();
      const normalizedExpectedName = (expectedName ?? "").trim().toLowerCase();
      if (normalizedExpectedName && existingCustomMcpNameSet.has(normalizedExpectedName)) {
        addToast({ title: "该 MCP 已存在", variant: "error" });
        return;
      }
      if (!url) {
        addToast({ title: "请输入 server 链接", variant: "error" });
        return;
      }
      setIsMcpImporting(true);
      try {
        const item = await importMcpSo(url);
        const name = item.name.trim() || "Imported MCP";
        if (existingCustomMcpNameSet.has(name.toLowerCase())) {
          addToast({ title: "该 MCP 已存在", variant: "error" });
          return;
        }
        const id = `custom_mcp_${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        await wsClient.sendRequest("connectors.upsert", {
          id,
          type: "custom_mcp",
          name,
          description: item.description ?? "",
          authMode: "none",
          config: item.config ?? {},
        });

        addToast({ title: "MCP 导入成功", variant: "success" });
        await load();
      } catch (error) {
        addToast({
          title: "导入 MCP 失败",
          description: error instanceof Error ? error.message : "import failed",
          variant: "error",
        });
      } finally {
        setIsMcpImporting(false);
      }
    },
    [addToast, existingCustomMcpNameSet, load, wsClient],
  );

  const searchMcpSo = useCallback(
    async (options?: { page?: number; append?: boolean }) => {
      const page = options?.page ?? 1;
      const append = options?.append ?? false;
      setMcpSoLoading(true);
      try {
        const data = await searchMcpSoCatalog({
          query: mcpSoQuery.trim(),
          limit: 60,
          page,
        });
        const nextItems = data.items ?? [];
        setMcpSoItems((prev) => {
          if (!append) return nextItems;
          const seen = new Set(
            prev.map((item) => item.serverPageUrl || `${item.name}:${item.repoUrl || ""}`),
          );
          const merged = [...prev];
          for (const item of nextItems) {
            const key = item.serverPageUrl || `${item.name}:${item.repoUrl || ""}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(item);
          }
          return merged;
        });
        setMcpSoPage(page);
        setMcpSoHasMore(Boolean(data.hasMore));
      } catch (error) {
        if (!append) {
          setMcpSoItems([]);
          setMcpSoPage(1);
          setMcpSoHasMore(false);
        }
        addToast({
          title: "mcp.so 搜索失败",
          description: error instanceof Error ? error.message : "search failed",
          variant: "error",
        });
      } finally {
        setMcpSoLoading(false);
      }
    },
    [addToast, mcpSoQuery],
  );

  useEffect(() => {
    if (mcpSoPickerOpen && mcpSoItems.length === 0 && !mcpSoLoading) {
      void searchMcpSo();
    }
  }, [mcpSoItems.length, mcpSoLoading, mcpSoPickerOpen, searchMcpSo]);

  const openMcpSoDetail = useCallback(
    async (item: McpSoItem) => {
      if (!item.serverPageUrl) return;
      setMcpSoDetailOpen(true);
      setMcpSoDetailLoading(true);
      setMcpSoDetailItem({
        title: item.title,
        description: item.description,
        authorName: item.authorName,
        repoUrl: item.repoUrl,
        serverPageUrl: item.serverPageUrl,
      });
      try {
        const detailItem = await getMcpSoDetail(item.serverPageUrl);
        setMcpSoDetailItem(detailItem);
      } catch (error) {
        addToast({
          title: "加载 MCP 详情失败",
          description: error instanceof Error ? error.message : "detail failed",
          variant: "error",
        });
      } finally {
        setMcpSoDetailLoading(false);
      }
    },
    [addToast],
  );

  const startOAuth = useCallback(
    async (id: string): Promise<boolean> => {
      if (!wsClient) {
        addToast({ title: "未连接网关", description: "请先连接网关后再试", variant: "error" });
        return false;
      }
      setOauthPendingId(id);
      const callbackUrl = getConnectorOAuthCallbackUrl(id);
      // Pre-open window in click gesture to avoid popup blockers.
      const popup = window.open("", `oauth-${id}`, "width=560,height=780");
      try {
        const result = await wsClient.sendRequest<{
          authorizeUrl?: string;
        }>("connectors.oauth.start", {
          id,
          callbackUrl,
        });
        const authorizeUrl = result?.authorizeUrl;
        if (!authorizeUrl) {
          throw new Error("authorizeUrl is missing");
        }
        if (!popup) {
          throw new Error("浏览器拦截了授权弹窗，请允许弹窗后重试");
        }
        popup.location.href = authorizeUrl;
        popup.focus();
        return true;
      } catch (error) {
        popup?.close();
        addToast({
          title: "OAuth 启动失败",
          description: error instanceof Error ? error.message : "connectors.oauth.start failed",
          variant: "error",
        });
        return false;
      } finally {
        setOauthPendingId((prev) => (prev === id ? null : prev));
      }
    },
    [addToast, wsClient],
  );

  const saveOAuthProviderConfig = useCallback(async () => {
    if (!wsClient || !selectedConnector || selectedConnector.authMode !== "oauth") return;
    const scopes = oauthScopesText
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    setOauthConfigSaving(true);
    try {
      await wsClient.sendRequest("connectors.upsert", {
        id: selectedConnector.id,
        type: selectedConnector.type,
        name: selectedConnector.name,
        description: selectedConnector.description ?? "",
        icon: selectedConnector.icon,
        enabled: selectedConnector.enabled ?? true,
        authMode: selectedConnector.authMode,
        config: {
          oauthProvider: {
            authorizeUrl: oauthAuthorizeUrl.trim(),
            tokenUrl: oauthTokenUrl.trim(),
            clientId: oauthClientId.trim(),
            clientSecret: oauthClientSecret.trim(),
            scopes,
          },
        },
      });
      addToast({ title: "OAuth 配置已保存", variant: "success" });
      await load();
      setSelectedConnector((prev) => {
        if (!prev || prev.id !== selectedConnector.id) return prev;
        return {
          ...prev,
          oauthProviderConfig: {
            ...(prev.oauthProviderConfig ?? {}),
            authorizeUrl: oauthAuthorizeUrl.trim(),
            tokenUrl: oauthTokenUrl.trim(),
            clientId: oauthClientId.trim(),
            clientSecret: oauthClientSecret.trim(),
            scopes,
          },
        };
      });
    } catch (error) {
      addToast({
        title: "OAuth 配置保存失败",
        description: error instanceof Error ? error.message : "connectors.upsert failed",
        variant: "error",
      });
    } finally {
      setOauthConfigSaving(false);
    }
  }, [
    addToast,
    load,
    oauthAuthorizeUrl,
    oauthClientId,
    oauthClientSecret,
    oauthScopesText,
    oauthTokenUrl,
    selectedConnector,
    wsClient,
  ]);

  useEffect(() => {
    const allowedOrigins = new Set(getConnectorOAuthMessageOrigins());

    const handler = (event: MessageEvent<OAuthCallbackMessage>) => {
      if (!allowedOrigins.has(event.origin)) {
        return;
      }
      if (!event.data || event.data.type !== OAUTH_MESSAGE_TYPE) {
        return;
      }
      const payload = event.data.payload;
      if (payload.error) {
        addToast({
          title: "OAuth 授权失败",
          description: payload.error,
          variant: "error",
        });
        return;
      }
      if (!payload.id || !payload.code || !payload.state || !payload.callbackUrl) {
        addToast({
          title: "OAuth 回调参数不完整",
          variant: "error",
        });
        return;
      }
      if (!wsClient) {
        addToast({ title: "未连接网关", description: "无法完成 OAuth 兑换", variant: "error" });
        return;
      }
      void wsClient
        .sendRequest("connectors.oauth.complete", payload)
        .then(async () => {
          addToast({ title: "连接成功", description: `${payload.id} 已授权`, variant: "success" });
          await load();
        })
        .catch((error) => {
          addToast({
            title: "OAuth 兑换失败",
            description:
              error instanceof Error ? error.message : "connectors.oauth.complete failed",
            variant: "error",
          });
        });
    };

    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
    };
  }, [addToast, load, wsClient]);

  return (
    <div className="h-full flex flex-col gap-2">
      <Tabs value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
        <TabsList className="justify-start bg-transparent border-b border-border-light rounded-none p-0 h-auto gap-0 w-full">
          <TabsTrigger
            value="all"
            className="px-4 py-2.5 rounded-none border-b-2 border-transparent text-text-secondary data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-text-primary transition-colors"
          >
            <span className="text-xs">全部</span>
          </TabsTrigger>
          <TabsTrigger
            value="app"
            className="px-4 py-2.5 rounded-none border-b-2 border-transparent text-text-secondary data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-text-primary transition-colors"
          >
            <span className="text-xs">Apps</span>
          </TabsTrigger>
          <TabsTrigger
            value="custom_api"
            className="px-4 py-2.5 rounded-none border-b-2 border-transparent text-text-secondary data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-text-primary transition-colors"
          >
            <span className="text-xs">Custom API</span>
          </TabsTrigger>
          <TabsTrigger
            value="custom_mcp"
            className="px-4 py-2.5 rounded-none border-b-2 border-transparent text-text-secondary data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-text-primary transition-colors"
          >
            <span className="text-xs">Custom MCP</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value={kind} className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-[24rem]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索连接器"
                className="h-8 text-xs pl-8"
              />
            </div>
            <div className="flex items-center gap-2">
              {kind === "custom_api" && (
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => openAddDialog("custom_api")}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  添加 Custom API
                </Button>
              )}
              {kind === "custom_mcp" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-8 text-xs">
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      添加 MCP
                      <ChevronDown className="w-3 h-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openAddDialog("custom_mcp")}>
                      <Plus className="w-4 h-4 mr-2" />
                      添加 Custom MCP
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setMcpSoPickerOpen(true);
                      }}
                    >
                      <Search className="w-4 h-4 mr-2" />从 mcp.so 中选择
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          <div className="border border-border-light rounded-lg divide-y divide-border-light overflow-hidden">
            {loading ? (
              <div className="px-4 py-7 text-sm text-text-tertiary">加载中...</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-7 text-sm text-text-tertiary">暂无连接器</div>
            ) : (
              filtered.map((item) => {
                const IconComponent = getConnectorIcon(item.icon);
                return (
                  <div
                    key={item.id}
                    className="px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-background cursor-pointer"
                    onClick={() => handleConnectorClick(item)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded border border-border-light flex items-center justify-center text-text-secondary overflow-hidden">
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-text-primary truncate">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-text-tertiary truncate">
                          {item.description || item.id}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[11px] ${statusClass(item.status)}`}>
                        {item.status === "connected"
                          ? "已连接"
                          : item.status === "disconnected"
                            ? "未连接"
                            : item.status}
                      </span>
                      {!item.builtin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeConnector(item.id);
                          }}
                        >
                          <Unplug className="w-3.5 h-3.5 mr-1" />
                          删除
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[36rem] max-h-[85vh] overflow-y-auto scrollbar-default">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "custom_api" ? "添加 Custom API" : "添加 Custom MCP"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-text-secondary">名称</label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如: CRM API"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-secondary">描述</label>
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="该连接器用于什么场景"
              />
            </div>

            {dialogMode === "custom_api" ? (
              <>
                <div className="space-y-1">
                  <label className="text-xs text-text-secondary">Secret Name</label>
                  <Input
                    value={secretName}
                    onChange={(event) => setSecretName(event.target.value)}
                    placeholder="例如: API_KEY"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-text-secondary">Secret Value</label>
                  <Input
                    type="password"
                    value={secretValue}
                    onChange={(event) => setSecretValue(event.target.value)}
                    placeholder="输入密钥"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-xs text-text-secondary">Transport</label>
                  <select
                    value={transport}
                    onChange={(event) => setTransport(event.target.value)}
                    className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                  >
                    <option value="http">HTTP</option>
                    <option value="sse">SSE</option>
                    <option value="stdio">STDIO</option>
                    <option value="websocket">WebSocket</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-text-secondary">Server URL / Command</label>
                  <Input
                    value={serverUrl}
                    onChange={(event) => setServerUrl(event.target.value)}
                    placeholder={
                      transport === "stdio"
                        ? "例如: npx -y @org/mcp-server"
                        : "https://mcp.example.com"
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-text-secondary">Headers (JSON)</label>
                  <Input
                    value={headersText}
                    onChange={(event) => setHeadersText(event.target.value)}
                    placeholder='例如: {"Authorization":"Bearer xxx"}'
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              取消
            </Button>
            <Button onClick={() => void saveCustomConnector()} disabled={isSaving}>
              {isSaving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mcpSoPickerOpen} onOpenChange={setMcpSoPickerOpen}>
        <DialogContent className="max-w-[42rem] h-[70vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>从 mcp.so 中选择 MCP</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            <p className="text-xs text-text-tertiary">
              可按名称或描述搜索，并一键添加到 Custom MCP。
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={mcpSoQuery}
                onChange={(event) => setMcpSoQuery(event.target.value)}
                placeholder="搜索（名称/描述）"
                className="h-8 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={mcpSoLoading}
                onClick={() => void searchMcpSo({ page: 1, append: false })}
              >
                {mcpSoLoading ? "搜索中..." : "搜索"}
              </Button>
            </div>

            <div className="rounded-md border border-border-light divide-y divide-border-light flex-1 min-h-0 overflow-y-auto scrollbar-default">
              {mcpSoItems.length === 0 ? (
                <div className="px-3 py-5 text-xs text-text-tertiary">
                  {mcpSoLoading ? "加载中..." : "暂无匹配结果"}
                </div>
              ) : (
                mcpSoItems.map((item) => {
                  const alreadyAdded = existingCustomMcpNameSet.has(
                    item.title.trim().toLowerCase(),
                  );
                  const descriptionText = item.description?.trim()
                    ? item.description.trim()
                    : "暂无官方描述";
                  return (
                    <div
                      key={`${item.serverPageUrl || item.repoUrl || item.name}`}
                      className="px-3 py-2.5 flex items-start justify-between gap-2 cursor-pointer hover:bg-background"
                      onClick={() => void openMcpSoDetail(item)}
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-text-primary truncate">{item.title}</div>
                        <div className="text-[11px] text-text-tertiary leading-4 line-clamp-2">
                          {descriptionText}
                        </div>
                        {(item.authorName || item.repoUrl) && (
                          <div className="text-[11px] text-text-tertiary truncate">
                            {item.authorName ? `作者: ${item.authorName}` : item.repoUrl}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.serverPageUrl && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={(event) => {
                              event.stopPropagation();
                              openExternalPage(item.serverPageUrl as string);
                            }}
                            title="打开详情页"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {alreadyAdded && (
                          <span className="text-[11px] px-2 py-1 rounded border border-border-light text-text-tertiary">
                            已存在
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={isMcpImporting || !item.serverPageUrl || alreadyAdded}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!item.serverPageUrl) return;
                            void importMcpFromMcpSo(item.serverPageUrl, item.title);
                          }}
                        >
                          添加
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {mcpSoItems.length > 0 && mcpSoHasMore && (
              <div className="flex justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={mcpSoLoading}
                  onClick={() => void searchMcpSo({ page: mcpSoPage + 1, append: true })}
                >
                  {mcpSoLoading ? "加载中..." : "加载更多"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={mcpSoDetailOpen} onOpenChange={setMcpSoDetailOpen}>
        <DialogContent className="max-w-[52rem] h-[78vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{mcpSoDetailItem?.title || "MCP 详情"}</DialogTitle>
            {mcpSoDetailItem?.description && (
              <DialogDescription className="line-clamp-2">
                {mcpSoDetailItem.description}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-default space-y-4 pr-1">
            {mcpSoDetailLoading ? (
              <div className="text-sm text-text-tertiary py-4">加载详情中...</div>
            ) : (
              <>
                {(mcpSoDetailItem?.authorName ||
                  mcpSoDetailItem?.repoUrl ||
                  mcpSoDetailItem?.serverPageUrl) && (
                  <div className="text-xs text-text-tertiary space-y-1">
                    {mcpSoDetailItem.authorName && <div>作者: {mcpSoDetailItem.authorName}</div>}
                    {mcpSoDetailItem.repoUrl && (
                      <div className="flex items-center gap-2">
                        <span>仓库</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 shrink-0"
                          onClick={() => openExternalPage(mcpSoDetailItem.repoUrl as string)}
                          title="打开仓库"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                    {mcpSoDetailItem.serverPageUrl && (
                      <div className="flex items-center gap-2">
                        <span>页面</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 shrink-0"
                          onClick={() => openExternalPage(mcpSoDetailItem.serverPageUrl as string)}
                          title="打开页面"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {mcpSoDetailItem?.summary && (
                  <div className="rounded-md border border-border-light p-3">
                    <div className="text-xs font-semibold text-text-secondary mb-2">概览</div>
                    <div className="text-xs text-text-primary whitespace-pre-wrap leading-5">
                      {mcpSoDetailItem.summary}
                    </div>
                  </div>
                )}

                {mcpSoDetailItem?.content && (
                  <div className="rounded-md border border-border-light p-3">
                    <div className="text-xs font-semibold text-text-secondary mb-2">详细介绍</div>
                    <div className="text-xs text-text-primary whitespace-pre-wrap leading-5">
                      {mcpSoDetailItem.content}
                    </div>
                  </div>
                )}

                {mcpSoDetailItem?.serverConfigText && (
                  <div className="rounded-md border border-border-light p-3">
                    <div className="text-xs font-semibold text-text-secondary mb-2">
                      Server Config
                    </div>
                    <pre className="text-[11px] text-text-primary whitespace-pre-wrap break-all">
                      {mcpSoDetailItem.serverConfigText}
                    </pre>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setMcpSoDetailOpen(false)}>
              关闭
            </Button>
            <Button
              size="sm"
              disabled={
                isMcpImporting ||
                !mcpSoDetailItem?.serverPageUrl ||
                existingCustomMcpNameSet.has((mcpSoDetailItem.title || "").trim().toLowerCase())
              }
              onClick={() => {
                if (!mcpSoDetailItem?.serverPageUrl) return;
                void importMcpFromMcpSo(mcpSoDetailItem.serverPageUrl, mcpSoDetailItem.title);
              }}
            >
              添加到 Custom MCP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-[40rem] max-h-[85vh] overflow-y-auto scrollbar-default">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {selectedConnector && (
                <>
                  {(() => {
                    const IconComponent = getConnectorIcon(selectedConnector.icon);
                    return <IconComponent className="w-6 h-6" />;
                  })()}
                  <span>{selectedConnector.name}</span>
                </>
              )}
            </DialogTitle>
            <DialogDescription>{selectedConnector?.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">状态</span>
              <span
                className={`text-sm font-medium ${statusClass(selectedConnector?.status || "disconnected")}`}
              >
                {selectedConnector?.status === "connected" ? "已连接" : "未连接"}
              </span>
            </div>

            {/* Type */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">类型</span>
              <span className="text-sm text-text-primary">
                {selectedConnector?.type === "app"
                  ? "内置应用"
                  : selectedConnector?.type === "custom_api"
                    ? "自定义 API"
                    : "自定义 MCP"}
              </span>
            </div>

            {/* ID */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">ID</span>
              <span className="text-sm text-text-primary font-mono text-right break-all">
                {selectedConnector?.id}
              </span>
            </div>

            {/* Auth Mode */}
            {selectedConnector?.authMode && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">认证方式</span>
                <span className="text-sm text-text-primary">
                  {selectedConnector.authMode === "oauth"
                    ? "OAuth"
                    : selectedConnector.authMode === "api_key"
                      ? "API Key"
                      : "无"}
                </span>
              </div>
            )}

            {selectedConnector?.authMode === "oauth" && (
              <div className="space-y-3 rounded-md border border-border-light p-3">
                <div className="text-sm font-medium text-text-primary">OAuth 配置</div>
                <div className="space-y-1">
                  <label className="text-xs text-text-secondary">Provider</label>
                  <Input value={selectedConnector.oauthProvider ?? ""} disabled />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-text-secondary">Authorize URL</label>
                  <Input
                    value={oauthAuthorizeUrl}
                    onChange={(event) => setOauthAuthorizeUrl(event.target.value)}
                    placeholder="https://provider.example.com/oauth/authorize"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-text-secondary">Token URL</label>
                  <Input
                    value={oauthTokenUrl}
                    onChange={(event) => setOauthTokenUrl(event.target.value)}
                    placeholder="https://provider.example.com/oauth/token"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-text-secondary">Client ID</label>
                  <Input
                    value={oauthClientId}
                    onChange={(event) => setOauthClientId(event.target.value)}
                    placeholder="OAuth Client ID"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-text-secondary">Client Secret</label>
                  <Input
                    type="password"
                    value={oauthClientSecret}
                    onChange={(event) => setOauthClientSecret(event.target.value)}
                    placeholder="OAuth Client Secret"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-text-secondary">Scopes（逗号分隔）</label>
                  <Input
                    value={oauthScopesText}
                    onChange={(event) => setOauthScopesText(event.target.value)}
                    placeholder="repo, read:user, user:email"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={oauthConfigSaving}
                  onClick={() => void saveOAuthProviderConfig()}
                >
                  {oauthConfigSaving ? "保存中..." : "保存 OAuth 配置"}
                </Button>
              </div>
            )}

            {/* Config Details for Custom API/MCP */}
            {selectedConnector?.type === "custom_api" && selectedConnector?.config && (
              <div className="space-y-2">
                <span className="text-sm text-text-secondary">配置</span>
                <div className="bg-background rounded-md p-3 text-xs font-mono space-y-1">
                  {Object.entries(selectedConnector.config).map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <span className="text-text-tertiary">{key}:</span>
                      <span className="text-text-primary break-all">
                        {key === "secrets" ? "******" : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedConnector?.type === "custom_mcp" && selectedConnector?.config && (
              <div className="space-y-2">
                <span className="text-sm text-text-secondary">配置</span>
                <div className="bg-background rounded-md p-3 text-xs font-mono space-y-1">
                  {Object.entries(selectedConnector.config).map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <span className="text-text-tertiary">{key}:</span>
                      <span className="text-text-primary break-all">
                        {key === "headers" ? "******" : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col gap-2">
            {selectedConnector?.authMode === "oauth" && (
              <Button
                className="w-full"
                variant={selectedConnector?.status === "connected" ? "outline" : "default"}
                disabled={oauthPendingId === selectedConnector?.id}
                onClick={async () => {
                  if (selectedConnector) {
                    const ok = await startOAuth(selectedConnector.id);
                    if (ok) {
                      setDetailOpen(false);
                    }
                  }
                }}
              >
                {oauthPendingId === selectedConnector?.id ? (
                  <>
                    <Link2 className="w-4 h-4 mr-2" />
                    连接中...
                  </>
                ) : selectedConnector?.status === "connected" ? (
                  <>
                    <Link2 className="w-4 h-4 mr-2" />
                    重新连接
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4 mr-2" />
                    连接
                  </>
                )}
              </Button>
            )}
            {selectedConnector?.status === "connected" && selectedConnector?.builtin && (
              <Button className="w-full" variant="outline" onClick={handleDisconnect}>
                <Unplug className="w-4 h-4 mr-2" />
                断开连接
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
