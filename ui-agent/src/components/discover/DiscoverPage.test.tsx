import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiscoverPage } from "./DiscoverPage";
import type { DiscoverClient } from "./types";

type MockClient = {
  sendRequest: jest.Mock<Promise<unknown>, [string, Record<string, unknown>?]>;
};

function createClient(): MockClient {
  const sendRequest = jest.fn<Promise<unknown>, [string, Record<string, unknown>?]>();

  sendRequest.mockImplementation(async (method) => {
    if (method === "discover.feed") {
      return {
        generatedAt: "2026-04-03T00:00:00.000Z",
        items: [
          {
            id: "item-1",
            title: "全球制造业并购升温",
            summary: "多地区工业自动化并购活动增加，估值与资金成本出现分化。",
            sourceId: "source-reuters",
            sourceName: "Reuters",
            url: "https://example.com/item-1",
            publishedAt: "2026-04-02T12:00:00.000Z",
            tags: ["制造业", "并购"],
          },
        ],
      };
    }

    if (method === "discover.settings.get") {
      return {
        settings: {
          allowExternalFetch: false,
          updateIntervalMinutes: 60,
          maxItemsPerFeed: 30,
        },
      };
    }

    if (method === "discover.sources.list") {
      return {
        sources: [
          {
            id: "source-reuters",
            name: "Reuters",
            type: "global-media",
            enabled: true,
            url: "https://www.reuters.com/world/",
          },
        ],
      };
    }

    if (method === "discover.sources.health") {
      return {
        sources: [
          {
            sourceId: "source-reuters",
            status: "healthy",
            failCount: 0,
            lastFetchAt: "2026-04-03T00:00:00.000Z",
            nextFetchAt: "2026-04-03T01:00:00.000Z",
          },
        ],
      };
    }

    if (method === "discover.settings.set") {
      return {
        settings: {
          allowExternalFetch: true,
          updateIntervalMinutes: 30,
          maxItemsPerFeed: 30,
        },
      };
    }

    if (method === "discover.sources.bulkImportPreview") {
      return {
        conflictStrategy: "upsert",
        totalInput: 1,
        valid: 1,
        added: 1,
        updated: 0,
        skipped: 0,
      };
    }

    if (method === "discover.sources.failedExport") {
      return {
        totalFailed: 1,
        content:
          "sourceId,sourceName,enabled,failCount,lastError,lastFetchAt,nextFetchAt,url\nid-1,Test,true,1,error,...",
      };
    }

    if (method === "discover.sources.export") {
      return {
        totalSources: 1,
        content:
          '{"version":1,"sources":[{"id":"source-reuters","name":"Reuters","url":"https://www.reuters.com/world/","type":"global-media"}]}',
      };
    }

    if (method === "discover.sources.importSnapshot") {
      return {
        imported: 1,
        total: 1,
      };
    }

    if (method === "discover.feedback") {
      return { ok: true };
    }

    if (method === "discover.act") {
      return { ok: true, updatedCount: 1 };
    }

    return {};
  });

  return { sendRequest };
}

describe("DiscoverPage", () => {
  it("renders discovery feed and sends save feedback", async () => {
    const client = createClient();

    render(<DiscoverPage wsClient={client as unknown as DiscoverClient} />);

    await waitFor(() => {
      expect(screen.getByText("全球制造业并购升温")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "收藏" }));

    expect(client.sendRequest).toHaveBeenCalledWith("discover.feedback", {
      itemId: "item-1",
      action: "save",
    });
  });

  it("opens settings and saves updates", async () => {
    const client = createClient();

    render(<DiscoverPage wsClient={client as unknown as DiscoverClient} />);

    await waitFor(() => {
      expect(screen.getByText("全球制造业并购升温")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "来源配置" }));

    const intervalInput = await screen.findByLabelText("更新间隔（分钟）");
    fireEvent.change(intervalInput, { target: { value: "30" } });

    await userEvent.click(screen.getByRole("button", { name: "保存设置" }));

    await waitFor(() => {
      const updateCall = client.sendRequest.mock.calls.find(
        ([method]) => method === "discover.settings.set",
      );
      expect(updateCall).toBeDefined();
      expect(updateCall?.[1]).toEqual(
        expect.objectContaining({
          updateIntervalMinutes: 30,
        }),
      );
    });
  });

  it("shows source health state in settings panel", async () => {
    const client = createClient();

    render(<DiscoverPage wsClient={client as unknown as DiscoverClient} />);

    await waitFor(() => {
      expect(screen.getByText("全球制造业并购升温")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "来源配置" }));

    expect(await screen.findByText("healthy")).toBeInTheDocument();
  });

  it("sends forceSync when clicking refresh button", async () => {
    const client = createClient();
    render(<DiscoverPage wsClient={client as unknown as DiscoverClient} />);

    await waitFor(() => {
      expect(screen.getByText("全球制造业并购升温")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "刷新" }));

    await waitFor(() => {
      expect(
        client.sendRequest.mock.calls.some(
          ([method, params]) => method === "discover.feed" && params?.forceSync === true,
        ),
      ).toBe(true);
    });
  });

  it("runs import preview from settings panel", async () => {
    const client = createClient();
    render(<DiscoverPage wsClient={client as unknown as DiscoverClient} />);

    await waitFor(() => {
      expect(screen.getByText("全球制造业并购升温")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: "来源配置" }));

    const textarea = await screen.findByPlaceholderText(
      "Reuters World,https://www.reuters.com/world/,global-media",
    );
    await userEvent.type(textarea, "Test Source,https://example.com/feed.xml,custom");
    await userEvent.click(screen.getByRole("button", { name: "预检导入" }));

    await waitFor(() => {
      expect(
        client.sendRequest.mock.calls.some(
          ([method, params]) =>
            method === "discover.sources.bulkImportPreview" &&
            params?.conflictStrategy === "upsert",
        ),
      ).toBe(true);
    });
    expect(screen.getByText(/预检：输入/)).toBeInTheDocument();
  });

  it("supports batch toggle from settings panel", async () => {
    const client = createClient();
    render(<DiscoverPage wsClient={client as unknown as DiscoverClient} />);

    await waitFor(() => {
      expect(screen.getByText("全球制造业并购升温")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: "来源配置" }));
    await userEvent.click(await screen.findByRole("button", { name: "全关" }));

    await waitFor(() => {
      expect(
        client.sendRequest.mock.calls.some(
          ([method, params]) =>
            method === "discover.act" &&
            params?.action === "source.batchToggle" &&
            params?.enabled === false,
        ),
      ).toBe(true);
    });
  });

  it("exports failed sources csv from settings panel", async () => {
    const client = createClient();
    render(<DiscoverPage wsClient={client as unknown as DiscoverClient} />);

    await waitFor(() => {
      expect(screen.getByText("全球制造业并购升温")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: "来源配置" }));
    await userEvent.click(await screen.findByRole("button", { name: "导出失败来源" }));

    await waitFor(() => {
      expect(
        client.sendRequest.mock.calls.some(
          ([method]) => method === "discover.sources.failedExport",
        ),
      ).toBe(true);
    });
    expect(screen.getByText(/失败来源 1 条/)).toBeInTheDocument();
  });

  it("exports and replays full sources snapshot", async () => {
    const client = createClient();
    render(<DiscoverPage wsClient={client as unknown as DiscoverClient} />);

    await waitFor(() => {
      expect(screen.getByText("全球制造业并购升温")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: "来源配置" }));
    await userEvent.click(await screen.findByRole("button", { name: "导出全部来源" }));
    await userEvent.click(await screen.findByRole("button", { name: "回放导入" }));

    await waitFor(() => {
      expect(
        client.sendRequest.mock.calls.some(([method]) => method === "discover.sources.export"),
      ).toBe(true);
      expect(
        client.sendRequest.mock.calls.some(
          ([method]) => method === "discover.sources.importSnapshot",
        ),
      ).toBe(true);
    });
  });
});
