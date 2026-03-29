import { useConnectionStore } from "@/stores/connectionStore";

export type ChannelHealth = "healthy" | "warning" | "offline";
export type ChannelMonitorWindow = "5m" | "1h" | "24h";

export type ChannelAccountSnapshot = {
  accountId: string;
  name?: string;
  enabled?: boolean;
  configured?: boolean;
  connected?: boolean;
  running?: boolean;
  reconnectAttempts?: number;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  lastError?: string | null;
};

export type ChannelsStatusPayload = {
  ts: number;
  channelOrder: string[];
  channelLabels: Record<string, string>;
  channelDetailLabels?: Record<string, string>;
  channelSystemImages?: Record<string, string>;
  channelMeta?: Array<{
    id: string;
    label: string;
    detailLabel: string;
    systemImage?: string;
  }>;
  channels: Record<string, { configured?: boolean } & Record<string, unknown>>;
  channelAccounts: Record<string, ChannelAccountSnapshot[]>;
  channelDefaultAccountId: Record<string, string>;
};

export type ChannelCardVM = {
  channelId: string;
  label: string;
  detailLabel?: string;
  systemImage?: string;
  configured: boolean;
  health: ChannelHealth;
  accountTotal: number;
  accountConnected: number;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  alertCount: number;
};

export type ChannelAlertVM = {
  severity: "critical" | "warn" | "info";
  kind: "auth" | "config" | "permissions" | "runtime";
  message: string;
  accountId?: string;
};

export type ChannelLogEventVM = {
  ts: number;
  channelId: string;
  accountId: string;
  direction: "inbound" | "outbound" | "unknown";
  severity: "error" | "warn" | "info";
  message: string;
  raw: string;
};

export type ChannelMonitorSnapshotVM = {
  channelId: string;
  ts: number;
  accounts: ChannelAccountSnapshot[];
  alerts: ChannelAlertVM[];
  stream: ChannelLogEventVM[];
  stats: {
    window: ChannelMonitorWindow;
    inbound: number;
    outbound: number;
    total: number;
    successRate: number;
    errorRate: number;
  };
};

export type LogsTailPayload = {
  file: string;
  cursor: number;
  size: number;
  lines: string[];
  truncated: boolean;
  reset: boolean;
};

type ConfigGetResponse = {
  hash?: string;
  config?: Record<string, unknown>;
  parsed?: Record<string, unknown>;
  raw?: string;
};

const CHANNEL_NOT_CONNECTED = "未连接到网关";

function getWsClientOrThrow() {
  const wsClient = useConnectionStore.getState().wsClient;
  if (!wsClient || !wsClient.isConnected()) {
    throw new Error(CHANNEL_NOT_CONNECTED);
  }
  return wsClient;
}

export async function fetchChannelsStatus(params?: {
  probe?: boolean;
  timeoutMs?: number;
}): Promise<ChannelsStatusPayload> {
  const wsClient = getWsClientOrThrow();
  return wsClient.sendRequest<ChannelsStatusPayload>("channels.status", {
    probe: params?.probe ?? true,
    timeoutMs: params?.timeoutMs ?? 10000,
  });
}

export async function fetchLogsTail(params?: {
  cursor?: number;
  limit?: number;
  maxBytes?: number;
}): Promise<LogsTailPayload> {
  const wsClient = getWsClientOrThrow();
  return wsClient.sendRequest<LogsTailPayload>("logs.tail", {
    cursor: params?.cursor,
    limit: params?.limit ?? 300,
    maxBytes: params?.maxBytes ?? 250_000,
  });
}

export async function fetchChannelConfigSection(channelId: string): Promise<{
  hash: string;
  section: Record<string, unknown> | null;
}> {
  const wsClient = getWsClientOrThrow();
  const response = await wsClient.sendRequest<ConfigGetResponse>("config.get", {});
  const root =
    (response.config as Record<string, unknown> | undefined) ??
    (response.parsed as Record<string, unknown> | undefined) ??
    (response.raw ? (JSON.parse(response.raw) as Record<string, unknown>) : {});
  const channels = (root?.channels as Record<string, unknown> | undefined) ?? {};
  const sectionRaw = channels[channelId];
  const section =
    sectionRaw && typeof sectionRaw === "object" && !Array.isArray(sectionRaw)
      ? (sectionRaw as Record<string, unknown>)
      : null;
  return {
    hash: response.hash ?? "",
    section,
  };
}

export async function patchChannelConfigSection(
  channelId: string,
  section: Record<string, unknown>,
  baseHash: string,
): Promise<void> {
  const wsClient = getWsClientOrThrow();
  await wsClient.sendRequest("config.patch", {
    baseHash,
    raw: JSON.stringify({
      channels: {
        [channelId]: section,
      },
    }),
  });
}

function buildChannelIds(payload: ChannelsStatusPayload): string[] {
  const set = new Set<string>();
  payload.channelOrder.forEach((channelId) => set.add(channelId));
  Object.keys(payload.channels ?? {}).forEach((channelId) => set.add(channelId));
  Object.keys(payload.channelAccounts ?? {}).forEach((channelId) => set.add(channelId));
  return Array.from(set);
}

function resolveHealth(params: {
  configured: boolean;
  accountConnected: number;
  alertCount: number;
}): ChannelHealth {
  if (params.accountConnected > 0 && params.alertCount === 0) {
    return "healthy";
  }
  if (params.configured || params.accountConnected > 0) {
    return "warning";
  }
  return "offline";
}

function getMaxTimestamp(
  accounts: ChannelAccountSnapshot[],
  key: "lastInboundAt" | "lastOutboundAt",
): number | null {
  let result: number | null = null;
  for (const account of accounts) {
    const value = account[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      result = result == null ? value : Math.max(result, value);
    }
  }
  return result;
}

function countAlerts(accounts: ChannelAccountSnapshot[]): number {
  let count = 0;
  for (const account of accounts) {
    if (account.configured === false) {
      count += 1;
    }
    if (account.lastError) {
      count += 1;
    }
    if ((account.reconnectAttempts ?? 0) > 0) {
      count += 1;
    }
  }
  return count;
}

export function buildChannelCards(payload: ChannelsStatusPayload): ChannelCardVM[] {
  const orderIndex = new Map(payload.channelOrder.map((channelId, index) => [channelId, index]));
  const metaMap = new Map(payload.channelMeta?.map((entry) => [entry.id, entry]) ?? []);
  const cards = buildChannelIds(payload).map((channelId) => {
    const accounts = payload.channelAccounts[channelId] ?? [];
    const accountTotal = accounts.length;
    const accountConnected = accounts.filter((account) => account.connected).length;
    const summary = payload.channels[channelId] ?? {};
    const configured =
      summary.configured === true || accounts.some((account) => account.configured);
    const alertCount = countAlerts(accounts);
    const label =
      payload.channelLabels[channelId] ??
      metaMap.get(channelId)?.label ??
      payload.channelDetailLabels?.[channelId] ??
      channelId;
    const detailLabel =
      payload.channelDetailLabels?.[channelId] ?? metaMap.get(channelId)?.detailLabel;
    const systemImage =
      payload.channelSystemImages?.[channelId] ?? metaMap.get(channelId)?.systemImage ?? undefined;

    return {
      channelId,
      label,
      detailLabel,
      systemImage,
      configured,
      health: resolveHealth({ configured, accountConnected, alertCount }),
      accountTotal,
      accountConnected,
      lastInboundAt: getMaxTimestamp(accounts, "lastInboundAt"),
      lastOutboundAt: getMaxTimestamp(accounts, "lastOutboundAt"),
      alertCount,
    };
  });

  cards.sort((left, right) => {
    const leftOrder = orderIndex.get(left.channelId);
    const rightOrder = orderIndex.get(right.channelId);
    if (leftOrder != null && rightOrder != null) {
      return leftOrder - rightOrder;
    }
    if (leftOrder != null) {
      return -1;
    }
    if (rightOrder != null) {
      return 1;
    }
    return left.label.localeCompare(right.label, "en");
  });

  return cards;
}

export function parseChannelLogLine(line: string, channelId: string): ChannelLogEventVM | null {
  const match = line.match(
    /^\[(?<ts>[^\]]+)\]\s+\[(?<channel>[a-zA-Z0-9_-]+)\/(?<account>[^\]]+)\]\s+(?<message>.+)$/,
  );
  if (!match?.groups) {
    return null;
  }
  if (match.groups.channel !== channelId) {
    return null;
  }
  const timestampMs = Date.parse(match.groups.ts);
  const lowerMessage = match.groups.message.toLowerCase();
  const direction = lowerMessage.includes("inbound")
    ? "inbound"
    : lowerMessage.includes("outbound")
      ? "outbound"
      : "unknown";
  const severity = lowerMessage.includes("error")
    ? "error"
    : lowerMessage.includes("warn")
      ? "warn"
      : "info";

  return {
    ts: Number.isFinite(timestampMs) ? timestampMs : Date.now(),
    channelId: match.groups.channel,
    accountId: match.groups.account,
    direction,
    severity,
    message: match.groups.message,
    raw: line,
  };
}

function inferAlertKind(message: string): ChannelAlertVM["kind"] {
  const lower = message.toLowerCase();
  if (lower.includes("token") || lower.includes("auth") || lower.includes("login")) {
    return "auth";
  }
  if (lower.includes("permission") || lower.includes("intent") || lower.includes("allow")) {
    return "permissions";
  }
  if (lower.includes("config") || lower.includes("missing") || lower.includes("required")) {
    return "config";
  }
  return "runtime";
}

function windowToMs(window: ChannelMonitorWindow): number {
  switch (window) {
    case "5m":
      return 5 * 60_000;
    case "1h":
      return 60 * 60_000;
    case "24h":
      return 24 * 60 * 60_000;
    default:
      return 60 * 60_000;
  }
}

export function buildChannelMonitorSnapshot(params: {
  channelId: string;
  payload: ChannelsStatusPayload;
  logLines: string[];
  now?: number;
  window?: ChannelMonitorWindow;
}): ChannelMonitorSnapshotVM {
  const now = params.now ?? Date.now();
  const window = params.window ?? "1h";
  const accounts = params.payload.channelAccounts[params.channelId] ?? [];
  const alerts: ChannelAlertVM[] = [];

  for (const account of accounts) {
    if (account.configured === false) {
      alerts.push({
        severity: "warn",
        kind: "config",
        message: `Account ${account.accountId} is not configured`,
        accountId: account.accountId,
      });
    }
    if (account.lastError) {
      alerts.push({
        severity: "critical",
        kind: inferAlertKind(account.lastError),
        message: account.lastError,
        accountId: account.accountId,
      });
    }
    if ((account.reconnectAttempts ?? 0) > 0) {
      alerts.push({
        severity: "warn",
        kind: "runtime",
        message: `Account ${account.accountId} reconnect attempts: ${account.reconnectAttempts}`,
        accountId: account.accountId,
      });
    }
  }

  const stream = params.logLines
    .map((line) => parseChannelLogLine(line, params.channelId))
    .filter((entry): entry is ChannelLogEventVM => Boolean(entry))
    .sort((left, right) => left.ts - right.ts);

  const minTs = now - windowToMs(window);
  const scoped = stream.filter((entry) => entry.ts >= minTs && entry.ts <= now);

  const inbound = scoped.filter((entry) => entry.direction === "inbound").length;
  const outbound = scoped.filter((entry) => entry.direction === "outbound").length;
  const total = scoped.length;
  const errors = scoped.filter((entry) => entry.severity === "error").length;
  const success = Math.max(0, total - errors);
  const successRate = total > 0 ? success / total : 1;
  const errorRate = total > 0 ? errors / total : 0;

  return {
    channelId: params.channelId,
    ts: now,
    accounts,
    alerts,
    stream: scoped,
    stats: {
      window,
      inbound,
      outbound,
      total,
      successRate,
      errorRate,
    },
  };
}
