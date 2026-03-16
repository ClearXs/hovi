import { requireApiKey, resolveApiKeyForProvider } from "../agents/model-auth.js";
import type { SsrFPolicy } from "../infra/net/ssrf.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { normalizeSecretInput } from "../utils/normalize-secret-input.js";
import type { EmbeddingProviderOptions } from "./embeddings.js";
import { buildRemoteBaseUrlPolicy } from "./remote-http.js";
import { resolveMemorySecretInputString } from "./secret-input.js";

const log = createSubsystemLogger("memory");

export type RemoteEmbeddingProviderId = "openai" | "voyage" | "mistral";

export async function resolveRemoteEmbeddingBearerClient(params: {
  provider: RemoteEmbeddingProviderId;
  options: EmbeddingProviderOptions;
  defaultBaseUrl: string;
}): Promise<{ baseUrl: string; headers: Record<string, string>; ssrfPolicy?: SsrFPolicy }> {
  const remote = params.options.remote;
  const remoteApiKey = resolveMemorySecretInputString({
    value: remote?.apiKey,
    path: "agents.*.memorySearch.remote.apiKey",
  });
  log.info(
    `resolveRemoteEmbeddingBearerClient: remoteApiKey=${remoteApiKey ? "present" : "empty"}`,
  );
  const remoteBaseUrl = remote?.baseUrl?.trim();
  log.info(`resolveRemoteEmbeddingBearerClient: remoteBaseUrl=${remoteBaseUrl || "empty"}`);
  const providerConfig = params.options.config.models?.providers?.[params.provider];
  log.info(
    `resolveRemoteEmbeddingBearerClient: providerConfig baseUrl=${providerConfig?.baseUrl || "empty"}`,
  );

  // 优先使用配置文件中的 apiKey，而不是环境变量
  const configApiKey = normalizeSecretInput(providerConfig?.apiKey);
  log.info(
    `resolveRemoteEmbeddingBearerClient: configApiKey present=${!!configApiKey}, first4=${configApiKey?.substring(0, 4) || "N/A"}`,
  );

  let apiKey: string;
  if (configApiKey) {
    // 优先使用配置文件中的 API key
    apiKey = configApiKey;
    log.info(`resolveRemoteEmbeddingBearerClient: using configApiKey`);
  } else {
    // 配置文件没有才用 resolveApiKeyForProvider（会读取环境变量）
    log.info(
      `resolveRemoteEmbeddingBearerClient: configApiKey not found, falling back to resolveApiKeyForProvider`,
    );
    const resolvedAuth = await resolveApiKeyForProvider({
      provider: params.provider,
      cfg: params.options.config,
      agentDir: params.options.agentDir,
    });
    log.info(`resolveRemoteEmbeddingBearerClient: resolvedAuth source=${resolvedAuth.source}`);
    apiKey = requireApiKey(resolvedAuth, params.provider);
  }

  log.info(
    `resolveRemoteEmbeddingBearerClient: final apiKey present=${!!apiKey}, first4=${apiKey?.substring(0, 4) || "N/A"}`,
  );
  const baseUrl = remoteBaseUrl || providerConfig?.baseUrl?.trim() || params.defaultBaseUrl;
  log.info(`resolveRemoteEmbeddingBearerClient: final baseUrl=${baseUrl}`);
  const headerOverrides = Object.assign({}, providerConfig?.headers, remote?.headers);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...headerOverrides,
  };
  return { baseUrl, headers, ssrfPolicy: buildRemoteBaseUrlPolicy(baseUrl) };
}
