const DEFAULT_DESKTOP_HTTP_URL = "http://127.0.0.1:18789";
const DEFAULT_DESKTOP_WS_URL = "ws://127.0.0.1:18789";
const DEFAULT_BROWSER_HTTP_URL = "http://localhost:8000";
const DEFAULT_BROWSER_WS_URL = "ws://localhost:18789";
const CONNECTOR_OAUTH_CALLBACK_PATH = "/oauth/connectors/callback";
const GATEWAY_URL_STORAGE_KEY = "clawdbot.gateway.url";

type TauriWindow = Window & {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

type RuntimeLocationOptions = {
  tauri?: boolean;
  currentUrl?: string;
};

function getTauriWindow(): TauriWindow | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window as TauriWindow;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function toHttpBaseUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "ws:") {
      parsed.protocol = "http:";
    } else if (parsed.protocol === "wss:") {
      parsed.protocol = "https:";
    } else if (!/^https?:$/.test(parsed.protocol)) {
      return null;
    }
    return normalizeBaseUrl(parsed.toString());
  } catch {
    return null;
  }
}

function resolveCurrentUrl(opts?: RuntimeLocationOptions): URL | null {
  if (opts?.currentUrl) {
    try {
      return new URL(opts.currentUrl);
    } catch {
      return null;
    }
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    return new URL(window.location.href);
  } catch {
    return null;
  }
}

function resolveCurrentOrigin(opts?: RuntimeLocationOptions): string | null {
  const currentUrl = resolveCurrentUrl(opts);
  if (!currentUrl) {
    return null;
  }

  if (currentUrl.origin !== "null") {
    return currentUrl.origin;
  }

  return currentUrl.host ? `${currentUrl.protocol}//${currentUrl.host}` : null;
}

function isHttpOrigin(origin: string | null): origin is string {
  return typeof origin === "string" && /^https?:\/\//.test(origin);
}

function shouldUseRelativeGatewayPath(opts?: RuntimeLocationOptions): boolean {
  if (opts?.tauri ?? isTauriRuntime()) {
    return false;
  }
  return isHttpOrigin(resolveCurrentOrigin(opts));
}

export function isTauriRuntime(): boolean {
  const tauriWindow = getTauriWindow();

  return !!(tauriWindow?.__TAURI__ || tauriWindow?.__TAURI_INTERNALS__);
}

export function getGatewayHttpBaseUrl(opts?: RuntimeLocationOptions): string {
  if (opts?.tauri ?? isTauriRuntime()) {
    return DEFAULT_DESKTOP_HTTP_URL;
  }

  const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configuredUrl) {
    return normalizeBaseUrl(configuredUrl);
  }

  if (typeof window !== "undefined") {
    const storedGatewayUrl = toHttpBaseUrl(localStorage.getItem(GATEWAY_URL_STORAGE_KEY));
    if (storedGatewayUrl) {
      return storedGatewayUrl;
    }
  }

  const configuredWsUrl = toHttpBaseUrl(process.env.NEXT_PUBLIC_WS_URL);
  if (configuredWsUrl) {
    return configuredWsUrl;
  }

  const currentOrigin = resolveCurrentOrigin(opts);
  if (isHttpOrigin(currentOrigin)) {
    return normalizeBaseUrl(currentOrigin);
  }

  return DEFAULT_BROWSER_HTTP_URL;
}

export function getGatewayWsBaseUrl(opts?: { tauri?: boolean }): string {
  if (opts?.tauri ?? isTauriRuntime()) {
    return DEFAULT_DESKTOP_WS_URL;
  }

  return normalizeBaseUrl(process.env.NEXT_PUBLIC_WS_URL || DEFAULT_BROWSER_WS_URL);
}

export function buildGatewayUrl(path: string, opts?: RuntimeLocationOptions): string {
  if (shouldUseRelativeGatewayPath(opts) && path.startsWith("/")) {
    return path;
  }
  return new URL(path, `${getGatewayHttpBaseUrl(opts)}/`).toString();
}

export function getConnectorOAuthCallbackUrl(
  connectorId: string,
  opts?: RuntimeLocationOptions,
): string {
  const tauri = opts?.tauri ?? isTauriRuntime();
  const currentOrigin = resolveCurrentOrigin(opts);
  const callbackOrigin =
    tauri && !isHttpOrigin(currentOrigin)
      ? getGatewayHttpBaseUrl({ tauri: true })
      : currentOrigin || getGatewayHttpBaseUrl({ tauri });
  const callbackUrl = new URL(CONNECTOR_OAUTH_CALLBACK_PATH, `${callbackOrigin}/`);

  callbackUrl.searchParams.set("id", connectorId);
  if (currentOrigin) {
    callbackUrl.searchParams.set("openerOrigin", currentOrigin);
  }

  return callbackUrl.toString();
}

export function getConnectorOAuthMessageOrigins(opts?: RuntimeLocationOptions): string[] {
  const origins = new Set<string>();
  const currentOrigin = resolveCurrentOrigin(opts);
  const tauri = opts?.tauri ?? isTauriRuntime();

  if (currentOrigin) {
    origins.add(currentOrigin);
  }
  if (tauri) {
    origins.add(new URL(getGatewayHttpBaseUrl({ tauri: true })).origin);
  }

  return Array.from(origins);
}

export function getConnectorOAuthCallbackUrlFromLocation(
  opts?: RuntimeLocationOptions,
): string | null {
  const currentUrl = resolveCurrentUrl(opts);
  if (!currentUrl) {
    return null;
  }

  const callbackUrl = new URL(currentUrl.pathname, `${currentUrl.origin}/`);
  const id = currentUrl.searchParams.get("id")?.trim();
  const openerOrigin = currentUrl.searchParams.get("openerOrigin")?.trim();

  if (!id) {
    return null;
  }

  callbackUrl.searchParams.set("id", id);
  if (openerOrigin) {
    callbackUrl.searchParams.set("openerOrigin", openerOrigin);
  }

  return callbackUrl.toString();
}

export function getConnectorOAuthOpenerOriginFromLocation(
  opts?: RuntimeLocationOptions,
): string | null {
  const currentUrl = resolveCurrentUrl(opts);
  if (!currentUrl) {
    return null;
  }

  const openerOrigin = currentUrl.searchParams.get("openerOrigin")?.trim();
  return openerOrigin || currentUrl.origin;
}
