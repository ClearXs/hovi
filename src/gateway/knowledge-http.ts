import fs from "node:fs";
import fsPromises from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import busboy from "busboy";
import {
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../agents/agent-scope.js";
import { loadConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { KnowledgeManager } from "../memory/knowledge-manager.js";
import type {
  KnowledgeBaseTagInput,
  UpdateKnowledgeSettingsParams,
} from "../memory/knowledge-manager.js";
import type { KnowledgeBaseRuntimeSettings } from "../memory/knowledge-schema.js";
import { requireNodeSqlite } from "../memory/sqlite.js";
import { AuthRateLimiter } from "./auth-rate-limit.ts";
import { authorizeGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import {
  readJsonBodyOrError,
  sendInvalidRequest,
  sendJson,
  sendMethodNotAllowed,
  sendUnauthorized,
} from "./http-common.js";
import { getBearerToken, resolveAgentIdFromHeader } from "./http-utils.js";
import { formatError } from "./server-utils.js";

type KnowledgeHttpOptions = {
  auth: ResolvedGatewayAuth;
  trustedProxies?: string[];
  rateLimiter?: AuthRateLimiter;
};

const DEFAULT_BODY_BYTES = 512 * 1024;
const log = createSubsystemLogger("knowledge-http");

// Shared database instance
const dbByAgent = new Map<string, DatabaseSync>();

function getDatabase(agentId: string): DatabaseSync {
  const existing = dbByAgent.get(agentId);
  if (existing) {
    return existing;
  }
  const { DatabaseSync: DB } = requireNodeSqlite();
  const cfg = loadConfig();
  const agentDir = resolveAgentDir(cfg, agentId);
  const dbPath = `${agentDir}/memory.db`;
  try {
    fs.mkdirSync(agentDir, { recursive: true });
  } catch (err) {
    log.error(`failed to ensure agent dir ${agentDir}: ${formatError(err)}`);
    throw err;
  }
  let db: DatabaseSync;
  try {
    db = new DB(dbPath);
  } catch (err) {
    log.error(`failed to open knowledge db at ${dbPath}: ${formatError(err)}`);
    throw err;
  }
  dbByAgent.set(agentId, db);
  return db;
}

function getKnowledgeManager(agentId: string): KnowledgeManager {
  const cfg = loadConfig();
  const db = getDatabase(agentId);
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  return new KnowledgeManager({ cfg, db, baseDir: workspaceDir, agentId });
}

function parseTags(params: URLSearchParams, fallback?: string): string[] | undefined {
  const raw = params.getAll("tags");
  const merged = raw.length > 0 ? raw.join(",") : (fallback ?? "");
  const tags = merged
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}

function parseListParams(params: URLSearchParams, key: string): string[] | undefined {
  const raw = params.getAll(key);
  const merged = raw.length > 0 ? raw.join(",") : "";
  const values = merged
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

function parseLimit(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseRangeHeader(
  rangeHeader: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!rangeHeader) {
    return null;
  }
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    return null;
  }
  const startRaw = match[1];
  const endRaw = match[2];
  const start = startRaw ? Number.parseInt(startRaw, 10) : 0;
  const end = endRaw ? Number.parseInt(endRaw, 10) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return null;
  }
  return {
    start: Math.max(0, start),
    end: Math.min(size - 1, end),
  };
}

function parseNumberParam(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBaseSettings(value: unknown): Partial<KnowledgeBaseRuntimeSettings> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const settings: Partial<KnowledgeBaseRuntimeSettings> = {};
  if (raw.vectorization && typeof raw.vectorization === "object") {
    const vectorization = raw.vectorization as Record<string, unknown>;
    settings.vectorization = {
      enabled: typeof vectorization.enabled === "boolean" ? vectorization.enabled : undefined,
    } as Partial<KnowledgeBaseRuntimeSettings["vectorization"]>;
  }
  if (raw.chunk && typeof raw.chunk === "object") {
    const chunk = raw.chunk as Record<string, unknown>;
    settings.chunk = {
      enabled: typeof chunk.enabled === "boolean" ? chunk.enabled : undefined,
      size: typeof chunk.size === "number" ? chunk.size : undefined,
      overlap: typeof chunk.overlap === "number" ? chunk.overlap : undefined,
      separator:
        chunk.separator === "auto" ||
        chunk.separator === "paragraph" ||
        chunk.separator === "sentence"
          ? chunk.separator
          : undefined,
    } as Partial<KnowledgeBaseRuntimeSettings["chunk"]>;
  }
  if (raw.retrieval && typeof raw.retrieval === "object") {
    const retrieval = raw.retrieval as Record<string, unknown>;
    settings.retrieval = {
      mode:
        retrieval.mode === "semantic" || retrieval.mode === "keyword" || retrieval.mode === "hybrid"
          ? retrieval.mode
          : undefined,
      topK: typeof retrieval.topK === "number" ? retrieval.topK : undefined,
      minScore: typeof retrieval.minScore === "number" ? retrieval.minScore : undefined,
      hybridAlpha: typeof retrieval.hybridAlpha === "number" ? retrieval.hybridAlpha : undefined,
    } as Partial<KnowledgeBaseRuntimeSettings["retrieval"]>;
  }
  if (raw.index && typeof raw.index === "object") {
    const index = raw.index as Record<string, unknown>;
    settings.index = {
      mode: index.mode === "high_quality" || index.mode === "balanced" ? index.mode : undefined,
    } as Partial<KnowledgeBaseRuntimeSettings["index"]>;
  }
  if (raw.graph && typeof raw.graph === "object") {
    const graph = raw.graph as Record<string, unknown>;
    settings.graph = {
      enabled: typeof graph.enabled === "boolean" ? graph.enabled : undefined,
    } as Partial<KnowledgeBaseRuntimeSettings["graph"]>;
  }
  return settings;
}

function parseBaseTags(value: unknown): KnowledgeBaseTagInput[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const tags = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const row = item as Record<string, unknown>;
      if (typeof row.name !== "string") {
        return null;
      }
      return {
        name: row.name,
        color: typeof row.color === "string" ? row.color : undefined,
      };
    })
    .filter(Boolean) as KnowledgeBaseTagInput[];
  return tags.length ? tags : [];
}

function parseSettingsUpdate(value: unknown): UpdateKnowledgeSettingsParams {
  if (!value || typeof value !== "object") {
    throw new Error("settings payload must be an object");
  }
  const raw = value as Record<string, unknown>;
  const next: {
    vectorization?: {
      enabled?: boolean;
      provider?: "openai" | "gemini" | "local" | "auto";
      model?: string;
    };
    graph?: {
      enabled?: boolean;
      extractor?: "llm";
      provider?: string;
      model?: string;
      minTriples?: number;
      maxTriples?: number;
      triplesPerKTokens?: number;
      maxDepth?: number;
    };
  } = {};

  if (raw.vectorization !== undefined) {
    if (!raw.vectorization || typeof raw.vectorization !== "object") {
      throw new Error("vectorization must be an object");
    }
    const vector = raw.vectorization as Record<string, unknown>;
    const parsedVector: NonNullable<typeof next.vectorization> = {};
    if (vector.enabled !== undefined) {
      if (typeof vector.enabled !== "boolean") {
        throw new Error("vectorization.enabled must be a boolean");
      }
      parsedVector.enabled = vector.enabled;
    }
    if (vector.provider !== undefined) {
      if (
        vector.provider !== "openai" &&
        vector.provider !== "gemini" &&
        vector.provider !== "local" &&
        vector.provider !== "auto"
      ) {
        throw new Error("vectorization.provider is invalid");
      }
      parsedVector.provider = vector.provider;
    }
    if (vector.model !== undefined) {
      if (typeof vector.model !== "string") {
        throw new Error("vectorization.model must be a string");
      }
      parsedVector.model = vector.model;
    }
    next.vectorization = parsedVector;
  }

  if (raw.graph !== undefined) {
    if (!raw.graph || typeof raw.graph !== "object") {
      throw new Error("graph must be an object");
    }
    const graph = raw.graph as Record<string, unknown>;
    const parsedGraph: NonNullable<typeof next.graph> = {};
    if (graph.enabled !== undefined) {
      if (typeof graph.enabled !== "boolean") {
        throw new Error("graph.enabled must be a boolean");
      }
      parsedGraph.enabled = graph.enabled;
    }
    if (graph.extractor !== undefined) {
      if (graph.extractor !== "llm") {
        throw new Error("graph.extractor is invalid, only 'llm' is supported");
      }
      parsedGraph.extractor = "llm";
    }
    if (graph.provider !== undefined) {
      if (typeof graph.provider !== "string") {
        throw new Error("graph.provider must be a string");
      }
      parsedGraph.provider = graph.provider;
    }
    if (graph.model !== undefined) {
      if (typeof graph.model !== "string") {
        throw new Error("graph.model must be a string");
      }
      parsedGraph.model = graph.model;
    }
    if (graph.minTriples !== undefined) {
      if (typeof graph.minTriples !== "number") {
        throw new Error("graph.minTriples must be a number");
      }
      parsedGraph.minTriples = graph.minTriples;
    }
    if (graph.maxTriples !== undefined) {
      if (typeof graph.maxTriples !== "number") {
        throw new Error("graph.maxTriples must be a number");
      }
      parsedGraph.maxTriples = graph.maxTriples;
    }
    if (graph.triplesPerKTokens !== undefined) {
      if (typeof graph.triplesPerKTokens !== "number") {
        throw new Error("graph.triplesPerKTokens must be a number");
      }
      parsedGraph.triplesPerKTokens = graph.triplesPerKTokens;
    }
    if (graph.maxDepth !== undefined) {
      if (typeof graph.maxDepth !== "number") {
        throw new Error("graph.maxDepth must be a number");
      }
      parsedGraph.maxDepth = graph.maxDepth;
    }
    next.graph = parsedGraph;
  }

  return next;
}

/**
 * Parse multipart form data for file upload
 */
function parseMultipartUpload(
  req: IncomingMessage,
  maxFileSize: number,
): Promise<{
  filename: string;
  buffer: Buffer;
  mimetype: string;
  fields: Record<string, string>;
}> {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: req.headers, defParamCharset: "utf8" });
    let filename = "";
    let mimetype = "";
    const chunks: Buffer[] = [];
    let totalSize = 0;
    const fields: Record<string, string> = {};

    bb.on(
      "file",
      (
        _fieldname: string,
        file: NodeJS.ReadableStream,
        info: { filename: string; mimeType: string },
      ) => {
        filename = info.filename;
        mimetype = info.mimeType;

        file.on("data", (data: Buffer) => {
          totalSize += data.length;
          if (totalSize > maxFileSize) {
            file.resume();
            reject(new Error(`File too large (max: ${maxFileSize} bytes)`));
            return;
          }
          chunks.push(data);
        });
      },
    );

    bb.on("field", (fieldname: string, value: string) => {
      fields[fieldname] = value;
    });

    bb.on("finish", () => {
      if (!filename || chunks.length === 0) {
        reject(new Error("No file uploaded"));
        return;
      }

      const buffer = Buffer.concat(chunks);
      resolve({ filename, buffer, mimetype, fields });
    });

    bb.on("error", (err: Error) => {
      reject(err);
    });

    req.pipe(bb);
  });
}

function resolveKnowledgeAgentId(req: IncomingMessage) {
  const cfg = loadConfig();
  return resolveAgentIdFromHeader(req) ?? resolveDefaultAgentId(cfg);
}

function toBasePayload(base: {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  visibility: "private" | "team" | "public";
  created_at: number;
  updated_at: number;
  tags?: Array<{ tagId: string; name: string; color: string | null }>;
  settings?: KnowledgeBaseRuntimeSettings;
  documentCount?: number;
}) {
  return {
    kbId: base.id,
    name: base.name,
    description: base.description ?? null,
    icon: base.icon ?? null,
    visibility: base.visibility,
    tags: base.tags ?? [],
    settings: base.settings,
    documentCount: base.documentCount ?? 0,
    createdAt: new Date(base.created_at).toISOString(),
    updatedAt: new Date(base.updated_at).toISOString(),
  };
}

export async function handleKnowledgeHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: KnowledgeHttpOptions,
): Promise<boolean> {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (!url.pathname.startsWith("/api/knowledge/")) {
      return false;
    }

    const token = getBearerToken(req);
    const authResult = await authorizeGatewayConnect({
      auth: opts.auth,
      connectAuth: { token, password: token },
      req,
      trustedProxies: opts.trustedProxies,
    });
    if (!authResult.ok) {
      sendUnauthorized(res);
      return true;
    }

    const agentId = resolveKnowledgeAgentId(req);
    const manager = getKnowledgeManager(agentId);

    if (!manager.isEnabled(agentId)) {
      sendInvalidRequest(res, "Knowledge base is not enabled");
      return true;
    }

    if (url.pathname === "/api/knowledge/upload") {
      if (req.method !== "POST") {
        sendMethodNotAllowed(res, "POST");
        return true;
      }

      const config = manager.getConfig(agentId);
      if (!config) {
        sendInvalidRequest(res, "Knowledge base configuration not found");
        return true;
      }
      if (!config.upload.webApi) {
        sendInvalidRequest(res, "Knowledge base web uploads are disabled");
        return true;
      }

      try {
        const { filename, buffer, mimetype, fields } = await parseMultipartUpload(
          req,
          config.storage.maxFileSize,
        );

        const description = fields.description?.trim() || undefined;
        const tagsField = Object.prototype.hasOwnProperty.call(fields, "tags")
          ? fields.tags
          : undefined;
        const tags =
          tagsField === undefined
            ? undefined
            : tagsField
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean);

        const kbId = fields.kbId?.trim() || undefined;
        const result = await manager.uploadDocument({
          kbId,
          filename,
          buffer,
          mimetype,
          sourceType: "web_api",
          agentId,
          description,
          tags,
        });

        sendJson(res, 200, {
          documentId: result.documentId,
          filename,
          size: buffer.length,
          indexed: result.indexed,
        });
      } catch (err) {
        sendInvalidRequest(res, `Upload failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/update") {
      if (req.method !== "POST") {
        sendMethodNotAllowed(res, "POST");
        return true;
      }

      const config = manager.getConfig(agentId);
      if (!config) {
        sendInvalidRequest(res, "Knowledge base configuration not found");
        return true;
      }
      if (!config.upload.webApi) {
        sendInvalidRequest(res, "Knowledge base web uploads are disabled");
        return true;
      }

      try {
        const { filename, buffer, mimetype, fields } = await parseMultipartUpload(
          req,
          config.storage.maxFileSize,
        );

        const kbId = fields.kbId?.trim();
        const documentId = fields.documentId?.trim();
        if (!kbId) {
          sendInvalidRequest(res, "kbId is required");
          return true;
        }
        if (!documentId) {
          sendInvalidRequest(res, "documentId is required");
          return true;
        }

        const description = fields.description?.trim() || undefined;
        const tagsField = Object.prototype.hasOwnProperty.call(fields, "tags")
          ? fields.tags
          : undefined;
        const tags =
          tagsField === undefined
            ? undefined
            : tagsField
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean);

        const result = await manager.updateDocument({
          kbId,
          documentId,
          filename,
          buffer,
          mimetype,
          sourceType: "web_api",
          agentId,
          description,
          tags,
        });

        sendJson(res, 200, result);
      } catch (err) {
        sendInvalidRequest(res, `Update failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/base" && req.method === "POST") {
      const body = (await readJsonBodyOrError(req, res, DEFAULT_BODY_BYTES)) as Record<
        string,
        unknown
      > | null;
      if (!body) {
        return true;
      }
      try {
        const kb = manager.createBase({
          agentId,
          name: typeof body.name === "string" ? body.name : "",
          description: typeof body.description === "string" ? body.description : undefined,
          icon: typeof body.icon === "string" ? body.icon : undefined,
          visibility: body.visibility as "private" | "team" | "public" | undefined,
          tags: parseBaseTags(body.tags),
          settings: parseBaseSettings(body.settings),
        });
        sendJson(res, 200, toBasePayload(kb));
      } catch (err) {
        sendInvalidRequest(res, `Create base failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/base/list") {
      if (req.method !== "GET") {
        sendMethodNotAllowed(res, "GET");
        return true;
      }
      const limit = parseLimit(url.searchParams.get("limit"), 50);
      const offset = parseLimit(url.searchParams.get("offset"), 0);
      const search = url.searchParams.get("search")?.trim() || undefined;
      const visibility = url.searchParams.get("visibility")?.trim() as
        | "private"
        | "team"
        | "public"
        | undefined;
      const tags = parseTags(url.searchParams);
      try {
        const list = manager.listBases({
          agentId,
          limit,
          offset,
          search,
          visibility,
          tags,
        });
        sendJson(res, 200, {
          total: list.total,
          returned: list.returned,
          offset: list.offset,
          kbs: list.kbs.map((kb) =>
            toBasePayload({
              ...kb,
              documentCount: manager.getDocumentCount({ agentId, kbId: kb.id }),
            }),
          ),
        });
      } catch (err) {
        sendInvalidRequest(res, `List bases failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/base/get") {
      if (req.method !== "GET") {
        sendMethodNotAllowed(res, "GET");
        return true;
      }
      const kbId = url.searchParams.get("kbId")?.trim() || undefined;
      try {
        const kb = manager.getBase(agentId, kbId);
        if (!kb) {
          sendInvalidRequest(res, "Knowledge base not found");
          return true;
        }
        const stats = manager.getGraphStats({ agentId, kbId: kb.id });
        sendJson(res, 200, {
          ...toBasePayload({
            ...kb,
            documentCount: manager.getDocumentCount({ agentId, kbId: kb.id }),
          }),
          stats,
        });
      } catch (err) {
        sendInvalidRequest(res, `Get base failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/base" && req.method === "PUT") {
      const body = (await readJsonBodyOrError(req, res, DEFAULT_BODY_BYTES)) as Record<
        string,
        unknown
      > | null;
      if (!body) {
        return true;
      }
      try {
        const kb = manager.updateBase({
          agentId,
          kbId: typeof body.kbId === "string" ? body.kbId : "",
          name: typeof body.name === "string" ? body.name : undefined,
          description: typeof body.description === "string" ? body.description : undefined,
          icon: typeof body.icon === "string" ? body.icon : undefined,
          visibility: body.visibility as "private" | "team" | "public" | undefined,
          tags: parseBaseTags(body.tags),
        });
        sendJson(
          res,
          200,
          toBasePayload({
            ...kb,
            documentCount: manager.getDocumentCount({ agentId, kbId: kb.id }),
          }),
        );
      } catch (err) {
        sendInvalidRequest(res, `Update base failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/base/delete") {
      if (req.method !== "POST") {
        sendMethodNotAllowed(res, "POST");
        return true;
      }
      const body = (await readJsonBodyOrError(req, res, DEFAULT_BODY_BYTES)) as Record<
        string,
        unknown
      > | null;
      if (!body) {
        return true;
      }
      try {
        const kbId = typeof body.kbId === "string" ? body.kbId : "";
        const result = manager.deleteBase({ agentId, kbId });
        sendJson(res, 200, result);
      } catch (err) {
        sendInvalidRequest(res, `Delete base failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/base/settings") {
      if (req.method === "GET") {
        const kbId = url.searchParams.get("kbId")?.trim() || "";
        if (!kbId) {
          sendInvalidRequest(res, "kbId is required");
          return true;
        }
        try {
          const settings = manager.getBaseSettings({ agentId, kbId });
          sendJson(res, 200, { kbId, settings });
        } catch (err) {
          sendInvalidRequest(res, `Base settings load failed: ${formatError(err)}`);
        }
        return true;
      }
      if (req.method === "PUT") {
        const body = (await readJsonBodyOrError(req, res, DEFAULT_BODY_BYTES)) as Record<
          string,
          unknown
        > | null;
        if (!body) {
          return true;
        }
        const kbId = typeof body.kbId === "string" ? body.kbId.trim() : "";
        if (!kbId) {
          sendInvalidRequest(res, "kbId is required");
          return true;
        }
        try {
          const settings = manager.updateBaseSettings({
            agentId,
            kbId,
            settings: parseBaseSettings(body.settings) ?? {},
          });
          sendJson(res, 200, { kbId, settings });
        } catch (err) {
          sendInvalidRequest(res, `Base settings update failed: ${formatError(err)}`);
        }
        return true;
      }
      sendMethodNotAllowed(res, "GET, PUT");
      return true;
    }

    if (url.pathname === "/api/knowledge/tags") {
      if (req.method === "GET") {
        try {
          sendJson(res, 200, { tags: manager.listTags(agentId) });
        } catch (err) {
          sendInvalidRequest(res, `Tags list failed: ${formatError(err)}`);
        }
        return true;
      }
      if (req.method === "POST") {
        const body = (await readJsonBodyOrError(req, res, DEFAULT_BODY_BYTES)) as Record<
          string,
          unknown
        > | null;
        if (!body) {
          return true;
        }
        try {
          const tag = manager.createTag({
            agentId,
            name: typeof body.name === "string" ? body.name : "",
            color: typeof body.color === "string" ? body.color : undefined,
          });
          sendJson(res, 200, tag);
        } catch (err) {
          sendInvalidRequest(res, `Tag create failed: ${formatError(err)}`);
        }
        return true;
      }
      if (req.method === "PUT") {
        const body = (await readJsonBodyOrError(req, res, DEFAULT_BODY_BYTES)) as Record<
          string,
          unknown
        > | null;
        if (!body) {
          return true;
        }
        try {
          const tag = manager.updateTag({
            agentId,
            tagId: typeof body.tagId === "string" ? body.tagId : "",
            name: typeof body.name === "string" ? body.name : undefined,
            color: typeof body.color === "string" ? body.color : undefined,
          });
          sendJson(res, 200, tag);
        } catch (err) {
          sendInvalidRequest(res, `Tag update failed: ${formatError(err)}`);
        }
        return true;
      }
      sendMethodNotAllowed(res, "GET, POST, PUT");
      return true;
    }

    if (url.pathname === "/api/knowledge/tags/delete") {
      if (req.method !== "POST") {
        sendMethodNotAllowed(res, "POST");
        return true;
      }
      const body = (await readJsonBodyOrError(req, res, DEFAULT_BODY_BYTES)) as Record<
        string,
        unknown
      > | null;
      if (!body) {
        return true;
      }
      try {
        const result = manager.deleteTag({
          agentId,
          tagId: typeof body.tagId === "string" ? body.tagId : "",
        });
        sendJson(res, 200, result);
      } catch (err) {
        sendInvalidRequest(res, `Tag delete failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/base/tags/bind") {
      if (req.method !== "POST") {
        sendMethodNotAllowed(res, "POST");
        return true;
      }
      const body = (await readJsonBodyOrError(req, res, DEFAULT_BODY_BYTES)) as Record<
        string,
        unknown
      > | null;
      if (!body) {
        return true;
      }
      try {
        const tags = manager.bindTagsToBase({
          agentId,
          kbId: typeof body.kbId === "string" ? body.kbId : "",
          tagIds:
            Array.isArray(body.tagIds) && body.tagIds.every((item) => typeof item === "string")
              ? body.tagIds
              : [],
        });
        sendJson(res, 200, { tags });
      } catch (err) {
        sendInvalidRequest(res, `Bind tags failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/base/tags/unbind") {
      if (req.method !== "POST") {
        sendMethodNotAllowed(res, "POST");
        return true;
      }
      const body = (await readJsonBodyOrError(req, res, DEFAULT_BODY_BYTES)) as Record<
        string,
        unknown
      > | null;
      if (!body) {
        return true;
      }
      try {
        const tags = manager.unbindTagsFromBase({
          agentId,
          kbId: typeof body.kbId === "string" ? body.kbId : "",
          tagIds:
            Array.isArray(body.tagIds) && body.tagIds.every((item) => typeof item === "string")
              ? body.tagIds
              : [],
        });
        sendJson(res, 200, { tags });
      } catch (err) {
        sendInvalidRequest(res, `Unbind tags failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/base" && req.method !== "POST" && req.method !== "PUT") {
      sendMethodNotAllowed(res, "POST, PUT");
      return true;
    }

    if (url.pathname === "/api/knowledge/file") {
      if (req.method !== "GET") {
        sendMethodNotAllowed(res, "GET");
        return true;
      }
      const documentId = url.searchParams.get("documentId")?.trim();
      const kbId = url.searchParams.get("kbId")?.trim() || undefined;
      if (!documentId) {
        sendInvalidRequest(res, "documentId is required");
        return true;
      }
      try {
        const resolved = manager.resolveDocumentPath({ agentId, documentId, kbId });
        const stat = await fsPromises.stat(resolved.absPath);
        const range = parseRangeHeader(req.headers.range, stat.size);
        res.setHeader("Content-Type", resolved.mimetype);
        res.setHeader("Accept-Ranges", "bytes");
        if (range) {
          const chunkSize = range.end - range.start + 1;
          res.statusCode = 206;
          res.setHeader("Content-Length", chunkSize);
          res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
          fs.createReadStream(resolved.absPath, { start: range.start, end: range.end }).pipe(res);
          return true;
        }
        res.statusCode = 200;
        res.setHeader("Content-Length", stat.size);
        fs.createReadStream(resolved.absPath).pipe(res);
      } catch (err) {
        sendInvalidRequest(res, `File preview failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/chunks") {
      if (req.method !== "GET") {
        sendMethodNotAllowed(res, "GET");
        return true;
      }
      const documentId = url.searchParams.get("documentId")?.trim();
      const kbId = url.searchParams.get("kbId")?.trim() || undefined;
      if (!documentId) {
        sendInvalidRequest(res, "documentId is required");
        return true;
      }
      const limit = parseLimit(url.searchParams.get("limit"), 50);
      const offset = parseLimit(url.searchParams.get("offset"), 0);
      try {
        const payload = manager.listChunks({ agentId, documentId, kbId, limit, offset });
        sendJson(res, 200, payload);
      } catch (err) {
        sendInvalidRequest(res, `Chunks fetch failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/chunk") {
      if (req.method !== "GET") {
        sendMethodNotAllowed(res, "GET");
        return true;
      }
      const chunkId = url.searchParams.get("chunkId")?.trim();
      const kbId = url.searchParams.get("kbId")?.trim() || undefined;
      if (!chunkId) {
        sendInvalidRequest(res, "chunkId is required");
        return true;
      }
      try {
        const chunk = manager.getChunk({ agentId, chunkId, kbId });
        sendJson(res, 200, { chunk });
      } catch (err) {
        sendInvalidRequest(res, `Chunk fetch failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/list") {
      if (req.method !== "GET") {
        sendMethodNotAllowed(res, "GET");
        return true;
      }

      const tags = parseTags(url.searchParams);
      const kbId = url.searchParams.get("kbId")?.trim() || undefined;
      const limit = parseLimit(url.searchParams.get("limit"), 20);
      const offset = parseLimit(url.searchParams.get("offset"), 0);

      try {
        const documents = manager.listDocuments({
          agentId,
          kbId,
          tags,
          limit,
          offset,
        });
        const total = manager.getDocumentCount({ agentId, kbId });
        sendJson(res, 200, {
          total,
          returned: documents.length,
          offset,
          documents: documents.map((doc) => ({
            id: doc.id,
            kbId: doc.kb_id ?? null,
            filename: doc.filename,
            mimetype: doc.mimetype,
            size: doc.size,
            uploadedAt: new Date(doc.uploaded_at).toISOString(),
            indexed: doc.indexed_at !== null,
            tags: doc.tags,
            description: doc.description,
            sourceType: doc.source_type,
          })),
        });
      } catch (err) {
        sendInvalidRequest(res, `List failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/settings") {
      if (req.method === "GET") {
        try {
          const settings = manager.getSettings(agentId);
          sendJson(res, 200, settings);
        } catch (err) {
          sendInvalidRequest(res, `Settings load failed: ${formatError(err)}`);
        }
        return true;
      }
      if (req.method === "PUT") {
        const body = await readJsonBodyOrError(req, res, DEFAULT_BODY_BYTES);
        if (!body) {
          return true;
        }
        try {
          const settings = manager.updateSettings(agentId, parseSettingsUpdate(body));
          sendJson(res, 200, settings);
        } catch (err) {
          sendInvalidRequest(res, `Settings update failed: ${formatError(err)}`);
        }
        return true;
      }
      sendMethodNotAllowed(res, "GET, PUT");
      return true;
    }

    if (url.pathname === "/api/knowledge/graph/status") {
      if (req.method !== "GET") {
        sendMethodNotAllowed(res, "GET");
        return true;
      }
      const documentId = url.searchParams.get("documentId")?.trim();
      const kbId = url.searchParams.get("kbId")?.trim() || undefined;
      if (!documentId) {
        sendInvalidRequest(res, "documentId is required");
        return true;
      }
      try {
        const run = manager.getGraphRun({ agentId, documentId, kbId });
        sendJson(res, 200, { run });
      } catch (err) {
        sendInvalidRequest(res, `Graph status failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/graph/stats") {
      if (req.method !== "GET") {
        sendMethodNotAllowed(res, "GET");
        return true;
      }
      try {
        const kbId = url.searchParams.get("kbId")?.trim() || undefined;
        const stats = manager.getGraphStats({ agentId, kbId });
        sendJson(res, 200, stats);
      } catch (err) {
        sendInvalidRequest(res, `Graph stats failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/graph/subgraph") {
      if (req.method !== "GET") {
        sendMethodNotAllowed(res, "GET");
        return true;
      }
      const keyword = url.searchParams.get("keyword")?.trim() ?? "";
      const kbId = url.searchParams.get("kbId")?.trim() || undefined;
      const documentIds = parseListParams(url.searchParams, "documentId");
      const relation = url.searchParams.get("relation")?.trim() || undefined;
      const entityPrefix = url.searchParams.get("entityPrefix")?.trim() || undefined;
      const createdAfter = parseNumberParam(url.searchParams.get("createdAfter"));
      const createdBefore = parseNumberParam(url.searchParams.get("createdBefore"));
      const minDegree = parseNumberParam(url.searchParams.get("minDegree"));
      if (
        !keyword &&
        !(documentIds?.length || relation || entityPrefix || createdAfter || createdBefore)
      ) {
        sendInvalidRequest(res, "keyword or filters are required");
        return true;
      }
      const maxDepth = parseLimit(url.searchParams.get("maxDepth"), 2);
      const maxTriples = parseLimit(url.searchParams.get("maxTriples"), 200);
      try {
        const result = manager.queryGraphSubgraph({
          agentId,
          keyword,
          kbId,
          maxDepth,
          maxTriples,
          documentIds,
          relation,
          entityPrefix,
          createdAfter,
          createdBefore,
          minDegree,
        });
        sendJson(res, 200, result);
      } catch (err) {
        sendInvalidRequest(res, `Graph query failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/get") {
      if (req.method !== "GET") {
        sendMethodNotAllowed(res, "GET");
        return true;
      }

      const documentId = url.searchParams.get("documentId");
      const kbId = url.searchParams.get("kbId")?.trim() || undefined;
      if (!documentId) {
        sendInvalidRequest(res, "documentId is required");
        return true;
      }

      try {
        const doc = manager.getDocument({ documentId, agentId, kbId });
        if (!doc) {
          sendInvalidRequest(res, `Document not found: ${documentId}`);
          return true;
        }

        sendJson(res, 200, {
          id: doc.id,
          kbId: doc.kb_id ?? null,
          filename: doc.filename,
          filepath: doc.filepath,
          mimetype: doc.mimetype,
          size: doc.size,
          hash: doc.hash,
          sourceType: doc.source_type,
          sourceMetadata: doc.source_metadata ? JSON.parse(doc.source_metadata) : null,
          uploadedAt: new Date(doc.uploaded_at).toISOString(),
          indexedAt: doc.indexed_at ? new Date(doc.indexed_at).toISOString() : null,
          description: doc.description,
          tags: doc.tags,
        });
      } catch (err) {
        sendInvalidRequest(res, `Get failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/metadata") {
      if (req.method !== "PUT") {
        sendMethodNotAllowed(res, "PUT");
        return true;
      }
      const body = (await readJsonBodyOrError(req, res, DEFAULT_BODY_BYTES)) as Record<
        string,
        unknown
      > | null;
      if (!body) {
        return true;
      }
      const documentId = typeof body.documentId === "string" ? body.documentId.trim() : "";
      const kbId = typeof body.kbId === "string" ? body.kbId.trim() : "";
      if (!documentId) {
        sendInvalidRequest(res, "documentId is required");
        return true;
      }
      if (!kbId) {
        sendInvalidRequest(res, "kbId is required");
        return true;
      }
      const tags =
        Array.isArray(body.tags) && body.tags.every((item) => typeof item === "string")
          ? body.tags.map((tag) => tag.trim()).filter(Boolean)
          : undefined;
      const description =
        body.description === null
          ? null
          : typeof body.description === "string"
            ? body.description
            : undefined;
      try {
        const updated = manager.updateDocumentMetadata({
          agentId,
          documentId,
          kbId,
          filename: typeof body.filename === "string" ? body.filename.trim() : undefined,
          description,
          tags,
        });
        sendJson(res, 200, {
          id: updated.id,
          kbId: updated.kb_id ?? null,
          filename: updated.filename,
          filepath: updated.filepath,
          mimetype: updated.mimetype,
          size: updated.size,
          hash: updated.hash,
          sourceType: updated.source_type,
          sourceMetadata: updated.source_metadata ? JSON.parse(updated.source_metadata) : null,
          uploadedAt: new Date(updated.uploaded_at).toISOString(),
          indexedAt: updated.indexed_at ? new Date(updated.indexed_at).toISOString() : null,
          description: updated.description,
          tags: updated.tags,
        });
      } catch (err) {
        sendInvalidRequest(res, `Update metadata failed: ${formatError(err)}`);
      }
      return true;
    }

    if (url.pathname === "/api/knowledge/delete") {
      if (req.method !== "POST") {
        sendMethodNotAllowed(res, "POST");
        return true;
      }

      let documentId = url.searchParams.get("documentId") ?? "";
      let kbId = url.searchParams.get("kbId")?.trim() || undefined;
      if (!documentId) {
        const bodyUnknown = await readJsonBodyOrError(req, res, DEFAULT_BODY_BYTES);
        if (bodyUnknown === undefined) {
          return true;
        }
        const body = bodyUnknown as { documentId?: unknown; kbId?: unknown } | null;
        if (body && typeof body === "object" && typeof body.documentId === "string") {
          documentId = body.documentId.trim();
        }
        if (!kbId && body && typeof body === "object" && typeof body.kbId === "string") {
          const resolved = body.kbId.trim();
          kbId = resolved || undefined;
        }
      }

      if (!documentId) {
        sendInvalidRequest(res, "documentId is required");
        return true;
      }

      try {
        const result = await manager.deleteDocument({ documentId, agentId, kbId });
        if (!result.success) {
          sendInvalidRequest(res, `Document not found: ${documentId}`);
          return true;
        }
        sendJson(res, 200, { success: true, documentId });
      } catch (err) {
        sendInvalidRequest(res, `Delete failed: ${formatError(err)}`);
      }
      return true;
    }

    // Match /api/knowledge/documents/:id/content
    const contentMatch = url.pathname.match(/^\/api\/knowledge\/documents\/([^/]+)\/content$/);
    if (contentMatch) {
      const documentId = contentMatch[1];
      const kbId = url.searchParams.get("kbId")?.trim() || undefined;
      if (req.method !== "PUT") {
        sendMethodNotAllowed(res, "PUT");
        return true;
      }
      try {
        const bodyUnknown = await readJsonBodyOrError(req, res, DEFAULT_BODY_BYTES);
        if (!bodyUnknown) {
          return true;
        }

        const body = bodyUnknown as Record<string, unknown>;
        if (typeof body.content !== "string") {
          sendInvalidRequest(res, "Missing or invalid 'content' field");
          return true;
        }

        const content = body.content;

        const resolved = manager.resolveDocumentPath({ agentId, documentId, kbId });
        await fsPromises.writeFile(resolved.absPath, content, "utf-8");

        // Update document metadata
        const updatedAt = new Date().toISOString();
        const db = getDatabase(agentId);
        db.prepare(`UPDATE knowledge_documents SET updatedAt = ? WHERE id = ?`).run(
          updatedAt,
          documentId,
        );

        sendJson(res, 200, {
          success: true,
          message: "Content saved successfully",
          documentId,
          updatedAt,
        });
      } catch (err) {
        sendInvalidRequest(res, `Save content failed: ${formatError(err)}`);
      }
      return true;
    }

    // Match /api/knowledge/convert/to-univer/:id
    const toUniverMatch = url.pathname.match(/^\/api\/knowledge\/convert\/to-univer\/([^/]+)$/);
    if (toUniverMatch) {
      const documentId = toUniverMatch[1];
      const kbId = url.searchParams.get("kbId")?.trim() || undefined;
      if (req.method !== "GET") {
        sendMethodNotAllowed(res, "GET");
        return true;
      }
      try {
        // Get type query parameter (xlsx, csv or docx)
        const fileType = url.searchParams.get("type");
        if (!fileType || (fileType !== "xlsx" && fileType !== "csv" && fileType !== "docx")) {
          sendInvalidRequest(
            res,
            "Missing or invalid 'type' query parameter (must be 'xlsx', 'csv' or 'docx')",
          );
          return true;
        }

        const resolved = manager.resolveDocumentPath({ agentId, documentId, kbId });

        // Import converter functions
        const { xlsxToUniver, csvToUniver, docxToUniver } =
          await import("./knowledge-converters.js");

        // Convert based on file type
        let univerData: unknown;
        if (fileType === "xlsx") {
          univerData = await xlsxToUniver(resolved.absPath);
        } else if (fileType === "csv") {
          univerData = await csvToUniver(resolved.absPath);
        } else {
          univerData = await docxToUniver(resolved.absPath);
        }

        sendJson(res, 200, {
          success: true,
          data: univerData,
          documentId,
        });
      } catch (err) {
        sendInvalidRequest(res, `Conversion failed: ${formatError(err)}`);
      }
      return true;
    }

    // Match /api/knowledge/save-from-univer/:id
    const saveFromUniverMatch = url.pathname.match(/^\/api\/knowledge\/save-from-univer\/([^/]+)$/);
    if (saveFromUniverMatch) {
      const documentId = saveFromUniverMatch[1];
      if (req.method !== "POST") {
        sendMethodNotAllowed(res, "POST");
        return true;
      }
      try {
        const bodyUnknown = await readJsonBodyOrError(req, res, DEFAULT_BODY_BYTES);
        if (!bodyUnknown) {
          return true;
        }

        const body = bodyUnknown as Record<string, unknown>;
        if (!body.data || typeof body.data !== "object") {
          sendInvalidRequest(res, "Missing or invalid 'data' field");
          return true;
        }
        const kbId =
          typeof body.kbId === "string" && body.kbId.trim().length > 0
            ? body.kbId.trim()
            : undefined;

        const fileType = body.type;
        if (!fileType || (fileType !== "xlsx" && fileType !== "csv" && fileType !== "docx")) {
          sendInvalidRequest(
            res,
            "Missing or invalid 'type' field (must be 'xlsx', 'csv' or 'docx')",
          );
          return true;
        }

        const resolved = manager.resolveDocumentPath({ agentId, documentId, kbId });

        // Import converter functions
        const { univerToXlsx, univerToCsv, univerToDocx } =
          await import("./knowledge-converters.js");

        // Save based on file type
        if (fileType === "xlsx") {
          await univerToXlsx(body.data as never, resolved.absPath);
        } else if (fileType === "csv") {
          await univerToCsv(body.data as never, resolved.absPath);
        } else {
          await univerToDocx(body.data as never, resolved.absPath);
        }

        // Update document metadata
        const updatedAt = new Date().toISOString();
        const db = getDatabase(agentId);
        db.prepare(`UPDATE knowledge_documents SET updatedAt = ? WHERE id = ?`).run(
          updatedAt,
          documentId,
        );

        sendJson(res, 200, {
          success: true,
          message: "Document saved successfully",
          documentId,
          updatedAt,
        });
      } catch (err) {
        sendInvalidRequest(res, `Save failed: ${formatError(err)}`);
      }
      return true;
    }

    // Match /api/knowledge/convert/pptx-to-pdf/:id
    const pptxToPdfMatch = url.pathname.match(/^\/api\/knowledge\/convert\/pptx-to-pdf\/([^/]+)$/);
    if (pptxToPdfMatch) {
      const documentId = pptxToPdfMatch[1];
      const kbId = url.searchParams.get("kbId")?.trim() || undefined;
      if (req.method !== "GET") {
        sendMethodNotAllowed(res, "GET");
        return true;
      }
      try {
        const resolved = manager.resolveDocumentPath({ agentId, documentId, kbId });

        // Generate PDF path
        const path = await import("node:path");
        const pdfPath = resolved.absPath.replace(/\.pptx$/i, ".pdf");

        // Import converter function
        const { pptxToPdf } = await import("./knowledge-converters.js");

        // Convert PPTX to PDF
        await pptxToPdf(resolved.absPath, pdfPath);

        // Read and send the PDF file
        const { promises: fsPromises } = await import("node:fs");
        const pdfBuffer = await fsPromises.readFile(pdfPath);

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Length", pdfBuffer.length);
        res.setHeader("Content-Disposition", `inline; filename="${path.basename(pdfPath)}"`);
        res.end(pdfBuffer);
      } catch (err) {
        sendInvalidRequest(res, `PDF conversion failed: ${formatError(err)}`);
      }
      return true;
    }

    return false;
  } catch (err) {
    log.error(`knowledge http request failed: ${formatError(err)}`);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Internal Server Error");
    }
    return true;
  }
}
