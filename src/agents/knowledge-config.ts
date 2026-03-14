import type { OpenClawConfig } from "../config/config.js";
import type { KnowledgeBaseConfig } from "../config/types.tools.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { resolveAgentConfig } from "./agent-scope.js";

/**
 * Resolved knowledge base configuration with defaults applied
 */
export type ResolvedKnowledgeConfig = {
  enabled: boolean;
  vectorization: {
    enabled: boolean;
    provider?: "openai" | "gemini" | "local" | "auto";
    model?: string;
  };
  graph: {
    enabled: boolean;
    extractor: "llm";
    provider?: string;
    model?: string;
    minTriples: number;
    maxTriples: number;
    triplesPerKTokens: number;
    maxDepth: number;
  };
  storage: {
    maxFileSize: number;
    maxDocuments: number;
  };
  formats: {
    pdf: { enabled: boolean; maxPages?: number };
    docx: { enabled: boolean };
    txt: { enabled: boolean };
    html: { enabled: boolean };
  };
  upload: {
    webApi: boolean;
    chatAttachments: boolean;
    allowedChannels?: string[];
  };
  search: {
    autoIndex: boolean;
    includeInMemorySearch: boolean;
  };
};

/**
 * Default knowledge base configuration
 */
const DEFAULT_KNOWLEDGE_CONFIG: ResolvedKnowledgeConfig = {
  enabled: true,
  vectorization: {
    enabled: true,
  },
  graph: {
    enabled: false,
    extractor: "llm",
    minTriples: 20,
    maxTriples: 400,
    triplesPerKTokens: 20,
    maxDepth: 2,
  },
  storage: {
    maxFileSize: 500 * 1024 * 1024, // 500MB - practically unlimited for most use cases
    maxDocuments: 1000,
  },
  formats: {
    pdf: { enabled: true },
    docx: { enabled: true },
    txt: { enabled: true },
    html: { enabled: true },
  },
  upload: {
    webApi: true,
    chatAttachments: true,
  },
  search: {
    autoIndex: true,
    includeInMemorySearch: true,
  },
};

/**
 * Resolves knowledge base configuration for a specific agent,
 * merging global defaults with agent-specific overrides.
 */
export function resolveKnowledgeConfig(
  cfg: OpenClawConfig,
  agentId: string,
): ResolvedKnowledgeConfig | null {
  const globalConfig = cfg.agents?.defaults?.tools?.knowledgeBase;
  const agentConfig = resolveAgentConfig(cfg, agentId);
  const agentOverrides =
    agentConfig?.tools?.knowledgeBase ?? resolveLegacyAgentOverrides(cfg, agentId);

  const merged: KnowledgeBaseConfig = {
    ...globalConfig,
    ...agentOverrides,
    storage: {
      ...globalConfig?.storage,
      ...agentOverrides?.storage,
    },
    formats: {
      ...globalConfig?.formats,
      ...agentOverrides?.formats,
      pdf: {
        ...globalConfig?.formats?.pdf,
        ...agentOverrides?.formats?.pdf,
      },
      docx: {
        ...globalConfig?.formats?.docx,
        ...agentOverrides?.formats?.docx,
      },
      txt: {
        ...globalConfig?.formats?.txt,
        ...agentOverrides?.formats?.txt,
      },
      html: {
        ...globalConfig?.formats?.html,
        ...agentOverrides?.formats?.html,
      },
    },
    upload: {
      ...globalConfig?.upload,
      ...agentOverrides?.upload,
    },
    search: {
      ...globalConfig?.search,
      ...agentOverrides?.search,
    },
    vectorization: {
      ...globalConfig?.vectorization,
      ...agentOverrides?.vectorization,
    },
    graph: {
      ...globalConfig?.graph,
      ...agentOverrides?.graph,
    },
  };

  const enabled = merged.enabled ?? DEFAULT_KNOWLEDGE_CONFIG.enabled;
  // If not enabled, return null
  if (!enabled) {
    return null;
  }

  // Apply defaults
  return {
    enabled: true,
    vectorization: {
      enabled:
        merged.vectorization?.enabled ??
        merged.search?.includeInMemorySearch ??
        DEFAULT_KNOWLEDGE_CONFIG.vectorization.enabled,
      provider: merged.vectorization?.provider,
      model: merged.vectorization?.model,
    },
    graph: {
      enabled: merged.graph?.enabled ?? DEFAULT_KNOWLEDGE_CONFIG.graph.enabled,
      extractor: merged.graph?.extractor ?? DEFAULT_KNOWLEDGE_CONFIG.graph.extractor,
      provider: merged.graph?.provider,
      model: merged.graph?.model,
      minTriples: merged.graph?.minTriples ?? DEFAULT_KNOWLEDGE_CONFIG.graph.minTriples,
      maxTriples: merged.graph?.maxTriples ?? DEFAULT_KNOWLEDGE_CONFIG.graph.maxTriples,
      triplesPerKTokens:
        merged.graph?.triplesPerKTokens ?? DEFAULT_KNOWLEDGE_CONFIG.graph.triplesPerKTokens,
      maxDepth: merged.graph?.maxDepth ?? DEFAULT_KNOWLEDGE_CONFIG.graph.maxDepth,
    },
    storage: {
      maxFileSize: merged.storage?.maxFileSize ?? DEFAULT_KNOWLEDGE_CONFIG.storage.maxFileSize,
      maxDocuments: merged.storage?.maxDocuments ?? DEFAULT_KNOWLEDGE_CONFIG.storage.maxDocuments,
    },
    formats: {
      pdf: {
        enabled: merged.formats?.pdf?.enabled ?? DEFAULT_KNOWLEDGE_CONFIG.formats.pdf.enabled,
        maxPages: merged.formats?.pdf?.maxPages,
      },
      docx: {
        enabled: merged.formats?.docx?.enabled ?? DEFAULT_KNOWLEDGE_CONFIG.formats.docx.enabled,
      },
      txt: {
        enabled: merged.formats?.txt?.enabled ?? DEFAULT_KNOWLEDGE_CONFIG.formats.txt.enabled,
      },
      html: {
        enabled: merged.formats?.html?.enabled ?? DEFAULT_KNOWLEDGE_CONFIG.formats.html.enabled,
      },
    },
    upload: {
      webApi: merged.upload?.webApi ?? DEFAULT_KNOWLEDGE_CONFIG.upload.webApi,
      chatAttachments:
        merged.upload?.chatAttachments ?? DEFAULT_KNOWLEDGE_CONFIG.upload.chatAttachments,
      allowedChannels: merged.upload?.allowedChannels,
    },
    search: {
      autoIndex: merged.search?.autoIndex ?? DEFAULT_KNOWLEDGE_CONFIG.search.autoIndex,
      includeInMemorySearch:
        merged.search?.includeInMemorySearch ??
        DEFAULT_KNOWLEDGE_CONFIG.search.includeInMemorySearch,
    },
  };
}

function resolveLegacyAgentOverrides(
  cfg: OpenClawConfig,
  agentId: string,
): KnowledgeBaseConfig | undefined {
  const routingAgents = (cfg as { routing?: { agents?: Record<string, unknown> } })?.routing
    ?.agents;
  if (!routingAgents || typeof routingAgents !== "object") {
    return undefined;
  }
  const normalizedId = normalizeAgentId(agentId);
  for (const [rawId, entry] of Object.entries(routingAgents)) {
    if (normalizeAgentId(rawId) !== normalizedId) {
      continue;
    }
    if (!entry || typeof entry !== "object") {
      return undefined;
    }
    const tools = (entry as { tools?: { knowledgeBase?: KnowledgeBaseConfig } }).tools;
    return tools?.knowledgeBase;
  }
  return undefined;
}
