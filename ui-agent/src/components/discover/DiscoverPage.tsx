"use client";

import { RefreshCcw, Settings2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { DiscoverCard } from "@/components/discover/DiscoverCard";
import { DiscoverSettingsPanel } from "@/components/discover/DiscoverSettingsPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
  DiscoverClient,
  DiscoverFeedItem,
  DiscoverSettings,
  DiscoverSource,
  DiscoverSourceHealth,
} from "./types";

const DEFAULT_SETTINGS: DiscoverSettings = {
  allowExternalFetch: false,
  updateIntervalMinutes: 60,
  maxItemsPerFeed: 30,
};

type DiscoverPageProps = {
  wsClient?: DiscoverClient | null;
  onError?: (message: string) => void;
};

type DiscoverFeedResponse = {
  items?: DiscoverFeedItem[];
};

type DiscoverSettingsResponse = {
  settings?: DiscoverSettings;
};

type DiscoverSourcesResponse = {
  sources?: DiscoverSource[];
};

type DiscoverSourcesHealthResponse = {
  sources?: DiscoverSourceHealth[];
};

type DiscoverBulkImportPreviewResponse = {
  conflictStrategy?: "upsert" | "skip";
  totalInput: number;
  valid: number;
  added: number;
  updated: number;
  skipped: number;
};

type DiscoverFailedSourcesExportResponse = {
  totalFailed: number;
  content: string;
};

type DiscoverSourcesExportResponse = {
  totalSources: number;
  content: string;
};

type DiscoverSourcesImportSnapshotResponse = {
  imported: number;
  updated?: number;
  total: number;
};

function parseSourcesImportText(
  value: string,
): Array<{ name: string; url: string; type?: string }> {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, url, type] = line.split(",").map((part) => part.trim());
      return { name, url, type };
    })
    .filter((item) => item.name && item.url);
}

export function DiscoverPage({ wsClient = null, onError }: DiscoverPageProps) {
  const [items, setItems] = useState<DiscoverFeedItem[]>([]);
  const [settings, setSettings] = useState<DiscoverSettings>(DEFAULT_SETTINGS);
  const [sources, setSources] = useState<DiscoverSource[]>([]);
  const [sourceHealthById, setSourceHealthById] = useState<Record<string, DiscoverSourceHealth>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const notifyError = useCallback(
    (error: unknown, fallback: string) => {
      const message = error instanceof Error ? error.message : fallback;
      onError?.(message);
    },
    [onError],
  );

  const loadData = useCallback(
    async (options?: { forceSync?: boolean }) => {
      if (!wsClient) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [feedRes, settingsRes, sourcesRes, healthRes] = await Promise.all([
          wsClient.sendRequest<DiscoverFeedResponse>("discover.feed", {
            forceSync: options?.forceSync === true,
          }),
          wsClient.sendRequest<DiscoverSettingsResponse>("discover.settings.get", {}),
          wsClient.sendRequest<DiscoverSourcesResponse>("discover.sources.list", {}),
          wsClient.sendRequest<DiscoverSourcesHealthResponse>("discover.sources.health", {}),
        ]);

        setItems(Array.isArray(feedRes?.items) ? feedRes.items : []);
        setSettings(settingsRes?.settings ?? DEFAULT_SETTINGS);
        setSources(Array.isArray(sourcesRes?.sources) ? sourcesRes.sources : []);
        const healthSources = Array.isArray(healthRes?.sources) ? healthRes.sources : [];
        setSourceHealthById(Object.fromEntries(healthSources.map((item) => [item.sourceId, item])));
      } catch (error) {
        notifyError(error, "discover.load failed");
      } finally {
        setLoading(false);
      }
    },
    [notifyError, wsClient],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleFeedback = useCallback(
    async (item: DiscoverFeedItem, action: "save" | "hide") => {
      if (!wsClient) return;
      setBusy(true);
      try {
        await wsClient.sendRequest("discover.feedback", { itemId: item.id, action });
        if (action === "save") {
          setItems((prev) =>
            prev.map((entry) => (entry.id === item.id ? { ...entry, saved: true } : entry)),
          );
        } else {
          setItems((prev) => prev.filter((entry) => entry.id !== item.id));
        }
      } catch (error) {
        notifyError(error, "discover.feedback failed");
      } finally {
        setBusy(false);
      }
    },
    [notifyError, wsClient],
  );

  const handleSaveSettings = useCallback(
    async (nextSettings: DiscoverSettings) => {
      if (!wsClient) return;
      setBusy(true);
      try {
        const response = await wsClient.sendRequest<DiscoverSettingsResponse>(
          "discover.settings.set",
          {
            allowExternalFetch: nextSettings.allowExternalFetch,
            updateIntervalMinutes: nextSettings.updateIntervalMinutes,
            maxItemsPerFeed: nextSettings.maxItemsPerFeed,
          },
        );
        setSettings(response.settings ?? nextSettings);
      } catch (error) {
        notifyError(error, "discover.settings.set failed");
      } finally {
        setBusy(false);
      }
    },
    [notifyError, wsClient],
  );

  const handleToggleSource = useCallback(
    async (sourceId: string, enabled: boolean) => {
      if (!wsClient) return;
      try {
        await wsClient.sendRequest("discover.act", { action: "source.toggle", sourceId, enabled });
        setSources((prev) =>
          prev.map((source) => (source.id === sourceId ? { ...source, enabled } : source)),
        );
        const healthRes = await wsClient.sendRequest<DiscoverSourcesHealthResponse>(
          "discover.sources.health",
          {},
        );
        const healthSources = Array.isArray(healthRes?.sources) ? healthRes.sources : [];
        setSourceHealthById(Object.fromEntries(healthSources.map((item) => [item.sourceId, item])));
      } catch (error) {
        notifyError(error, "discover.act failed");
      }
    },
    [notifyError, wsClient],
  );

  const handleBulkImport = useCallback(
    async (lines: string, strategy: "upsert" | "skip") => {
      if (!wsClient) return;
      const itemsToImport = parseSourcesImportText(lines);
      if (itemsToImport.length === 0) {
        return;
      }
      try {
        await wsClient.sendRequest("discover.sources.bulkImport", {
          items: itemsToImport,
          conflictStrategy: strategy,
        });
        const [sourcesRes, healthRes] = await Promise.all([
          wsClient.sendRequest<DiscoverSourcesResponse>("discover.sources.list", {}),
          wsClient.sendRequest<DiscoverSourcesHealthResponse>("discover.sources.health", {}),
        ]);
        setSources(Array.isArray(sourcesRes?.sources) ? sourcesRes.sources : []);
        const healthSources = Array.isArray(healthRes?.sources) ? healthRes.sources : [];
        setSourceHealthById(Object.fromEntries(healthSources.map((item) => [item.sourceId, item])));
      } catch (error) {
        notifyError(error, "discover.sources.bulkImport failed");
      }
    },
    [notifyError, wsClient],
  );

  const handlePreviewImport = useCallback(
    async (lines: string, strategy: "upsert" | "skip") => {
      if (!wsClient) {
        return null;
      }
      const itemsToImport = parseSourcesImportText(lines);
      if (itemsToImport.length === 0) {
        return null;
      }
      try {
        const result = await wsClient.sendRequest<DiscoverBulkImportPreviewResponse>(
          "discover.sources.bulkImportPreview",
          {
            items: itemsToImport,
            conflictStrategy: strategy,
          },
        );
        return result;
      } catch (error) {
        notifyError(error, "discover.sources.bulkImportPreview failed");
        return null;
      }
    },
    [notifyError, wsClient],
  );

  const handleExportFailedSources = useCallback(async () => {
    if (!wsClient) {
      return null;
    }
    try {
      const result = await wsClient.sendRequest<DiscoverFailedSourcesExportResponse>(
        "discover.sources.failedExport",
        { format: "csv" },
      );
      return result;
    } catch (error) {
      notifyError(error, "discover.sources.failedExport failed");
      return null;
    }
  }, [notifyError, wsClient]);

  const handleExportSourcesSnapshot = useCallback(async () => {
    if (!wsClient) {
      return null;
    }
    try {
      const result = await wsClient.sendRequest<DiscoverSourcesExportResponse>(
        "discover.sources.export",
        {},
      );
      return result;
    } catch (error) {
      notifyError(error, "discover.sources.export failed");
      return null;
    }
  }, [notifyError, wsClient]);

  const handleImportSourcesSnapshot = useCallback(
    async (content: string, mode: "replace" | "merge") => {
      if (!wsClient) {
        return null;
      }
      setBusy(true);
      try {
        const result = await wsClient.sendRequest<DiscoverSourcesImportSnapshotResponse>(
          "discover.sources.importSnapshot",
          { content, mode },
        );
        const [sourcesRes, healthRes] = await Promise.all([
          wsClient.sendRequest<DiscoverSourcesResponse>("discover.sources.list", {}),
          wsClient.sendRequest<DiscoverSourcesHealthResponse>("discover.sources.health", {}),
        ]);
        setSources(Array.isArray(sourcesRes?.sources) ? sourcesRes.sources : []);
        const healthSources = Array.isArray(healthRes?.sources) ? healthRes.sources : [];
        setSourceHealthById(Object.fromEntries(healthSources.map((item) => [item.sourceId, item])));
        return result;
      } catch (error) {
        notifyError(error, "discover.sources.importSnapshot failed");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [notifyError, wsClient],
  );

  const handleBatchToggleSources = useCallback(
    async (enabled: boolean) => {
      if (!wsClient) return;
      setBusy(true);
      try {
        await wsClient.sendRequest("discover.act", { action: "source.batchToggle", enabled });
        const [sourcesRes, healthRes] = await Promise.all([
          wsClient.sendRequest<DiscoverSourcesResponse>("discover.sources.list", {}),
          wsClient.sendRequest<DiscoverSourcesHealthResponse>("discover.sources.health", {}),
        ]);
        setSources(Array.isArray(sourcesRes?.sources) ? sourcesRes.sources : []);
        const healthSources = Array.isArray(healthRes?.sources) ? healthRes.sources : [];
        setSourceHealthById(Object.fromEntries(healthSources.map((item) => [item.sourceId, item])));
      } catch (error) {
        notifyError(error, "discover.act source.batchToggle failed");
      } finally {
        setBusy(false);
      }
    },
    [notifyError, wsClient],
  );

  return (
    <div className="relative h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        {loading ? (
          <Card className="border-border-light bg-background">
            <CardContent className="py-10 text-center text-sm text-text-tertiary">
              正在加载内容...
            </CardContent>
          </Card>
        ) : items.length === 0 ? (
          <Card className="border-border-light bg-background">
            <CardContent className="py-10 text-center text-sm text-text-tertiary">
              暂无结果，请先在“来源配置”中启用来源或导入新来源。
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <DiscoverCard
                key={item.id}
                item={item}
                busy={busy}
                onSave={(entry) => void handleFeedback(entry, "save")}
                onHide={(entry) => void handleFeedback(entry, "hide")}
              />
            ))}
          </div>
        )}
      </div>

      <div className="absolute right-5 top-5 z-[90] flex w-fit flex-row gap-2">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-11 w-11 rounded-full border-border-light bg-background/95 shadow-lg backdrop-blur cursor-pointer"
          onClick={() => void loadData({ forceSync: true })}
          disabled={loading}
          aria-label="刷新"
          title="刷新"
        >
          <RefreshCcw className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          className="h-11 w-11 rounded-full shadow-lg cursor-pointer"
          onClick={() => setSettingsOpen(true)}
          aria-label="来源配置"
          title="来源配置"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>

      <DiscoverSettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        sources={sources}
        sourceHealthById={sourceHealthById}
        saving={busy}
        onSave={handleSaveSettings}
        onToggleSource={handleToggleSource}
        onBatchToggleSources={handleBatchToggleSources}
        onPreviewImport={handlePreviewImport}
        onBulkImport={handleBulkImport}
        onExportFailedSources={handleExportFailedSources}
        onExportSourcesSnapshot={handleExportSourcesSnapshot}
        onImportSourcesSnapshot={handleImportSourcesSnapshot}
      />
    </div>
  );
}
