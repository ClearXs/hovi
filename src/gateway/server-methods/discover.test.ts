import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverHandlers } from "./discover.js";
import type { GatewayRequestHandlerOptions } from "./types.js";

function createOptions(
  method: string,
  params: Record<string, unknown> = {},
): GatewayRequestHandlerOptions {
  return {
    req: { type: "req", id: "req-1", method, params },
    params,
    client: null,
    isWebchatConnect: () => false,
    respond: vi.fn(),
    context: {
      logGateway: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    },
  } as unknown as GatewayRequestHandlerOptions;
}

describe("discoverHandlers", () => {
  let stateDir = "";
  const originalStateDir = process.env.OPENCLAW_STATE_DIR;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-discover-"));
    process.env.OPENCLAW_STATE_DIR = stateDir;
  });

  afterEach(() => {
    fs.rmSync(stateDir, { recursive: true, force: true });
    if (typeof originalStateDir === "string") {
      process.env.OPENCLAW_STATE_DIR = originalStateDir;
    } else {
      delete process.env.OPENCLAW_STATE_DIR;
    }
  });

  it("returns private-first default settings", async () => {
    const opts = createOptions("discover.settings.get");

    await discoverHandlers["discover.settings.get"](opts);

    expect(opts.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        settings: expect.objectContaining({
          allowExternalFetch: false,
          updateIntervalMinutes: 60,
        }),
      }),
      undefined,
    );
  });

  it("updates settings and persists across requests", async () => {
    const setOpts = createOptions("discover.settings.set", {
      allowExternalFetch: true,
      updateIntervalMinutes: 15,
      maxItemsPerFeed: 40,
    });

    await discoverHandlers["discover.settings.set"](setOpts);
    expect(setOpts.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        settings: expect.objectContaining({
          allowExternalFetch: true,
          updateIntervalMinutes: 15,
          maxItemsPerFeed: 40,
        }),
      }),
      undefined,
    );

    const getOpts = createOptions("discover.settings.get");
    await discoverHandlers["discover.settings.get"](getOpts);

    expect(getOpts.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        settings: expect.objectContaining({
          allowExternalFetch: true,
          updateIntervalMinutes: 15,
          maxItemsPerFeed: 40,
        }),
      }),
      undefined,
    );
  });

  it("imports sources and hides items from feed after feedback", async () => {
    const importOpts = createOptions("discover.sources.bulkImport", {
      items: [
        {
          name: "Reuters World",
          url: "https://www.reuters.com/world/",
          type: "global-media",
          region: "global",
        },
      ],
    });
    await discoverHandlers["discover.sources.bulkImport"](importOpts);

    const listOpts = createOptions("discover.sources.list");
    await discoverHandlers["discover.sources.list"](listOpts);

    const listPayload = (listOpts.respond as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      sources?: Array<{ name?: string }>;
    };
    expect(listPayload.sources?.some((source) => source.name === "Reuters World")).toBe(true);

    const feedOpts = createOptions("discover.feed", { limit: 5 });
    await discoverHandlers["discover.feed"](feedOpts);
    const feedPayload = (feedOpts.respond as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      items?: Array<{ id: string }>;
    };
    const firstItemId = feedPayload.items?.[0]?.id;
    expect(typeof firstItemId).toBe("string");

    const feedbackOpts = createOptions("discover.feedback", {
      itemId: firstItemId,
      action: "hide",
    });
    await discoverHandlers["discover.feedback"](feedbackOpts);

    const feedAfterHideOpts = createOptions("discover.feed", { limit: 5 });
    await discoverHandlers["discover.feed"](feedAfterHideOpts);
    const feedAfterHidePayload = (feedAfterHideOpts.respond as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[1] as {
      items?: Array<{ id: string }>;
    };

    expect(feedAfterHidePayload.items?.some((item) => item.id === firstItemId)).toBe(false);
  });

  it("returns source health data with scheduler timestamps", async () => {
    const healthOpts = createOptions("discover.sources.health");
    await discoverHandlers["discover.sources.health"](healthOpts);

    const healthPayload = (healthOpts.respond as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      sources?: Array<{
        sourceId?: string;
        status?: string;
        failCount?: number;
        lastFetchAt?: string;
        nextFetchAt?: string;
      }>;
    };

    expect(Array.isArray(healthPayload.sources)).toBe(true);
    expect(healthPayload.sources?.length).toBeGreaterThan(0);
    expect(healthPayload.sources?.[0]).toEqual(
      expect.objectContaining({
        sourceId: expect.any(String),
        status: expect.stringMatching(/healthy|warning|error/),
        failCount: expect.any(Number),
        lastFetchAt: expect.any(String),
        nextFetchAt: expect.any(String),
      }),
    );
  });

  it("updates health timestamps after feed generation", async () => {
    const beforeOpts = createOptions("discover.sources.health");
    await discoverHandlers["discover.sources.health"](beforeOpts);
    const beforePayload = (beforeOpts.respond as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      sources?: Array<{ sourceId: string; lastFetchAt: string }>;
    };
    const beforeSource = beforePayload.sources?.find((entry) => entry.sourceId === "reuters-world");
    expect(beforeSource).toBeDefined();

    const feedOpts = createOptions("discover.feed", { limit: 3 });
    await discoverHandlers["discover.feed"](feedOpts);

    const afterOpts = createOptions("discover.sources.health");
    await discoverHandlers["discover.sources.health"](afterOpts);
    const afterPayload = (afterOpts.respond as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      sources?: Array<{ sourceId: string; lastFetchAt: string; nextFetchAt: string }>;
    };
    const afterSource = afterPayload.sources?.find((entry) => entry.sourceId === "reuters-world");
    expect(afterSource).toBeDefined();

    const beforeAt = Number(new Date(beforeSource?.lastFetchAt ?? 0));
    const afterAt = Number(new Date(afterSource?.lastFetchAt ?? 0));
    const nextAt = Number(new Date(afterSource?.nextFetchAt ?? 0));

    expect(afterAt).toBeGreaterThanOrEqual(beforeAt);
    expect(nextAt).toBeGreaterThan(afterAt);
  });

  it("fetches external sources when enabled and force sync is requested", async () => {
    const previousFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Demo Feed</title>
    <item>
      <title>工业AI观察</title>
      <link>https://example.com/articles/a?utm_source=test</link>
      <description>工业自动化与AI协同升级。</description>
      <pubDate>Fri, 03 Apr 2026 02:00:00 GMT</pubDate>
    </item>
    <item>
      <title>工业AI观察</title>
      <link>https://example.com/articles/a?utm_source=other</link>
      <description>重复条目用于去重。</description>
      <pubDate>Fri, 03 Apr 2026 02:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`,
        { status: 200, headers: { "content-type": "application/rss+xml" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    try {
      const setOpts = createOptions("discover.settings.set", {
        allowExternalFetch: true,
        updateIntervalMinutes: 5,
        maxItemsPerFeed: 20,
      });
      await discoverHandlers["discover.settings.set"](setOpts);

      const feedOpts = createOptions("discover.feed", { forceSync: true, limit: 20 });
      await discoverHandlers["discover.feed"](feedOpts);
      const feedPayload = (feedOpts.respond as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
        items?: Array<{ title?: string; url?: string }>;
      };

      expect(fetchMock).toHaveBeenCalled();
      expect(feedPayload.items?.some((item) => item.title === "工业AI观察")).toBe(true);
      expect(
        (feedPayload.items ?? []).filter((item) =>
          item.url?.startsWith("https://example.com/articles/a"),
        ).length,
      ).toBe(1);
    } finally {
      vi.stubGlobal("fetch", previousFetch);
    }
  });

  it("records source fetch failures into health status", async () => {
    const previousFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    try {
      const setOpts = createOptions("discover.settings.set", {
        allowExternalFetch: true,
        updateIntervalMinutes: 5,
      });
      await discoverHandlers["discover.settings.set"](setOpts);

      const feedOpts = createOptions("discover.feed", { forceSync: true, limit: 5 });
      await discoverHandlers["discover.feed"](feedOpts);

      const healthOpts = createOptions("discover.sources.health");
      await discoverHandlers["discover.sources.health"](healthOpts);
      const healthPayload = (healthOpts.respond as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
        sources?: Array<{ status: string; failCount: number; lastError?: string }>;
      };
      const failed = (healthPayload.sources ?? []).find((item) => item.failCount > 0);
      expect(failed).toBeDefined();
      expect(failed?.status).toMatch(/warning|error/);
      expect(failed?.lastError).toContain("network down");
    } finally {
      vi.stubGlobal("fetch", previousFetch);
    }
  });

  it("previews bulk import result without persisting", async () => {
    const previewOpts = createOptions("discover.sources.bulkImportPreview", {
      items: [
        {
          name: "Reuters World",
          url: "https://www.reuters.com/world/",
          type: "global-media",
        },
        {
          name: "New Private Source",
          url: "https://example.com/private-feed.xml",
          type: "custom",
        },
        {
          name: "Invalid Missing Url",
          type: "custom",
        },
      ],
    });
    await discoverHandlers["discover.sources.bulkImportPreview"](previewOpts);

    expect(previewOpts.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        added: 1,
        updated: 1,
        skipped: 1,
      }),
      undefined,
    );

    const listOpts = createOptions("discover.sources.list");
    await discoverHandlers["discover.sources.list"](listOpts);
    const listPayload = (listOpts.respond as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      sources?: Array<{ name: string }>;
    };
    expect(listPayload.sources?.some((item) => item.name === "New Private Source")).toBe(false);
  });

  it("supports source.batchToggle action", async () => {
    const disableAllOpts = createOptions("discover.act", {
      action: "source.batchToggle",
      enabled: false,
    });
    await discoverHandlers["discover.act"](disableAllOpts);
    expect(disableAllOpts.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        updatedCount: expect.any(Number),
      }),
      undefined,
    );

    const listAfterDisable = createOptions("discover.sources.list", { enabledOnly: true });
    await discoverHandlers["discover.sources.list"](listAfterDisable);
    const disablePayload = (listAfterDisable.respond as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[1] as {
      sources?: Array<{ id: string }>;
    };
    expect(disablePayload.sources?.length ?? 0).toBe(0);

    const enableAllOpts = createOptions("discover.act", {
      action: "source.batchToggle",
      enabled: true,
    });
    await discoverHandlers["discover.act"](enableAllOpts);

    const listAfterEnable = createOptions("discover.sources.list", { enabledOnly: true });
    await discoverHandlers["discover.sources.list"](listAfterEnable);
    const enablePayload = (listAfterEnable.respond as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[1] as {
      sources?: Array<{ id: string }>;
    };
    expect((enablePayload.sources?.length ?? 0) > 0).toBe(true);
  });

  it("supports bulk import with conflictStrategy=skip", async () => {
    const importOpts = createOptions("discover.sources.bulkImport", {
      conflictStrategy: "skip",
      items: [
        {
          name: "Reuters World Updated Name",
          url: "https://www.reuters.com/world/",
          type: "global-media",
        },
        {
          name: "Brand New Source",
          url: "https://example.com/new-feed.xml",
          type: "custom",
        },
      ],
    });
    await discoverHandlers["discover.sources.bulkImport"](importOpts);

    expect(importOpts.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        conflictStrategy: "skip",
        imported: 1,
        updated: 0,
      }),
      undefined,
    );

    const listOpts = createOptions("discover.sources.list");
    await discoverHandlers["discover.sources.list"](listOpts);
    const listPayload = (listOpts.respond as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      sources?: Array<{ name: string }>;
    };
    expect(
      listPayload.sources?.some((source) => source.name === "Reuters World Updated Name"),
    ).toBe(false);
    expect(listPayload.sources?.some((source) => source.name === "Brand New Source")).toBe(true);
  });

  it("exports failed sources in csv format", async () => {
    const previousFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => {
      throw new Error("temporary fetch error");
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    try {
      await discoverHandlers["discover.settings.set"](
        createOptions("discover.settings.set", { allowExternalFetch: true }),
      );
      await discoverHandlers["discover.feed"](createOptions("discover.feed", { forceSync: true }));

      const exportOpts = createOptions("discover.sources.failedExport", { format: "csv" });
      await discoverHandlers["discover.sources.failedExport"](exportOpts);
      const payload = (exportOpts.respond as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
        totalFailed?: number;
        content?: string;
      };
      expect(payload.totalFailed).toBeGreaterThan(0);
      expect(payload.content).toContain("sourceId,sourceName,enabled,failCount,lastError");
      expect(payload.content).toContain("temporary fetch error");
    } finally {
      vi.stubGlobal("fetch", previousFetch);
    }
  });

  it("exports full sources snapshot and supports replay import", async () => {
    const exportOpts = createOptions("discover.sources.export");
    await discoverHandlers["discover.sources.export"](exportOpts);
    const exportPayload = (exportOpts.respond as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      totalSources?: number;
      content?: string;
    };
    expect(exportPayload.totalSources).toBeGreaterThan(0);
    expect(exportPayload.content).toContain('"sources"');

    await discoverHandlers["discover.act"](
      createOptions("discover.act", { action: "source.batchToggle", enabled: false }),
    );

    const importOpts = createOptions("discover.sources.importSnapshot", {
      content: exportPayload.content,
      mode: "replace",
    });
    await discoverHandlers["discover.sources.importSnapshot"](importOpts);
    expect(importOpts.respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        imported: expect.any(Number),
      }),
      undefined,
    );

    const listOpts = createOptions("discover.sources.list");
    await discoverHandlers["discover.sources.list"](listOpts);
    const listPayload = (listOpts.respond as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      sources?: Array<{ id: string }>;
    };
    expect((listPayload.sources?.length ?? 0) > 0).toBe(true);
    expect(listPayload.sources?.some((source) => source.id === "reuters-world")).toBe(true);
  });

  it("rejects invalid replay snapshot payload", async () => {
    const importOpts = createOptions("discover.sources.importSnapshot", {
      content: '{"invalid":true}',
      mode: "replace",
    });
    await discoverHandlers["discover.sources.importSnapshot"](importOpts);
    expect(importOpts.respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "INVALID_REQUEST",
      }),
    );
  });
});
