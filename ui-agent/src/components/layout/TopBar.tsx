"use client";

import {
  Share2,
  Download,
  MoreVertical,
  Edit,
  Trash2,
  Wifi,
  WifiOff,
  Loader2,
  AlertCircle,
  KeyRound,
  RefreshCcw,
} from "lucide-react";
import { User, Settings, HelpCircle, Info, LogOut, Puzzle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getStoredDeviceIdentity, resetDeviceIdentity } from "@/services/device-identity";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToastStore } from "@/stores/toastStore";

interface TopBarProps {
  mode: "welcome" | "chat";
  conversationTitle?: string;
  userName?: string;
  onShare?: () => void;
  onExport?: () => void;
  onDelete?: () => void;
  onRename?: () => void;
}

export function TopBar({
  mode,
  conversationTitle,
  userName = "用户",
  onShare = () => {},
  onExport = () => {},
  onDelete = () => {},
  onRename = () => {},
}: TopBarProps) {
  const {
    status,
    lastError,
    connect,
    reconnectAttempts,
    lastConnectedAt,
    gatewayUrl,
    gatewayToken,
    pairingRequestId,
    pairingDeviceId,
    setGatewayUrl,
    setGatewayToken,
    clearPairingRequest,
  } = useConnectionStore();
  const { addToast } = useToastStore();
  const { openSettings } = useSettingsStore();
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isTokenOpen, setIsTokenOpen] = useState(false);
  const [gatewayUrlInput, setGatewayUrlInput] = useState(gatewayUrl);
  const [tokenInput, setTokenInput] = useState(gatewayToken);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  // Auto-connect on mount
  useEffect(() => {
    if (status === "disconnected") {
      connect();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const stored = getStoredDeviceIdentity();
    setDeviceId(stored?.deviceId ?? null);
  }, []);

  useEffect(() => {
    setTokenInput(gatewayToken);
  }, [gatewayToken]);

  useEffect(() => {
    setGatewayUrlInput(gatewayUrl);
  }, [gatewayUrl]);

  useEffect(() => {
    if (status !== "connected") return;
    const stored = getStoredDeviceIdentity();
    setDeviceId(stored?.deviceId ?? null);
  }, [status]);

  useEffect(() => {
    if (!lastError) return;
    const normalized = lastError.toLowerCase();
    const action = () => setIsDetailsOpen(true);
    if (normalized.includes("pairing required")) {
      return;
    }
    if (normalized.includes("device identity required")) {
      addToast({
        title: "需要设备身份",
        description: "请打开连接详情，重置设备身份后重试。",
        variant: "warning",
        action: { label: "查看详情", onClick: action },
      });
      return;
    }
    if (normalized.includes("gateway token")) {
      addToast({
        title: "需要网关 Token",
        description: "当前连接需要 gateway token。",
        variant: "error",
        action: { label: "填写 Token", onClick: () => setIsTokenOpen(true) },
      });
      return;
    }
    addToast({
      title: "连接失败",
      description: lastError,
      variant: "error",
      action: { label: "查看详情", onClick: action },
    });
  }, [lastError, addToast]);

  useEffect(() => {
    if (!pairingRequestId) return;
    const command = `moltbot devices approve ${pairingRequestId}`;
    addToast({
      title: "设备配对请求",
      description: "需要在网关主机批准设备配对。",
      variant: "warning",
      action: {
        label: "复制命令",
        onClick: () => {
          void navigator.clipboard?.writeText(command);
          clearPairingRequest();
        },
      },
    });
  }, [pairingRequestId, addToast, clearPairingRequest]);

  const deviceIdShort = useMemo(() => {
    if (!deviceId) return "未生成";
    return `${deviceId.slice(0, 6)}…${deviceId.slice(-4)}`;
  }, [deviceId]);

  const connectedAtText = useMemo(() => {
    if (!lastConnectedAt) return "—";
    return new Date(lastConnectedAt).toLocaleString();
  }, [lastConnectedAt]);

  // Connection status indicator component
  const ConnectionIndicator = () => {
    const getStatusColor = () => {
      switch (status) {
        case "connected":
          return "text-success";
        case "connecting":
          return "text-warning";
        case "error":
          return "text-error";
        case "disconnected":
          return "text-text-tertiary";
        default:
          return "text-text-tertiary";
      }
    };

    const getStatusText = () => {
      switch (status) {
        case "connected":
          return "已连接";
        case "connecting":
          return "连接中...";
        case "error":
          return lastError || "连接错误";
        case "disconnected":
          return "未连接";
        default:
          return "未知状态";
      }
    };

    const getStatusIcon = () => {
      switch (status) {
        case "connected":
          return <Wifi className="w-4 h-4" />;
        case "connecting":
          return <Loader2 className="w-4 h-4 animate-spin" />;
        case "error":
          return <AlertCircle className="w-4 h-4" />;
        case "disconnected":
          return <WifiOff className="w-4 h-4" />;
        default:
          return <WifiOff className="w-4 h-4" />;
      }
    };

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-xs px-sm py-xs rounded-md transition-all duration-fast",
                "hover:bg-surface-hover",
                getStatusColor(),
              )}
              onClick={() => {
                setIsDetailsOpen(true);
              }}
            >
              {getStatusIcon()}
              <span className="text-xs font-medium">{getStatusText()}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {status === "connected"
                ? "Clawdbot Gateway 已连接"
                : status === "connecting"
                  ? "正在连接到 Clawdbot Gateway..."
                  : status === "error"
                    ? `连接错误: ${lastError}`
                    : "查看连接详情"}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="h-12 flex items-center justify-between px-lg border-b border-border-light">
      {/* Left: Connection Status */}
      <div className="flex items-center gap-md flex-shrink-0">
        <ConnectionIndicator />
      </div>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-[28rem]">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">连接详情</DialogTitle>
          </DialogHeader>
          <div className="space-y-md text-sm text-text-secondary">
            <div className="flex items-center justify-between">
              <span>状态</span>
              <span className="text-text-primary">{status}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Device ID</span>
              <span className="text-text-primary">{deviceIdShort}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>最近连接</span>
              <span className="text-text-primary">{connectedAtText}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>重试次数</span>
              <span className="text-text-primary">{reconnectAttempts}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Gateway Token</span>
              <span className="text-text-primary">{gatewayToken ? "已设置" : "未设置"}</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span>Gateway 地址</span>
                <span className="text-text-primary text-xs">{gatewayUrl}</span>
              </div>
              <Input
                placeholder="ws://192.168.110.193:18789"
                value={gatewayUrlInput}
                onChange={(event) => setGatewayUrlInput(event.target.value)}
              />
              <p className="text-xs text-text-tertiary">
                地址仅保存在当前浏览器，用于这台设备连接网关。
              </p>
            </div>
            {pairingRequestId && (
              <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                <p className="font-medium text-warning">需要配对审批</p>
                <p className="mt-1 text-text-secondary">
                  设备 {pairingDeviceId ? pairingDeviceId.slice(0, 6) : ""} 请求配对
                </p>
                <p className="mt-2 font-mono text-xs text-text-primary">
                  moltbot devices approve {pairingRequestId}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  onClick={() => {
                    void navigator.clipboard?.writeText(
                      `moltbot devices approve ${pairingRequestId}`,
                    );
                  }}
                >
                  复制命令
                </Button>
              </div>
            )}
            {lastError && (
              <div className="rounded-md border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">
                {lastError}
              </div>
            )}
          </div>
          <DialogFooter className="gap-sm">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetDeviceIdentity();
                setDeviceId(null);
                addToast({
                  title: "设备身份已重置",
                  description: "请重新连接以生成新的设备身份。",
                  variant: "warning",
                });
              }}
            >
              重置设备身份
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsTokenOpen(true)}>
              <KeyRound className="mr-2 h-4 w-4" />
              填写 Token
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const nextGatewayUrl = gatewayUrlInput.trim();
                const gatewayChanged = nextGatewayUrl && nextGatewayUrl !== gatewayUrl;
                if (gatewayChanged) {
                  setGatewayUrl(nextGatewayUrl);
                }
                connect();
              }}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              重新连接
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isTokenOpen} onOpenChange={setIsTokenOpen}>
        <DialogContent className="max-w-[24rem]">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">设置 Gateway Token</DialogTitle>
          </DialogHeader>
          <div className="space-y-sm">
            <Input
              placeholder="输入 gateway token"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
            />
            <p className="text-xs text-text-tertiary">
              Token 会保存在本地浏览器，仅用于当前网关连接。
            </p>
          </div>
          <DialogFooter className="gap-sm">
            <Button variant="outline" size="sm" onClick={() => setIsTokenOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setGatewayToken(tokenInput);
                setIsTokenOpen(false);
                addToast({
                  title: "Token 已更新",
                  description: "点击重新连接以生效。",
                  variant: "success",
                });
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Center: Conversation Title (when in chat mode) */}
      {mode === "chat" && conversationTitle && (
        <div className="flex-1 flex justify-center px-lg">
          <h2 className="text-sm font-medium text-text-primary text-center">{conversationTitle}</h2>
        </div>
      )}

      {/* Spacer when no title */}
      {!(mode === "chat" && conversationTitle) && <div className="flex-1" />}

      {/* Right: Action buttons + User menu */}
      <div className="flex items-center gap-sm">
        {mode === "chat" && (
          <>
            <IconButton icon={Share2} onClick={onShare} tooltip="分享对话 (⌘⇧S)" />

            <IconButton icon={Download} onClick={onExport} tooltip="导出对话 (⌘E)" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-2 rounded-md hover:bg-surface-hover transition-colors duration-fast text-text-secondary hover:text-text-primary">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onRename}>
                  <Edit className="w-4 h-4 mr-2" />
                  重命名
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-error focus:text-error">
                  <Trash2 className="w-4 h-4 mr-2" />
                  删除对话
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Divider */}
            <div className="w-px h-6 bg-border-light mx-1" />
          </>
        )}

        {/* Theme Switcher */}
        <ThemeSwitcher />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-sm px-sm py-xs rounded-md hover:bg-surface-hover transition-colors duration-fast">
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <span className="text-xs text-white font-medium">{userName[0]}</span>
              </div>
              <span className="text-sm text-text-primary">{userName}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => openSettings("general")}>
              <User className="w-4 h-4 mr-2" />
              通用设置
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openSettings("skills")}>
              <Settings className="w-4 h-4 mr-2" />
              Skills 管理
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openSettings("plugins")}>
              <Puzzle className="w-4 h-4 mr-2" />
              Plugins 管理
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openSettings("connectors")}>
              <Settings className="w-4 h-4 mr-2" />
              连接器管理
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openSettings("models")}>
              <Settings className="w-4 h-4 mr-2" />
              模型配置
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <HelpCircle className="w-4 h-4 mr-2" />
              帮助文档
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Info className="w-4 h-4 mr-2" />
              关于我们
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-error focus:text-error">
              <LogOut className="w-4 h-4 mr-2" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
