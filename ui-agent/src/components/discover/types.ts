export type DiscoverSettings = {
  allowExternalFetch: boolean;
  updateIntervalMinutes: number;
  maxItemsPerFeed: number;
};

export type DiscoverSource = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  url: string;
  region?: string;
  reliabilityScore?: number;
};

export type DiscoverSourceHealthStatus = "healthy" | "warning" | "error";

export type DiscoverSourceHealth = {
  sourceId: string;
  sourceName?: string;
  enabled?: boolean;
  status: DiscoverSourceHealthStatus;
  failCount: number;
  lastError?: string;
  lastFetchAt: string;
  nextFetchAt: string;
  reliabilityScore?: number;
};

export type DiscoverFeedItem = {
  id: string;
  title: string;
  summary: string;
  sourceId: string;
  sourceName: string;
  url: string;
  publishedAt: string;
  tags: string[];
  saved?: boolean;
};

export type DiscoverClient = {
  sendRequest<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
};
