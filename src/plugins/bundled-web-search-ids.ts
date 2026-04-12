import { resolveManifestContractPluginIds } from "./manifest-registry.js";

export const BUNDLED_WEB_SEARCH_PLUGIN_IDS = resolveManifestContractPluginIds({
  contract: "webSearchProviders",
  origin: "bundled",
});

export function listBundledWebSearchPluginIds(): string[] {
  return [...BUNDLED_WEB_SEARCH_PLUGIN_IDS];
}
