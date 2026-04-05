"use client";

import {
  Briefcase,
  FileText,
  BarChart3,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentManageDialog } from "@/components/agent-manage/AgentManageDialog";
import { ComputerPanelWrapper } from "@/components/agent/ComputerPanelWrapper";
import { ChannelCenterPage } from "@/components/channel/ChannelCenterPage";
import { EnhancedChatInput } from "@/components/chat/EnhancedChatInput";
import { MessageList, Message, SessionAttachmentMeta } from "@/components/chat/MessageList";
import { SessionDocuments } from "@/components/chat/SessionDocuments";
import { SessionPreviewPanel } from "@/components/chat/SessionPreviewPanel";
import { CronJobsDialog } from "@/components/cron/CronJobsDialog";
import { SettingsPanel } from "@/components/desk-pet/SettingsPanel";
import { VirtualAssistantPage } from "@/components/desk-pet/VirtualAssistantPage";
import { DesktopBootstrap } from "@/components/desktop/DesktopBootstrap";
import { DiscoverPage } from "@/components/discover/DiscoverPage";
import { FileItemProps } from "@/components/files/FileList";
import { KnowledgeBasePage } from "@/components/knowledge/KnowledgeBasePage";
import MainLayout from "@/components/layout/MainLayout";
import { MobileSessionDrawer } from "@/components/layout/MobileSessionDrawer";
import { MyPage } from "@/components/my/MyPage";
import { TaskSearchDialog } from "@/components/search/TaskSearchDialog";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { WelcomePage } from "@/components/welcome/WelcomePage";
import { StreamingReplayProvider, useStreamingReplay } from "@/contexts/StreamingReplayContext";
import { fetchAgents } from "@/features/persona/services/personaApi";
import type { AgentInfo } from "@/features/persona/types/persona";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useResponsive } from "@/hooks/useResponsive";
import { isSubagentLifecycleEvent } from "@/lib/agent-stream-events";
import { detectPathCardsFromAssistantMessage } from "@/lib/chat/path-detection";
import {
  bindSessionDocuments,
  isPageIndexSupported,
  listSessionDocuments,
} from "@/services/pageindexApi";
import { useAgentStore } from "@/stores/agentStore";
import { useAvatarStateStore } from "@/stores/avatarStateStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSessionDocumentStore } from "@/stores/sessionDocumentStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useShortcutStore } from "@/stores/shortcutStore";
import { useToastStore } from "@/stores/toastStore";

type ConnectorItem = {
  id: string;
  name: string;
  icon?: string;
  status?: "connected" | "disconnected" | "error" | "draft";
};

const HOME_QUICK_CARDS: Array<{
  title: string;
  description: string;
  prompt: string;
  icon: LucideIcon;
}> = [
  {
    title: "查询公司资质",
    description: "快速梳理公司证照与到期风险",
    prompt:
      "帮我整理一下公司都有哪些资质证书，包括营业执照、各类行业许可证、ISO认证等，最好能标注一下哪些即将过期需要续期",
    icon: Briefcase,
  },
  {
    title: "分析本月销售数据",
    description: "生成月度销售趋势与异常点总结",
    prompt:
      "这个月销售数据出来了，帮我分析一下销售额、订单量、客户增长这些指标，跟上个月和去年同期对比怎么样，有没有异常波动",
    icon: BarChart3,
  },
  {
    title: "投标文件生成器",
    description: "基于招标要求生成投标文档",
    prompt: "/投标文件生成器\n我需要制作投标文件，请帮我分析招标文件并生成完整的技术标和商务标",
    icon: FileText,
  },
  {
    title: "查看今日考勤情况",
    description: "汇总出勤、迟到、请假与加班信息",
    prompt: "帮忙查一下今天公司员工的考勤情况，有多少人正常出勤，谁迟到了，谁请假了，还有谁在加班",
    icon: Users,
  },
  {
    title: "撰写客户跟进邮件",
    description: "按客户阶段生成专业跟进话术",
    prompt:
      "帮我写一封客户跟进邮件，客户是制造业企业，之前已沟通过预算和交付周期，这次希望推进到合同确认阶段",
    icon: MessageSquare,
  },
  {
    title: "生成会议纪要",
    description: "整理重点结论、待办和负责人",
    prompt:
      "请根据今天项目例会内容生成一份会议纪要，包含关键决策、未决问题、待办事项和责任人，最后附上下次会议建议议程",
    icon: FileText,
  },
  {
    title: "制定招聘计划",
    description: "输出岗位优先级与招聘节奏",
    prompt:
      "帮我做一个季度招聘计划，按部门梳理岗位优先级、人数、预算和招聘节奏，并给出每个岗位的JD关键能力点",
    icon: Users,
  },
  {
    title: "本周运营复盘",
    description: "总结核心指标变化与下周策略",
    prompt:
      "请帮我做一份本周运营复盘，包含流量、转化、留存、客单价等核心指标变化，分析原因并提出下周优化动作",
    icon: BarChart3,
  },
];

const HOME_PRIMARY_CARDS = HOME_QUICK_CARDS.slice(0, 2);
const AUTO_APPROVE_ALWAYS_STORAGE_KEY = "hovi.approval.auto-allow-always.v1";

// 内部组件，使用StreamingReplayContext
function HomeContent() {
  const {
    sessions,
    activeSessionKey,
    fetchSessions,
    selectSession,
    createSession,
    renameSession,
    deleteSession,
    getSessionByKey,
    getUnreadMap,
    isLoading: isSessionsLoading,
    filterKind,
    setFilterKind,
    unreadOnly,
    setUnreadOnly,
    sortMode,
    setSortMode,
    getFilteredSessions,
    selectionMode,
    selectedKeys,
    toggleSelectionMode,
    toggleSelectedKey,
    selectAllKeys,
    clearSelection,
  } = useSessionStore();
  const { status, wsClient } = useConnectionStore();
  const { addToast } = useToastStore();
  const shortcutStore = useShortcutStore();
  const agentStore = useAgentStore();
  const { openSettings, config, loadConfig } = useSettingsStore();
  const { isMobile } = useResponsive();
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [activeMainView, setActiveMainView] = useState<
    "chat" | "channel" | "discover" | "knowledge" | "persona" | "my"
  >("chat");

  // Get user name from config
  const userName = config?.ui?.assistant?.name || "张三";
  const [assistantVisible, setAssistantVisible] = useState(false);
  const [personaSettingsOpen, setPersonaSettingsOpen] = useState(false);
  const [cronJobsOpen, setCronJobsOpen] = useState(false);
  const [agentManageOpen, setAgentManageOpen] = useState(false);
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false);
  const [taskSearchOpen, setTaskSearchOpen] = useState(false);
  const [homeTemplatesOpen, setHomeTemplatesOpen] = useState(false);
  const { isStreaming, startStreaming, stopStreaming } = useStreamingReplay();
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [detailSessionKey, setDetailSessionKey] = useState<string | null>(null);
  const [historyLoadingKey, setHistoryLoadingKey] = useState<string | null>(null);
  const [historyErrors, setHistoryErrors] = useState<Record<string, string>>({});
  const [historyLimits, setHistoryLimits] = useState<Record<string, number>>({});
  const historyDefaultLimit = 1000;
  const [toolEventsByRun, setToolEventsByRun] = useState<
    Record<
      string,
      {
        toolCalls?: Array<{
          id?: string;
          name?: string;
          arguments?: unknown;
          status?: "running" | "done";
          durationMs?: number;
        }>;
        toolResults?: Array<{
          toolCallId?: string;
          toolName?: string;
          content?: string;
          isError?: boolean;
          durationMs?: number;
        }>;
      }
    >
  >({});
  const [toolStartTimes, setToolStartTimes] = useState<Record<string, number>>({});
  const usageAppliedByRunKeyRef = useRef<Record<string, boolean>>({});
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<File[]>([]);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [availableConnectors, setAvailableConnectors] = useState<ConnectorItem[]>([]);
  const [sessionConnectorIds, setSessionConnectorIds] = useState<Record<string, string[]>>({});
  const [draftConnectorIds, setDraftConnectorIds] = useState<string[]>([]);
  const [autoApproveAlways, setAutoApproveAlways] = useState(false);

  // 当前正在进行的 runId（用于取消）
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const pendingUploadSessionKeyRef = useRef(
    `__preview_upload__:${typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : Date.now().toString(36)}`,
  );
  const pendingUploadSessionKey = pendingUploadSessionKeyRef.current;
  const detectedPathCardsCacheRef = useRef<Map<string, FileItemProps[]>>(new Map());
  const MAX_PATH_CARDS_PER_MESSAGE = 20;
  const workspaceDir =
    typeof config?.agents?.defaults?.workspace === "string"
      ? config.agents.defaults.workspace
      : undefined;

  // Dialog states
  type DialogType = "rename" | "delete" | "batchDelete" | null;
  const [activeDialog, setActiveDialog] = useState<DialogType>(null);
  const [dialogSessionKey, setDialogSessionKey] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");

  // 动态消息状态管理 - 支持多轮对话
  const [conversationMessages, setConversationMessages] = useState<Record<string, Message[]>>({});

  // 从配置初始化虚拟角色可见性
  useEffect(() => {
    let initialized = false;
    const init = async () => {
      if (initialized) return;
      await loadConfig();
      initialized = true;
    };
    void init();
    return () => {
      initialized = true;
    };
  }, []);

  useEffect(() => {
    if (config?.ui?.assistant?.enabled === true) {
      setAssistantVisible(true);
    }
  }, [config]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const value = window.localStorage.getItem(AUTO_APPROVE_ALWAYS_STORAGE_KEY);
      setAutoApproveAlways(value === "1" || value === "true");
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(AUTO_APPROVE_ALWAYS_STORAGE_KEY, autoApproveAlways ? "1" : "0");
    } catch {}
  }, [autoApproveAlways]);

  useEffect(() => {
    if (status === "connected") {
      void fetchSessions();
    }
  }, [status, fetchSessions]);

  useEffect(() => {
    if (activeSessionKey) {
      setCurrentConversationId(activeSessionKey);
    }
  }, [activeSessionKey]);

  // Mobile events - listen for mobile tab bar actions
  useEffect(() => {
    const handleOpenChat = () => {
      setCurrentConversationId(null);
      setActiveMainView("chat");
    };
    const handleOpenPersona = () => {
      setCurrentConversationId(null);
      setActiveMainView("persona");
    };
    const handleOpenSettings = () => openSettings();
    const handleOpenCronJobs = () => setCronJobsOpen(true);
    const handleOpenAgentManage = () => setAgentManageOpen(true);
    const handleOpenKnowledge = () => {
      setCurrentConversationId(null);
      setActiveMainView("knowledge");
    };
    const handleOpenDiscover = () => {
      setCurrentConversationId(null);
      setActiveMainView("discover");
    };
    const handleOpenChannel = () => {
      setCurrentConversationId(null);
      setActiveMainView("channel");
    };
    const handleOpenMy = () => {
      setCurrentConversationId(null);
      setActiveMainView("my");
    };

    window.addEventListener("mobile:open-chat", handleOpenChat);
    window.addEventListener("mobile:open-persona", handleOpenPersona);
    window.addEventListener("mobile:open-settings", handleOpenSettings);
    window.addEventListener("mobile:open-cron-jobs", handleOpenCronJobs);
    window.addEventListener("mobile:open-agent-manage", handleOpenAgentManage);
    window.addEventListener("mobile:open-knowledge", handleOpenKnowledge);
    window.addEventListener("mobile:open-discover", handleOpenDiscover);
    window.addEventListener("mobile:open-channel", handleOpenChannel);
    window.addEventListener("mobile:open-my", handleOpenMy);

    return () => {
      window.removeEventListener("mobile:open-chat", handleOpenChat);
      window.removeEventListener("mobile:open-persona", handleOpenPersona);
      window.removeEventListener("mobile:open-settings", handleOpenSettings);
      window.removeEventListener("mobile:open-cron-jobs", handleOpenCronJobs);
      window.removeEventListener("mobile:open-agent-manage", handleOpenAgentManage);
      window.removeEventListener("mobile:open-knowledge", handleOpenKnowledge);
      window.removeEventListener("mobile:open-discover", handleOpenDiscover);
      window.removeEventListener("mobile:open-channel", handleOpenChannel);
      window.removeEventListener("mobile:open-my", handleOpenMy);
    };
  }, [openSettings]);

  // 注册快捷键
  const shortcuts = useMemo(() => {
    const s = shortcutStore.shortcuts;
    const resolve = (
      id: string,
      fallback: { key: string; ctrl: boolean; shift: boolean; alt: boolean; meta: boolean },
    ) => {
      const match = s.find((entry) => entry.id === id);
      return {
        key: match?.key || fallback.key,
        ctrl: match?.ctrl ?? fallback.ctrl,
        shift: match?.shift ?? fallback.shift,
        alt: match?.alt ?? fallback.alt,
        meta: match?.meta ?? fallback.meta,
      };
    };
    return [
      {
        ...resolve("newSession", { key: "n", ctrl: true, shift: false, alt: false, meta: true }),
        action: "newSession",
        handler: () => {
          if (isStreaming) stopStreaming();
          setActiveMainView("chat");
          setCurrentConversationId(null);
          setDraftMessage("");
          setDraftAttachments([]);
          window.setTimeout(() => {
            const input = document.querySelector("textarea");
            if (input) {
              input.scrollIntoView({ behavior: "smooth", block: "center" });
              (input as HTMLTextAreaElement).focus();
            }
          }, 0);
        },
      },
      {
        ...resolve("search", { key: "k", ctrl: true, shift: false, alt: false, meta: true }),
        action: "openTaskSearch",
        handler: () => setTaskSearchOpen(true),
      },
      {
        ...resolve("persona", { key: "z", ctrl: true, shift: true, alt: false, meta: false }),
        action: "openPersona",
        handler: () => {
          setCurrentConversationId(null);
          setActiveMainView("persona");
        },
      },
      {
        ...resolve("cron", { key: "x", ctrl: true, shift: true, alt: false, meta: false }),
        action: "openCron",
        handler: () => setCronJobsOpen(true),
      },
      {
        ...resolve("agent", { key: "c", ctrl: true, shift: true, alt: false, meta: false }),
        action: "openAgent",
        handler: () => setAgentManageOpen(true),
      },
      {
        ...resolve("settings", { key: "v", ctrl: true, shift: true, alt: false, meta: false }),
        action: "openSettings",
        handler: () => openSettings(),
      },
      {
        ...resolve("home", { key: "h", ctrl: true, shift: true, alt: false, meta: false }),
        action: "goHome",
        handler: () => setActiveMainView("chat"),
      },
    ];
  }, [shortcutStore.shortcuts, openSettings, isStreaming, stopStreaming]);

  useKeyboardShortcuts({ shortcuts, enabled: !taskSearchOpen });

  const shortcutLabels = useMemo(() => {
    const resolveLabel = (
      id: string,
      fallback: { key: string; ctrl: boolean; shift: boolean; alt: boolean; meta: boolean },
    ) => {
      const shortcut = shortcutStore.shortcuts.find((item) => item.id === id);
      const key = (shortcut?.key || fallback.key).toUpperCase();
      const ctrl = shortcut?.ctrl ?? fallback.ctrl;
      const shift = shortcut?.shift ?? fallback.shift;
      const alt = shortcut?.alt ?? fallback.alt;
      const meta = shortcut?.meta ?? fallback.meta;
      const parts: string[] = [];
      if (ctrl) parts.push("Ctrl");
      if (meta) parts.push("Cmd");
      if (shift) parts.push("Shift");
      if (alt) parts.push("Alt");
      if (key) parts.push(key);
      return parts.join("+");
    };

    return {
      search: resolveLabel("search", {
        key: "k",
        ctrl: true,
        shift: false,
        alt: false,
        meta: true,
      }),
      newSession: resolveLabel("newSession", {
        key: "n",
        ctrl: true,
        shift: false,
        alt: false,
        meta: true,
      }),
    };
  }, [shortcutStore.shortcuts]);

  const loadConnectors = useCallback(async () => {
    if (!wsClient) return;
    try {
      const result = await wsClient.sendRequest<{ items?: ConnectorItem[] }>("connectors.list", {});
      setAvailableConnectors(result?.items ?? []);
    } catch (error) {
      addToast({
        title: "连接器加载失败",
        description: error instanceof Error ? error.message : "connectors.list failed",
        variant: "error",
      });
    }
  }, [addToast, wsClient]);

  // Session 文档预览面板包装器
  const SessionPreviewPanelWrapper = useCallback(({ sessionKey }: { sessionKey: string }) => {
    const { previewDocumentId, previewHighlightPage, previewHighlightText, closePreview } =
      useSessionDocumentStore();

    const handleClose = useCallback(() => {
      closePreview();
    }, [closePreview]);

    return (
      <SessionPreviewPanel
        documentId={previewDocumentId}
        highlightPage={previewHighlightPage}
        highlightText={previewHighlightText}
        onClose={handleClose}
      />
    );
  }, []);

  const loadSessionConnectors = useCallback(
    async (sessionKey: string) => {
      if (!wsClient || !sessionKey) return;
      try {
        const result = await wsClient.sendRequest<{ connectorIds?: string[] }>(
          "connectors.session.get",
          { sessionKey },
        );
        const ids = Array.isArray(result?.connectorIds)
          ? result.connectorIds.filter(
              (id): id is string => typeof id === "string" && id.trim().length > 0,
            )
          : [];
        setSessionConnectorIds((prev) => ({ ...prev, [sessionKey]: ids }));
      } catch (error) {
        addToast({
          title: "会话连接器加载失败",
          description: error instanceof Error ? error.message : "connectors.session.get failed",
          variant: "error",
        });
      }
    },
    [addToast, wsClient],
  );

  const saveSessionConnectors = useCallback(
    async (sessionKey: string, connectorIds: string[]) => {
      if (!wsClient || !sessionKey) return false;
      try {
        await wsClient.sendRequest("connectors.session.set", { sessionKey, connectorIds });
        setSessionConnectorIds((prev) => ({ ...prev, [sessionKey]: connectorIds }));
        return true;
      } catch (error) {
        addToast({
          title: "会话连接器保存失败",
          description: error instanceof Error ? error.message : "connectors.session.set failed",
          variant: "error",
        });
        return false;
      }
    },
    [addToast, wsClient],
  );

  useEffect(() => {
    if (status !== "connected") return;
    void loadConnectors();
  }, [status, loadConnectors]);

  useEffect(() => {
    if (!currentConversationId) return;
    if (sessionConnectorIds[currentConversationId]) return;
    void loadSessionConnectors(currentConversationId);
  }, [currentConversationId, loadSessionConnectors, sessionConnectorIds]);

  useEffect(() => {
    setDraftMessage("");
    setDraftAttachments([]);
  }, [currentConversationId]);

  const extractMessageText = useCallback((content: unknown): string => {
    let text: string;
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .map((part) => {
          if (part && typeof part === "object" && "text" in part) {
            const value = (part as { text?: string }).text;
            return typeof value === "string" ? value : "";
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
    } else {
      text = "";
    }
    // 过滤掉 Conversation info 元数据块
    // 匹配从 "Conversation info (untrusted metadata):" 到下一个以 [ 开头的时间戳格式之前的所有内容
    text = text.replace(/Conversation info \(untrusted metadata\):[\s\S]*?```[\s\S]*?```\n*/g, "");
    text = text.replace(/Sender \(untrusted metadata\):[\s\S]*?```[\s\S]*?```\n*/g, "");
    text = text.replace(/Thread starter \(untrusted metadata\):[\s\S]*?```[\s\S]*?```\n*/g, "");
    // 过滤掉消息前面的时间戳 [Fri 2026-02-27 08:56 GMT+8]
    text = text.replace(/^\[.*?\]\s*/g, "");
    return text.trim();
  }, []);

  const normalizeUsage = useCallback((usage: unknown) => {
    if (!usage || typeof usage !== "object") return undefined;
    const record = usage as Record<string, unknown>;
    const resolveNumber = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value) ? value : undefined;
    const input =
      resolveNumber(record.input) ??
      resolveNumber(record.inputTokens) ??
      resolveNumber(record.prompt_tokens) ??
      resolveNumber(record.promptTokens);
    const output =
      resolveNumber(record.output) ??
      resolveNumber(record.outputTokens) ??
      resolveNumber(record.completion_tokens) ??
      resolveNumber(record.completionTokens);
    const total =
      resolveNumber(record.total) ??
      resolveNumber(record.totalTokens) ??
      resolveNumber(record.total_tokens);
    if (input == null && output == null && total == null) return undefined;
    return { input, output, total };
  }, []);

  const mergeUsage = useCallback(
    (base: Message["usage"] | undefined, next: Message["usage"] | undefined, runKey: string) => {
      if (!next) return base;
      if (usageAppliedByRunKeyRef.current[runKey]) {
        return base;
      }
      usageAppliedByRunKeyRef.current[runKey] = true;
      if (!base) return next;
      return {
        input: (base.input ?? 0) + (next.input ?? 0),
        output: (base.output ?? 0) + (next.output ?? 0),
        total: (base.total ?? 0) + (next.total ?? 0),
      };
    },
    [],
  );

  const resolveGroupKey = useCallback((sessionKey: string, runId: string) => {
    return `${sessionKey}:${runId}`;
  }, []);

  const mergeToolCalls = useCallback(
    (
      existing:
        | Array<{
            id?: string;
            name?: string;
            arguments?: unknown;
            status?: "running" | "done";
            durationMs?: number;
          }>
        | undefined,
      incoming:
        | Array<{
            id?: string;
            name?: string;
            arguments?: unknown;
            status?: "running" | "done";
            durationMs?: number;
          }>
        | undefined,
    ) => {
      const next = new Map<
        string,
        {
          id?: string;
          name?: string;
          arguments?: unknown;
          status?: "running" | "done";
          durationMs?: number;
        }
      >();
      const push = (item: { id?: string; name?: string; arguments?: unknown }) => {
        const key = item.id ?? item.name ?? `call-${next.size}`;
        const previous = next.get(key);
        next.set(key, { ...previous, ...item });
      };
      existing?.forEach(push);
      incoming?.forEach(push);
      return Array.from(next.values());
    },
    [],
  );

  const mergeToolResults = useCallback(
    (
      existing:
        | Array<{
            toolCallId?: string;
            toolName?: string;
            content?: string;
            isError?: boolean;
            durationMs?: number;
          }>
        | undefined,
      incoming:
        | Array<{
            toolCallId?: string;
            toolName?: string;
            content?: string;
            isError?: boolean;
            durationMs?: number;
          }>
        | undefined,
    ) => {
      const next = new Map<
        string,
        {
          toolCallId?: string;
          toolName?: string;
          content?: string;
          isError?: boolean;
          durationMs?: number;
        }
      >();
      const push = (item: {
        toolCallId?: string;
        toolName?: string;
        content?: string;
        isError?: boolean;
        durationMs?: number;
      }) => {
        const key = item.toolCallId ?? item.toolName ?? `result-${next.size}`;
        const previous = next.get(key);
        next.set(key, { ...previous, ...item });
      };
      existing?.forEach(push);
      incoming?.forEach(push);
      return Array.from(next.values());
    },
    [],
  );

  const formatToolResult = useCallback((result: unknown, meta?: string) => {
    let base = "";
    if (typeof result === "string") {
      base = result;
    } else if (result != null) {
      try {
        base = JSON.stringify(result, null, 2);
      } catch {
        base = String(result);
      }
    }
    if (meta && base) return `${meta}\n${base}`;
    return meta ?? base;
  }, []);

  const normalizeHistoryMessages = useCallback(
    (messages: unknown[], sessionKey?: string): Message[] => {
      const normalized: Message[] = [];
      messages.forEach((item, index) => {
        const raw = item as {
          role?: string;
          content?: unknown;
          createdAt?: number | string;
          timestamp?: number;
          toolCallId?: string;
          toolName?: string;
          isError?: boolean;
          usage?: unknown;
        };
        const role = raw?.role;
        if (role === "toolResult") {
          const last = normalized[normalized.length - 1];
          if (last && last.role === "assistant") {
            const toolResult = {
              toolCallId: raw.toolCallId,
              toolName: raw.toolName,
              isError: raw.isError,
              content: extractMessageText(raw.content ?? ""),
            };
            last.toolResults = [...(last.toolResults ?? []), toolResult];
          }
          return;
        }

        const mappedRole =
          role === "user" || role === "assistant" || role === "system" ? role : "assistant";
        const text = extractMessageText(raw?.content ?? item);
        const createdAt = raw?.createdAt ?? raw?.timestamp;
        const timestamp =
          typeof createdAt === "number"
            ? new Date(createdAt)
            : typeof createdAt === "string"
              ? new Date(createdAt)
              : new Date();

        const toolCalls: Array<{ id?: string; name?: string; arguments?: unknown }> = [];
        const toolResults: Array<{
          toolCallId?: string;
          toolName?: string;
          content?: string;
          isError?: boolean;
        }> = [];
        if (Array.isArray(raw?.content)) {
          raw.content.forEach((part) => {
            if (!part || typeof part !== "object") return;
            const entry = part as {
              type?: string;
              id?: string;
              name?: string;
              arguments?: unknown;
              tool_use_id?: string;
              content?: unknown;
              is_error?: boolean;
              toolUse?: { id?: string; name?: string; input?: unknown };
              toolResult?: {
                tool_use_id?: string;
                content?: string;
                is_error?: boolean;
                name?: string;
              };
            };
            // Extract tool calls
            if (
              entry.type === "toolCall" ||
              entry.type === "toolUse" ||
              entry.type === "functionCall" ||
              entry.type === "tool_use"
            ) {
              toolCalls.push({
                id: entry.id ?? entry.toolUse?.id,
                name: entry.name ?? entry.toolUse?.name,
                arguments: entry.arguments ?? entry.toolUse?.input,
              });
            }
            // Extract tool results
            if (
              entry.type === "toolResult" ||
              entry.type === "tool_result" ||
              entry.type === "tool_result_multiple"
            ) {
              const resultContent = extractMessageText(
                entry.content ?? entry.toolResult?.content ?? "",
              );
              toolResults.push({
                toolCallId: entry.tool_use_id ?? entry.toolResult?.tool_use_id,
                toolName: entry.name ?? entry.toolResult?.name,
                content: resultContent,
                isError: entry.is_error ?? entry.toolResult?.is_error,
              });
            }
          });
        }

        const messageId = `history-${index}-${timestamp.getTime()}`;
        const normalizedRole = mappedRole === "system" ? "assistant" : mappedRole;
        const detectedPathCards =
          normalizedRole === "assistant"
            ? detectPathCardsFromAssistantMessage(text, {
                sessionKey,
                maxPerMessage: MAX_PATH_CARDS_PER_MESSAGE,
                workspaceDir,
              })
            : [];

        normalized.push({
          id: messageId,
          role: normalizedRole,
          content: text || (toolCalls.length > 0 ? "[工具调用]" : "[无文本内容]"),
          timestamp,
          usage: normalizeUsage(raw?.usage),
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          toolResults: toolResults.length > 0 ? toolResults : undefined,
          files: detectedPathCards.length > 0 ? detectedPathCards : undefined,
        });
      });
      return normalized;
    },
    [extractMessageText, normalizeUsage, MAX_PATH_CARDS_PER_MESSAGE, workspaceDir],
  );

  const getDetectedPathCards = useCallback(
    (params: { messageId: string; content: string; sessionKey?: string }): FileItemProps[] => {
      const text = params.content.trim();
      if (!text) return [];
      const cacheKey = `${params.sessionKey ?? "no-session"}:${params.messageId}:${workspaceDir ?? "no-workspace"}:${text}`;
      const cached = detectedPathCardsCacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }
      const cards = detectPathCardsFromAssistantMessage(text, {
        sessionKey: params.sessionKey,
        maxPerMessage: MAX_PATH_CARDS_PER_MESSAGE,
        workspaceDir,
      });
      detectedPathCardsCacheRef.current.set(cacheKey, cards);
      if (detectedPathCardsCacheRef.current.size > 500) {
        const firstKey = detectedPathCardsCacheRef.current.keys().next().value;
        if (typeof firstKey === "string") {
          detectedPathCardsCacheRef.current.delete(firstKey);
        }
      }
      return cards;
    },
    [MAX_PATH_CARDS_PER_MESSAGE, workspaceDir],
  );

  const mergeDetectedPathCards = useCallback(
    (
      existing: FileItemProps[] | undefined,
      detected: FileItemProps[],
    ): FileItemProps[] | undefined => {
      const base = (existing ?? []).filter((item) => item.source !== "detected-path");
      if (base.length === 0 && detected.length === 0) {
        return undefined;
      }
      return [...base, ...detected];
    },
    [],
  );

  const extractAttachmentNamesFromText = useCallback((text: string): string[] => {
    if (!text) return [];
    const matches: string[] = [];
    const pattern = /^\[Attachment\s+\d+\]\s+(.+?)(?:\s+\([^)]*\))?\s*$/gm;
    let match: RegExpExecArray | null = pattern.exec(text);
    while (match) {
      const filename = match[1]?.trim();
      if (filename) {
        matches.push(filename);
      }
      match = pattern.exec(text);
    }
    return matches;
  }, []);

  const attachSessionDocumentsToMessages = useCallback(
    (
      messages: Message[],
      documents: Array<{
        id: string;
        knowledgeDocumentId?: string;
        kbId?: string;
        filename: string;
        mimeType: string;
        uploadedAt: string;
      }>,
    ): Message[] => {
      if (messages.length === 0 || documents.length === 0) {
        return messages;
      }
      const userIndexes = messages
        .map((message, index) => (message.role === "user" ? index : -1))
        .filter((index): index is number => index >= 0);
      if (userIndexes.length === 0) {
        return messages;
      }

      const nextMessages = messages.map((message) => ({ ...message }));
      const docEntries = documents.map((doc) => ({
        doc,
        uploadedAtMs: Number.isFinite(new Date(doc.uploadedAt).getTime())
          ? new Date(doc.uploadedAt).getTime()
          : 0,
      }));
      const assignedDocIds = new Set<string>();
      const attachmentsByMessage = new Map<number, SessionAttachmentMeta[]>();
      const ensureSlot = (messageIndex: number) => {
        if (!attachmentsByMessage.has(messageIndex)) {
          attachmentsByMessage.set(messageIndex, []);
        }
        return attachmentsByMessage.get(messageIndex)!;
      };
      const assignDoc = (messageIndex: number, doc: (typeof docEntries)[number]["doc"]) => {
        if (assignedDocIds.has(doc.id)) return;
        assignedDocIds.add(doc.id);
        ensureSlot(messageIndex).push({
          documentId: doc.id,
          knowledgeDocumentId: doc.knowledgeDocumentId,
          kbId: doc.kbId,
          name: doc.filename,
          mimeType: doc.mimeType,
          uploadedAt: doc.uploadedAt,
        });
      };

      for (const messageIndex of userIndexes) {
        const message = nextMessages[messageIndex];
        const names = extractAttachmentNamesFromText(message.content);
        if (names.length === 0) continue;
        const messageTime = message.timestamp.getTime();
        for (const name of names) {
          const candidate = docEntries
            .filter((entry) => !assignedDocIds.has(entry.doc.id) && entry.doc.filename === name)
            .sort(
              (a, b) =>
                Math.abs(a.uploadedAtMs - messageTime) - Math.abs(b.uploadedAtMs - messageTime),
            )[0];
          if (candidate) {
            assignDoc(messageIndex, candidate.doc);
          }
        }
      }

      for (const entry of docEntries) {
        if (assignedDocIds.has(entry.doc.id)) continue;
        let bestIndex = -1;
        let bestDelta = Number.POSITIVE_INFINITY;
        for (const messageIndex of userIndexes) {
          const delta = Math.abs(
            nextMessages[messageIndex].timestamp.getTime() - entry.uploadedAtMs,
          );
          if (delta < bestDelta) {
            bestDelta = delta;
            bestIndex = messageIndex;
          }
        }
        if (bestIndex >= 0) {
          assignDoc(bestIndex, entry.doc);
        }
      }

      attachmentsByMessage.forEach((attachments, messageIndex) => {
        const dedup = new Map<string, SessionAttachmentMeta>();
        for (const item of attachments) {
          dedup.set(item.documentId, item);
        }
        nextMessages[messageIndex].sessionAttachments = Array.from(dedup.values());
      });
      return nextMessages;
    },
    [extractAttachmentNamesFromText],
  );

  const fetchHistory = useCallback(
    async (sessionKey: string, force = false, limitOverride?: number) => {
      if (!wsClient) return;
      // 总是强制重新获取完整历史，忽略缓存
      const limit = typeof limitOverride === "number" ? limitOverride : historyDefaultLimit;
      setHistoryLoadingKey(sessionKey);
      try {
        // First, get the total count to determine how many messages to load
        const countResult = await wsClient.sendRequest<{
          totalMessages?: number;
        }>("chat.history", {
          sessionKey,
          limit: 1,
        });
        // 如果后端没有返回 totalMessages，直接使用默认的最大限制
        const totalToLoad = countResult?.totalMessages
          ? countResult.totalMessages + 100
          : historyDefaultLimit;

        const result = await wsClient.sendRequest<{
          messages?: unknown[];
          totalMessages?: number;
        }>("chat.history", {
          sessionKey,
          limit: totalToLoad,
        });
        let history = normalizeHistoryMessages(result?.messages ?? [], sessionKey);
        try {
          const docsResult = await listSessionDocuments(sessionKey);
          history = attachSessionDocumentsToMessages(history, docsResult.documents ?? []);
        } catch {}
        setConversationMessages((prev) => {
          const existing = prev[sessionKey];
          if (!force && existing && existing.length > 0) {
            return prev;
          }
          return {
            ...prev,
            [sessionKey]: history,
          };
        });
        setHistoryErrors((prev) => {
          if (!prev[sessionKey]) return prev;
          const next = { ...prev };
          delete next[sessionKey];
          return next;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "chat.history failed";
        setHistoryErrors((prev) => ({ ...prev, [sessionKey]: message }));
        addToast({
          title: "历史记录加载失败",
          description: message,
          variant: "error",
        });
      } finally {
        setHistoryLoadingKey((current) => (current === sessionKey ? null : current));
      }
    },
    [
      addToast,
      attachSessionDocumentsToMessages,
      conversationMessages,
      historyDefaultLimit,
      normalizeHistoryMessages,
      wsClient,
    ],
  );

  useEffect(() => {
    const sessionKey = activeSessionKey;
    if (!sessionKey) return;
    void fetchHistory(sessionKey);
  }, [activeSessionKey, fetchHistory]);

  useEffect(() => {
    if (!wsClient) return;
    const handleChatEvent = (payload: unknown) => {
      const data = payload as {
        runId?: string;
        sessionKey?: string;
        state?: "delta" | "final" | "error";
        message?: { role?: string; content?: unknown; timestamp?: number };
        errorMessage?: string;
        usage?: unknown;
      };
      const sessionKey = typeof data.sessionKey === "string" ? data.sessionKey : undefined;
      const runId = typeof data.runId === "string" ? data.runId : undefined;
      if (!sessionKey || !runId) return;
      if (data.message?.role === "user") {
        return;
      }
      const runKey = `${sessionKey}:${runId}`;
      const text = extractMessageText(data.message?.content ?? "");
      const timestampValue = data.message?.timestamp;
      const timestamp = typeof timestampValue === "number" ? new Date(timestampValue) : new Date();
      const groupKey = resolveGroupKey(sessionKey, runId);
      const messageId = `assistant-${groupKey}`;
      const toolData = toolEventsByRun[groupKey];
      const normalizedUsage = normalizeUsage(data.usage);
      setConversationMessages((prev) => {
        const messages = prev[sessionKey] ? [...prev[sessionKey]!] : [];
        const index = messages.findIndex((msg) => msg.id === messageId);
        if (data.state === "error") {
          const errorText = data.errorMessage?.trim()
            ? `请求失败：${data.errorMessage}`
            : "请求失败，请重试";
          const errorMessage: Message = {
            id: messageId,
            role: "assistant",
            content: errorText,
            timestamp: new Date(),
            status: undefined, // 清除等待状态
            toolCalls: toolData?.toolCalls,
            toolResults: toolData?.toolResults,
          };
          if (index >= 0) {
            messages[index] = errorMessage;
          } else {
            messages.push(errorMessage);
          }
          delete usageAppliedByRunKeyRef.current[runKey];
          return { ...prev, [sessionKey]: messages };
        }
        if (!text && data.state === "final") {
          if (index >= 0) {
            return { ...prev, [sessionKey]: messages };
          }
          return prev;
        }
        const existingFiles = index >= 0 ? messages[index]?.files : undefined;
        const detectedPathCards =
          data.state === "final"
            ? getDetectedPathCards({ messageId, content: text, sessionKey })
            : [];
        const mergedFiles =
          data.state === "final"
            ? mergeDetectedPathCards(existingFiles, detectedPathCards)
            : existingFiles;
        const nextMessage: Message = {
          id: messageId,
          role: "assistant",
          content: text,
          timestamp,
          status: undefined, // 清除等待状态
          usage: mergeUsage(
            index >= 0 ? messages[index]?.usage : undefined,
            normalizedUsage,
            runKey,
          ),
          toolCalls: toolData?.toolCalls,
          toolResults: toolData?.toolResults,
          files: mergedFiles,
        };
        if (index >= 0) {
          messages[index] = {
            ...messages[index],
            ...nextMessage,
            toolCalls: mergeToolCalls(messages[index].toolCalls, nextMessage.toolCalls),
            toolResults: mergeToolResults(messages[index].toolResults, nextMessage.toolResults),
          };
        } else {
          messages.push(nextMessage);
        }
        if (data.state === "final") {
          delete usageAppliedByRunKeyRef.current[runKey];
        }
        return { ...prev, [sessionKey]: messages };
      });
    };
    wsClient.addEventListener("chat", handleChatEvent);
    return () => {
      wsClient.removeEventListener("chat", handleChatEvent);
    };
  }, [
    extractMessageText,
    resolveGroupKey,
    mergeUsage,
    mergeToolCalls,
    mergeToolResults,
    mergeDetectedPathCards,
    normalizeUsage,
    getDetectedPathCards,
    toolEventsByRun,
    wsClient,
  ]);

  useEffect(() => {
    if (!wsClient) return;
    const handleAgentEvent = (payload: unknown) => {
      const data = payload as {
        runId?: string;
        sessionKey?: string;
        stream?: string;
        data?: {
          phase?: string;
          name?: string;
          toolCallId?: string;
          args?: unknown;
          result?: unknown;
          meta?: string;
          isError?: boolean;
          text?: string;
          delta?: string;
        };
      };

      // 处理 assistant 流事件
      if (data.stream === "assistant") {
        const sessionKey = typeof data.sessionKey === "string" ? data.sessionKey : undefined;
        const runId = typeof data.runId === "string" ? data.runId : undefined;
        if (!sessionKey || !runId) return;

        const text = typeof data.data?.text === "string" ? data.data.text : "";
        const delta = typeof data.data?.delta === "string" ? data.data.delta : "";

        if (!text && !delta) return;

        // 使用类似 handleChatEvent 的逻辑来处理 assistant 消息
        const groupKey = resolveGroupKey(sessionKey, runId);
        const messageId = `assistant-${groupKey}`;

        setConversationMessages((prev) => {
          const messages = prev[sessionKey] ? [...prev[sessionKey]!] : [];
          const index = messages.findIndex((msg) => msg.id === messageId);

          const nextMessage: Message = {
            id: messageId,
            role: "assistant",
            content: text || delta,
            timestamp: new Date(),
            status: undefined,
          };

          if (index >= 0) {
            messages[index] = {
              ...messages[index],
              ...nextMessage,
            };
          } else {
            messages.push(nextMessage);
          }
          return { ...prev, [sessionKey]: messages };
        });
        return;
      }

      // 处理 subagent lifecycle 事件
      if (isSubagentLifecycleEvent(data)) {
        const subagentData = data.data.subagent;
        const phase = data.data.phase;

        if (phase === "start") {
          agentStore.addSubagent({
            ...subagentData,
            createdAt: new Date(data.data.startedAt || Date.now()),
            startedAt: data.data.startedAt ? new Date(data.data.startedAt) : undefined,
          });
        } else if (phase === "end" || phase === "error") {
          agentStore.updateSubagent(subagentData.id, {
            status: phase === "error" ? "failed" : "completed",
            output: data.data.output as string | undefined,
            error: data.data.error as string | undefined,
            endedAt: data.data.endedAt ? new Date(data.data.endedAt) : new Date(),
          });
        }
        return;
      }

      if (data.stream !== "tool") return;
      const sessionKey = typeof data.sessionKey === "string" ? data.sessionKey : undefined;
      const runId = typeof data.runId === "string" ? data.runId : undefined;
      if (!sessionKey || !runId) return;
      const phase = data.data?.phase;
      const toolCallId =
        typeof data.data?.toolCallId === "string" ? data.data.toolCallId : undefined;
      const toolName = typeof data.data?.name === "string" ? data.data.name : undefined;

      // 处理 avatar 状态工具事件
      if (toolName === "set_avatar_state") {
        const resultData = data.data?.result as
          | {
              details?: {
                type?: string;
                state?: "idle" | "emote";
                emoteId?: string | null;
                expression?: string;
              };
            }
          | undefined;

        if (resultData?.details?.type === "avatar_state") {
          const avatarState = {
            type: "avatar_state" as const,
            state: resultData.details.state || "idle",
            emoteId: resultData.details.emoteId || null,
            expression: resultData.details.expression || "neutral",
          };
          useAvatarStateStore.getState().setAvatarState(avatarState);
        }
      }

      const toolKey = resolveGroupKey(sessionKey, runId);
      const toolCallKey = toolCallId ? `${toolKey}:${toolCallId}` : undefined;
      const durationMs =
        phase === "result" && toolCallKey && toolStartTimes[toolCallKey] != null
          ? Date.now() - toolStartTimes[toolCallKey]
          : undefined;
      const nextToolCalls =
        phase === "start" || phase === "update"
          ? [
              {
                id: toolCallId,
                name: toolName,
                arguments: data.data?.args,
                status: "running" as const,
              },
            ]
          : undefined;
      const finalToolCall =
        phase === "result"
          ? [
              {
                id: toolCallId,
                name: toolName,
                status: "done" as const,
                durationMs,
              },
            ]
          : undefined;
      const resultContent =
        phase === "result" ? formatToolResult(data.data?.result, data.data?.meta) : undefined;
      const nextToolResults =
        phase === "result"
          ? [
              {
                toolCallId,
                toolName,
                content: resultContent,
                isError: Boolean(data.data?.isError),
                durationMs,
              },
            ]
          : undefined;

      if (nextToolCalls || nextToolResults || finalToolCall) {
        if (phase === "start" && toolCallKey) {
          setToolStartTimes((prev) => ({ ...prev, [toolCallKey]: Date.now() }));
        }
        if (phase === "result" && toolCallKey) {
          setToolStartTimes((prev) => {
            if (!prev[toolCallKey]) return prev;
            const next = { ...prev };
            delete next[toolCallKey];
            return next;
          });
        }
        setToolEventsByRun((prev) => {
          const current = prev[toolKey] ?? {};
          const toolCalls = mergeToolCalls(
            current.toolCalls,
            mergeToolCalls(nextToolCalls, finalToolCall),
          );
          const toolResults = mergeToolResults(current.toolResults, nextToolResults);
          return {
            ...prev,
            [toolKey]: {
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
              toolResults: toolResults.length > 0 ? toolResults : undefined,
            },
          };
        });

        setConversationMessages((prev) => {
          const messages = prev[sessionKey] ? [...prev[sessionKey]!] : [];
          const messageId = `assistant-${toolKey}`;
          const index = messages.findIndex((msg) => msg.id === messageId);
          if (index < 0) return prev;
          const existing = messages[index];
          messages[index] = {
            ...existing,
            toolCalls: mergeToolCalls(
              existing.toolCalls,
              mergeToolCalls(nextToolCalls, finalToolCall),
            ),
            toolResults: mergeToolResults(existing.toolResults, nextToolResults),
          };
          return { ...prev, [sessionKey]: messages };
        });
      }
    };
    wsClient.addEventListener("agent", handleAgentEvent);
    return () => {
      wsClient.removeEventListener("agent", handleAgentEvent);
    };
  }, [
    formatToolResult,
    mergeToolCalls,
    mergeToolResults,
    resolveGroupKey,
    toolStartTimes,
    wsClient,
  ]);

  const fileToBase64 = useCallback((file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Unexpected file reader result"));
          return;
        }
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const updateMessageById = useCallback(
    (sessionKey: string, messageId: string, updater: (message: Message) => Message) => {
      setConversationMessages((prev) => {
        const messages = prev[sessionKey] ? [...prev[sessionKey]!] : [];
        const index = messages.findIndex((msg) => msg.id === messageId);
        if (index < 0) return prev;
        messages[index] = updater(messages[index]);
        return { ...prev, [sessionKey]: messages };
      });
    },
    [],
  );

  const sendChatPayload = useCallback(
    async (params: {
      sessionKey: string;
      message: string;
      attachments?: File[];
      runId?: string;
    }) => {
      const client = useConnectionStore.getState().wsClient;
      if (!client) {
        return { ok: false, error: "尚未连接到网关" };
      }
      const normalizedAttachments =
        params.attachments && params.attachments.length > 0
          ? await Promise.all(
              params.attachments.map(async (file) => ({
                type: file.type.startsWith("image/") ? "image" : "file",
                mimeType: file.type,
                fileName: file.name,
                content: await fileToBase64(file),
              })),
            )
          : undefined;
      // Use provided runId or generate a new one
      const idempotencyKey =
        params.runId ??
        (typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `run-${Date.now()}`);
      try {
        const response = await client.sendRequest<{ runId?: string }>("chat.send", {
          sessionKey: params.sessionKey,
          message: params.message,
          idempotencyKey,
          attachments: normalizedAttachments,
        });
        return { ok: true, runId: response?.runId ?? idempotencyKey };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "chat.send failed",
        };
      }
    },
    [fileToBase64],
  );

  const deriveSessionLabel = useCallback((text: string) => {
    const trimmed = text.trim().replace(/\s+/g, " ");
    if (!trimmed) return undefined;
    return trimmed.length > 20 ? `${trimmed.slice(0, 20)}…` : trimmed;
  }, []);

  const currentSession = activeSessionKey ? getSessionByKey(activeSessionKey) : undefined;
  const detailSession = detailSessionKey ? getSessionByKey(detailSessionKey) : undefined;
  const conversationTitle =
    currentSession?.label ||
    currentSession?.derivedTitle ||
    currentSession?.displayName ||
    undefined;

  // 收集当前对话的所有生成文件
  const generatedFiles = useMemo(() => {
    if (!currentConversationId) return [];

    const messages = conversationMessages[currentConversationId] || [];
    const allFiles: FileItemProps[] = [];

    messages.forEach((msg) => {
      if (msg.files && msg.files.length > 0) {
        allFiles.push(...msg.files);
      }
    });

    return allFiles;
  }, [currentConversationId, conversationMessages]);

  const handleNewConversation = async () => {
    if (isStreaming) stopStreaming();
    setActiveMainView("chat");
    setCurrentConversationId(null);
    setDraftMessage("");
    setDraftAttachments([]);
    window.setTimeout(() => {
      const input = document.querySelector("textarea");
      if (input) {
        input.scrollIntoView({ behavior: "smooth", block: "center" });
        (input as HTMLTextAreaElement).focus();
      }
    }, 0);
  };

  const handleSelectConversation = (id: string) => {
    setActiveMainView("chat");
    setCurrentConversationId(id);
    selectSession(id);
    if (isStreaming) {
      stopStreaming();
    }
  };

  const handleSelectAssistant = (prompt: string) => {
    setActiveMainView("chat");
    setDraftMessage(prompt);
    setDraftAttachments([]);
    window.setTimeout(() => {
      const input = document.querySelector("textarea");
      if (input) {
        input.scrollIntoView({ behavior: "smooth", block: "center" });
        (input as HTMLTextAreaElement).focus();
      }
    }, 0);
  };

  const handleSendMessage = async (message: string, attachments?: File[]) => {
    if (isStreaming) {
      stopStreaming();
    }

    if (!useConnectionStore.getState().wsClient) {
      addToast({
        title: "尚未连接到网关",
        description: "请先完成连接后再发送消息。",
        variant: "error",
      });
      return { ok: false, error: "尚未连接到网关" };
    }
    if (isCreatingSession) {
      return { ok: false, error: "正在创建会话" };
    }

    let sessionKey = currentConversationId;
    const selectedConnectors = sessionKey
      ? (sessionConnectorIds[sessionKey] ?? [])
      : draftConnectorIds;

    // 创建新的用户消息
    const messageId = `msg-${Date.now()}`;
    const newUserMessage: Message = {
      id: messageId,
      role: "user",
      content: message,
      attachments: attachments ?? [],
      timestamp: new Date(),
      status: "sending",
      retryPayload: { message, attachments },
    };

    if (!sessionKey) {
      // 先显示用户消息（使用临时会话 key）
      const tempSessionKey = `temp-${Date.now()}`;
      setCurrentConversationId(tempSessionKey);
      setConversationMessages((prev) => ({
        ...prev,
        [tempSessionKey]: [newUserMessage],
      }));

      // 然后创建真实会话
      setIsCreatingSession(true);
      const label = deriveSessionLabel(message);
      sessionKey = await createSession(label);
      setIsCreatingSession(false);

      if (!sessionKey) {
        addToast({
          title: "新建会话失败",
          description: "请确认网关连接后重试。",
          variant: "error",
        });
        return { ok: false, error: "新建会话失败" };
      }

      // 更新为真实会话 key
      setCurrentConversationId(sessionKey);
      setConversationMessages((prev) => {
        const messages = { ...prev };
        // 将临时会话的消息转移到真实会话
        messages[sessionKey!] = messages[tempSessionKey] || [];
        delete messages[tempSessionKey];
        return messages;
      });

      try {
        await bindSessionDocuments({
          sourceSessionKey: pendingUploadSessionKey,
          targetSessionKey: sessionKey,
        });
        const { loadDocuments } = useSessionDocumentStore.getState();
        await loadDocuments(sessionKey);
      } catch {}

      if (selectedConnectors.length > 0) {
        await saveSessionConnectors(sessionKey, selectedConnectors);
        setDraftConnectorIds([]);
      }
    } else {
      // 更新对话消息列表
      setConversationMessages((prev) => ({
        ...prev,
        [sessionKey!]: [...(prev[sessionKey!] || []), newUserMessage],
      }));
    }

    // 生成 runId 用于创建 AI 消息占位符
    const runId =
      typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `run-${Date.now()}`;
    const assistantMessageId = `assistant-${sessionKey!}:${runId}`;

    // 上传附件到 PageIndex（如果支持）
    if (attachments && attachments.length > 0 && sessionKey) {
      const { uploadDocument } = useSessionDocumentStore.getState();
      for (const file of attachments) {
        if (file.type.startsWith("image/") || isPageIndexSupported(file.name)) {
          // 后台上传，不阻塞消息发送
          uploadDocument(sessionKey, file).catch((err) => {});
        }
      }
    }

    const result = await sendChatPayload({
      sessionKey,
      message,
      attachments,
      runId,
    });
    if (result.ok) {
      // 使用网关返回的 runId 创建 AI 消息占位符
      const actualRunId = result.runId ?? runId;
      const assistantMessageId = `assistant-${sessionKey!}:${actualRunId}`;
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        status: "waiting",
      };
      setConversationMessages((prev) => ({
        ...prev,
        [sessionKey!]: [...(prev[sessionKey!] || []), assistantMessage],
      }));
      // 设置 activeRunId 用于取消
      setActiveRunId(actualRunId);
      updateMessageById(sessionKey, messageId, (msg) => ({
        ...msg,
        status: undefined,
        retryPayload: undefined,
      }));
      return { ok: true };
    }
    addToast({
      title: "消息发送失败",
      description: result.error ?? "chat.send failed",
      variant: "error",
    });
    updateMessageById(sessionKey, messageId, (msg) => ({
      ...msg,
      status: "failed",
      retryPayload: msg.retryPayload ?? { message, attachments },
    }));
    return { ok: false, error: result.error ?? "chat.send failed" };
  };

  // 重放按钮点击处理
  const handleReplayClick = () => {
    if (!currentConversationId) {
      return;
    }

    if (isStreaming) {
      stopStreaming();
    } else {
      const messages = conversationMessages[currentConversationId] || [];
      startStreaming(messages);
    }
  };

  const activeConnectorIds = currentConversationId
    ? (sessionConnectorIds[currentConversationId] ?? [])
    : draftConnectorIds;

  const handleToggleConnector = useCallback(
    (connectorId: string, enabled: boolean) => {
      const apply = (prev: string[]) => {
        if (enabled) {
          if (prev.includes(connectorId)) return prev;
          return [...prev, connectorId];
        }
        return prev.filter((id) => id !== connectorId);
      };
      if (currentConversationId) {
        const prev = sessionConnectorIds[currentConversationId] ?? [];
        const next = apply(prev);
        void saveSessionConnectors(currentConversationId, next);
      } else {
        setDraftConnectorIds((prev) => apply(prev));
      }
    },
    [currentConversationId, saveSessionConnectors, sessionConnectorIds],
  );

  // TopBar actions

  const handleShare = () => {
    addToast({
      title: "分享功能开发中",
      description: "该功能正在开发中,敬请期待",
    });
  };

  const handleExport = () => {
    addToast({
      title: "导出功能开发中",
      description: "该功能正在开发中,敬请期待",
    });
  };

  const handleDelete = () => {
    if (!currentConversationId) return;
    setDialogSessionKey(currentConversationId);
    setActiveDialog("delete");
  };

  const handleRename = () => {
    if (!currentConversationId) return;
    const session = getSessionByKey(currentConversationId);
    setRenameInput(session?.label || session?.derivedTitle || session?.displayName || "");
    setDialogSessionKey(currentConversationId);
    setActiveDialog("rename");
  };

  const confirmRename = () => {
    if (!dialogSessionKey || !renameInput.trim()) return;
    void renameSession(dialogSessionKey, renameInput.trim());
    setActiveDialog(null);
    setDialogSessionKey(null);
    setRenameInput("");
  };

  const confirmDelete = () => {
    if (!dialogSessionKey) return;
    void deleteSession(dialogSessionKey);
    if (currentConversationId === dialogSessionKey) {
      setCurrentConversationId(null);
    }
    setActiveDialog(null);
    setDialogSessionKey(null);
  };

  const confirmBatchDelete = () => {
    if (selectedKeys.length === 0) return;
    selectedKeys.forEach((key) => deleteSession(key));
    clearSelection();
    if (selectedKeys.includes(currentConversationId ?? "")) {
      setCurrentConversationId(null);
    }
    setActiveDialog(null);
  };

  const closeDialog = () => {
    setActiveDialog(null);
    setDialogSessionKey(null);
    setRenameInput("");
  };

  const handleViewSession = (key: string) => {
    setDetailSessionKey(key);
  };

  const resolveTokens = (session?: typeof detailSession) => {
    if (!session) return "—";
    if (typeof session.totalTokens === "number") return session.totalTokens;
    const total = (session.inputTokens ?? 0) + (session.outputTokens ?? 0);
    return total > 0 ? total : "—";
  };

  // 取消正在进行的生成
  const handleCancelMessage = async (message: Message) => {
    if (!currentConversationId || !activeRunId || !wsClient) return;

    try {
      await wsClient.sendRequest("chat.abort", {
        sessionKey: currentConversationId,
        runId: activeRunId,
      });
      // 更新消息状态为已取消
      updateMessageById(currentConversationId, message.id, (msg) => ({
        ...msg,
        status: "cancelled",
      }));
      // 清除 activeRunId
      setActiveRunId(null);
    } catch (error) {
      addToast({
        title: "取消失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "error",
      });
    }
  };

  const handleRetryMessage = async (message: Message) => {
    if (!currentConversationId || !message.retryPayload) return;
    updateMessageById(currentConversationId, message.id, (msg) => ({
      ...msg,
      status: "sending",
    }));
    const result = await sendChatPayload({
      sessionKey: currentConversationId,
      message: message.retryPayload.message,
      attachments: message.retryPayload.attachments,
    });
    if (result.ok) {
      updateMessageById(currentConversationId, message.id, (msg) => ({
        ...msg,
        status: undefined,
        retryPayload: undefined,
      }));
      return;
    }
    addToast({
      title: "消息发送失败",
      description: result.error ?? "chat.send failed",
      variant: "error",
    });
    updateMessageById(currentConversationId, message.id, (msg) => ({
      ...msg,
      status: "failed",
    }));
  };

  const handleEditMessage = (message: Message) => {
    if (!message.retryPayload) return;
    setDraftMessage(message.retryPayload.message);
    setDraftAttachments(message.retryPayload.attachments ?? []);
    window.setTimeout(() => {
      const input = document.querySelector("textarea");
      if (input) {
        input.scrollIntoView({ behavior: "smooth", block: "center" });
        (input as HTMLTextAreaElement).focus();
      }
    }, 0);
  };

  const handleCopyMessage = (message: Message) => {
    if (!message.retryPayload?.message) return;
    void navigator.clipboard?.writeText(message.retryPayload.message);
    addToast({
      title: "已复制内容",
      description: "可以在输入框中粘贴后快速重发。",
    });
  };

  const handleCopyToDraft = (message: Message) => {
    if (!message.retryPayload?.message) return;
    setDraftMessage(message.retryPayload.message);
    setDraftAttachments(message.retryPayload.attachments ?? []);
    window.setTimeout(() => {
      const input = document.querySelector("textarea");
      if (input) {
        input.scrollIntoView({ behavior: "smooth", block: "center" });
        (input as HTMLTextAreaElement).focus();
      }
    }, 0);
  };

  const handleDeleteFailedMessage = (message: Message) => {
    if (!currentConversationId) return;
    if (message.status !== "failed") return;
    setConversationMessages((prev) => {
      const messages = prev[currentConversationId] ? [...prev[currentConversationId]!] : [];
      const next = messages.filter((msg) => msg.id !== message.id);
      return { ...prev, [currentConversationId]: next };
    });
  };

  // 开始编辑用户消息
  const handleStartEdit = (message: Message) => {
    if (message.role !== "user") return;
    setEditingMessageId(message.id);
  };

  // 确认编辑并发送
  const handleConfirmEdit = async (message: Message, newContent: string) => {
    if (!newContent.trim() || !currentConversationId) return;
    setEditingMessageId(null);
    // 删除原消息
    setConversationMessages((prev) => {
      const messages = prev[currentConversationId] ? [...prev[currentConversationId]!] : [];
      const next = messages.filter((msg) => msg.id !== message.id);
      return { ...prev, [currentConversationId]: next };
    });
    // 使用新内容发送
    await handleSendMessage(newContent);
  };

  // 取消编辑
  const handleCancelEdit = (message: Message) => {
    setEditingMessageId(null);
    setDraftMessage("");
  };

  // 复制消息内容
  const handleCopyContent = (content: string) => {
    navigator.clipboard.writeText(content);
    addToast({
      title: "复制成功",
      description: "内容已复制到剪贴板",
      variant: "success",
    });
  };

  // 获取当前对话的消息
  const currentMessages = currentConversationId
    ? conversationMessages[currentConversationId] || []
    : [];
  const currentHistoryError = currentConversationId
    ? historyErrors[currentConversationId]
    : undefined;

  const showWelcomePage =
    !currentConversationId ||
    (currentMessages.length === 0 && historyLoadingKey !== currentConversationId);

  // DEBUG

  return (
    <>
      <MainLayout
        userName={userName}
        sessions={getFilteredSessions()}
        isLoading={isSessionsLoading}
        unreadMap={getUnreadMap()}
        currentSessionKey={currentConversationId}
        conversationTitle={activeMainView === "chat" ? conversationTitle : undefined}
        onSelectSession={handleSelectConversation}
        onNewSession={handleNewConversation}
        onFilterChange={(kind) => setFilterKind(kind ?? "all")}
        unreadOnly={unreadOnly}
        onUnreadToggle={setUnreadOnly}
        sortMode={sortMode}
        onSortChange={(mode) => setSortMode(mode ?? "recent")}
        filterKind={filterKind}
        selectionMode={selectionMode}
        selectedKeys={selectedKeys}
        onToggleSelectionMode={toggleSelectionMode}
        onToggleSelectedKey={toggleSelectedKey}
        onSelectAllKeys={(keys) => selectAllKeys(keys)}
        onClearSelection={clearSelection}
        onBatchDelete={() => {
          if (selectedKeys.length === 0) return;
          setActiveDialog("batchDelete");
        }}
        onRenameSession={(key) => {
          if (currentConversationId !== key) {
            setCurrentConversationId(key);
          }
          const session = getSessionByKey(key);
          setRenameInput(session?.label || session?.derivedTitle || session?.displayName || "");
          setDialogSessionKey(key);
          setActiveDialog("rename");
        }}
        onOpenKnowledge={() => {
          setCurrentConversationId(null);
          setActiveMainView("knowledge");
        }}
        onOpenDiscover={() => {
          setCurrentConversationId(null);
          setActiveMainView("discover");
        }}
        onOpenChannel={() => {
          setCurrentConversationId(null);
          setActiveMainView("channel");
        }}
        onOpenPersonaSettings={() => {
          setCurrentConversationId(null);
          setActiveMainView("persona");
          setPersonaSettingsOpen(true);
        }}
        onOpenCronJobs={() => setCronJobsOpen(true)}
        onOpenAgentManage={() => setAgentManageOpen(true)}
        onOpenTaskSearch={() => setTaskSearchOpen(true)}
        onGoHome={() => setActiveMainView("chat")}
        assistantVisible={
          activeMainView !== "persona" && activeMainView !== "discover" && assistantVisible
        }
        onToggleAssistantVisible={() => setAssistantVisible(!assistantVisible)}
        showTopBar={activeMainView !== "persona" && activeMainView !== "my"}
        showSidebar={activeMainView !== "persona" && activeMainView !== "my"}
        activeView={activeMainView}
        searchShortcutLabel={shortcutLabels.search}
        newSessionShortcutLabel={shortcutLabels.newSession}
        onDeleteSession={(key) => {
          setDialogSessionKey(key);
          setActiveDialog("delete");
        }}
        onViewSession={handleViewSession}
        onShare={handleShare}
        onExport={handleExport}
        onDelete={handleDelete}
        onRename={handleRename}
      >
        <div className="h-full flex flex-col relative">
          {/* 移动端：会话列表按钮 - 左上角 */}
          {isMobile && activeMainView === "chat" && (
            <button
              onClick={() => setSessionDrawerOpen(true)}
              className="fixed left-2 top-2 z-50 flex items-center gap-2 px-3 py-2 hover:bg-surface-hover rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5 text-text-primary" />
              <span className="text-sm font-medium text-text-primary">会话</span>
            </button>
          )}

          {/* 主内容区域 */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {activeMainView === "persona" ? (
              <div className="flex-1 overflow-hidden">
                {/* VRM 全屏显示 */}
                <VirtualAssistantPage onClose={() => setActiveMainView("chat")} />
              </div>
            ) : activeMainView === "knowledge" ? (
              <div className="flex-1 overflow-hidden bg-background-tertiary">
                <KnowledgeBasePage />
              </div>
            ) : activeMainView === "discover" ? (
              <div className="flex-1 overflow-hidden bg-background-tertiary">
                <DiscoverPage
                  wsClient={wsClient ?? undefined}
                  onError={(message) =>
                    addToast({
                      title: "请求失败",
                      description: message,
                      variant: "error",
                    })
                  }
                />
              </div>
            ) : activeMainView === "channel" ? (
              <div className="flex-1 overflow-hidden bg-background-tertiary">
                <ChannelCenterPage />
              </div>
            ) : activeMainView === "my" ? (
              <div className="flex-1 overflow-hidden">
                <MyPage userName={userName} onClose={() => setActiveMainView("chat")} />
              </div>
            ) : !showWelcomePage ? (
              // 对话内容区域
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* 消息列表 */}
                <MessageList
                  messages={currentMessages}
                  sessionKey={currentConversationId}
                  autoApproveAlways={autoApproveAlways}
                  isLoading={historyLoadingKey === currentConversationId}
                  autoScrollToBottom={!(historyLoadingKey === currentConversationId)}
                  emptyState={{
                    title: currentHistoryError ? "历史记录加载失败" : "暂无消息",
                    description: currentHistoryError
                      ? "请检查网关连接后重试"
                      : "发送第一条消息开始对话",
                    actionLabel: currentHistoryError ? "重试" : undefined,
                    onAction:
                      currentHistoryError && currentConversationId
                        ? () => {
                            void fetchHistory(currentConversationId, true);
                          }
                        : undefined,
                  }}
                  onRetryMessage={handleRetryMessage}
                  onEditMessage={handleEditMessage}
                  onCopyMessage={handleCopyToDraft}
                  onDeleteMessage={handleDeleteFailedMessage}
                  onCancelMessage={handleCancelMessage}
                  onStartEdit={handleStartEdit}
                  onConfirmEdit={handleConfirmEdit}
                  onCancelEdit={handleCancelEdit}
                  onCopy={handleCopyContent}
                  editingMessageId={editingMessageId}
                />

                {/* 输入框 - 底部 */}
                <div className="flex-shrink-0">
                  {/* 触发按钮横条 - 在有文件时显示 */}
                  <ComputerPanelWrapper
                    files={generatedFiles}
                    isOpen={workspaceOpen}
                    onToggle={() => setWorkspaceOpen((prev) => !prev)}
                    compact={true}
                  />

                  <EnhancedChatInput
                    onSend={handleSendMessage}
                    autoApproveAlways={autoApproveAlways}
                    onAutoApproveAlwaysChange={setAutoApproveAlways}
                    placeholder="输入消息... (支持 @ 提及和 / 命令)"
                    compact={true}
                    draftValue={draftMessage}
                    onDraftChange={setDraftMessage}
                    draftAttachments={draftAttachments}
                    onDraftAttachmentsChange={setDraftAttachments}
                    onWorkspaceClick={() => setWorkspaceOpen((prev) => !prev)}
                    hasGeneratedFiles={generatedFiles.length > 0}
                    workspaceOpen={workspaceOpen}
                    connectors={availableConnectors}
                    activeConnectorIds={activeConnectorIds}
                    onToggleConnector={handleToggleConnector}
                    sessionKey={currentConversationId}
                    pendingUploadSessionKey={pendingUploadSessionKey}
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 px-2xl overflow-hidden">
                <div className="mx-auto h-full w-full max-w-[1080px] flex flex-col">
                  <div className="flex-1 min-h-0 flex items-center justify-center py-lg">
                    <div className="mx-auto w-full max-w-[980px] max-h-full overflow-y-auto scrollbar-default pr-1">
                      <div className="text-center">
                        <div className="mx-auto mb-sm flex h-14 w-14 items-center justify-center rounded-2xl border border-border-light bg-white/90 shadow-sm">
                          <img
                            src="/img/logo.png"
                            alt="Hovi"
                            className="w-9 h-9 object-contain"
                            style={{ backgroundColor: "transparent" }}
                          />
                        </div>
                        <h1 className="text-4xl font-bold tracking-tight text-text-primary">
                          Hovi
                        </h1>
                        <p className="text-sm text-text-tertiary">
                          描述你的目标，Hovi 会一步步帮你完成。
                        </p>
                      </div>
                      <div className="mt-lg mb-md text-center">
                        <p className="text-sm font-medium text-text-secondary">快捷开始</p>
                      </div>
                      <div className="mx-auto grid w-full max-w-[860px] grid-cols-1 md:grid-cols-2 gap-md">
                        {HOME_PRIMARY_CARDS.map((card) => (
                          <button
                            key={card.title}
                            type="button"
                            onClick={() => handleSelectAssistant(card.prompt)}
                            className="group text-left rounded-2xl border border-border-light bg-gradient-to-br from-white to-surface-tertiary/50 p-lg shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md"
                          >
                            <div className="flex items-start gap-sm">
                              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mt-0.5 transition-colors group-hover:bg-primary/15">
                                <card.icon className="h-[18px] w-[18px]" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-base font-semibold text-text-primary truncate">
                                  {card.title}
                                </div>
                                <p className="text-sm text-text-tertiary mt-1.5 line-clamp-2">
                                  {card.description}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                      <div className="mt-md flex justify-center pb-xs">
                        <Button
                          size="sm"
                          variant="outline"
                          className="px-md"
                          onClick={() => setHomeTemplatesOpen(true)}
                        >
                          更多模板
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    <ComputerPanelWrapper
                      files={generatedFiles}
                      isOpen={workspaceOpen}
                      onToggle={() => setWorkspaceOpen((prev) => !prev)}
                      compact={true}
                    />

                    <EnhancedChatInput
                      onSend={handleSendMessage}
                      autoApproveAlways={autoApproveAlways}
                      onAutoApproveAlwaysChange={setAutoApproveAlways}
                      placeholder="输入消息... (支持 @ 提及和 / 命令)"
                      compact={true}
                      draftValue={draftMessage}
                      onDraftChange={setDraftMessage}
                      draftAttachments={draftAttachments}
                      onDraftAttachmentsChange={setDraftAttachments}
                      onWorkspaceClick={() => setWorkspaceOpen((prev) => !prev)}
                      hasGeneratedFiles={generatedFiles.length > 0}
                      workspaceOpen={workspaceOpen}
                      connectors={availableConnectors}
                      activeConnectorIds={activeConnectorIds}
                      onToggleConnector={handleToggleConnector}
                      sessionKey={currentConversationId}
                      pendingUploadSessionKey={pendingUploadSessionKey}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <Dialog open={homeTemplatesOpen} onOpenChange={setHomeTemplatesOpen}>
          <DialogContent className="max-w-[980px] h-[78vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">更多模板</DialogTitle>
              <DialogDescription>选择一个模板即可自动填充到输入框并立即开始。</DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-default px-sm">
              <WelcomePage
                onSelectPrompt={(prompt) => {
                  handleSelectAssistant(prompt);
                  setHomeTemplatesOpen(false);
                }}
                compact={true}
                variant="cards"
              />
            </div>
          </DialogContent>
        </Dialog>
        {/* 会话详情对话框 */}
        <Dialog open={Boolean(detailSessionKey)} onOpenChange={() => setDetailSessionKey(null)}>
          <DialogContent className="max-w-[28rem]">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">会话详情</DialogTitle>
            </DialogHeader>
            {detailSession ? (
              <div className="space-y-sm text-sm text-text-secondary">
                <div className="flex items-center justify-between">
                  <span>标题</span>
                  <span className="text-text-primary">
                    {detailSession.label ||
                      detailSession.derivedTitle ||
                      detailSession.displayName ||
                      "未命名"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Session Key</span>
                  <span className="text-text-primary truncate max-w-[200px]">
                    {detailSession.key}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>最近活动</span>
                  <span className="text-text-primary">
                    {detailSession.updatedAt
                      ? new Date(detailSession.updatedAt).toLocaleString("zh-CN", {
                          hour12: false,
                        })
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Token 使用量</span>
                  <span className="text-text-primary">{resolveTokens(detailSession)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Channel</span>
                  <span className="text-text-primary">{detailSession.channel || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Model</span>
                  <span className="text-text-primary">
                    {detailSession.model || detailSession.modelProvider || "—"}
                  </span>
                </div>
                {detailSession.lastMessagePreview && (
                  <div className="rounded-md border border-border-light bg-background-secondary p-2 text-xs">
                    {detailSession.lastMessagePreview}
                  </div>
                )}
                {/* 文档列表 */}
                <div className="mt-4">
                  <div className="text-sm font-medium mb-2">上传的文档</div>
                  <SessionDocuments sessionKey={detailSession.key} />
                </div>
              </div>
            ) : (
              <div className="text-sm text-text-tertiary">未找到会话数据。</div>
            )}
            <DialogFooter className="gap-sm">
              {detailSession && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(detailSession.key);
                  }}
                >
                  复制 Session Key
                </Button>
              )}
              <Button size="sm" onClick={() => setDetailSessionKey(null)}>
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 重命名对话框 */}
        <Dialog open={activeDialog === "rename"} onOpenChange={closeDialog}>
          <DialogContent className="max-w-[28rem]">
            <DialogHeader>
              <DialogTitle>重命名对话</DialogTitle>
              <DialogDescription>请输入新的对话标题</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                placeholder="输入新的对话标题"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renameInput.trim()) {
                    confirmRename();
                  }
                }}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>
                取消
              </Button>
              <Button onClick={confirmRename} disabled={!renameInput.trim()}>
                确认
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 删除确认对话框 */}
        <Dialog open={activeDialog === "delete"} onOpenChange={closeDialog}>
          <DialogContent className="max-w-[28rem]">
            <DialogHeader>
              <DialogTitle>删除对话</DialogTitle>
              <DialogDescription>确定要删除此对话吗?删除后将无法恢复。</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>
                取消
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 批量删除确认对话框 */}
        <Dialog open={activeDialog === "batchDelete"} onOpenChange={closeDialog}>
          <DialogContent className="max-w-[28rem]">
            <DialogHeader>
              <DialogTitle>批量删除</DialogTitle>
              <DialogDescription>
                确定要删除 {selectedKeys.length} 个会话吗?删除后将无法恢复。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>
                取消
              </Button>
              <Button variant="destructive" onClick={confirmBatchDelete}>
                删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </MainLayout>

      {/* 移动端会话列表抽屉 */}
      {isMobile && (
        <MobileSessionDrawer
          sessions={getFilteredSessions()}
          currentSessionKey={currentConversationId}
          unreadMap={getUnreadMap()}
          onSelectSession={handleSelectConversation}
          onNewSession={handleNewConversation}
          onDeleteSession={deleteSession}
          onOpenTaskSearch={() => setTaskSearchOpen(true)}
          open={sessionDrawerOpen}
          onOpenChange={setSessionDrawerOpen}
        />
      )}

      <TaskSearchDialog
        open={taskSearchOpen}
        sessions={sessions}
        currentSessionKey={currentConversationId}
        onSelectSession={handleSelectConversation}
        onOpenChange={setTaskSearchOpen}
        mobile={isMobile}
      />

      {/* Session 文档预览面板 */}
      {currentConversationId && <SessionPreviewPanelWrapper sessionKey={currentConversationId} />}

      {/* 全局设置对话框 */}
      <SettingsDialog />

      {/* 虚拟角色设置面板 */}
      <SettingsPanel open={personaSettingsOpen} onOpenChange={setPersonaSettingsOpen} />

      {/* 定时任务对话框 */}
      <CronJobsDialog open={cronJobsOpen} onOpenChange={setCronJobsOpen} />

      {/* Agent管理对话框 */}
      <AgentManageDialog open={agentManageOpen} onOpenChange={setAgentManageOpen} />
    </>
  );
}

// 主组件，包裹StreamingReplayProvider
export default function Home() {
  return (
    <StreamingReplayProvider>
      <DesktopBootstrap>
        <HomeContent />
      </DesktopBootstrap>
    </StreamingReplayProvider>
  );
}
