import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../../config/paths.js";
import { fetchWithTimeout } from "../../utils/fetch-timeout.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

type DiscoverSourceType =
  | "global-media"
  | "journals"
  | "hot-papers"
  | "global-newspapers"
  | "traditional-culture"
  | "tech-community"
  | "custom";

type DiscoverSettings = {
  allowExternalFetch: boolean;
  updateIntervalMinutes: number;
  maxItemsPerFeed: number;
};

type DiscoverSourceHealthStatus = "healthy" | "warning" | "error";

type DiscoverSource = {
  id: string;
  name: string;
  type: DiscoverSourceType;
  enabled: boolean;
  url: string;
  region: string;
  reliabilityScore: number;
  updatedAt: string;
  lastFetchAt: string;
  nextFetchAt: string;
  failCount: number;
  lastError?: string;
};

type DiscoverFeedbackEntry = {
  saved: boolean;
  hidden: boolean;
  reason?: string;
  updatedAt: string;
};

type DiscoverState = {
  version: 1;
  settings: DiscoverSettings;
  topics: string[];
  sources: DiscoverSource[];
  cachedItems: DiscoverCachedItem[];
  feedback: Record<string, DiscoverFeedbackEntry>;
};

type DiscoverCachedItem = {
  id: string;
  title: string;
  summary: string;
  sourceId: string;
  sourceName: string;
  sourceType: DiscoverSourceType;
  url: string;
  publishedAt: string;
  tags: string[];
  fetchedAt: string;
};

type ParsedFeedItem = {
  title: string;
  summary: string;
  url: string;
  publishedAt: string;
};

type PreparedImportSource = {
  id: string;
  name: string;
  type: DiscoverSourceType;
  enabled: boolean;
  url: string;
  region: string;
  reliabilityScore: number;
  lastFetchAt?: string;
  nextFetchAt?: string;
  failCount?: number;
  lastError?: string;
};

type ImportConflictStrategy = "upsert" | "skip";
type ImportSnapshotMode = "replace" | "merge";

type DiscoverSourceHealth = {
  sourceId: string;
  sourceName: string;
  enabled: boolean;
  status: DiscoverSourceHealthStatus;
  failCount: number;
  lastError?: string;
  lastFetchAt: string;
  nextFetchAt: string;
  reliabilityScore: number;
};

type DiscoverFeedItem = {
  id: string;
  title: string;
  summary: string;
  sourceId: string;
  sourceName: string;
  url: string;
  publishedAt: string;
  tags: string[];
  saved: boolean;
};

const DISCOVER_STATE_VERSION = 1 as const;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_ITEMS_PER_SOURCE_FETCH = 20;
const MAX_CACHED_ITEMS = 600;
const DEFAULT_TOPICS = ["工业", "金融", "投资"] as const;
const DEFAULT_SETTINGS: DiscoverSettings = {
  allowExternalFetch: false,
  updateIntervalMinutes: 60,
  maxItemsPerFeed: 30,
};

const DEFAULT_SOURCES: Omit<
  DiscoverSource,
  "updatedAt" | "lastFetchAt" | "nextFetchAt" | "failCount" | "lastError"
>[] = [
  {
    id: "reuters-world",
    name: "Reuters World",
    type: "global-media",
    enabled: true,
    url: "https://www.reuters.com/world/",
    region: "global",
    reliabilityScore: 92,
  },
  {
    id: "ft-markets",
    name: "Financial Times Markets",
    type: "global-media",
    enabled: true,
    url: "https://www.ft.com/markets",
    region: "global",
    reliabilityScore: 90,
  },
  {
    id: "nature-latest",
    name: "Nature Latest Research",
    type: "journals",
    enabled: true,
    url: "https://www.nature.com/research",
    region: "global",
    reliabilityScore: 95,
  },
  {
    id: "arxiv-cs",
    name: "arXiv Computer Science",
    type: "hot-papers",
    enabled: true,
    url: "https://arxiv.org/list/cs/new",
    region: "global",
    reliabilityScore: 84,
  },
  {
    id: "wsj-opinion",
    name: "WSJ Opinion",
    type: "global-newspapers",
    enabled: true,
    url: "https://www.wsj.com/news/opinion",
    region: "us",
    reliabilityScore: 87,
  },
  {
    id: "hacker-news",
    name: "Hacker News",
    type: "tech-community",
    enabled: true,
    url: "https://news.ycombinator.com/",
    region: "global",
    reliabilityScore: 82,
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function addMinutesIso(value: string, minutes: number): string {
  const timestamp = Number(new Date(value));
  if (!Number.isFinite(timestamp)) {
    return nowIso();
  }
  return new Date(timestamp + minutes * 60 * 1000).toISOString();
}

function resolveDiscoverStatePath(): string {
  return path.join(resolveStateDir(), "discovery", "discover-state.json");
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSourceType(value: unknown): DiscoverSourceType {
  const text = normalizeText(value);
  switch (text) {
    case "global-media":
    case "journals":
    case "hot-papers":
    case "global-newspapers":
    case "traditional-culture":
    case "tech-community":
    case "custom":
      return text;
    default:
      return "custom";
  }
}

function buildDefaultState(): DiscoverState {
  const updatedAt = nowIso();
  const nextFetchAt = addMinutesIso(updatedAt, DEFAULT_SETTINGS.updateIntervalMinutes);
  return {
    version: DISCOVER_STATE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    topics: [...DEFAULT_TOPICS],
    sources: DEFAULT_SOURCES.map((source) => ({
      ...source,
      updatedAt,
      lastFetchAt: updatedAt,
      nextFetchAt,
      failCount: 0,
    })),
    cachedItems: [],
    feedback: {},
  };
}

async function writeState(state: DiscoverState): Promise<void> {
  const filePath = resolveDiscoverStatePath();
  const dirPath = path.dirname(filePath);
  await fs.mkdir(dirPath, { recursive: true });
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), "utf8");
  try {
    await fs.chmod(tmpPath, 0o600);
  } catch {
    // ignore permission tightening failures
  }
  await fs.rename(tmpPath, filePath);
}

function normalizeTopics(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_TOPICS];
  }
  const unique = new Set<string>();
  for (const item of value) {
    const topic = normalizeText(item);
    if (topic) {
      unique.add(topic);
    }
  }
  if (unique.size === 0) {
    return [...DEFAULT_TOPICS];
  }
  return Array.from(unique);
}

function normalizeSources(value: unknown, settings: DiscoverSettings): DiscoverSource[] {
  if (!Array.isArray(value)) {
    return buildDefaultState().sources;
  }
  const normalized: DiscoverSource[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const record = raw as Partial<DiscoverSource>;
    const id = normalizeText(record.id);
    const name = normalizeText(record.name);
    const url = normalizeText(record.url);
    if (!id || !name || !url) {
      continue;
    }
    const reliability = typeof record.reliabilityScore === "number" ? record.reliabilityScore : 70;
    normalized.push({
      id,
      name,
      url,
      type: normalizeSourceType(record.type),
      enabled: record.enabled !== false,
      region: normalizeText(record.region) || "global",
      reliabilityScore: clampInteger(reliability, 0, 100),
      updatedAt: normalizeText(record.updatedAt) || nowIso(),
      lastFetchAt: normalizeText(record.lastFetchAt) || normalizeText(record.updatedAt) || nowIso(),
      nextFetchAt:
        normalizeText(record.nextFetchAt) ||
        addMinutesIso(
          normalizeText(record.lastFetchAt) || normalizeText(record.updatedAt) || nowIso(),
          settings.updateIntervalMinutes,
        ),
      failCount: clampInteger(typeof record.failCount === "number" ? record.failCount : 0, 0, 1000),
      lastError: normalizeText(record.lastError) || undefined,
    });
  }
  if (normalized.length === 0) {
    return buildDefaultState().sources;
  }
  return normalized;
}

function normalizeCachedItems(value: unknown): DiscoverCachedItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized: DiscoverCachedItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const record = raw as Partial<DiscoverCachedItem>;
    const id = normalizeText(record.id);
    const title = normalizeText(record.title);
    const sourceId = normalizeText(record.sourceId);
    const sourceName = normalizeText(record.sourceName);
    const url = normalizeText(record.url);
    if (!id || !title || !sourceId || !sourceName || !url) {
      continue;
    }
    const sourceType = normalizeSourceType(record.sourceType);
    normalized.push({
      id,
      title,
      summary: normalizeText(record.summary),
      sourceId,
      sourceName,
      sourceType,
      url,
      publishedAt: normalizeText(record.publishedAt) || nowIso(),
      tags: Array.isArray(record.tags)
        ? record.tags.map((tag) => normalizeText(tag)).filter(Boolean)
        : [sourceType],
      fetchedAt: normalizeText(record.fetchedAt) || nowIso(),
    });
  }
  return normalized
    .toSorted((a, b) => Number(new Date(b.publishedAt)) - Number(new Date(a.publishedAt)))
    .slice(0, MAX_CACHED_ITEMS);
}

function normalizeFeedback(value: unknown): Record<string, DiscoverFeedbackEntry> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const normalized: Record<string, DiscoverFeedbackEntry> = {};
  for (const [itemId, rawEntry] of Object.entries(value)) {
    if (!rawEntry || typeof rawEntry !== "object") {
      continue;
    }
    const entry = rawEntry as Partial<DiscoverFeedbackEntry>;
    normalized[itemId] = {
      saved: entry.saved === true,
      hidden: entry.hidden === true,
      reason: normalizeText(entry.reason) || undefined,
      updatedAt: normalizeText(entry.updatedAt) || nowIso(),
    };
  }
  return normalized;
}

function normalizeSettings(value: unknown): DiscoverSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_SETTINGS };
  }
  const record = value as Partial<DiscoverSettings>;
  const updateInterval =
    typeof record.updateIntervalMinutes === "number"
      ? clampInteger(record.updateIntervalMinutes, 5, 24 * 60)
      : DEFAULT_SETTINGS.updateIntervalMinutes;
  const maxItems =
    typeof record.maxItemsPerFeed === "number"
      ? clampInteger(record.maxItemsPerFeed, 5, 100)
      : DEFAULT_SETTINGS.maxItemsPerFeed;
  return {
    allowExternalFetch: record.allowExternalFetch === true,
    updateIntervalMinutes: updateInterval,
    maxItemsPerFeed: maxItems,
  };
}

async function loadState(): Promise<DiscoverState> {
  const filePath = resolveDiscoverStatePath();
  try {
    const rawText = await fs.readFile(filePath, "utf8");
    const raw = JSON.parse(rawText) as Partial<DiscoverState>;
    const settings = normalizeSettings(raw.settings);
    return {
      version: DISCOVER_STATE_VERSION,
      settings,
      topics: normalizeTopics(raw.topics),
      sources: normalizeSources(raw.sources, settings),
      cachedItems: normalizeCachedItems(raw.cachedItems),
      feedback: normalizeFeedback(raw.feedback),
    };
  } catch {
    return buildDefaultState();
  }
}

function summarizeState(state: DiscoverState) {
  const enabledSourceCount = state.sources.filter((source) => source.enabled).length;
  const unhealthySourceCount = state.sources.filter(
    (source) => resolveSourceHealth(source) !== "healthy",
  ).length;
  return {
    sourceCount: state.sources.length,
    enabledSourceCount,
    topicCount: state.topics.length,
    unhealthySourceCount,
    cachedItemCount: state.cachedItems.length,
  };
}

function resolveSourceHealth(source: DiscoverSource): DiscoverSourceHealthStatus {
  if (source.failCount >= 3) {
    return "error";
  }
  if (source.failCount > 0) {
    return "warning";
  }
  return "healthy";
}

function buildSourceHealthSnapshot(state: DiscoverState): DiscoverSourceHealth[] {
  return state.sources
    .map((source) => ({
      sourceId: source.id,
      sourceName: source.name,
      enabled: source.enabled,
      status: resolveSourceHealth(source),
      failCount: source.failCount,
      lastError: source.lastError,
      lastFetchAt: source.lastFetchAt,
      nextFetchAt: source.nextFetchAt,
      reliabilityScore: source.reliabilityScore,
    }))
    .toSorted((a, b) => {
      if (a.status !== b.status) {
        const order: Record<DiscoverSourceHealthStatus, number> = {
          error: 0,
          warning: 1,
          healthy: 2,
        };
        return order[a.status] - order[b.status];
      }
      return b.reliabilityScore - a.reliabilityScore || a.sourceName.localeCompare(b.sourceName);
    });
}

function runSchedulerTick(state: DiscoverState): boolean {
  const now = nowIso();
  let changed = false;
  for (const source of state.sources) {
    if (!source.enabled) {
      continue;
    }
    if (source.lastFetchAt !== now) {
      source.lastFetchAt = now;
      source.nextFetchAt = addMinutesIso(now, state.settings.updateIntervalMinutes);
      changed = true;
    }
  }
  return changed;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripMarkup(value: string): string {
  return decodeXmlEntities(
    value
      .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function extractTagValue(block: string, tagName: string): string {
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "i");
  const matched = re.exec(block);
  return matched ? stripMarkup(matched[1] ?? "") : "";
}

function extractAtomHref(block: string): string {
  const matched = /<link\b[^>]*href=["']([^"']+)["'][^>]*>/i.exec(block);
  if (matched?.[1]) {
    return normalizeText(matched[1]);
  }
  return extractTagValue(block, "link");
}

function normalizePublishedAt(value: string): string {
  const parsed = Number(new Date(value));
  if (!Number.isFinite(parsed)) {
    return nowIso();
  }
  return new Date(parsed).toISOString();
}

function parseRssItems(xmlText: string): ParsedFeedItem[] {
  const blocks = Array.from(xmlText.matchAll(/<item\b[\s\S]*?<\/item>/gi)).map((match) => match[0]);
  return blocks.map((block) => ({
    title: extractTagValue(block, "title"),
    summary: extractTagValue(block, "description") || extractTagValue(block, "content:encoded"),
    url: extractTagValue(block, "link"),
    publishedAt: normalizePublishedAt(
      extractTagValue(block, "pubDate") || extractTagValue(block, "dc:date") || nowIso(),
    ),
  }));
}

function parseAtomItems(xmlText: string): ParsedFeedItem[] {
  const blocks = Array.from(xmlText.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)).map(
    (match) => match[0],
  );
  return blocks.map((block) => ({
    title: extractTagValue(block, "title"),
    summary: extractTagValue(block, "summary") || extractTagValue(block, "content"),
    url: extractAtomHref(block),
    publishedAt: normalizePublishedAt(
      extractTagValue(block, "published") || extractTagValue(block, "updated") || nowIso(),
    ),
  }));
}

function parseHtmlFallback(htmlText: string, baseUrl: string): ParsedFeedItem[] {
  const matches = Array.from(
    htmlText.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  );
  const seen = new Set<string>();
  const items: ParsedFeedItem[] = [];
  for (const match of matches) {
    const href = normalizeText(match[1] ?? "");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
      continue;
    }
    const title = stripMarkup(match[2] ?? "");
    if (title.length < 8) {
      continue;
    }
    let normalizedUrl = "";
    try {
      normalizedUrl = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(normalizedUrl)) {
      continue;
    }
    seen.add(normalizedUrl);
    items.push({
      title,
      summary: "",
      url: normalizedUrl,
      publishedAt: nowIso(),
    });
    if (items.length >= MAX_ITEMS_PER_SOURCE_FETCH) {
      break;
    }
  }
  return items;
}

function parseFeedItems(text: string, sourceUrl: string): ParsedFeedItem[] {
  const rss = parseRssItems(text)
    .filter((item) => item.title && item.url)
    .slice(0, MAX_ITEMS_PER_SOURCE_FETCH);
  if (rss.length > 0) {
    return rss;
  }
  const atom = parseAtomItems(text)
    .filter((item) => item.title && item.url)
    .slice(0, MAX_ITEMS_PER_SOURCE_FETCH);
  if (atom.length > 0) {
    return atom;
  }
  return parseHtmlFallback(text, sourceUrl);
}

function normalizeUrlForDisplay(value: string): string {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }
  try {
    return new URL(text).toString();
  } catch {
    return text;
  }
}

function normalizeUrlDedupKey(value: string): string {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }
  try {
    const url = new URL(text);
    url.hash = "";
    for (const [key] of url.searchParams.entries()) {
      const lowered = key.toLowerCase();
      if (
        lowered.startsWith("utm_") ||
        lowered === "gclid" ||
        lowered === "fbclid" ||
        lowered === "ref"
      ) {
        url.searchParams.delete(key);
      }
    }
    const search = url.searchParams.toString();
    return `${url.origin.toLowerCase()}${url.pathname}${search ? `?${search}` : ""}`;
  } catch {
    return text.toLowerCase();
  }
}

function normalizeTitleDedupKey(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function computeBackoffMinutes(failCount: number): number {
  if (failCount <= 1) {
    return 1;
  }
  if (failCount === 2) {
    return 5;
  }
  if (failCount === 3) {
    return 15;
  }
  return 60;
}

function isDueSource(source: DiscoverSource, forceSync: boolean): boolean {
  if (!source.enabled) {
    return false;
  }
  if (forceSync) {
    return true;
  }
  return Number(new Date(source.nextFetchAt)) <= Date.now();
}

async function runExternalFetchSync(
  state: DiscoverState,
  params: { forceSync: boolean },
): Promise<{
  syncedSources: number;
  failedSources: number;
  ingestedItems: number;
  changed: boolean;
}> {
  if (!state.settings.allowExternalFetch) {
    return { syncedSources: 0, failedSources: 0, ingestedItems: 0, changed: false };
  }

  const dueSources = state.sources.filter((source) => isDueSource(source, params.forceSync));
  if (dueSources.length === 0) {
    return { syncedSources: 0, failedSources: 0, ingestedItems: 0, changed: false };
  }

  let syncedSources = 0;
  let failedSources = 0;
  let ingestedItems = 0;
  let changed = false;
  const dedupeKeys = new Set<string>();
  const cacheItems: DiscoverCachedItem[] = [];

  for (const item of state.cachedItems) {
    const urlKey = normalizeUrlDedupKey(item.url);
    const titleKey = normalizeTitleDedupKey(item.title);
    dedupeKeys.add(`url:${urlKey}`);
    dedupeKeys.add(`title:${titleKey}`);
    cacheItems.push(item);
  }

  for (const source of dueSources) {
    const fetchAt = nowIso();
    try {
      const response = await fetchWithTimeout(
        source.url,
        {
          method: "GET",
          headers: {
            accept:
              "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, text/html;q=0.8",
          },
        },
        FETCH_TIMEOUT_MS,
      );
      if (!response.ok) {
        throw new Error(`fetch failed: HTTP ${response.status}`);
      }
      const raw = await response.text();
      const parsedItems = parseFeedItems(raw, source.url);
      if (parsedItems.length === 0) {
        throw new Error("feed parse returned no entries");
      }

      for (const parsed of parsedItems) {
        const normalizedUrl = normalizeUrlForDisplay(parsed.url);
        const urlKey = normalizeUrlDedupKey(normalizedUrl);
        const titleKey = normalizeTitleDedupKey(parsed.title);
        if (!normalizedUrl || !titleKey) {
          continue;
        }
        if (dedupeKeys.has(`url:${urlKey}`) || dedupeKeys.has(`title:${titleKey}`)) {
          continue;
        }
        dedupeKeys.add(`url:${urlKey}`);
        dedupeKeys.add(`title:${titleKey}`);

        const articleText = `${parsed.title} ${parsed.summary}`.toLowerCase();
        const matchedTopics = state.topics.filter((topic) =>
          articleText.includes(topic.toLowerCase()),
        );
        const id = `disc-${createHash("sha1")
          .update(`${source.id}|${urlKey}|${titleKey}`)
          .digest("hex")
          .slice(0, 18)}`;
        cacheItems.push({
          id,
          title: parsed.title,
          summary: parsed.summary,
          sourceId: source.id,
          sourceName: source.name,
          sourceType: source.type,
          url: normalizedUrl,
          publishedAt: normalizePublishedAt(parsed.publishedAt),
          tags: [...matchedTopics, source.type],
          fetchedAt: fetchAt,
        });
        ingestedItems += 1;
      }

      source.failCount = 0;
      source.lastError = undefined;
      source.lastFetchAt = fetchAt;
      source.nextFetchAt = addMinutesIso(fetchAt, state.settings.updateIntervalMinutes);
      source.updatedAt = fetchAt;
      syncedSources += 1;
      changed = true;
    } catch (error) {
      source.failCount = clampInteger(source.failCount + 1, 0, 1000);
      source.lastError = error instanceof Error ? error.message : "fetch failed";
      source.lastFetchAt = fetchAt;
      source.nextFetchAt = addMinutesIso(fetchAt, computeBackoffMinutes(source.failCount));
      source.updatedAt = fetchAt;
      failedSources += 1;
      changed = true;
    }
  }

  if (changed) {
    state.cachedItems = cacheItems
      .toSorted((a, b) => Number(new Date(b.publishedAt)) - Number(new Date(a.publishedAt)))
      .slice(0, MAX_CACHED_ITEMS);
  }

  return { syncedSources, failedSources, ingestedItems, changed };
}

function safeTopicSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

function buildFeedItems(
  state: DiscoverState,
  params: Record<string, unknown>,
): { items: DiscoverFeedItem[]; visibleCount: number } {
  const sourceIdFilter = normalizeText(params.sourceId);
  const topicFilter = normalizeText(params.topic);
  const requestedLimit =
    typeof params.limit === "number" ? params.limit : Number.parseInt(String(params.limit), 10);
  const defaultLimit = clampInteger(state.settings.maxItemsPerFeed, 5, 100);
  const limit = Number.isFinite(requestedLimit)
    ? clampInteger(requestedLimit, 1, defaultLimit)
    : defaultLimit;

  const enabledSources = state.sources.filter(
    (source) => source.enabled && (!sourceIdFilter || source.id === sourceIdFilter),
  );
  const enabledSourceIds = new Set(enabledSources.map((source) => source.id));

  const cached = state.cachedItems
    .filter((item) => enabledSourceIds.has(item.sourceId))
    .filter((item) => {
      if (!topicFilter) {
        return true;
      }
      const haystack = `${item.title} ${item.summary} ${(item.tags ?? []).join(" ")}`.toLowerCase();
      return haystack.includes(topicFilter.toLowerCase());
    })
    .filter((item) => !state.feedback[item.id]?.hidden)
    .map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      sourceId: item.sourceId,
      sourceName: item.sourceName,
      url: item.url,
      publishedAt: item.publishedAt,
      tags: item.tags,
      saved: state.feedback[item.id]?.saved,
    }))
    .toSorted((a, b) => Number(new Date(b.publishedAt)) - Number(new Date(a.publishedAt)));

  if (cached.length > 0) {
    return { items: cached.slice(0, limit), visibleCount: cached.length };
  }

  const topics = topicFilter ? [topicFilter] : state.topics;
  const feedItems: DiscoverFeedItem[] = [];
  let cursor = 0;
  const now = Date.now();

  for (const topic of topics) {
    for (const source of enabledSources) {
      const slug = safeTopicSlug(topic) || "topic";
      const id = `disc-${source.id}-${slug}`;
      const feedback = state.feedback[id];
      if (feedback?.hidden) {
        continue;
      }
      const publishedAt = new Date(now - cursor * 20 * 60 * 1000).toISOString();
      cursor += 1;
      feedItems.push({
        id,
        title: `${topic}：${source.name} 最新趋势`,
        summary: `围绕“${topic}”筛选了来自 ${source.name} 的高相关信息，建议优先关注行业变化、产品信号和关键主体动作。`,
        sourceId: source.id,
        sourceName: source.name,
        url: source.url,
        publishedAt,
        tags: [topic, source.type],
        saved: feedback?.saved,
      });
      if (feedItems.length >= limit) {
        return { items: feedItems, visibleCount: feedItems.length };
      }
    }
  }

  return { items: feedItems.slice(0, limit), visibleCount: feedItems.length };
}

function parseBooleanField(
  params: Record<string, unknown>,
  key: string,
): { ok: true; value: boolean } | { ok: false } | { ok: true; value: undefined } {
  if (!(key in params)) {
    return { ok: true, value: undefined };
  }
  if (typeof params[key] !== "boolean") {
    return { ok: false };
  }
  return { ok: true, value: params[key] };
}

function parseNumberField(
  params: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): { ok: true; value: number } | { ok: false } | { ok: true; value: undefined } {
  if (!(key in params)) {
    return { ok: true, value: undefined };
  }
  const raw = params[key];
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { ok: false };
  }
  return { ok: true, value: clampInteger(raw, min, max) };
}

function parseConflictStrategy(
  params: Record<string, unknown>,
): { ok: true; value: ImportConflictStrategy } | { ok: false } {
  const value = normalizeText(params.conflictStrategy);
  if (!value || value === "upsert") {
    return { ok: true, value: "upsert" };
  }
  if (value === "skip") {
    return { ok: true, value: "skip" };
  }
  return { ok: false };
}

function parseSnapshotMode(
  params: Record<string, unknown>,
): { ok: true; value: ImportSnapshotMode } | { ok: false } {
  const value = normalizeText(params.mode);
  if (!value || value === "replace") {
    return { ok: true, value: "replace" };
  }
  if (value === "merge") {
    return { ok: true, value: "merge" };
  }
  return { ok: false };
}

function escapeCsvField(value: string): string {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function normalizeSnapshotSources(value: unknown, settings: DiscoverSettings): DiscoverSource[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized: DiscoverSource[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const record = raw as Partial<DiscoverSource>;
    const id = normalizeText(record.id);
    const name = normalizeText(record.name);
    const url = normalizeText(record.url);
    if (!id || !name || !url) {
      continue;
    }
    const updatedAt = normalizeText(record.updatedAt) || nowIso();
    const lastFetchAt = normalizeText(record.lastFetchAt) || updatedAt;
    normalized.push({
      id,
      name,
      url,
      type: normalizeSourceType(record.type),
      enabled: record.enabled !== false,
      region: normalizeText(record.region) || "global",
      reliabilityScore: clampInteger(
        typeof record.reliabilityScore === "number" ? record.reliabilityScore : 70,
        0,
        100,
      ),
      updatedAt,
      lastFetchAt,
      nextFetchAt:
        normalizeText(record.nextFetchAt) ||
        addMinutesIso(lastFetchAt, settings.updateIntervalMinutes),
      failCount: clampInteger(typeof record.failCount === "number" ? record.failCount : 0, 0, 1000),
      lastError: normalizeText(record.lastError) || undefined,
    });
  }
  return normalized;
}

function prepareBulkImportItems(items: unknown[]): {
  prepared: PreparedImportSource[];
  skipped: number;
} {
  const prepared: PreparedImportSource[] = [];
  let skipped = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") {
      skipped += 1;
      continue;
    }
    const source = raw as Record<string, unknown>;
    const name = normalizeText(source.name);
    const url = normalizeText(source.url);
    if (!name || !url) {
      skipped += 1;
      continue;
    }
    prepared.push({
      id: normalizeText(source.id) || `discover-${randomUUID()}`,
      name,
      url,
      type: normalizeSourceType(source.type),
      enabled: source.enabled !== false,
      region: normalizeText(source.region) || "global",
      reliabilityScore: clampInteger(
        typeof source.reliabilityScore === "number" ? source.reliabilityScore : 70,
        0,
        100,
      ),
      lastFetchAt: normalizeText(source.lastFetchAt) || undefined,
      nextFetchAt: normalizeText(source.nextFetchAt) || undefined,
      failCount:
        typeof source.failCount === "number" ? clampInteger(source.failCount, 0, 1000) : undefined,
      lastError: normalizeText(source.lastError) || undefined,
    });
  }
  return { prepared, skipped };
}

export const discoverHandlers: GatewayRequestHandlers = {
  "discover.feed": async ({ params, respond }) => {
    const state = await loadState();
    const forceSync = parseBooleanField(params, "forceSync");
    if (!forceSync.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "discover.feed forceSync must be boolean"),
      );
      return;
    }

    const pipelineResult = state.settings.allowExternalFetch
      ? await runExternalFetchSync(state, { forceSync: forceSync.value === true })
      : { syncedSources: 0, failedSources: 0, ingestedItems: 0, changed: runSchedulerTick(state) };
    if (pipelineResult.changed) {
      await writeState(state);
    }

    const { items } = buildFeedItems(state, params);
    respond(
      true,
      {
        generatedAt: nowIso(),
        items,
        topics: state.topics,
        stats: summarizeState(state),
        pipeline: {
          mode: state.settings.allowExternalFetch ? "external" : "local-only",
          syncedSources: pipelineResult.syncedSources,
          failedSources: pipelineResult.failedSources,
          ingestedItems: pipelineResult.ingestedItems,
        },
      },
      undefined,
    );
  },

  "discover.settings.get": async ({ respond }) => {
    const state = await loadState();
    respond(
      true,
      {
        settings: state.settings,
        topics: state.topics,
        stats: summarizeState(state),
      },
      undefined,
    );
  },

  "discover.settings.set": async ({ params, respond }) => {
    const state = await loadState();
    const allowExternalFetch = parseBooleanField(params, "allowExternalFetch");
    const updateIntervalMinutes = parseNumberField(params, "updateIntervalMinutes", 5, 24 * 60);
    const maxItemsPerFeed = parseNumberField(params, "maxItemsPerFeed", 5, 100);

    if (!allowExternalFetch.ok || !updateIntervalMinutes.ok || !maxItemsPerFeed.ok) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "discover.settings.set payload is invalid"),
      );
      return;
    }

    if (allowExternalFetch.value !== undefined) {
      state.settings.allowExternalFetch = allowExternalFetch.value;
    }
    if (updateIntervalMinutes.value !== undefined) {
      state.settings.updateIntervalMinutes = updateIntervalMinutes.value;
      for (const source of state.sources) {
        source.nextFetchAt = addMinutesIso(
          source.lastFetchAt,
          state.settings.updateIntervalMinutes,
        );
      }
    }
    if (maxItemsPerFeed.value !== undefined) {
      state.settings.maxItemsPerFeed = maxItemsPerFeed.value;
    }

    await writeState(state);
    respond(
      true,
      {
        settings: state.settings,
        stats: summarizeState(state),
      },
      undefined,
    );
  },

  "discover.sources.list": async ({ params, respond }) => {
    const state = await loadState();
    const typeFilter = normalizeText(params.type);
    const enabledOnly = params.enabledOnly === true;
    const sources = state.sources
      .filter((source) => {
        if (typeFilter && source.type !== typeFilter) {
          return false;
        }
        if (enabledOnly && !source.enabled) {
          return false;
        }
        return true;
      })
      .toSorted((a, b) => b.reliabilityScore - a.reliabilityScore || a.name.localeCompare(b.name));
    respond(
      true,
      {
        sources,
        stats: summarizeState(state),
      },
      undefined,
    );
  },

  "discover.sources.health": async ({ respond }) => {
    const state = await loadState();
    respond(
      true,
      {
        generatedAt: nowIso(),
        sources: buildSourceHealthSnapshot(state),
        stats: summarizeState(state),
      },
      undefined,
    );
  },

  "discover.sources.bulkImportPreview": async ({ params, respond }) => {
    const items = Array.isArray(params.items) ? params.items : null;
    if (!items || items.length === 0) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "discover.sources.bulkImportPreview requires non-empty items",
        ),
      );
      return;
    }
    const conflictStrategy = parseConflictStrategy(params);
    if (!conflictStrategy.ok) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "discover.sources.bulkImportPreview conflictStrategy must be upsert|skip",
        ),
      );
      return;
    }
    const state = await loadState();
    const { prepared, skipped } = prepareBulkImportItems(items);
    let added = 0;
    let updated = 0;
    let conflictSkipped = 0;
    for (const source of prepared) {
      const existing = state.sources.find(
        (entry) => entry.id === source.id || entry.url === source.url,
      );
      if (existing) {
        if (conflictStrategy.value === "skip") {
          conflictSkipped += 1;
        } else {
          updated += 1;
        }
      } else {
        added += 1;
      }
    }
    respond(
      true,
      {
        conflictStrategy: conflictStrategy.value,
        totalInput: items.length,
        valid: prepared.length,
        added,
        updated,
        skipped: skipped + conflictSkipped,
        stats: summarizeState(state),
      },
      undefined,
    );
  },

  "discover.sources.export": async ({ respond }) => {
    const state = await loadState();
    const snapshot = {
      version: 1,
      exportedAt: nowIso(),
      sourceCount: state.sources.length,
      sources: state.sources,
    };
    respond(
      true,
      {
        format: "json",
        totalSources: state.sources.length,
        generatedAt: snapshot.exportedAt,
        content: JSON.stringify(snapshot, null, 2),
      },
      undefined,
    );
  },

  "discover.sources.importSnapshot": async ({ params, respond }) => {
    const mode = parseSnapshotMode(params);
    if (!mode.ok) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "discover.sources.importSnapshot mode must be replace|merge",
        ),
      );
      return;
    }

    let payload: unknown = params.snapshot;
    const content = normalizeText(params.content);
    if (!payload && content) {
      try {
        payload = JSON.parse(content);
      } catch {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "discover.sources.importSnapshot content is not valid json",
          ),
        );
        return;
      }
    }
    if (!payload || typeof payload !== "object") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "discover.sources.importSnapshot requires snapshot object or content",
        ),
      );
      return;
    }

    const snapshot = payload as Record<string, unknown>;
    const state = await loadState();
    const normalizedSources = normalizeSnapshotSources(snapshot.sources, state.settings);
    if (normalizedSources.length === 0) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "discover.sources.importSnapshot snapshot.sources must contain valid sources",
        ),
      );
      return;
    }

    if (mode.value === "replace") {
      state.sources = normalizedSources;
      await writeState(state);
      respond(
        true,
        {
          mode: mode.value,
          imported: normalizedSources.length,
          total: state.sources.length,
          stats: summarizeState(state),
        },
        undefined,
      );
      return;
    }

    let imported = 0;
    let updated = 0;
    const now = nowIso();
    for (const source of normalizedSources) {
      const existing = state.sources.find(
        (entry) => entry.id === source.id || entry.url === source.url,
      );
      if (existing) {
        existing.name = source.name;
        existing.url = source.url;
        existing.type = source.type;
        existing.enabled = source.enabled;
        existing.region = source.region;
        existing.reliabilityScore = source.reliabilityScore;
        existing.updatedAt = now;
        existing.lastFetchAt = source.lastFetchAt;
        existing.nextFetchAt = source.nextFetchAt;
        existing.failCount = source.failCount;
        existing.lastError = source.lastError;
        updated += 1;
      } else {
        state.sources.push({
          ...source,
          updatedAt: now,
        });
        imported += 1;
      }
    }
    await writeState(state);
    respond(
      true,
      {
        mode: mode.value,
        imported,
        updated,
        total: state.sources.length,
        stats: summarizeState(state),
      },
      undefined,
    );
  },

  "discover.sources.failedExport": async ({ params, respond }) => {
    const format = normalizeText(params.format) || "csv";
    if (format !== "csv" && format !== "json") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "discover.sources.failedExport format must be csv|json",
        ),
      );
      return;
    }
    const state = await loadState();
    const failedSources = state.sources
      .filter((source) => source.failCount > 0 || normalizeText(source.lastError))
      .toSorted((a, b) => b.failCount - a.failCount || a.name.localeCompare(b.name));

    if (format === "json") {
      respond(
        true,
        {
          format,
          totalFailed: failedSources.length,
          generatedAt: nowIso(),
          items: failedSources.map((source) => ({
            sourceId: source.id,
            sourceName: source.name,
            failCount: source.failCount,
            lastError: source.lastError ?? "",
            lastFetchAt: source.lastFetchAt,
            nextFetchAt: source.nextFetchAt,
            enabled: source.enabled,
          })),
        },
        undefined,
      );
      return;
    }

    const lines = [
      "sourceId,sourceName,enabled,failCount,lastError,lastFetchAt,nextFetchAt,url",
      ...failedSources.map((source) =>
        [
          source.id,
          source.name,
          source.enabled ? "true" : "false",
          String(source.failCount),
          source.lastError ?? "",
          source.lastFetchAt,
          source.nextFetchAt,
          source.url,
        ]
          .map((value) => escapeCsvField(value))
          .join(","),
      ),
    ];
    respond(
      true,
      {
        format,
        totalFailed: failedSources.length,
        generatedAt: nowIso(),
        content: lines.join("\n"),
      },
      undefined,
    );
  },

  "discover.sources.bulkImport": async ({ params, respond }) => {
    const items = Array.isArray(params.items) ? params.items : null;
    if (!items || items.length === 0) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "discover.sources.bulkImport requires non-empty items",
        ),
      );
      return;
    }
    const conflictStrategy = parseConflictStrategy(params);
    if (!conflictStrategy.ok) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "discover.sources.bulkImport conflictStrategy must be upsert|skip",
        ),
      );
      return;
    }

    const state = await loadState();
    const { prepared, skipped } = prepareBulkImportItems(items);
    let imported = 0;
    let updated = 0;
    let conflictSkipped = 0;
    const now = nowIso();

    for (const source of prepared) {
      const existing = state.sources.find(
        (entry) => entry.id === source.id || entry.url === source.url,
      );
      if (existing) {
        if (conflictStrategy.value === "skip") {
          conflictSkipped += 1;
          continue;
        }
        existing.name = source.name;
        existing.url = source.url;
        existing.type = normalizeSourceType(source.type);
        existing.enabled = source.enabled;
        existing.region = source.region || existing.region || "global";
        existing.reliabilityScore = clampInteger(
          typeof source.reliabilityScore === "number"
            ? source.reliabilityScore
            : existing.reliabilityScore,
          0,
          100,
        );
        existing.updatedAt = now;
        existing.lastFetchAt = source.lastFetchAt || existing.lastFetchAt || now;
        existing.nextFetchAt =
          source.nextFetchAt ||
          addMinutesIso(existing.lastFetchAt, state.settings.updateIntervalMinutes);
        existing.failCount = clampInteger(
          typeof source.failCount === "number" ? source.failCount : existing.failCount,
          0,
          1000,
        );
        existing.lastError = source.lastError || existing.lastError;
        updated += 1;
      } else {
        const initialFetchAt = source.lastFetchAt || now;
        state.sources.push({
          id: source.id,
          name: source.name,
          url: source.url,
          type: normalizeSourceType(source.type),
          enabled: source.enabled,
          region: source.region || "global",
          reliabilityScore: clampInteger(
            typeof source.reliabilityScore === "number" ? source.reliabilityScore : 70,
            0,
            100,
          ),
          updatedAt: now,
          lastFetchAt: initialFetchAt,
          nextFetchAt:
            source.nextFetchAt ||
            addMinutesIso(initialFetchAt, state.settings.updateIntervalMinutes),
          failCount: clampInteger(
            typeof source.failCount === "number" ? source.failCount : 0,
            0,
            1000,
          ),
          lastError: source.lastError || undefined,
        });
        imported += 1;
      }
    }

    await writeState(state);
    respond(
      true,
      {
        conflictStrategy: conflictStrategy.value,
        imported,
        updated,
        skipped: skipped + conflictSkipped,
        total: state.sources.length,
        stats: summarizeState(state),
      },
      undefined,
    );
  },

  "discover.act": async ({ params, respond }) => {
    const action = normalizeText(params.action);
    if (!action) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "action is required"));
      return;
    }

    const state = await loadState();
    if (action === "topic.subscribe") {
      const topic = normalizeText(params.topic);
      if (!topic) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "topic is required"));
        return;
      }
      if (!state.topics.includes(topic)) {
        state.topics.push(topic);
      }
      await writeState(state);
      respond(true, { topics: state.topics, stats: summarizeState(state) }, undefined);
      return;
    }

    if (action === "topic.unsubscribe") {
      const topic = normalizeText(params.topic);
      if (!topic) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "topic is required"));
        return;
      }
      state.topics = state.topics.filter((entry) => entry !== topic);
      if (state.topics.length === 0) {
        state.topics = [...DEFAULT_TOPICS];
      }
      await writeState(state);
      respond(true, { topics: state.topics, stats: summarizeState(state) }, undefined);
      return;
    }

    if (action === "source.toggle") {
      const sourceId = normalizeText(params.sourceId);
      if (!sourceId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sourceId is required"));
        return;
      }
      const source = state.sources.find((entry) => entry.id === sourceId);
      if (!source) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "source not found"));
        return;
      }
      if ("enabled" in params && typeof params.enabled !== "boolean") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "enabled must be boolean"),
        );
        return;
      }
      source.enabled = typeof params.enabled === "boolean" ? params.enabled : !source.enabled;
      source.updatedAt = nowIso();
      if (source.enabled) {
        source.lastFetchAt = nowIso();
        source.nextFetchAt = addMinutesIso(
          source.lastFetchAt,
          state.settings.updateIntervalMinutes,
        );
      }
      await writeState(state);
      respond(true, { source, stats: summarizeState(state) }, undefined);
      return;
    }

    if (action === "source.batchToggle") {
      if (typeof params.enabled !== "boolean") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "enabled must be boolean"),
        );
        return;
      }
      const sourceIds = Array.isArray(params.sourceIds)
        ? params.sourceIds.map((item) => normalizeText(item)).filter(Boolean)
        : [];
      const sourceIdSet = sourceIds.length > 0 ? new Set(sourceIds) : null;
      const now = nowIso();
      let matchedCount = 0;
      let updatedCount = 0;
      for (const source of state.sources) {
        if (sourceIdSet && !sourceIdSet.has(source.id)) {
          continue;
        }
        matchedCount += 1;
        if (source.enabled === params.enabled) {
          continue;
        }
        source.enabled = params.enabled;
        source.updatedAt = now;
        if (source.enabled) {
          source.lastFetchAt = now;
          source.nextFetchAt = addMinutesIso(now, state.settings.updateIntervalMinutes);
        }
        updatedCount += 1;
      }
      await writeState(state);
      respond(
        true,
        {
          enabled: params.enabled,
          matchedCount,
          updatedCount,
          stats: summarizeState(state),
        },
        undefined,
      );
      return;
    }

    respond(
      false,
      undefined,
      errorShape(
        ErrorCodes.INVALID_REQUEST,
        "unsupported action, expected topic.subscribe | topic.unsubscribe | source.toggle | source.batchToggle",
      ),
    );
  },

  "discover.feedback": async ({ params, respond }) => {
    const itemId = normalizeText(params.itemId);
    const action = normalizeText(params.action);
    if (!itemId || !action) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "itemId and action are required"),
      );
      return;
    }

    const state = await loadState();
    const current = state.feedback[itemId] ?? {
      saved: false,
      hidden: false,
      updatedAt: nowIso(),
    };

    switch (action) {
      case "save":
        current.saved = true;
        break;
      case "unsave":
        current.saved = false;
        break;
      case "hide":
        current.hidden = true;
        break;
      case "unhide":
        current.hidden = false;
        break;
      case "not_interested":
        current.hidden = true;
        current.reason = normalizeText(params.reason) || "not_interested";
        break;
      default:
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "unsupported action, expected save | unsave | hide | unhide | not_interested",
          ),
        );
        return;
    }

    current.updatedAt = nowIso();
    if (!current.saved && !current.hidden && !current.reason) {
      delete state.feedback[itemId];
    } else {
      state.feedback[itemId] = current;
    }

    await writeState(state);
    respond(true, { itemId, feedback: state.feedback[itemId] ?? null }, undefined);
  },
};
