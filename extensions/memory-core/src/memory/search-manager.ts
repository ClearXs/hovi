import {
  createSubsystemLogger,
  resolveAgentWorkspaceDir,
  resolveGlobalSingleton,
  type OpenClawConfig,
} from "openclaw/plugin-sdk/memory-core-host-engine-foundation";
import { checkQmdBinaryAvailability } from "openclaw/plugin-sdk/memory-core-host-engine-qmd";
import {
  resolveMemoryBackendConfig,
  requireNodeSqlite,
  type MemoryEmbeddingProbeResult,
  type MemorySearchManager,
  type MemorySearchOverrides,
  type MemorySyncProgressUpdate,
  type ResolvedQmdConfig,
} from "openclaw/plugin-sdk/memory-core-host-engine-storage";

const MEMORY_SEARCH_MANAGER_CACHE_KEY = Symbol.for("openclaw.memorySearchManagerCache");
type MemorySearchManagerCacheStore = {
  qmdManagerCache: Map<string, MemorySearchManager>;
};

function getMemorySearchManagerCacheStore(): MemorySearchManagerCacheStore {
  // Keep caches reachable across `vi.resetModules()` so later cleanup can close older instances.
  return resolveGlobalSingleton<MemorySearchManagerCacheStore>(
    MEMORY_SEARCH_MANAGER_CACHE_KEY,
    () => ({
      qmdManagerCache: new Map<string, MemorySearchManager>(),
    }),
  );
}

const log = createSubsystemLogger("memory");
import { resolveAgentDir } from "../../../../src/agents/agent-scope.js";
import { resolveKnowledgeConfig } from "../../../../src/agents/knowledge-config.js";
const { qmdManagerCache: QMD_MANAGER_CACHE } = getMemorySearchManagerCacheStore();
let managerRuntimePromise: Promise<typeof import("./manager-runtime.js")> | null = null;

function loadManagerRuntime() {
  managerRuntimePromise ??= import("./manager-runtime.js");
  return managerRuntimePromise;
}

// 检查是否需要使用 fallback（当知识库集成启用时）
function shouldUseFallbackForKnowledge(cfg: OpenClawConfig, agentId: string): boolean {
  const knowledgeConfig = resolveKnowledgeConfig(cfg, agentId);
  return knowledgeConfig?.search.includeInMemorySearch ?? false;
}

export type MemorySearchManagerResult = {
  manager: MemorySearchManager | null;
  error?: string;
};

export async function getMemorySearchManager(params: {
  cfg: OpenClawConfig;
  agentId: string;
  purpose?: "default" | "status";
}): Promise<MemorySearchManagerResult> {
  const resolved = resolveMemoryBackendConfig(params);
  // 当知识库集成启用时，跳过 QMD 直接使用 fallback，以确保知识库能被搜索
  const useKnowledgeFallback = shouldUseFallbackForKnowledge(params.cfg, params.agentId);
  if (resolved.backend === "qmd" && resolved.qmd && !useKnowledgeFallback) {
    const statusOnly = params.purpose === "status";
    const baseCacheKey = buildQmdCacheKey(params.agentId, resolved.qmd);
    const cacheKey = `${baseCacheKey}:${statusOnly ? "status" : "full"}`;
    const cached = QMD_MANAGER_CACHE.get(cacheKey);
    if (cached) {
      return { manager: cached };
    }
    if (statusOnly) {
      const fullCached = QMD_MANAGER_CACHE.get(`${baseCacheKey}:full`);
      if (fullCached) {
        // Status callers often close the manager they receive. Wrap the live
        // full manager with a no-op close so health/status probes do not tear
        // down the active QMD manager for the process.
        return { manager: new BorrowedMemoryManager(fullCached) };
      }
    }

    const qmdBinary = await checkQmdBinaryAvailability({
      command: resolved.qmd.command,
      env: process.env,
      cwd: resolveAgentWorkspaceDir(params.cfg, params.agentId),
    });
    if (!qmdBinary.available) {
      log.warn(
        `qmd binary unavailable (${resolved.qmd.command}); falling back to builtin: ${qmdBinary.error ?? "unknown error"}`,
      );
    } else {
      try {
        const { QmdMemoryManager } = await import("./qmd-manager.js");
        const primary = await QmdMemoryManager.create({
          cfg: params.cfg,
          agentId: params.agentId,
          resolved,
          mode: statusOnly ? "status" : "full",
        });
        if (primary) {
          if (statusOnly) {
            return { manager: primary };
          }
          const wrapper = new FallbackMemoryManager(
            {
              primary,
              fallbackFactory: async () => {
                const { MemoryIndexManager } = await loadManagerRuntime();
                return await MemoryIndexManager.get(params);
              },
            },
            () => {
              QMD_MANAGER_CACHE.delete(cacheKey);
            },
          );
          QMD_MANAGER_CACHE.set(cacheKey, wrapper);
          return { manager: wrapper };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`qmd memory unavailable; falling back to builtin: ${message}`);
      }
    }
  }

  try {
    const { MemoryIndexManager } = await loadManagerRuntime();
    const overrides = loadKnowledgeVectorOverrides(params.cfg, params.agentId);
    const manager = await MemoryIndexManager.get({ ...params, overrides });
    return { manager };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { manager: null, error: message };
  }
}

class BorrowedMemoryManager implements MemorySearchManager {
  constructor(private readonly inner: MemorySearchManager) {}

  async search(
    query: string,
    opts?: { maxResults?: number; minScore?: number; sessionKey?: string },
  ) {
    return await this.inner.search(query, opts);
  }

  async readFile(params: { relPath: string; from?: number; lines?: number }) {
    return await this.inner.readFile(params);
  }

  status() {
    return this.inner.status();
  }

  async sync(params?: {
    reason?: string;
    force?: boolean;
    sessionFiles?: string[];
    progress?: (update: MemorySyncProgressUpdate) => void;
  }) {
    await this.inner.sync?.(params);
  }

  async probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult> {
    return await this.inner.probeEmbeddingAvailability();
  }

  async probeVectorAvailability() {
    return await this.inner.probeVectorAvailability();
  }

  async close() {}
}

export async function closeAllMemorySearchManagers(): Promise<void> {
  const managers = Array.from(QMD_MANAGER_CACHE.values());
  QMD_MANAGER_CACHE.clear();
  for (const manager of managers) {
    try {
      await manager.close?.();
    } catch (err) {
      log.warn(`failed to close qmd memory manager: ${String(err)}`);
    }
  }
  if (managerRuntimePromise !== null) {
    const { closeAllMemoryIndexManagers } = await loadManagerRuntime();
    await closeAllMemoryIndexManagers();
  }
}

class FallbackMemoryManager implements MemorySearchManager {
  private fallback: MemorySearchManager | null = null;
  private primaryFailed = false;
  private lastError?: string;
  private cacheEvicted = false;

  constructor(
    private readonly deps: {
      primary: MemorySearchManager;
      fallbackFactory: () => Promise<MemorySearchManager | null>;
    },
    private readonly onClose?: () => void,
  ) {}

  async search(
    query: string,
    opts?: { maxResults?: number; minScore?: number; sessionKey?: string },
  ) {
    if (!this.primaryFailed) {
      try {
        return await this.deps.primary.search(query, opts);
      } catch (err) {
        this.primaryFailed = true;
        this.lastError = err instanceof Error ? err.message : String(err);
        log.warn(`qmd memory failed; switching to builtin index: ${this.lastError}`);
        await this.deps.primary.close?.().catch(() => {});
        // Evict the failed wrapper so the next request can retry QMD with a fresh manager.
        this.evictCacheEntry();
      }
    }
    const fallback = await this.ensureFallback();
    if (fallback) {
      return await fallback.search(query, opts);
    }
    throw new Error(this.lastError ?? "memory search unavailable");
  }

  async readFile(params: { relPath: string; from?: number; lines?: number }) {
    if (!this.primaryFailed) {
      return await this.deps.primary.readFile(params);
    }
    const fallback = await this.ensureFallback();
    if (fallback) {
      return await fallback.readFile(params);
    }
    throw new Error(this.lastError ?? "memory read unavailable");
  }

  status() {
    if (!this.primaryFailed) {
      return this.deps.primary.status();
    }
    const fallbackStatus = this.fallback?.status();
    const fallbackInfo = { from: "qmd", reason: this.lastError ?? "unknown" };
    if (fallbackStatus) {
      const custom = fallbackStatus.custom ?? {};
      return {
        ...fallbackStatus,
        fallback: fallbackInfo,
        custom: {
          ...custom,
          fallback: { disabled: true, reason: this.lastError ?? "unknown" },
        },
      };
    }
    const primaryStatus = this.deps.primary.status();
    const custom = primaryStatus.custom ?? {};
    return {
      ...primaryStatus,
      fallback: fallbackInfo,
      custom: {
        ...custom,
        fallback: { disabled: true, reason: this.lastError ?? "unknown" },
      },
    };
  }

  async sync(params?: {
    reason?: string;
    force?: boolean;
    sessionFiles?: string[];
    progress?: (update: MemorySyncProgressUpdate) => void;
  }) {
    if (!this.primaryFailed) {
      await this.deps.primary.sync?.(params);
      return;
    }
    const fallback = await this.ensureFallback();
    await fallback?.sync?.(params);
  }

  async probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult> {
    if (!this.primaryFailed) {
      return await this.deps.primary.probeEmbeddingAvailability();
    }
    const fallback = await this.ensureFallback();
    if (fallback) {
      return await fallback.probeEmbeddingAvailability();
    }
    return { ok: false, error: this.lastError ?? "memory embeddings unavailable" };
  }

  async probeVectorAvailability() {
    if (!this.primaryFailed) {
      return await this.deps.primary.probeVectorAvailability();
    }
    const fallback = await this.ensureFallback();
    return (await fallback?.probeVectorAvailability()) ?? false;
  }

  async close() {
    await this.deps.primary.close?.();
    await this.fallback?.close?.();
    this.evictCacheEntry();
  }

  private async ensureFallback(): Promise<MemorySearchManager | null> {
    if (this.fallback) {
      return this.fallback;
    }
    let fallback: MemorySearchManager | null;
    try {
      fallback = await this.deps.fallbackFactory();
      if (!fallback) {
        log.warn("memory fallback requested but builtin index is unavailable");
        return null;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`memory fallback unavailable: ${message}`);
      return null;
    }
    this.fallback = fallback;
    return this.fallback;
  }

  private evictCacheEntry(): void {
    if (this.cacheEvicted) {
      return;
    }
    this.cacheEvicted = true;
    this.onClose?.();
  }
}

function buildQmdCacheKey(agentId: string, config: ResolvedQmdConfig): string {
  return `${agentId}:${stableSerialize(config)}`;
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }
  if (value && typeof value === "object") {
    const sortedEntries = Object.keys(value as Record<string, unknown>)
      .toSorted((a, b) => a.localeCompare(b))
      .map((key) => [key, sortValue((value as Record<string, unknown>)[key])]);
    return Object.fromEntries(sortedEntries);
  }
  return value;
}

function loadKnowledgeVectorOverrides(
  cfg: OpenClawConfig,
  agentId: string,
): MemorySearchOverrides | undefined {
  const knowledgeConfig = resolveKnowledgeConfig(cfg, agentId);
  // 首先检查全局配置是否启用了 includeInMemorySearch
  if (!knowledgeConfig?.search.includeInMemorySearch) {
    return undefined;
  }
  const { DatabaseSync } = requireNodeSqlite();
  const agentDir = resolveAgentDir(cfg, agentId);
  const db = new DatabaseSync(`${agentDir}/memory.db`);
  try {
    const row = db
      .prepare(`SELECT vector_config, search_config FROM kb_settings WHERE owner_agent_id = ?`)
      .get(agentId) as { vector_config?: string | null; search_config?: string | null } | undefined;

    // 检查用户是否在知识库设置中明确禁用了 includeInMemorySearch
    if (row?.search_config) {
      const searchParsed = JSON.parse(row.search_config) as { includeInMemorySearch?: boolean };
      if (searchParsed.includeInMemorySearch === false) {
        return undefined;
      }
    }

    if (!row?.vector_config) {
      return undefined;
    }
    const parsed = JSON.parse(row.vector_config) as MemorySearchOverrides & { enabled?: boolean };
    if (parsed.enabled === false) {
      return undefined;
    }
    const overrides: MemorySearchOverrides = {};
    if (parsed.provider) {
      overrides.provider = parsed.provider;
    }
    if (parsed.model) {
      overrides.model = parsed.model;
    }
    return Object.keys(overrides).length ? overrides : undefined;
  } catch {
    return undefined;
  } finally {
    db.close();
  }
}
