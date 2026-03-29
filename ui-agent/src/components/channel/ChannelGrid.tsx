"use client";

import { useEffect, useMemo, useState } from "react";
import { ChannelCard } from "@/components/channel/ChannelCard";
import { ChannelLogo } from "@/components/channel/ChannelLogo";
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
import type { ChannelCardVM } from "@/services/channelApi";
import type { ChannelCreateInput } from "@/stores/channelCenterStore";

type FilterKind = "all" | "configured" | "unconfigured" | "alerts";
type CreateStep = "channel" | "config";

interface ChannelGridProps {
  cards: ChannelCardVM[];
  isLoading: boolean;
  isCreatingChannel: boolean;
  createError: string | null;
  createMessage: string | null;
  onOpenMonitor: (channelId: string) => void;
  onOpenConfig: (channelId: string) => void;
  onOpenLogs: (channelId: string) => void;
  onCreateChannel: (input: ChannelCreateInput) => Promise<void>;
}

type ChannelCreateCatalogItem = {
  channelId: string;
  label: string;
  detailLabel?: string;
  configured: boolean;
};

type ChannelFormFieldType = "text" | "password" | "number" | "textarea" | "select" | "list";

type ChannelFormField = {
  key: string;
  label: string;
  type: ChannelFormFieldType;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  options?: Array<{ value: string; label: string }>;
  helpText?: string;
};

const OFFICIAL_CHANNEL_CATALOG: ChannelCreateCatalogItem[] = [
  { channelId: "bluebubbles", label: "BlueBubbles", detailLabel: "BlueBubbles", configured: false },
  { channelId: "discord", label: "Discord", detailLabel: "Discord Bot", configured: false },
  { channelId: "feishu", label: "Feishu", detailLabel: "Feishu Bot", configured: false },
  { channelId: "googlechat", label: "Google Chat", detailLabel: "Google Chat", configured: false },
  { channelId: "imessage", label: "iMessage", detailLabel: "iMessage", configured: false },
  { channelId: "irc", label: "IRC", detailLabel: "IRC", configured: false },
  { channelId: "line", label: "LINE", detailLabel: "LINE Bot", configured: false },
  { channelId: "matrix", label: "Matrix", detailLabel: "Matrix", configured: false },
  { channelId: "mattermost", label: "Mattermost", detailLabel: "Mattermost", configured: false },
  { channelId: "msteams", label: "Microsoft Teams", detailLabel: "Teams Bot", configured: false },
  {
    channelId: "nextcloud-talk",
    label: "Nextcloud Talk",
    detailLabel: "Nextcloud Talk",
    configured: false,
  },
  { channelId: "nostr", label: "Nostr", detailLabel: "Nostr", configured: false },
  { channelId: "signal", label: "Signal", detailLabel: "Signal REST", configured: false },
  { channelId: "slack", label: "Slack", detailLabel: "Slack Bot", configured: false },
  {
    channelId: "synology-chat",
    label: "Synology Chat",
    detailLabel: "Synology Chat",
    configured: false,
  },
  { channelId: "telegram", label: "Telegram", detailLabel: "Telegram Bot", configured: false },
  { channelId: "tlon", label: "Tlon", detailLabel: "Tlon", configured: false },
  { channelId: "twitch", label: "Twitch", detailLabel: "Twitch Chat", configured: false },
  { channelId: "whatsapp", label: "WhatsApp", detailLabel: "WhatsApp Web", configured: false },
  { channelId: "zalo", label: "Zalo", detailLabel: "Zalo", configured: false },
  { channelId: "zalouser", label: "Zalo User", detailLabel: "Zalo Personal", configured: false },
];

const CHANNEL_DESCRIPTION_MAP: Record<string, string> = {
  telegram: "通过 Bot API 接收和发送 Telegram 消息，适合自动化客服与通知。",
  whatsapp: "通过 WhatsApp Web 接入个人或企业消息场景，适合高频沟通。",
  discord: "连接 Discord 服务器与频道，适合社区运营和机器人流程。",
  slack: "通过 Slack Bot + Socket Mode 接入团队协作消息与提醒。",
  signal: "通过 Signal CLI / REST 接入加密消息通道，强调隐私通信。",
  imessage: "接入苹果 iMessage 生态，覆盖 macOS / iOS 对话消息处理。",
  line: "接入 LINE Messaging API，适合日本与东亚地区用户触达。",
  irc: "连接传统 IRC 频道与私聊，适合开源社区与运维场景。",
  googlechat: "接入 Google Chat 空间消息，适配 Google Workspace 协作流。",
  matrix: "接入 Matrix 房间消息，适合自托管与跨组织聊天网络。",
  msteams: "接入 Microsoft Teams 消息与机器人，面向企业办公场景。",
  zalo: "接入 Zalo 官方账号消息，适合越南本地化业务沟通。",
  zalouser: "接入 Zalo 个人账号消息，支持更灵活的个人触达场景。",
  bluebubbles: "通过 BlueBubbles 转发苹果消息，适合跨端转接与自动回复。",
  twitch: "接入 Twitch 聊天频道，适合直播互动与运营自动化。",
  mattermost: "接入 Mattermost 团队消息，适用于私有化协作环境。",
  feishu: "接入飞书机器人消息，服务企业内部协作与审批提醒。",
  "nextcloud-talk": "接入 Nextcloud Talk，适用于私有化办公与协作沟通。",
  "synology-chat": "接入 Synology Chat Webhook，服务 NAS 私有协作场景。",
  synologychat: "接入 Synology Chat Webhook，服务 NAS 私有协作场景。",
  synology: "接入 Synology Chat Webhook，服务 NAS 私有协作场景。",
  nostr: "接入 Nostr 去中心化消息网络，适合开放协议探索场景。",
  tlon: "接入 Tlon 消息通道，支持团队内部自动化对话流程。",
};

const DM_POLICY_OPTIONS = [
  { value: "pairing", label: "pairing" },
  { value: "allowlist", label: "allowlist" },
  { value: "open", label: "open" },
  { value: "disabled", label: "disabled" },
];

const GROUP_POLICY_OPTIONS = [
  { value: "allowlist", label: "allowlist" },
  { value: "open", label: "open" },
  { value: "disabled", label: "disabled" },
];

const CHANNEL_FORM_SCHEMAS: Record<string, ChannelFormField[]> = {
  telegram: [
    {
      key: "botToken",
      label: "Bot Token",
      type: "password",
      required: true,
      helpText: "Telegram 机器人令牌，由 BotFather 生成。",
    },
    {
      key: "dmPolicy",
      label: "DM Policy",
      type: "select",
      defaultValue: "pairing",
      options: DM_POLICY_OPTIONS,
      helpText: "私聊触发策略：配对/白名单/开放/禁用。",
    },
  ],
  discord: [
    {
      key: "token",
      label: "Bot Token",
      type: "password",
      required: true,
      helpText: "Discord Bot Token（Developer Portal）。",
    },
    {
      key: "groupPolicy",
      label: "Group Policy",
      type: "select",
      defaultValue: "allowlist",
      options: GROUP_POLICY_OPTIONS,
      helpText: "群组/频道触发策略：白名单/开放/禁用。",
    },
  ],
  slack: [
    {
      key: "botToken",
      label: "Bot Token",
      type: "password",
      required: true,
      helpText: "xoxb 开头的 Slack Bot Token。",
    },
    {
      key: "appToken",
      label: "App Token",
      type: "password",
      required: true,
      helpText: "xapp 开头的 App Token（Socket Mode）。",
    },
  ],
  bluebubbles: [
    {
      key: "serverUrl",
      label: "Server URL",
      type: "text",
      required: true,
      placeholder: "https://host:1234",
      helpText: "BlueBubbles 服务地址（含协议与端口）。",
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      required: true,
      helpText: "BlueBubbles API 密码。",
    },
  ],
  feishu: [
    {
      key: "appId",
      label: "App ID",
      type: "text",
      required: true,
      helpText: "飞书应用的 App ID。",
    },
    {
      key: "appSecret",
      label: "App Secret",
      type: "password",
      required: true,
      helpText: "飞书应用密钥，用于接口鉴权。",
    },
    {
      key: "verificationToken",
      label: "Verification Token",
      type: "text",
      helpText: "事件订阅校验 Token（可选）。",
    },
  ],
  googlechat: [
    {
      key: "serviceAccountFile",
      label: "Service Account File",
      type: "text",
      placeholder: "/path/to/service-account.json",
      helpText: "Google 服务账号 JSON 文件路径。",
    },
    {
      key: "audienceType",
      label: "Audience Type",
      type: "select",
      defaultValue: "app-url",
      options: [
        { value: "app-url", label: "app-url" },
        { value: "project-number", label: "project-number" },
      ],
      helpText: "Audience 类型：应用 URL 或项目编号。",
    },
    {
      key: "audience",
      label: "Audience",
      type: "text",
      helpText: "与 Audience Type 对应的具体值。",
    },
  ],
  imessage: [
    {
      key: "service",
      label: "Service",
      type: "select",
      defaultValue: "auto",
      options: [
        { value: "auto", label: "auto" },
        { value: "imessage", label: "imessage" },
        { value: "sms", label: "sms" },
      ],
      helpText: "发送通道：自动选择 / iMessage / SMS。",
    },
    {
      key: "groupPolicy",
      label: "Group Policy",
      type: "select",
      defaultValue: "allowlist",
      options: GROUP_POLICY_OPTIONS,
      helpText: "群聊触发策略：白名单/开放/禁用。",
    },
  ],
  irc: [
    {
      key: "host",
      label: "Host",
      type: "text",
      required: true,
      placeholder: "irc.libera.chat",
      helpText: "IRC 服务器地址。",
    },
    {
      key: "port",
      label: "Port",
      type: "number",
      defaultValue: "6697",
      helpText: "IRC 端口，常见 TLS 为 6697。",
    },
    {
      key: "nick",
      label: "Nick",
      type: "text",
      required: true,
      placeholder: "openclaw-bot",
      helpText: "机器人昵称。",
    },
    {
      key: "channels",
      label: "Channels",
      type: "list",
      placeholder: "#general,#bot",
      helpText: "要加入的频道列表（逗号或换行分隔）。",
    },
  ],
  line: [
    {
      key: "channelAccessToken",
      label: "Channel Access Token",
      type: "password",
      required: true,
      helpText: "LINE Messaging API 的长期访问令牌。",
    },
    {
      key: "channelSecret",
      label: "Channel Secret",
      type: "password",
      required: true,
      helpText: "LINE Channel Secret。",
    },
  ],
  matrix: [
    {
      key: "homeserver",
      label: "Homeserver",
      type: "text",
      required: true,
      placeholder: "https://matrix.org",
      helpText: "Matrix Homeserver 地址。",
    },
    {
      key: "userId",
      label: "User ID",
      type: "text",
      required: true,
      placeholder: "@bot:matrix.org",
      helpText: "Matrix 用户 ID。",
    },
    {
      key: "accessToken",
      label: "Access Token",
      type: "password",
      required: true,
      helpText: "Matrix 访问令牌。",
    },
  ],
  mattermost: [
    {
      key: "url",
      label: "Server URL",
      type: "text",
      required: true,
      placeholder: "https://mattermost.example.com",
      helpText: "Mattermost 服务地址。",
    },
    {
      key: "token",
      label: "Token",
      type: "password",
      required: true,
      helpText: "Mattermost Bot/User Token。",
    },
    {
      key: "team",
      label: "Team",
      type: "text",
      helpText: "默认团队名称（可选）。",
    },
  ],
  msteams: [
    {
      key: "webhookUrl",
      label: "Webhook URL",
      type: "text",
      helpText: "Teams 入站 Webhook 地址（若采用 webhook 模式）。",
    },
    {
      key: "appId",
      label: "App ID",
      type: "text",
      helpText: "Azure 应用 ID（Bot 模式）。",
    },
    {
      key: "appSecret",
      label: "App Secret",
      type: "password",
      helpText: "Azure 应用密钥。",
    },
    {
      key: "tenantId",
      label: "Tenant ID",
      type: "text",
      helpText: "Microsoft 365 租户 ID。",
    },
  ],
  "nextcloud-talk": [
    {
      key: "webhookUrl",
      label: "Webhook URL",
      type: "text",
      required: true,
      helpText: "Nextcloud Talk 机器人 Webhook 地址。",
    },
    {
      key: "token",
      label: "Token",
      type: "password",
      required: true,
      helpText: "Nextcloud Talk 鉴权 Token。",
    },
  ],
  nostr: [
    {
      key: "privateKey",
      label: "Private Key / nsec",
      type: "password",
      required: true,
      helpText: "Nostr 私钥（hex 或 nsec）。",
    },
    {
      key: "relayUrls",
      label: "Relay URLs",
      type: "list",
      placeholder: "wss://relay1,wss://relay2",
      helpText: "Relay 地址列表（逗号或换行分隔）。",
    },
  ],
  signal: [
    {
      key: "account",
      label: "Signal Number",
      type: "text",
      placeholder: "+15550001111",
      helpText: "Signal 账号手机号（E.164）。",
    },
    {
      key: "service",
      label: "Service",
      type: "text",
      defaultValue: "signal-cli",
      helpText: "Signal 服务实现，默认 signal-cli。",
    },
    {
      key: "groupPolicy",
      label: "Group Policy",
      type: "select",
      defaultValue: "allowlist",
      options: GROUP_POLICY_OPTIONS,
      helpText: "群聊触发策略：白名单/开放/禁用。",
    },
  ],
  "synology-chat": [
    {
      key: "webhookUrl",
      label: "Webhook URL",
      type: "text",
      required: true,
      helpText: "Synology Chat 机器人 Webhook 地址。",
    },
    {
      key: "token",
      label: "Token",
      type: "password",
      helpText: "Synology Chat 鉴权 Token（若启用）。",
    },
  ],
  tlon: [
    {
      key: "url",
      label: "Gateway URL",
      type: "text",
      required: true,
      helpText: "Tlon 网关地址。",
    },
    {
      key: "code",
      label: "Auth Code",
      type: "password",
      required: true,
      helpText: "Tlon 授权码。",
    },
  ],
  twitch: [
    {
      key: "channel",
      label: "Channel",
      type: "text",
      required: true,
      helpText: "Twitch 频道名（不含 #）。",
    },
    {
      key: "token",
      label: "OAuth Token",
      type: "password",
      required: true,
      helpText: "Twitch OAuth 访问令牌。",
    },
  ],
  whatsapp: [
    {
      key: "authDir",
      label: "Auth Dir",
      type: "text",
      placeholder: "~/.openclaw/sessions/whatsapp",
      helpText: "WhatsApp 会话目录（可选）。",
    },
    {
      key: "sessionName",
      label: "Session Name",
      type: "text",
      defaultValue: "default",
      helpText: "会话名称（默认 default）。",
    },
    {
      key: "groupPolicy",
      label: "Group Policy",
      type: "select",
      defaultValue: "allowlist",
      options: GROUP_POLICY_OPTIONS,
      helpText: "群聊触发策略：白名单/开放/禁用。",
    },
  ],
  zalo: [
    {
      key: "token",
      label: "Token",
      type: "password",
      required: true,
      helpText: "Zalo 官方账号 Token。",
    },
    {
      key: "dmPolicy",
      label: "DM Policy",
      type: "select",
      defaultValue: "pairing",
      options: DM_POLICY_OPTIONS,
      helpText: "私聊触发策略：配对/白名单/开放/禁用。",
    },
    {
      key: "groupPolicy",
      label: "Group Policy",
      type: "select",
      defaultValue: "allowlist",
      options: GROUP_POLICY_OPTIONS,
      helpText: "群聊触发策略：白名单/开放/禁用。",
    },
  ],
  zalouser: [
    {
      key: "profile",
      label: "Profile",
      type: "text",
      required: true,
      helpText: "Zalo 个人账号配置档名。",
    },
    {
      key: "dmPolicy",
      label: "DM Policy",
      type: "select",
      defaultValue: "pairing",
      options: DM_POLICY_OPTIONS,
      helpText: "私聊触发策略：配对/白名单/开放/禁用。",
    },
    {
      key: "groupPolicy",
      label: "Group Policy",
      type: "select",
      defaultValue: "allowlist",
      options: GROUP_POLICY_OPTIONS,
      helpText: "群聊触发策略：白名单/开放/禁用。",
    },
  ],
};

function buildInitialFormValues(channelId: string): Record<string, string> {
  const fields = CHANNEL_FORM_SCHEMAS[channelId] ?? [];
  const values: Record<string, string> = {};
  for (const field of fields) {
    values[field.key] = field.defaultValue ?? "";
  }
  return values;
}

function getChannelDescription(option: ChannelCreateCatalogItem): string {
  return (
    CHANNEL_DESCRIPTION_MAP[option.channelId] ??
    `接入 ${option.detailLabel ?? option.label}，用于消息收发、监控与自动化处理。`
  );
}

export function ChannelGrid({
  cards,
  isLoading,
  isCreatingChannel,
  createError,
  createMessage,
  onOpenMonitor,
  onOpenConfig,
  onOpenLogs,
  onCreateChannel,
}: ChannelGridProps) {
  const filterOptions: Array<{ value: FilterKind; label: string }> = [
    { value: "all", label: "全部" },
    { value: "configured", label: "已配置" },
    { value: "unconfigured", label: "未配置" },
    { value: "alerts", label: "告警中" },
  ];

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>("channel");
  const [createChannelId, setCreateChannelId] = useState("telegram");
  const [enabled, setEnabled] = useState(true);
  const [formValues, setFormValues] = useState<Record<string, string>>(
    buildInitialFormValues("telegram"),
  );
  const [localCreateError, setLocalCreateError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return cards.filter((card) => {
      if (normalized && !card.label.toLowerCase().includes(normalized)) {
        return false;
      }
      if (filter === "configured") return card.configured;
      if (filter === "unconfigured") return !card.configured;
      if (filter === "alerts") return card.alertCount > 0;
      return true;
    });
  }, [cards, filter, query]);

  const createOptions = useMemo<ChannelCreateCatalogItem[]>(() => {
    const merged = new Map<string, ChannelCreateCatalogItem>(
      OFFICIAL_CHANNEL_CATALOG.map((item) => [item.channelId, item]),
    );
    for (const card of cards) {
      merged.set(card.channelId, {
        channelId: card.channelId,
        label: card.label,
        detailLabel: card.detailLabel,
        configured: card.configured,
      });
    }
    return Array.from(merged.values()).sort((left, right) => {
      if (left.configured !== right.configured) {
        return left.configured ? 1 : -1;
      }
      return left.label.localeCompare(right.label, "en");
    });
  }, [cards]);

  useEffect(() => {
    if (createOptions.length === 0) {
      return;
    }
    if (!createOptions.some((item) => item.channelId === createChannelId)) {
      setCreateChannelId(createOptions[0]!.channelId);
    }
  }, [createChannelId, createOptions]);

  useEffect(() => {
    if (createStep !== "config") {
      return;
    }
    setFormValues(buildInitialFormValues(createChannelId));
  }, [createChannelId, createStep]);

  const isSelectedConfigured = createOptions.some(
    (item) => item.channelId === createChannelId && item.configured,
  );
  const selectedFormFields = CHANNEL_FORM_SCHEMAS[createChannelId] ?? [];

  const resetWizard = () => {
    setCreateStep("channel");
    const nextChannelId =
      createOptions.find((item) => !item.configured)?.channelId ??
      createOptions[0]?.channelId ??
      "telegram";
    setCreateChannelId(nextChannelId);
    setEnabled(true);
    setFormValues(buildInitialFormValues(nextChannelId));
    setLocalCreateError(null);
  };

  const openWizard = () => {
    setCreateOpen(true);
    setFormValues(buildInitialFormValues(createChannelId));
    setLocalCreateError(null);
  };

  const handleOpenChange = (next: boolean) => {
    setCreateOpen(next);
    if (!next) {
      resetWizard();
    }
  };

  const buildCreatePayload = (): ChannelCreateInput => {
    const fields = CHANNEL_FORM_SCHEMAS[createChannelId] ?? [];
    const section: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = (formValues[field.key] ?? "").trim();
      if (field.required && !raw) {
        throw new Error(`请填写 ${field.label}`);
      }
      if (!raw) {
        continue;
      }
      if (field.type === "number") {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
          throw new Error(`${field.label} 必须是数字`);
        }
        section[field.key] = parsed;
        continue;
      }
      if (field.type === "list") {
        section[field.key] = raw
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean);
        continue;
      }
      section[field.key] = raw;
    }
    return {
      channelId: createChannelId,
      enabled,
      section,
    };
  };

  const handleCreateChannel = async () => {
    try {
      const payload = buildCreatePayload();
      setLocalCreateError(null);
      await onCreateChannel(payload);
      setCreateOpen(false);
      resetWizard();
    } catch (error) {
      setLocalCreateError(error instanceof Error ? error.message : "新增频道失败");
    }
  };

  const visibleCreateError = localCreateError ?? createError;

  return (
    <div className="flex h-full min-h-0 flex-col space-y-md p-2xl">
      <div className="flex items-center justify-between gap-md">
        <h2 className="text-lg font-semibold text-text-primary">频道</h2>
        <Button type="button" size="sm" className="h-8 text-xs" onClick={openWizard}>
          新增频道
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-sm">
        {filterOptions.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={filter === option.value ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {createMessage ? (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 px-sm py-xs text-xs text-green-600">
          {createMessage}
        </div>
      ) : null}

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索频道"
      />

      <div className="min-h-0 flex-1 overflow-auto scrollbar-default">
        {isLoading ? (
          <div className="py-xl text-center text-sm text-text-tertiary">频道加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="py-xl text-center text-sm text-text-tertiary">
            <div>暂无可展示频道</div>
            {cards.length === 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-sm h-8 text-xs"
                onClick={openWizard}
              >
                立即新增频道
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-md lg:grid-cols-2 2xl:grid-cols-3">
            {filtered.map((card) => (
              <ChannelCard
                key={card.channelId}
                card={card}
                onOpenMonitor={onOpenMonitor}
                onOpenConfig={onOpenConfig}
                onOpenLogs={onOpenLogs}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[86vh] w-[92vw] max-w-[68rem] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>新增频道向导</DialogTitle>
            <DialogDescription>根据现有配置模板，逐步创建并接入新的频道。</DialogDescription>
          </DialogHeader>
          {visibleCreateError ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-sm py-xs text-xs text-red-500">
              {visibleCreateError}
            </div>
          ) : null}

          {createStep === "channel" ? (
            <div className="min-h-0 space-y-sm">
              <div className="text-xs text-text-secondary">第 1 步：选择频道类型</div>
              <div className="text-xs text-text-tertiary">
                选择未配置频道可进入创建向导；已配置频道可直接进入配置页管理。
              </div>
              <div className="grid max-h-[56vh] grid-cols-1 gap-sm overflow-auto pr-1 md:grid-cols-2">
                {createOptions.map((item) => {
                  const selected = createChannelId === item.channelId;
                  const channelDescription = getChannelDescription(item);
                  return (
                    <Button
                      key={item.channelId}
                      type="button"
                      variant="ghost"
                      className={`h-auto w-full justify-start rounded-lg border p-sm text-left transition ${
                        selected
                          ? "border-primary bg-primary/10"
                          : "border-border-light hover:bg-background"
                      }`}
                      onClick={() => setCreateChannelId(item.channelId)}
                    >
                      <div className="mb-1 flex items-start justify-between gap-sm">
                        <div className="flex items-center gap-2">
                          <ChannelLogo
                            channelId={item.channelId}
                            label={item.label}
                            selected={selected}
                          />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-text-primary">
                              {item.label}
                            </div>
                            <div className="truncate text-xs text-text-tertiary">
                              {item.detailLabel ?? item.channelId}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] ${
                            item.configured
                              ? "bg-yellow-500/10 text-yellow-600"
                              : "bg-green-500/10 text-green-600"
                          }`}
                        >
                          {item.configured ? "已配置" : "未配置"}
                        </span>
                      </div>
                      <div className="line-clamp-2 text-xs leading-5 text-text-secondary">
                        {channelDescription}
                      </div>
                    </Button>
                  );
                })}
              </div>
              <div className="flex justify-end gap-sm">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => handleOpenChange(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    if (isSelectedConfigured) {
                      setCreateOpen(false);
                      onOpenConfig(createChannelId);
                      return;
                    }
                    setCreateStep("config");
                  }}
                >
                  {isSelectedConfigured ? "进入配置" : "下一步"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-sm">
              <div className="text-xs text-text-secondary">第 2 步：填写频道配置</div>
              <div className="flex items-center gap-2">
                <Switch
                  id="channel-create-enabled"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
                <Label
                  htmlFor="channel-create-enabled"
                  className="text-xs font-normal text-text-secondary"
                >
                  启用频道
                </Label>
              </div>

              {selectedFormFields.length > 0 ? (
                <div className="grid grid-cols-1 gap-sm md:grid-cols-2">
                  {selectedFormFields.map((field) => {
                    const fieldId = `channel-create-${createChannelId}-${field.key}`;
                    return (
                      <div
                        key={field.key}
                        className={
                          field.type === "textarea" || field.type === "list"
                            ? "md:col-span-2"
                            : undefined
                        }
                      >
                        <Label htmlFor={fieldId} className="mb-1 text-xs text-text-secondary">
                          <span>{field.label}</span>
                          {field.required ? <span className="text-red-500">*</span> : null}
                        </Label>
                        {field.type === "select" ? (
                          <Select
                            value={formValues[field.key] ?? ""}
                            onValueChange={(value) =>
                              setFormValues((current) => ({
                                ...current,
                                [field.key]: value,
                              }))
                            }
                          >
                            <SelectTrigger id={fieldId} className="h-8 w-full text-xs">
                              <SelectValue placeholder={field.placeholder ?? "请选择"} />
                            </SelectTrigger>
                            <SelectContent>
                              {(field.options ?? []).map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : field.type === "textarea" || field.type === "list" ? (
                          <Textarea
                            id={fieldId}
                            aria-label={field.label}
                            className="min-h-[6rem] text-xs"
                            placeholder={field.placeholder}
                            value={formValues[field.key] ?? ""}
                            onChange={(event) =>
                              setFormValues((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          <Input
                            id={fieldId}
                            aria-label={field.label}
                            type={
                              field.type === "password" || field.type === "number"
                                ? field.type
                                : "text"
                            }
                            placeholder={field.placeholder}
                            value={formValues[field.key] ?? ""}
                            onChange={(event) =>
                              setFormValues((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                          />
                        )}
                        {field.helpText ? (
                          <span className="mt-1 block text-[11px] text-text-tertiary">
                            {field.helpText}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-md border border-border-light bg-background p-sm text-xs text-text-secondary">
                  当前频道暂无预设字段，请先创建基础配置，后续在配置页补充。
                </div>
              )}

              <div className="flex justify-end gap-sm">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setCreateStep("channel")}
                  disabled={isCreatingChannel}
                >
                  上一步
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs disabled:opacity-60"
                  onClick={() => void handleCreateChannel()}
                  disabled={isCreatingChannel}
                >
                  {isCreatingChannel ? "创建中..." : "创建频道"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
