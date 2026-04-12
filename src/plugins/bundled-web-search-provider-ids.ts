import { normalizeLowercaseStringOrEmpty } from "../shared/string-coerce.js";
import {
  resolveManifestContractOwnerPluginId,
  resolveManifestContractPluginIds,
} from "./manifest-registry.js";

const BUNDLED_WEB_SEARCH_PLUGIN_ID_SET = new Set(
  resolveManifestContractPluginIds({
    contract: "webSearchProviders",
    origin: "bundled",
  }),
);

export function resolveBundledWebSearchPluginId(providerId: string | undefined): string | undefined {
  const normalizedProviderId = normalizeLowercaseStringOrEmpty(providerId);
  if (!normalizedProviderId) {
    return undefined;
  }

  if (BUNDLED_WEB_SEARCH_PLUGIN_ID_SET.has(normalizedProviderId)) {
    return normalizedProviderId;
  }

  return resolveManifestContractOwnerPluginId({
    contract: "webSearchProviders",
    origin: "bundled",
    value: normalizedProviderId,
  });
}
