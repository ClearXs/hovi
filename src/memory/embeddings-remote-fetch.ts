import type { SsrFPolicy } from "../infra/net/ssrf.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { postJson } from "./post-json.js";

const log = createSubsystemLogger("memory");

export async function fetchRemoteEmbeddingVectors(params: {
  url: string;
  headers: Record<string, string>;
  ssrfPolicy?: SsrFPolicy;
  body: unknown;
  errorPrefix: string;
}): Promise<number[][]> {
  // Log URL (without sensitive headers) for debugging
  const safeHeaders = { ...params.headers };
  if (safeHeaders.Authorization) {
    safeHeaders.Authorization = "[REDACTED]";
  }
  log.info(`embedding request: ${params.url}, headers: ${JSON.stringify(safeHeaders)}`);

  return await postJson({
    url: params.url,
    headers: params.headers,
    ssrfPolicy: params.ssrfPolicy,
    body: params.body,
    errorPrefix: params.errorPrefix,
    parse: (payload) => {
      const typedPayload = payload as {
        data?: Array<{ embedding?: number[] }>;
      };
      const data = typedPayload.data ?? [];
      return data.map((entry) => entry.embedding ?? []);
    },
  });
}
