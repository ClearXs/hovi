import crypto from "node:crypto";
import type { OpenClawConfig } from "../../config/config.js";
import { loadConfig, writeConfigFile } from "../../config/config.js";
import type {
  ConnectorEntry,
  ConnectorSessionState,
  ConnectorOAuthProvider,
} from "../../config/types.connectors.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateConnectorsDeleteParams,
  validateConnectorsListParams,
  validateConnectorsOAuthCompleteParams,
  validateConnectorsOAuthStartParams,
  validateConnectorsOAuthStatusParams,
  validateConnectorsSessionGetParams,
  validateConnectorsSessionSetParams,
  validateConnectorsUpsertParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

type ConnectorType = "app" | "custom_api" | "custom_mcp";

type BuiltinConnector = {
  id: string;
  type: ConnectorType;
  name: string;
  description: string;
  icon?: string;
  authMode?: "oauth" | "none" | "api_key";
  oauthProvider?: string;
  defaultScopes?: string[];
};

type OAuthPending = {
  connectorId: string;
  provider: string;
  callbackUrl: string;
  createdAt: number;
  expiresAt: number;
};

type OAuthProviderConfig = {
  authorizeUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string[];
  extraAuthorizeParams?: Record<string, string>;
  extraTokenParams?: Record<string, string>;
};

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const oauthStateStore = new Map<string, OAuthPending>();

const DEFAULT_OAUTH_PROVIDER_CONFIGS: Record<string, OAuthProviderConfig> = {
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
  },
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
  },
  slack: {
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
  },
  notion: {
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
  },
};

const BUILTIN_CONNECTORS: BuiltinConnector[] = [
  {
    id: "github",
    type: "app",
    name: "GitHub",
    description: "Manage repositories, track code changes, and collaborate on team projects",
    icon: "github",
    authMode: "oauth",
    oauthProvider: "github",
    defaultScopes: ["repo", "read:user", "user:email"],
  },
  {
    id: "gmail",
    type: "app",
    name: "Gmail",
    description: "Draft replies, search your inbox, and summarize email threads",
    icon: "gmail",
    authMode: "oauth",
    oauthProvider: "google",
    defaultScopes: ["https://www.googleapis.com/auth/gmail.modify"],
  },
  {
    id: "google-calendar",
    type: "app",
    name: "Google Calendar",
    description: "Schedule, view, and manage calendar events",
    icon: "calendar",
    authMode: "oauth",
    oauthProvider: "google",
    defaultScopes: ["https://www.googleapis.com/auth/calendar"],
  },
  {
    id: "google-drive",
    type: "app",
    name: "Google Drive",
    description: "Access and organize files from Google Drive",
    icon: "drive",
    authMode: "oauth",
    oauthProvider: "google",
    defaultScopes: ["https://www.googleapis.com/auth/drive.file"],
  },
  {
    id: "slack",
    type: "app",
    name: "Slack",
    description: "Read and write Slack conversations",
    icon: "slack",
    authMode: "oauth",
    oauthProvider: "slack",
    defaultScopes: ["channels:history", "channels:read", "chat:write"],
  },
  {
    id: "notion",
    type: "app",
    name: "Notion",
    description: "Search workspace content and update notes",
    icon: "notion",
    authMode: "oauth",
    oauthProvider: "notion",
  },
  {
    id: "browser",
    type: "app",
    name: "My Browser",
    description: "Access the web on your own browser",
    icon: "browser",
    authMode: "none",
  },
];

function pruneOAuthStateStore(now = Date.now()): void {
  for (const [state, entry] of oauthStateStore.entries()) {
    if (entry.expiresAt <= now) {
      oauthStateStore.delete(state);
    }
  }
}

function getConnectorEntries(cfg: OpenClawConfig): Record<string, Record<string, unknown>> {
  const connectors = cfg.connectors;
  if (!connectors || typeof connectors !== "object") {
    return {};
  }
  const entries = connectors.entries;
  if (!entries || typeof entries !== "object") {
    return {};
  }
  return entries as Record<string, Record<string, unknown>>;
}

function getConnectorSessions(cfg: OpenClawConfig): Record<string, { connectorIds?: string[] }> {
  const connectors = cfg.connectors;
  if (!connectors || typeof connectors !== "object") {
    return {};
  }
  const sessions = connectors.sessions;
  if (!sessions || typeof sessions !== "object") {
    return {};
  }
  return sessions as Record<string, { connectorIds?: string[] }>;
}

function getConnectorOAuthProviders(cfg: OpenClawConfig): Record<string, Record<string, unknown>> {
  const connectors = cfg.connectors;
  if (!connectors || typeof connectors !== "object") {
    return {};
  }
  const oauthProviders = connectors.oauthProviders;
  if (!oauthProviders || typeof oauthProviders !== "object") {
    return {};
  }
  return oauthProviders as Record<string, Record<string, unknown>>;
}

function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const pairs = Object.entries(value as Record<string, unknown>)
    .filter(([key, entry]) => key.trim().length > 0 && typeof entry === "string")
    .map(([key, entry]) => [key.trim(), entry]);
  if (pairs.length === 0) {
    return undefined;
  }
  return Object.fromEntries(pairs);
}

function normalizeOAuthProviderConfig(
  value: unknown,
  fallback?: OAuthProviderConfig,
): OAuthProviderConfig {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const authorizeUrl =
    typeof raw.authorizeUrl === "string" ? raw.authorizeUrl.trim() : (fallback?.authorizeUrl ?? "");
  const tokenUrl =
    typeof raw.tokenUrl === "string" ? raw.tokenUrl.trim() : (fallback?.tokenUrl ?? "");
  const clientId =
    typeof raw.clientId === "string" ? raw.clientId.trim() : (fallback?.clientId ?? "");
  const clientSecret =
    typeof raw.clientSecret === "string" ? raw.clientSecret.trim() : (fallback?.clientSecret ?? "");

  const rawScopes = Array.isArray(raw.scopes)
    ? raw.scopes
    : Array.isArray(fallback?.scopes)
      ? fallback.scopes
      : [];
  const scopes = rawScopes
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const extraAuthorizeParams =
    normalizeStringRecord(raw.extraAuthorizeParams) ?? fallback?.extraAuthorizeParams;
  const extraTokenParams =
    normalizeStringRecord(raw.extraTokenParams) ?? fallback?.extraTokenParams;

  const result: OAuthProviderConfig = {};
  if (authorizeUrl) {
    result.authorizeUrl = authorizeUrl;
  }
  if (tokenUrl) {
    result.tokenUrl = tokenUrl;
  }
  if (clientId) {
    result.clientId = clientId;
  }
  if (clientSecret) {
    result.clientSecret = clientSecret;
  }
  if (scopes.length > 0) {
    result.scopes = scopes;
  }
  if (extraAuthorizeParams) {
    result.extraAuthorizeParams = extraAuthorizeParams;
  }
  if (extraTokenParams) {
    result.extraTokenParams = extraTokenParams;
  }
  return result;
}

function ensureConnectorRoot(cfg: OpenClawConfig): {
  connectors: NonNullable<OpenClawConfig["connectors"]>;
  entries: Record<string, ConnectorEntry>;
  sessions: Record<string, ConnectorSessionState>;
  oauthProviders: Record<string, ConnectorOAuthProvider>;
} {
  const currentConnectors =
    cfg.connectors && typeof cfg.connectors === "object" ? cfg.connectors : {};
  const entries: Record<string, ConnectorEntry> | undefined =
    currentConnectors.entries && typeof currentConnectors.entries === "object"
      ? currentConnectors.entries
      : undefined;
  const sessions: Record<string, ConnectorSessionState> | undefined =
    currentConnectors.sessions && typeof currentConnectors.sessions === "object"
      ? currentConnectors.sessions
      : undefined;
  const oauthProviders: Record<string, ConnectorOAuthProvider> | undefined =
    currentConnectors.oauthProviders && typeof currentConnectors.oauthProviders === "object"
      ? currentConnectors.oauthProviders
      : undefined;
  return {
    connectors: {
      ...currentConnectors,
      entries: entries ?? {},
      sessions: sessions ?? {},
      oauthProviders: oauthProviders ?? {},
    },
    entries: entries ?? {},
    sessions: sessions ?? {},
    oauthProviders: oauthProviders ?? {},
  };
}

function resolveConnectorStatus(
  stored: Record<string, unknown> | undefined,
): "connected" | "disconnected" | "error" | "draft" {
  const raw = typeof stored?.status === "string" ? stored.status : undefined;
  if (raw === "connected" || raw === "disconnected" || raw === "error" || raw === "draft") {
    return raw;
  }
  const oauth = stored?.oauth;
  if (oauth && typeof oauth === "object" && (oauth as Record<string, unknown>).accessToken) {
    return "connected";
  }
  const customApi = stored?.customApi;
  if (customApi && typeof customApi === "object") {
    return "connected";
  }
  const customMcp = stored?.customMcp;
  if (customMcp && typeof customMcp === "object") {
    return "connected";
  }
  return "disconnected";
}

function normalizeConnectorIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) {
    return [];
  }
  const seen = new Set<string>();
  for (const value of ids) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    seen.add(trimmed);
  }
  return Array.from(seen);
}

function normalizeCallbackUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

async function exchangeOAuthCode(params: {
  providerConfig: OAuthProviderConfig;
  code: string;
  callbackUrl: string;
}): Promise<Record<string, unknown>> {
  const tokenUrlRaw =
    typeof params.providerConfig.tokenUrl === "string" ? params.providerConfig.tokenUrl : "";
  const clientId =
    typeof params.providerConfig.clientId === "string" ? params.providerConfig.clientId : "";
  const clientSecret =
    typeof params.providerConfig.clientSecret === "string"
      ? params.providerConfig.clientSecret
      : "";
  if (!tokenUrlRaw || !clientId || !clientSecret) {
    throw new Error("OAuth provider is missing tokenUrl/clientId/clientSecret");
  }
  const tokenUrl = normalizeCallbackUrl(tokenUrlRaw);
  if (!tokenUrl) {
    throw new Error("OAuth tokenUrl must be http(s)");
  }

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: params.callbackUrl,
  });
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: form.toString(),
  });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const hint =
      typeof payload.error_description === "string"
        ? payload.error_description
        : typeof payload.error === "string"
          ? payload.error
          : text;
    throw new Error(`OAuth token exchange failed: ${hint}`);
  }
  return payload;
}

export const connectorsHandlers: GatewayRequestHandlers = {
  "connectors.list": ({ params, respond }) => {
    if (!validateConnectorsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid connectors.list params: ${formatValidationErrors(validateConnectorsListParams.errors)}`,
        ),
      );
      return;
    }

    const cfg = loadConfig();
    const entries = getConnectorEntries(cfg);
    const oauthProviders = getConnectorOAuthProviders(cfg);
    const builtins = BUILTIN_CONNECTORS.map((builtin) => {
      const stored = entries[builtin.id];
      const status = resolveConnectorStatus(stored);
      const oauthProviderConfig = builtin.oauthProvider
        ? normalizeOAuthProviderConfig(
            oauthProviders[builtin.oauthProvider],
            DEFAULT_OAUTH_PROVIDER_CONFIGS[builtin.oauthProvider],
          )
        : undefined;
      return {
        id: builtin.id,
        type: builtin.type,
        name: builtin.name,
        description: builtin.description,
        icon: typeof stored?.icon === "string" ? stored.icon : builtin.icon,
        status,
        builtin: true,
        enabled: typeof stored?.enabled === "boolean" ? stored.enabled : true,
        authMode:
          typeof stored?.authMode === "string" ? stored.authMode : (builtin.authMode ?? "none"),
        oauthProvider: builtin.oauthProvider,
        oauthProviderConfig,
        oauth: {
          connected: status === "connected",
          connectedAt:
            stored?.oauth && typeof stored.oauth === "object"
              ? ((stored.oauth as Record<string, unknown>).connectedAt as number | undefined)
              : undefined,
          expiresAt:
            stored?.oauth && typeof stored.oauth === "object"
              ? ((stored.oauth as Record<string, unknown>).expiresAt as number | undefined)
              : undefined,
        },
      };
    });

    const custom = Object.entries(entries)
      .filter(([id]) => !BUILTIN_CONNECTORS.some((builtin) => builtin.id === id))
      .map(([id, value]) => {
        const status = resolveConnectorStatus(value);
        return {
          id,
          type:
            value.type === "app" || value.type === "custom_api" || value.type === "custom_mcp"
              ? value.type
              : ("custom_api" as const),
          name: typeof value.name === "string" ? value.name : id,
          description: typeof value.description === "string" ? value.description : "",
          icon: typeof value.icon === "string" ? value.icon : undefined,
          status,
          builtin: false,
          enabled: typeof value.enabled === "boolean" ? value.enabled : true,
          authMode:
            value.authMode === "none" || value.authMode === "api_key" || value.authMode === "oauth"
              ? value.authMode
              : "none",
        };
      });

    respond(true, { items: [...builtins, ...custom] }, undefined);
  },

  "connectors.upsert": async ({ params, respond }) => {
    if (!validateConnectorsUpsertParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid connectors.upsert params: ${formatValidationErrors(validateConnectorsUpsertParams.errors)}`,
        ),
      );
      return;
    }

    const p = params as {
      id: string;
      type: ConnectorType;
      name: string;
      description?: string;
      icon?: string;
      enabled?: boolean;
      authMode?: "none" | "api_key" | "oauth";
      config?: Record<string, unknown>;
    };
    const id = p.id.trim();
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "connector id is required"));
      return;
    }

    const cfg = loadConfig();
    const { connectors, entries, oauthProviders } = ensureConnectorRoot(cfg);
    const current: Partial<ConnectorEntry> = entries[id] ? { ...entries[id] } : {};

    current.type = p.type;
    current.name = p.name.trim() || id;
    current.description = p.description?.trim() ?? "";
    if (typeof p.icon === "string") {
      current.icon = p.icon.trim();
    }
    if (typeof p.enabled === "boolean") {
      current.enabled = p.enabled;
    }
    if (p.authMode) {
      current.authMode = p.authMode;
    }
    if (p.config && typeof p.config === "object") {
      if (p.type === "custom_api") {
        current.customApi = p.config;
      } else if (p.type === "custom_mcp") {
        const transport =
          typeof p.config.transport === "string" ? p.config.transport.trim().toLowerCase() : "";
        if (
          transport &&
          transport !== "http" &&
          transport !== "sse" &&
          transport !== "stdio" &&
          transport !== "websocket"
        ) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.INVALID_REQUEST, "invalid MCP transport"),
          );
          return;
        }
        current.customMcp = p.config;
      } else {
        const builtin = BUILTIN_CONNECTORS.find((item) => item.id === id);
        if (builtin?.oauthProvider) {
          const config = p.config.oauthProvider;
          if (config && typeof config === "object" && !Array.isArray(config)) {
            const normalized = normalizeOAuthProviderConfig(
              config,
              normalizeOAuthProviderConfig(
                oauthProviders[builtin.oauthProvider],
                DEFAULT_OAUTH_PROVIDER_CONFIGS[builtin.oauthProvider],
              ),
            );
            oauthProviders[builtin.oauthProvider] = normalized as Record<string, unknown>;
          }
        }
      }
    }

    entries[id] = current as ConnectorEntry;
    connectors.entries = entries;
    connectors.oauthProviders = oauthProviders;

    await writeConfigFile({
      ...cfg,
      connectors,
    });

    respond(true, { ok: true, id }, undefined);
  },

  "connectors.delete": async ({ params, respond }) => {
    if (!validateConnectorsDeleteParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid connectors.delete params: ${formatValidationErrors(validateConnectorsDeleteParams.errors)}`,
        ),
      );
      return;
    }

    const p = params as { id: string };
    const id = p.id.trim();
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "connector id is required"));
      return;
    }

    const cfg = loadConfig();
    const { connectors, entries, sessions } = ensureConnectorRoot(cfg);
    delete entries[id];
    for (const [sessionKey, sessionValue] of Object.entries(sessions)) {
      const nextIds = normalizeConnectorIds(sessionValue.connectorIds).filter(
        (item) => item !== id,
      );
      sessions[sessionKey] = { connectorIds: nextIds };
    }
    connectors.entries = entries;
    connectors.sessions = sessions;

    await writeConfigFile({
      ...cfg,
      connectors,
    });

    respond(true, { ok: true }, undefined);
  },

  "connectors.oauth.start": ({ params, respond }) => {
    if (!validateConnectorsOAuthStartParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid connectors.oauth.start params: ${formatValidationErrors(validateConnectorsOAuthStartParams.errors)}`,
        ),
      );
      return;
    }

    const p = params as { id: string; callbackUrl: string };
    const callbackUrl = normalizeCallbackUrl(p.callbackUrl);
    if (!callbackUrl) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "callbackUrl must be http(s)"),
      );
      return;
    }

    const builtin = BUILTIN_CONNECTORS.find((item) => item.id === p.id);
    if (!builtin || builtin.authMode !== "oauth" || !builtin.oauthProvider) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "connector does not support OAuth"),
      );
      return;
    }

    const cfg = loadConfig();
    const providerConfig = normalizeOAuthProviderConfig(
      getConnectorOAuthProviders(cfg)[builtin.oauthProvider],
      DEFAULT_OAUTH_PROVIDER_CONFIGS[builtin.oauthProvider],
    );

    const authorizeUrlRaw =
      typeof providerConfig.authorizeUrl === "string" ? providerConfig.authorizeUrl.trim() : "";
    const clientId =
      typeof providerConfig.clientId === "string" ? providerConfig.clientId.trim() : "";
    if (!authorizeUrlRaw || !clientId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, "OAuth provider is missing authorizeUrl/clientId"),
      );
      return;
    }
    const authorizeUrl = normalizeCallbackUrl(authorizeUrlRaw);
    if (!authorizeUrl) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "authorizeUrl must be http(s)"),
      );
      return;
    }

    pruneOAuthStateStore();
    const now = Date.now();
    const expiresAt = now + OAUTH_STATE_TTL_MS;
    const state = crypto.randomUUID();
    oauthStateStore.set(state, {
      connectorId: p.id,
      provider: builtin.oauthProvider,
      callbackUrl,
      createdAt: now,
      expiresAt,
    });

    const scopeFromProvider = Array.isArray(providerConfig.scopes)
      ? providerConfig.scopes.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0,
        )
      : [];
    const scopes = scopeFromProvider.length > 0 ? scopeFromProvider : (builtin.defaultScopes ?? []);

    const url = new URL(authorizeUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", callbackUrl);
    url.searchParams.set("state", state);
    if (scopes.length > 0) {
      url.searchParams.set("scope", scopes.join(" "));
    }

    const extraAuthorizeParams = providerConfig.extraAuthorizeParams;
    if (extraAuthorizeParams && typeof extraAuthorizeParams === "object") {
      for (const [key, value] of Object.entries(extraAuthorizeParams)) {
        if (typeof value === "string" && key.trim()) {
          url.searchParams.set(key.trim(), value);
        }
      }
    }

    respond(true, { authorizeUrl: url.toString(), state, expiresAt }, undefined);
  },

  "connectors.oauth.complete": async ({ params, respond }) => {
    if (!validateConnectorsOAuthCompleteParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid connectors.oauth.complete params: ${formatValidationErrors(validateConnectorsOAuthCompleteParams.errors)}`,
        ),
      );
      return;
    }

    const p = params as { id: string; callbackUrl: string; state: string; code: string };
    pruneOAuthStateStore();
    const stateRecord = oauthStateStore.get(p.state);
    if (!stateRecord) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "OAuth state is invalid or expired"),
      );
      return;
    }
    oauthStateStore.delete(p.state);

    const callbackUrl = normalizeCallbackUrl(p.callbackUrl);
    if (!callbackUrl || callbackUrl !== stateRecord.callbackUrl) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "callbackUrl mismatch"));
      return;
    }
    if (stateRecord.connectorId !== p.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "connector id mismatch"));
      return;
    }

    const cfg = loadConfig();
    const providerConfig = normalizeOAuthProviderConfig(
      getConnectorOAuthProviders(cfg)[stateRecord.provider],
      DEFAULT_OAUTH_PROVIDER_CONFIGS[stateRecord.provider],
    );

    let tokenPayload: Record<string, unknown>;
    try {
      tokenPayload = await exchangeOAuthCode({ providerConfig, code: p.code, callbackUrl });
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          error instanceof Error ? error.message : "OAuth token exchange failed",
        ),
      );
      return;
    }

    const now = Date.now();
    const expiresIn =
      typeof tokenPayload.expires_in === "number" && Number.isFinite(tokenPayload.expires_in)
        ? tokenPayload.expires_in
        : undefined;

    const { connectors, entries } = ensureConnectorRoot(cfg);
    const current: Partial<ConnectorEntry> = entries[p.id] ? { ...entries[p.id] } : {};
    current.type = current.type ?? "app";
    current.authMode = "oauth";
    current.status = "connected";
    const nextOauth: Record<string, unknown> =
      current.oauth && typeof current.oauth === "object"
        ? { ...(current.oauth as Record<string, unknown>) }
        : {};
    nextOauth.provider = stateRecord.provider;
    nextOauth.connectedAt = now;
    if (expiresIn != null) {
      nextOauth.expiresAt = now + expiresIn * 1000;
    }
    if (typeof tokenPayload.access_token === "string") {
      nextOauth.accessToken = tokenPayload.access_token;
    }
    if (typeof tokenPayload.refresh_token === "string") {
      nextOauth.refreshToken = tokenPayload.refresh_token;
    }
    if (typeof tokenPayload.token_type === "string") {
      nextOauth.tokenType = tokenPayload.token_type;
    }
    if (typeof tokenPayload.scope === "string") {
      nextOauth.scope = tokenPayload.scope;
    }
    current.oauth = nextOauth;
    entries[p.id] = current as ConnectorEntry;
    connectors.entries = entries;

    await writeConfigFile({
      ...cfg,
      connectors,
    });

    respond(true, { ok: true, id: p.id, status: "connected" }, undefined);
  },

  "connectors.oauth.status": ({ params, respond }) => {
    if (!validateConnectorsOAuthStatusParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid connectors.oauth.status params: ${formatValidationErrors(validateConnectorsOAuthStatusParams.errors)}`,
        ),
      );
      return;
    }

    const p = params as { id: string };
    const cfg = loadConfig();
    const entries = getConnectorEntries(cfg);
    const current = entries[p.id];
    const status = resolveConnectorStatus(current);
    const oauth =
      current?.oauth && typeof current.oauth === "object"
        ? (current.oauth as Record<string, unknown>)
        : undefined;

    respond(
      true,
      {
        id: p.id,
        status,
        connectedAt: typeof oauth?.connectedAt === "number" ? oauth.connectedAt : undefined,
        expiresAt: typeof oauth?.expiresAt === "number" ? oauth.expiresAt : undefined,
      },
      undefined,
    );
  },

  "connectors.session.get": ({ params, respond }) => {
    if (!validateConnectorsSessionGetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid connectors.session.get params: ${formatValidationErrors(validateConnectorsSessionGetParams.errors)}`,
        ),
      );
      return;
    }

    const p = params as { sessionKey: string };
    const sessionKey = p.sessionKey.trim();
    const cfg = loadConfig();
    const sessions = getConnectorSessions(cfg);
    const connectorIds = normalizeConnectorIds(sessions[sessionKey]?.connectorIds);
    respond(true, { sessionKey, connectorIds }, undefined);
  },

  "connectors.session.set": async ({ params, respond }) => {
    if (!validateConnectorsSessionSetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid connectors.session.set params: ${formatValidationErrors(validateConnectorsSessionSetParams.errors)}`,
        ),
      );
      return;
    }

    const p = params as { sessionKey: string; connectorIds: string[] };
    const sessionKey = p.sessionKey.trim();
    if (!sessionKey) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionKey is required"));
      return;
    }

    const cfg = loadConfig();
    const { connectors, sessions } = ensureConnectorRoot(cfg);
    sessions[sessionKey] = {
      connectorIds: normalizeConnectorIds(p.connectorIds),
    };
    connectors.sessions = sessions;

    await writeConfigFile({
      ...cfg,
      connectors,
    });

    respond(
      true,
      { ok: true, sessionKey, connectorIds: sessions[sessionKey].connectorIds ?? [] },
      undefined,
    );
  },
};
