import {
  buildChannelCards,
  buildChannelMonitorSnapshot,
  parseChannelLogLine,
  type ChannelsStatusPayload,
} from "./channelApi";

describe("channelApi", () => {
  test("buildChannelCards maps channel summary into ordered cards", () => {
    const payload: ChannelsStatusPayload = {
      ts: 1710000000000,
      channelOrder: ["telegram", "discord"],
      channelLabels: {
        telegram: "Telegram",
        discord: "Discord",
      },
      channelMeta: [
        { id: "telegram", label: "Telegram", detailLabel: "Telegram" },
        { id: "discord", label: "Discord", detailLabel: "Discord" },
      ],
      channels: {
        telegram: { configured: true },
        discord: { configured: false },
      },
      channelAccounts: {
        telegram: [
          {
            accountId: "default",
            configured: true,
            connected: true,
            lastInboundAt: 1710000000000,
            lastOutboundAt: 1710000001000,
          },
        ],
        discord: [
          {
            accountId: "default",
            configured: false,
            connected: false,
          },
        ],
      },
      channelDefaultAccountId: {
        telegram: "default",
        discord: "default",
      },
    };

    const cards = buildChannelCards(payload);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      channelId: "telegram",
      label: "Telegram",
      configured: true,
      accountTotal: 1,
      accountConnected: 1,
      health: "healthy",
      alertCount: 0,
    });
    expect(cards[1]).toMatchObject({
      channelId: "discord",
      configured: false,
      accountTotal: 1,
      accountConnected: 0,
      health: "offline",
      alertCount: 1,
    });
  });

  test("buildChannelMonitorSnapshot builds alerts, stream and stats for a channel", () => {
    const payload: ChannelsStatusPayload = {
      ts: 1710000000000,
      channelOrder: ["telegram"],
      channelLabels: { telegram: "Telegram" },
      channels: {
        telegram: { configured: true },
      },
      channelAccounts: {
        telegram: [
          {
            accountId: "default",
            configured: true,
            connected: true,
            lastError: "token expired",
          },
        ],
      },
      channelDefaultAccountId: { telegram: "default" },
    };

    const now = Date.parse("2026-03-26T10:10:00.000Z");
    const lines = [
      "[2026-03-26T10:00:00.000Z] [telegram/default] inbound message from user123",
      "[2026-03-26T10:00:05.000Z] [telegram/default] outbound message to user123",
      "[2026-03-26T10:00:06.000Z] [telegram/default] error send failed",
      "[2026-03-26T10:00:08.000Z] [discord/default] inbound should ignore",
    ];

    const monitor = buildChannelMonitorSnapshot({
      channelId: "telegram",
      payload,
      logLines: lines,
      now,
      window: "1h",
    });

    expect(monitor.alerts.some((alert) => alert.kind === "auth" || alert.kind === "runtime")).toBe(
      true,
    );
    expect(monitor.stream.length).toBe(3);
    expect(monitor.stats.total).toBe(3);
    expect(monitor.stats.inbound).toBe(1);
    expect(monitor.stats.outbound).toBe(1);
    expect(monitor.stats.errorRate).toBeCloseTo(1 / 3, 5);
  });

  test("parseChannelLogLine parses direction and severity and ignores unrelated lines", () => {
    const matched = parseChannelLogLine(
      "[2026-03-26T10:00:06.000Z] [telegram/default] outbound error send failed",
      "telegram",
    );
    expect(matched).toMatchObject({
      channelId: "telegram",
      accountId: "default",
      direction: "outbound",
      severity: "error",
    });

    const ignored = parseChannelLogLine(
      "[2026-03-26T10:00:06.000Z] [discord/default] outbound error send failed",
      "telegram",
    );
    expect(ignored).toBeNull();
  });
});
