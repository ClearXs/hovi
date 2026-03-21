import { isTauriRuntime } from "@/lib/runtime/desktop-env";
import { invokeTauriCommand } from "@/lib/tauri/invoke";

export type McpSoItem = {
  name: string;
  title: string;
  description?: string;
  authorName?: string;
  repoUrl?: string;
  serverPageUrl?: string;
};

export type McpSoSearchResult = {
  items: McpSoItem[];
  page: number;
  totalPages?: number;
  hasMore: boolean;
};

export type McpSoDetailItem = {
  title: string;
  description?: string;
  summary?: string;
  content?: string;
  serverConfigText?: string;
  authorName?: string;
  repoUrl?: string;
  serverPageUrl?: string;
};

export type McpSoImportResult = {
  name: string;
  description?: string;
  config: Record<string, unknown>;
};

function decodeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

function normalizeUrl(url: string): string {
  return url.trim();
}

function extractNearbyField(source: string, key: string): string | undefined {
  const plainRegex = new RegExp(`"${key}":"((?:\\\\.|[^"\\\\])*)"`);
  const escapedRegex = new RegExp(`\\\\"${key}\\\\":\\\\"((?:\\\\\\\\.|[^"\\\\])*)\\\\"`);
  const match = source.match(plainRegex) ?? source.match(escapedRegex);
  if (!match?.[1]) {
    return undefined;
  }

  const decoded = decodeJsonString(match[1]).trim();
  return decoded || undefined;
}

function uniqueByUrl(items: McpSoItem[]): McpSoItem[] {
  const seen = new Set<string>();
  const out: McpSoItem[] = [];

  for (const item of items) {
    const key = item.serverPageUrl || `${item.name}:${item.repoUrl || ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }

  return out;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "OpenClaw-MCP-Client/1.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`请求失败 (${response.status})`);
  }

  return response.text();
}

function decodeTokenText(value: string): string {
  return value
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\u0026/g, "&")
    .replace(/\\r/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .trim();
}

function extractTokenText(html: string, ref: string): string | undefined {
  const regex = new RegExp(`${ref}:T[0-9a-f]+,([\\s\\S]*?)(?=\\n[0-9a-z]+:|<\\/script>|<)`);
  const match = html.match(regex);
  if (!match?.[1]) {
    return undefined;
  }

  return decodeTokenText(match[1]);
}

function buildServerConfigText(html: string): string | undefined {
  const raw = extractNearbyField(html, "server_config");
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function buildCustomMcpConfig(html: string): Record<string, unknown> {
  const serverConfigRaw = extractNearbyField(html, "server_config");
  if (serverConfigRaw) {
    const parsed = tryParseJson(serverConfigRaw);
    if (parsed && typeof parsed === "object") {
      const mcpServers = (parsed as { mcpServers?: Record<string, unknown> }).mcpServers;
      if (mcpServers && typeof mcpServers === "object") {
        const first = Object.values(mcpServers)[0];
        if (first && typeof first === "object") {
          const cfg = first as Record<string, unknown>;
          const transport = typeof cfg.type === "string" ? cfg.type.toLowerCase() : undefined;
          const config: Record<string, unknown> = {};

          if (transport === "sse" || transport === "http" || transport === "websocket") {
            config.transport = transport;
            if (typeof cfg.url === "string" && cfg.url.trim()) {
              config.serverUrl = cfg.url.trim();
            }
            if (cfg.headers && typeof cfg.headers === "object") {
              config.headers = cfg.headers;
            }
            return config;
          }

          if (typeof cfg.command === "string" && cfg.command.trim()) {
            config.transport = "stdio";
            config.command = cfg.command.trim();
            if (Array.isArray(cfg.args)) {
              config.args = cfg.args;
            }
            if (cfg.env && typeof cfg.env === "object") {
              config.env = cfg.env;
            }
            return config;
          }
        }
      }
    }
  }

  const serverCommand = extractNearbyField(html, "server_command");
  const serverParamsRaw = extractNearbyField(html, "server_params");
  const config: Record<string, unknown> = {};
  if (serverCommand) {
    config.transport = "stdio";
    config.command = serverCommand;
  }
  if (serverParamsRaw) {
    const params = tryParseJson(serverParamsRaw);
    if (params && typeof params === "object") {
      config.env = params;
    }
  }
  return config;
}

function assertMcpSoServerPage(url: string): URL {
  const parsed = new URL(normalizeUrl(url));
  if (parsed.hostname !== "mcp.so" || !parsed.pathname.startsWith("/server/")) {
    throw new Error("url must be a mcp.so server page");
  }
  return parsed;
}

function parseSearchHtml(
  html: string,
  query: string,
  limit: number,
  page: number,
): McpSoSearchResult {
  const serverPageByName = new Map<string, string>();
  const pagePathRegex = /\/server\/([^"\/<]+)\/([^"\/<]+)/g;
  let pagePathMatch: RegExpExecArray | null;
  while ((pagePathMatch = pagePathRegex.exec(html)) !== null) {
    const slug = decodeURIComponent(pagePathMatch[1]);
    const author = decodeURIComponent(pagePathMatch[2]);
    if (!serverPageByName.has(slug)) {
      serverPageByName.set(slug, `https://mcp.so/server/${slug}/${author}`);
    }
  }

  const parsed: McpSoItem[] = [];
  const plainEntryRegex =
    /"name":"((?:\\.|[^"\\])*)","title":"((?:\\.|[^"\\])*)","description":"((?:\\.|[^"\\])*)"/g;
  const escapedEntryRegex =
    /\\"name\\":\\"((?:\\\\.|[^"\\])*)\\",\\"title\\":\\"((?:\\\\.|[^"\\])*)\\",\\"description\\":\\"((?:\\\\.|[^"\\])*)\\"/g;

  const collectEntries = (regex: RegExp, unescapeSlash: boolean) => {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      const rawName = unescapeSlash ? match[1].replace(/\\\\/g, "\\") : match[1];
      const rawTitle = unescapeSlash ? match[2].replace(/\\\\/g, "\\") : match[2];
      const rawDesc = unescapeSlash ? match[3].replace(/\\\\/g, "\\") : match[3];
      const name = decodeJsonString(rawName).trim();
      const title = decodeJsonString(rawTitle).trim();
      const description = decodeJsonString(rawDesc).trim();
      if (!name || !title) {
        continue;
      }

      const nearby = html.slice(match.index, Math.min(match.index + 4500, html.length));
      const authorName = extractNearbyField(nearby, "author_name");
      const repoUrl = extractNearbyField(nearby, "url");
      const serverPageUrl =
        serverPageByName.get(name) ||
        (authorName
          ? `https://mcp.so/server/${encodeURIComponent(name)}/${encodeURIComponent(authorName)}`
          : undefined);

      parsed.push({
        name,
        title,
        description: description || undefined,
        authorName,
        repoUrl,
        serverPageUrl,
      });
    }
  };

  collectEntries(plainEntryRegex, false);
  if (parsed.length < 10) {
    collectEntries(escapedEntryRegex, true);
  }

  const fallbackItems: McpSoItem[] =
    parsed.length === 0
      ? Array.from(serverPageByName.entries()).map(([name, serverPageUrl]) => ({
          name,
          title: name,
          serverPageUrl,
        }))
      : parsed;

  const normalizedQuery = query.toLowerCase();
  const filtered = normalizedQuery
    ? fallbackItems.filter((item) => {
        return (
          item.name.toLowerCase().includes(normalizedQuery) ||
          item.title.toLowerCase().includes(normalizedQuery) ||
          item.description?.toLowerCase().includes(normalizedQuery) ||
          item.authorName?.toLowerCase().includes(normalizedQuery)
        );
      })
    : fallbackItems;

  const items = uniqueByUrl(filtered)
    .slice(0, limit)
    .map((item) => ({
      ...item,
      description: item.description?.trim() || undefined,
    }));

  const totalPagesMatch =
    html.match(/"totalPages":\s*(\d+)/) ?? html.match(/\\?"totalPages\\?":\s*(\d+)/);
  const totalPages = totalPagesMatch ? Number(totalPagesMatch[1]) : undefined;
  const hasMore =
    typeof totalPages === "number"
      ? page < totalPages
      : items.length >= Math.max(20, Math.floor(limit * 0.5));

  return { items, page, totalPages, hasMore };
}

function parseDetailHtml(html: string, url: string): McpSoDetailItem {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const metaDescMatch = html.match(/<meta name="description" content="([^"]*)"/i);
  const summaryRef =
    html.match(/"summary":"\$([0-9a-z]+)"/)?.[1] ??
    html.match(/\\"summary\\":\\"\$([0-9a-z]+)\\"/)?.[1];
  const contentRef =
    html.match(/"content":"\$([0-9a-z]+)"/)?.[1] ??
    html.match(/\\"content\\":\\"\$([0-9a-z]+)\\"/)?.[1];

  return {
    title: titleMatch?.[1]?.replace(/\s*MCP Server\s*$/i, "").trim() || "MCP",
    description: decodeJsonString(metaDescMatch?.[1] ?? "").trim() || undefined,
    summary: summaryRef ? extractTokenText(html, summaryRef) : undefined,
    content: contentRef ? extractTokenText(html, contentRef) : undefined,
    serverConfigText: buildServerConfigText(html),
    authorName: extractNearbyField(html, "author_name"),
    repoUrl: extractNearbyField(html, "url"),
    serverPageUrl: url,
  };
}

function parseImportHtml(html: string, url: string): McpSoImportResult {
  const parsedUrl = new URL(url);
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const metaDescMatch = html.match(/<meta name="description" content="([^"]*)"/i);
  return {
    name:
      titleMatch?.[1]?.replace(/\s*MCP Server\s*$/i, "").trim() ||
      extractNearbyField(html, "title") ||
      extractNearbyField(html, "name") ||
      parsedUrl.pathname.split("/").filter(Boolean)[1] ||
      "Imported MCP",
    description:
      decodeJsonString(metaDescMatch?.[1] ?? "").trim() ||
      extractNearbyField(html, "description") ||
      undefined,
    config: buildCustomMcpConfig(html),
  };
}

export async function searchMcpSo(options?: {
  query?: string;
  limit?: number;
  page?: number;
}): Promise<McpSoSearchResult> {
  const query = options?.query?.trim() ?? "";
  const limit = options?.limit ?? 30;
  const page = options?.page ?? 1;

  if (isTauriRuntime()) {
    try {
      return await invokeTauriCommand<McpSoSearchResult>("mcpso_search", { query, limit, page });
    } catch {
      // Fallback for environments where desktop bridge is not wired yet.
    }
  }

  const url = new URL("https://mcp.so/servers");
  if (query) {
    url.searchParams.set("q", query);
  }
  if (page > 1) {
    url.searchParams.set("page", String(page));
  }

  const html = await fetchText(url.toString());
  return parseSearchHtml(html, query, limit, page);
}

export async function getMcpSoDetail(url: string): Promise<McpSoDetailItem> {
  const parsed = assertMcpSoServerPage(url);

  if (isTauriRuntime()) {
    try {
      return await invokeTauriCommand<McpSoDetailItem>("mcpso_detail", {
        url: parsed.toString(),
      });
    } catch {
      // Fallback for environments where desktop bridge is not wired yet.
    }
  }

  const html = await fetchText(parsed.toString());
  return parseDetailHtml(html, parsed.toString());
}

export async function importMcpSo(url: string): Promise<McpSoImportResult> {
  const parsed = assertMcpSoServerPage(url);

  if (isTauriRuntime()) {
    try {
      return await invokeTauriCommand<McpSoImportResult>("mcpso_import", {
        url: parsed.toString(),
      });
    } catch {
      // Fallback for environments where desktop bridge is not wired yet.
    }
  }

  const html = await fetchText(parsed.toString());
  return parseImportHtml(html, parsed.toString());
}
