import type { RuntimeVersionEnv } from "../version.js";
import { resolveRuntimeServiceVersion } from "../version.js";
import { normalizeProviderId } from "./provider-id.js";

export type ProviderAttributionVerification =
  | "vendor-documented"
  | "vendor-hidden-api-spec"
  | "vendor-sdk-hook-only"
  | "internal-runtime";

export type ProviderAttributionHook =
  | "request-headers"
  | "default-headers"
  | "user-agent-extra"
  | "custom-user-agent";

export type ProviderAttributionPolicy = {
  provider: string;
  enabledByDefault: boolean;
  verification: ProviderAttributionVerification;
  hook?: ProviderAttributionHook;
  docsUrl?: string;
  reviewNote?: string;
  product: string;
  version: string;
  headers?: Record<string, string>;
};

export type ProviderAttributionIdentity = Pick<ProviderAttributionPolicy, "product" | "version">;

export type ProviderRequestCapability = "llm" | "image" | "audio" | "video" | "other";

export type ProviderRequestTransport = "http" | "stream" | "media-understanding" | "websocket";

export type ProviderEndpointClass =
  | "default"
  | "openai-public"
  | "openrouter"
  | "moonshot-native"
  | "modelstudio-native"
  | "zai-native"
  | "cerebras-native"
  | "chutes-native"
  | "deepseek-native"
  | "mistral-public"
  | "opencode-native"
  | "xai-native"
  | "custom-openai-compatible";

export type ProviderRequestCapabilities = {
  endpointClass: ProviderEndpointClass;
  knownProviderFamily: string;
  supportsNativeStreamingUsageCompat: boolean;
  usesExplicitProxyLikeEndpoint: boolean;
};

export type ProviderRequestPolicyResolution = {
  provider: string;
  endpointClass: ProviderEndpointClass;
  knownProviderFamily: string;
  capability: ProviderRequestCapability;
  transport: ProviderRequestTransport;
  attributionHeaders?: Record<string, string>;
};

const OPENCLAW_ATTRIBUTION_PRODUCT = "OpenClaw";
const OPENCLAW_ATTRIBUTION_ORIGINATOR = "openclaw";

export function resolveProviderAttributionIdentity(
  env: RuntimeVersionEnv = process.env as RuntimeVersionEnv,
): ProviderAttributionIdentity {
  return {
    product: OPENCLAW_ATTRIBUTION_PRODUCT,
    version: resolveRuntimeServiceVersion(env),
  };
}

function buildOpenRouterAttributionPolicy(
  env: RuntimeVersionEnv = process.env as RuntimeVersionEnv,
): ProviderAttributionPolicy {
  const identity = resolveProviderAttributionIdentity(env);
  return {
    provider: "openrouter",
    enabledByDefault: true,
    verification: "vendor-documented",
    hook: "request-headers",
    docsUrl: "https://openrouter.ai/docs/app-attribution",
    reviewNote: "Documented app attribution headers. Verified in OpenClaw runtime wrapper.",
    ...identity,
    headers: {
      "HTTP-Referer": "https://openclaw.ai",
      "X-OpenRouter-Title": identity.product,
      "X-OpenRouter-Categories": "cli-agent",
    },
  };
}

function buildOpenAIAttributionPolicy(
  env: RuntimeVersionEnv = process.env as RuntimeVersionEnv,
): ProviderAttributionPolicy {
  const identity = resolveProviderAttributionIdentity(env);
  return {
    provider: "openai",
    enabledByDefault: true,
    verification: "vendor-hidden-api-spec",
    hook: "request-headers",
    reviewNote:
      "OpenAI native traffic supports hidden originator/User-Agent attribution. Verified against the Codex wire contract.",
    ...identity,
    headers: {
      originator: OPENCLAW_ATTRIBUTION_ORIGINATOR,
      version: identity.version,
      "User-Agent": `${OPENCLAW_ATTRIBUTION_ORIGINATOR}/${identity.version}`,
    },
  };
}

function buildOpenAICodexAttributionPolicy(
  env: RuntimeVersionEnv = process.env as RuntimeVersionEnv,
): ProviderAttributionPolicy {
  const identity = resolveProviderAttributionIdentity(env);
  return {
    provider: "openai-codex",
    enabledByDefault: true,
    verification: "vendor-hidden-api-spec",
    hook: "request-headers",
    reviewNote:
      "OpenAI Codex ChatGPT-backed traffic supports the same hidden originator/User-Agent attribution contract.",
    ...identity,
    headers: {
      originator: OPENCLAW_ATTRIBUTION_ORIGINATOR,
      version: identity.version,
      "User-Agent": `${OPENCLAW_ATTRIBUTION_ORIGINATOR}/${identity.version}`,
    },
  };
}

function buildSdkHookOnlyPolicy(
  provider: string,
  hook: ProviderAttributionHook,
  reviewNote: string,
  env: RuntimeVersionEnv = process.env as RuntimeVersionEnv,
): ProviderAttributionPolicy {
  return {
    provider,
    enabledByDefault: false,
    verification: "vendor-sdk-hook-only",
    hook,
    reviewNote,
    ...resolveProviderAttributionIdentity(env),
  };
}

export function listProviderAttributionPolicies(
  env: RuntimeVersionEnv = process.env as RuntimeVersionEnv,
): ProviderAttributionPolicy[] {
  return [
    buildOpenRouterAttributionPolicy(env),
    buildOpenAIAttributionPolicy(env),
    buildOpenAICodexAttributionPolicy(env),
    buildSdkHookOnlyPolicy(
      "anthropic",
      "default-headers",
      "Anthropic JS SDK exposes defaultHeaders, but app attribution is not yet verified.",
      env,
    ),
    buildSdkHookOnlyPolicy(
      "google",
      "user-agent-extra",
      "Google GenAI JS SDK exposes userAgentExtra/httpOptions, but provider-side attribution is not yet verified.",
      env,
    ),
    buildSdkHookOnlyPolicy(
      "groq",
      "default-headers",
      "Groq JS SDK exposes defaultHeaders, but app attribution is not yet verified.",
      env,
    ),
    buildSdkHookOnlyPolicy(
      "mistral",
      "custom-user-agent",
      "Mistral JS SDK exposes a custom userAgent option, but app attribution is not yet verified.",
      env,
    ),
    buildSdkHookOnlyPolicy(
      "together",
      "default-headers",
      "Together JS SDK exposes defaultHeaders, but app attribution is not yet verified.",
      env,
    ),
  ];
}

export function resolveProviderAttributionPolicy(
  provider?: string | null,
  env: RuntimeVersionEnv = process.env as RuntimeVersionEnv,
): ProviderAttributionPolicy | undefined {
  const normalized = normalizeProviderId(provider ?? "");
  return listProviderAttributionPolicies(env).find((policy) => policy.provider === normalized);
}

export function resolveProviderAttributionHeaders(
  provider?: string | null,
  env: RuntimeVersionEnv = process.env as RuntimeVersionEnv,
): Record<string, string> | undefined {
  const policy = resolveProviderAttributionPolicy(provider, env);
  if (!policy?.enabledByDefault) {
    return undefined;
  }
  return policy.headers;
}

function resolveHost(baseUrl?: string | null): string | undefined {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function resolveProviderEndpointClass(params: {
  provider?: string | null;
  baseUrl?: string | null;
}): ProviderEndpointClass {
  const provider = normalizeProviderId(params.provider ?? "");
  const host = resolveHost(params.baseUrl);

  if (!host) {
    if (provider === "openrouter") {
      return "openrouter";
    }
    if (provider === "moonshot") {
      return "moonshot-native";
    }
    if (provider === "modelstudio") {
      return "modelstudio-native";
    }
    if (provider === "zai") {
      return "zai-native";
    }
    if (provider === "cerebras") {
      return "cerebras-native";
    }
    if (provider === "chutes") {
      return "chutes-native";
    }
    if (provider === "deepseek") {
      return "deepseek-native";
    }
    if (provider === "mistral") {
      return "mistral-public";
    }
    if (provider === "opencode") {
      return "opencode-native";
    }
    if (provider === "xai") {
      return "xai-native";
    }
    if (provider === "openai" || provider === "openai-codex") {
      return "default";
    }
    return "default";
  }

  if (host.includes("openrouter.ai")) {
    return "openrouter";
  }
  if (host === "api.openai.com" || host.endsWith(".openai.com")) {
    return "openai-public";
  }
  if (host.includes("moonshot")) {
    return "moonshot-native";
  }
  if (host.includes("modelstudio")) {
    return "modelstudio-native";
  }
  if (host.includes("z.ai") || host.includes("bigmodel.cn")) {
    return "zai-native";
  }
  if (host.includes("cerebras")) {
    return "cerebras-native";
  }
  if (host.includes("chutes")) {
    return "chutes-native";
  }
  if (host.includes("deepseek")) {
    return "deepseek-native";
  }
  if (host.includes("mistral")) {
    return "mistral-public";
  }
  if (host.includes("opencode")) {
    return "opencode-native";
  }
  if (host.includes("x.ai") || host.includes("xai")) {
    return "xai-native";
  }
  return "custom-openai-compatible";
}

function resolveKnownProviderFamily(params: {
  provider?: string | null;
  endpointClass: ProviderEndpointClass;
}): string {
  const provider = normalizeProviderId(params.provider ?? "");
  if (provider === "openai-codex") {
    return "openai";
  }
  if (provider) {
    return provider;
  }
  if (params.endpointClass === "openai-public" || params.endpointClass === "default") {
    return "openai";
  }
  return params.endpointClass.replace(/-(native|public)$/u, "");
}

export function resolveProviderRequestCapabilities(params: {
  provider?: string | null;
  api?: string;
  baseUrl?: string | null;
  capability?: ProviderRequestCapability;
  transport?: ProviderRequestTransport;
  compat?: {
    supportsStore?: boolean;
  } | null;
  modelId?: string | null;
}): ProviderRequestCapabilities {
  const endpointClass = resolveProviderEndpointClass({
    provider: params.provider,
    baseUrl: params.baseUrl,
  });
  const knownProviderFamily = resolveKnownProviderFamily({
    provider: params.provider,
    endpointClass,
  });
  return {
    endpointClass,
    knownProviderFamily,
    supportsNativeStreamingUsageCompat:
      endpointClass === "default" ||
      endpointClass === "openai-public" ||
      endpointClass === "openrouter" ||
      params.compat?.supportsStore === true,
    usesExplicitProxyLikeEndpoint:
      endpointClass === "openrouter" || endpointClass === "custom-openai-compatible",
  };
}

export function resolveProviderRequestPolicy(params: {
  provider?: string | null;
  api?: string;
  baseUrl?: string | null;
  capability?: ProviderRequestCapability;
  transport?: ProviderRequestTransport;
}): ProviderRequestPolicyResolution {
  const capability = params.capability ?? "llm";
  const transport = params.transport ?? "http";
  const capabilities = resolveProviderRequestCapabilities({
    provider: params.provider,
    api: params.api,
    baseUrl: params.baseUrl,
    capability,
    transport,
  });
  const normalizedProvider = normalizeProviderId(params.provider ?? "");
  const provider = normalizedProvider || capabilities.knownProviderFamily;
  const attributionHeaders =
    capability === "llm" && transport !== "media-understanding"
      ? resolveProviderAttributionHeaders(provider)
      : undefined;
  return {
    provider,
    endpointClass: capabilities.endpointClass,
    knownProviderFamily: capabilities.knownProviderFamily,
    capability,
    transport,
    ...(attributionHeaders ? { attributionHeaders } : {}),
  };
}
