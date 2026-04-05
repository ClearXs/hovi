"use client";

import {
  Clock,
  Users,
  Palette,
  Calculator,
  LogOut,
  Settings,
  ArrowLeft,
  Info,
  Zap,
  Plug,
  Bot,
  Cog,
  DollarSign,
  Keyboard,
  User,
  Wifi,
  WifiOff,
  Loader2,
  AlertCircle,
  KeyRound,
  RefreshCcw,
  Link2,
  Puzzle,
} from "lucide-react";
import { memo, useState, useEffect, useCallback } from "react";
import { AdvancedTab } from "@/components/settings/tabs/AdvancedTab";
import { AppearanceTab } from "@/components/settings/tabs/AppearanceTab";
import { AvatarTab } from "@/components/settings/tabs/AvatarTab";
import { ConnectorsTab } from "@/components/settings/tabs/ConnectorsTab";
import { GeneralSettingsTab } from "@/components/settings/tabs/GeneralSettingsTab";
import { ModelsTab } from "@/components/settings/tabs/ModelsTab";
import { PluginsTab } from "@/components/settings/tabs/PluginsTab";
import { QuotaTab } from "@/components/settings/tabs/QuotaTab";
import { ShortcutsTab } from "@/components/settings/tabs/ShortcutsTab";
import { SkillsTab } from "@/components/settings/tabs/SkillsTab";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { fetchCronJobs, fetchCronStatus } from "@/features/cron/api/cronApi";
import { fetchAgents } from "@/features/persona/services/personaApi";
import type { AgentInfo } from "@/features/persona/types/persona";
import { getStoredDeviceIdentity, resetDeviceIdentity } from "@/services/device-identity";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useThemeStore } from "@/stores/themeStore";
import { useToastStore } from "@/stores/toastStore";
import type { CronJob, CronStatus, CronListResult } from "@/types/cron";

interface MyPageProps {
  userName?: string;
  onClose?: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: typeof Settings;
  onClick: () => void;
}

// 获取用户名的第一个字符
function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

// 关于页面组件 - 移动端适配版本，与桌面一致
function AboutSection({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState("feature");

  // 随机语录
  const quotes = ["让 AI 成为你最好的助手", "智能助手，触手可及", "简单对话，高效办事"];
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 简洁头部 */}
      <div className="flex items-center p-4 border-b border-border-light">
        <Button variant="ghost" size="icon" onClick={onBack} className="mr-2">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="font-medium">关于</span>
      </div>

      {/* 内容 */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* 角色卡片 */}
          <div className="rounded-lg border border-border-light p-4 mb-4">
            <div className="flex items-center gap-3">
              <img src="/img/logo.png" alt="Hovi" className="w-14 h-14 rounded-lg object-contain" />
              <div className="flex-1">
                <div className="font-semibold">赫薇 Hovi</div>
                <div className="text-xs text-text-tertiary">虚拟个人助手</div>
              </div>
            </div>
            <div className="mt-3 text-sm text-text-secondary">{randomQuote}</div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start gap-1 bg-transparent h-auto p-0 mb-3 border-b border-border-light rounded-none">
              <TabsTrigger
                value="feature"
                className="text-xs px-3 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-text-primary text-text-tertiary -mb-px"
              >
                功能
              </TabsTrigger>
              <TabsTrigger
                value="guide"
                className="text-xs px-3 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-text-primary text-text-tertiary -mb-px"
              >
                使用
              </TabsTrigger>
              <TabsTrigger
                value="faq"
                className="text-xs px-3 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-text-primary text-text-tertiary -mb-px"
              >
                问答
              </TabsTrigger>
              <TabsTrigger
                value="knowledge"
                className="text-xs px-3 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-text-primary text-text-tertiary -mb-px"
              >
                知识库
              </TabsTrigger>
              <TabsTrigger
                value="persona"
                className="text-xs px-3 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-text-primary text-text-tertiary -mb-px"
              >
                角色
              </TabsTrigger>
              <TabsTrigger
                value="project"
                className="text-xs px-3 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-text-primary text-text-tertiary -mb-px"
              >
                项目
              </TabsTrigger>
            </TabsList>

            <TabsContent value="feature" className="mt-0">
              <div className="space-y-3 text-sm text-text-secondary">
                <p>赫薇是一款智能助手，可以帮助你完成各种任务。</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>智能对话和问答</li>
                  <li>定时任务管理</li>
                  <li>知识库检索</li>
                  <li>多代理协作</li>
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="guide" className="mt-0">
              <div className="space-y-3 text-sm text-text-secondary">
                <p>使用赫薇很简单：</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>在对话页面输入问题</li>
                  <li>赫薇会智能回答</li>
                  <li>可以创建定时任务</li>
                  <li>管理知识库内容</li>
                </ol>
              </div>
            </TabsContent>

            <TabsContent value="faq" className="mt-0">
              <div className="space-y-3 text-sm text-text-secondary">
                <p>常见问题解答...</p>
              </div>
            </TabsContent>

            <TabsContent value="knowledge" className="mt-0">
              <div className="space-y-3 text-sm text-text-secondary">
                <p>知识库内容...</p>
              </div>
            </TabsContent>

            <TabsContent value="persona" className="mt-0">
              <div className="space-y-3 text-sm text-text-secondary">
                <p>角色信息...</p>
              </div>
            </TabsContent>

            <TabsContent value="project" className="mt-0">
              <div className="space-y-3 text-sm text-text-secondary">
                <p>项目信息...</p>
              </div>
            </TabsContent>
          </Tabs>

          {/* 版本信息 */}
          <div className="mt-6 pt-4 border-t border-border-light space-y-2 text-sm text-text-secondary">
            <div className="flex justify-between">
              <span className="text-text-tertiary">版本</span>
              <span>v2026.3.14</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-tertiary">开发者</span>
              <span>OpenClaw Team</span>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// 设置页面内容
function SettingsContent({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState("general");

  const tabs = [
    { value: "general", label: "通用", icon: <Settings className="w-4 h-4" /> },
    { value: "shortcuts", label: "快捷键", icon: <Keyboard className="w-4 h-4" /> },
    { value: "skills", label: "Skills", icon: <Zap className="w-4 h-4" /> },
    { value: "plugins", label: "Plugins", icon: <Puzzle className="w-4 h-4" /> },
    { value: "connectors", label: "连接器", icon: <Plug className="w-4 h-4" /> },
    { value: "models", label: "模型", icon: <Bot className="w-4 h-4" /> },
    { value: "appearance", label: "外观", icon: <Palette className="w-4 h-4" /> },
    { value: "advanced", label: "高级", icon: <Cog className="w-4 h-4" /> },
    { value: "quota", label: "配额", icon: <DollarSign className="w-4 h-4" /> },
    { value: "avatar", label: "虚拟角色", icon: <User className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* 简洁头部 */}
      <div className="flex items-center p-4 border-b border-border-light">
        <Button variant="ghost" size="icon" onClick={onBack} className="mr-2">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="font-medium">设置</span>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col overflow-hidden"
      >
        {/* Tab 列表 - 横向滚动 */}
        <ScrollArea
          className="mx-4 mt-2 mb-0 flex-shrink-0 border-b border-border-light"
          showVerticalScrollbar={false}
          showHorizontalScrollbar
        >
          <TabsList className="w-max justify-start bg-transparent rounded-none p-0 h-auto gap-0">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-text-primary text-text-tertiary data-[state=active]:bg-transparent hover:text-text-primary transition-colors"
              >
                {tab.icon}
                <span className="text-xs whitespace-nowrap">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollArea>

        <ScrollArea className="flex-1">
          <div className="px-4 py-4">
            {activeTab === "general" && <GeneralSettingsTab onClose={onBack} />}
            {activeTab === "shortcuts" && <ShortcutsTab />}
            {activeTab === "skills" && <SkillsTab />}
            {activeTab === "plugins" && <PluginsTab />}
            {activeTab === "connectors" && <ConnectorsTab />}
            {activeTab === "models" && <ModelsTab onClose={onBack} />}
            {activeTab === "appearance" && <AppearanceTab onClose={onBack} />}
            {activeTab === "advanced" && <AdvancedTab onClose={onBack} />}
            {activeTab === "quota" && <QuotaTab onClose={onBack} />}
            {activeTab === "avatar" && <AvatarTab onClose={onBack} />}
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

// 主题设置页面内容
function ThemeContent({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col h-full">
      {/* 简洁头部 */}
      <div className="flex items-center p-4 border-b border-border-light">
        <Button variant="ghost" size="icon" onClick={onBack} className="mr-2">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="font-medium">主题设置</span>
      </div>

      <ScrollArea className="flex-1">
        <AppearanceTab onClose={onBack} />
      </ScrollArea>
    </div>
  );
}

// 连接页面内容
function ConnectionContent({ onBack }: { onBack: () => void }) {
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
  } = useConnectionStore();
  const { addToast } = useToastStore();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [gatewayUrlInput, setGatewayUrlInput] = useState(gatewayUrl);
  const [tokenInput, setTokenInput] = useState(gatewayToken);
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false);

  // 获取设备ID
  useEffect(() => {
    const stored = getStoredDeviceIdentity();
    setDeviceId(stored?.deviceId ?? null);
  }, []);

  const deviceIdShort = deviceId ? `${deviceId.slice(0, 6)}…${deviceId.slice(-4)}` : "未生成";
  const connectedAtText = lastConnectedAt ? new Date(lastConnectedAt).toLocaleString() : "—";

  const getStatusIcon = () => {
    switch (status) {
      case "connected":
        return <Wifi className="w-5 h-5 text-success" />;
      case "connecting":
        return <Loader2 className="w-5 h-5 text-warning animate-spin" />;
      case "error":
        return <AlertCircle className="w-5 h-5 text-error" />;
      case "disconnected":
        return <WifiOff className="w-5 h-5 text-text-tertiary" />;
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
    }
  };

  const handleResetDeviceId = () => {
    resetDeviceIdentity();
    setDeviceId(null);
    addToast({
      title: "设备身份已重置",
      description: "请重新连接以生成新的设备身份。",
      variant: "warning",
    });
  };

  const handleSaveToken = () => {
    setGatewayToken(tokenInput);
    setIsTokenDialogOpen(false);
    addToast({
      title: "Token 已更新",
      description: "点击重新连接以生效。",
      variant: "success",
    });
  };

  const handleReconnect = () => {
    const nextGatewayUrl = gatewayUrlInput.trim();
    if (nextGatewayUrl && nextGatewayUrl !== gatewayUrl) {
      setGatewayUrl(nextGatewayUrl);
    }
    connect();
  };

  return (
    <div className="flex flex-col h-full">
      {/* 简洁头部 */}
      <div className="flex items-center p-4 border-b border-border-light">
        <Button variant="ghost" size="icon" onClick={onBack} className="mr-2">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="font-medium">连接详情</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* 状态卡片 */}
          <div className="p-4 bg-surface-subtle rounded-lg">
            <div className="flex items-center gap-3">
              {getStatusIcon()}
              <div>
                <div className="font-medium">{getStatusText()}</div>
                <div className="text-xs text-text-tertiary">{gatewayUrl}</div>
              </div>
            </div>
          </div>

          {/* 连接信息 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-tertiary">Device ID</span>
              <span className="font-mono text-xs">{deviceIdShort}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-tertiary">最近连接</span>
              <span>{connectedAtText}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-tertiary">重试次数</span>
              <span>{reconnectAttempts}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-tertiary">Gateway Token</span>
              <span>{gatewayToken ? "已设置" : "未设置"}</span>
            </div>
          </div>

          {/* 错误提示 */}
          {lastError && (
            <div className="p-3 bg-error/10 border border-error/20 rounded-lg text-sm text-error">
              {lastError}
            </div>
          )}

          {/* 配对提示 */}
          {pairingRequestId && (
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg text-sm">
              <div className="font-medium text-warning">需要配对审批</div>
              <div className="text-text-secondary mt-1">
                设备 {pairingDeviceId ? pairingDeviceId.slice(0, 6) : ""} 请求配对
              </div>
              <div className="mt-2 font-mono text-xs text-text-primary">
                moltbot devices approve {pairingRequestId}
              </div>
            </div>
          )}

          {/* Gateway 地址 */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Gateway 地址</div>
            <Input
              placeholder="ws://192.168.110.193:18789"
              value={gatewayUrlInput}
              onChange={(e) => setGatewayUrlInput(e.target.value)}
            />
            <p className="text-xs text-text-tertiary">地址仅保存在当前浏览器。</p>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleResetDeviceId}>
              重置设备身份
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsTokenDialogOpen(true)}>
              <KeyRound className="w-4 h-4 mr-1" />
              Token
            </Button>
            <Button size="sm" onClick={handleReconnect}>
              <RefreshCcw className="w-4 h-4 mr-1" />
              重新连接
            </Button>
          </div>
        </div>
      </ScrollArea>

      {/* Token 编辑对话框 */}
      <Dialog open={isTokenDialogOpen} onOpenChange={setIsTokenDialogOpen}>
        <DialogContent className="max-w-[24rem]">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">设置 Gateway Token</DialogTitle>
          </DialogHeader>
          <div className="space-y-sm">
            <Input
              placeholder="输入 gateway token"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
            />
            <p className="text-xs text-text-tertiary">
              Token 会保存在本地浏览器，仅用于当前网关连接。
            </p>
          </div>
          <DialogFooter className="gap-sm">
            <Button variant="outline" size="sm" onClick={() => setIsTokenDialogOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleSaveToken}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 定时任务页面内容
function CronContent({ onBack }: { onBack: () => void }) {
  const wsClient = useConnectionStore((s) => s.wsClient);
  const [status, setStatus] = useState<CronStatus | null>(null);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // 格式化 schedule 显示
  const formatSchedule = (schedule: CronJob["schedule"]): string => {
    if (schedule.kind === "cron") return schedule.expr;
    if (schedule.kind === "every") return `每 ${schedule.everyMs}ms`;
    if (schedule.kind === "at") return schedule.at;
    return "";
  };

  // 加载数据
  const loadData = useCallback(async () => {
    if (!wsClient) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [statusResult, jobsResult] = await Promise.all([
        fetchCronStatus(wsClient),
        fetchCronJobs(wsClient),
      ]);
      setStatus(statusResult);
      setJobs(jobsResult.jobs);
    } catch (error) {
      // Ignore error
    } finally {
      setLoading(false);
    }
  }, [wsClient]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div className="flex flex-col h-full">
      {/* 简洁头部 */}
      <div className="flex items-center p-4 border-b border-border-light">
        <Button variant="ghost" size="icon" onClick={onBack} className="mr-2">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="font-medium">定时任务</span>
        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
          新建
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {loading ? (
            <div className="text-center py-8 text-text-tertiary">加载中...</div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-8 text-text-tertiary">暂无定时任务</div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div key={job.id} className="p-3 bg-surface-subtle rounded-lg">
                  <div className="font-medium">{job.name}</div>
                  <div className="text-xs text-text-tertiary mt-1">
                    {formatSchedule(job.schedule)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// 代理管理页面内容
function AgentsContent({ onBack }: { onBack: () => void }) {
  const wsClient = useConnectionStore((s) => s.wsClient);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // 加载数据
  const loadData = useCallback(async () => {
    if (!wsClient) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const agents = await fetchAgents(wsClient);
      setAgents(agents);
    } catch (error) {
      // Ignore error
    } finally {
      setLoading(false);
    }
  }, [wsClient]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div className="flex flex-col h-full">
      {/* 简洁头部 */}
      <div className="flex items-center p-4 border-b border-border-light">
        <Button variant="ghost" size="icon" onClick={onBack} className="mr-2">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="font-medium">代理管理</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {loading ? (
            <div className="text-center py-8 text-text-tertiary">加载中...</div>
          ) : agents.length === 0 ? (
            <div className="text-center py-8 text-text-tertiary">暂无代理</div>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <div key={agent.id} className="p-3 bg-surface-subtle rounded-lg">
                  <div className="font-medium">{agent.name}</div>
                  <div className="text-xs text-text-tertiary mt-1">{agent.description}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export const MyPage = memo(function MyPage({ userName, onClose }: MyPageProps) {
  const { config } = useSettingsStore();
  const { theme } = useThemeStore();
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Get user info from config
  const displayName = config?.ui?.assistant?.name || userName || "用户";
  const assistantAvatar = config?.ui?.assistant?.avatar;

  const menuItems: MenuItem[] = [
    { id: "settings", label: "设置", icon: Settings, onClick: () => setActiveSection("settings") },
    { id: "theme", label: "主题设置", icon: Palette, onClick: () => setActiveSection("theme") },
    { id: "cron", label: "定时任务", icon: Clock, onClick: () => setActiveSection("cron") },
    { id: "agents", label: "代理管理", icon: Users, onClick: () => setActiveSection("agents") },
    { id: "connection", label: "连接", icon: Link2, onClick: () => setActiveSection("connection") },
    { id: "about", label: "关于", icon: Info, onClick: () => setActiveSection("about") },
  ];

  // 如果有activeSection，显示详细页面
  if (activeSection) {
    return (
      <div className="flex flex-col h-full bg-background">
        {/* 内容区域 */}
        <div className="flex-1">
          {activeSection === "settings" && (
            <SettingsContent onBack={() => setActiveSection(null)} />
          )}
          {activeSection === "theme" && <ThemeContent onBack={() => setActiveSection(null)} />}
          {activeSection === "cron" && <CronContent onBack={() => setActiveSection(null)} />}
          {activeSection === "agents" && <AgentsContent onBack={() => setActiveSection(null)} />}
          {activeSection === "connection" && (
            <ConnectionContent onBack={() => setActiveSection(null)} />
          )}
          {activeSection === "usage" && <QuotaTab onClose={() => setActiveSection(null)} />}
          {activeSection === "about" && <AboutSection onBack={() => setActiveSection(null)} />}
        </div>
      </div>
    );
  }

  // 主菜单页面
  return (
    <div className="flex flex-col h-full bg-background">
      {/* 头部 - 用户信息 + Token使用量 */}
      <div className="p-4 border-b border-border-light space-y-4">
        <div className="flex items-center gap-3">
          {/* 头像 - 无emoji，使用首字符 */}
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border border-border-light">
            {assistantAvatar ? (
              <img src={assistantAvatar} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg font-semibold text-primary">{getInitial(displayName)}</span>
            )}
          </div>
          <div className="flex-1">
            <div className="font-semibold text-text-primary">{displayName}</div>
          </div>
        </div>

        {/* Token 使用量 - 简洁显示 */}
        <div className="flex items-center justify-between px-3 py-2 bg-surface-subtle rounded-lg text-sm">
          <span className="text-text-tertiary">Token 使用量</span>
          <span className="font-medium">已用 0 · 剩余 0 · $0</span>
        </div>
      </div>

      {/* 菜单列表 */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={item.onClick}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-surface-hover transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-surface-subtle flex items-center justify-center">
                  <Icon className="w-5 h-5 text-text-secondary" />
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium text-text-primary">{item.label}</div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {/* 退出登录按钮 - 固定在底部 */}
      <div className="p-4 border-t border-border-light">
        <button
          onClick={() => {
            if (confirm("确定要退出登录吗？")) {
            }
          }}
          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-surface-hover transition-colors text-error"
        >
          <div className="w-10 h-10 rounded-lg bg-error/10 flex items-center justify-center">
            <LogOut className="w-5 h-5 text-error" />
          </div>
          <div className="flex-1 text-left">
            <div className="font-medium">退出登录</div>
          </div>
        </button>
      </div>
    </div>
  );
});
