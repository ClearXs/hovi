import { requireApiKey, resolveApiKeyForProvider } from "../../../../src/agents/model-auth.js";
import type { SsrFPolicy } from "../../../../src/infra/net/ssrf.js";
import { normalizeSecretInput } from "../../../../src/utils/normalize-secret-input.js";
import type { EmbeddingProviderOptions } from "./embeddings.js";
import { buildRemoteBaseUrlPolicy } from "./remote-http.js";

export type RemoteEmbeddingProviderId = "openai" | "voyage" | "mistral";

export async function resolveRemoteEmbeddingBearerClient(params: {
  provider: RemoteEmbeddingProviderId;
  options: EmbeddingProviderOptions;
  defaultBaseUrl: string;
}): Promise<{ baseUrl: string; headers: Record<string, string>; ssrfPolicy?: SsrFPolicy }> {
  const remote = params.options.remote;
  const remoteBaseUrl = remote?.baseUrl?.trim();
  const providerConfig = params.options.config.models?.providers?.[params.provider];

  // 优先使用配置文件中的 apiKey，而不是环境变量
  const configApiKey = normalizeSecretInput(providerConfig?.apiKey);

  let apiKey: string;
  if (configApiKey) {
    // 优先使用配置文件中的 API key
    apiKey = configApiKey;
  } else {
    const resolvedAuth = await resolveApiKeyForProvider({
      provider: params.provider,
      cfg: params.options.config,
      agentDir: params.options.agentDir,
    });
    apiKey = requireApiKey(resolvedAuth, params.provider);
  }

  const baseUrl = remoteBaseUrl || providerConfig?.baseUrl?.trim() || params.defaultBaseUrl;
  const headerOverrides = Object.assign({}, providerConfig?.headers, remote?.headers);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...headerOverrides,
  };
  return { baseUrl, headers, ssrfPolicy: buildRemoteBaseUrlPolicy(baseUrl) };
}
