import type { DatabaseSync } from "node:sqlite";

/**
 * Ensures knowledge base schema tables exist in the memory database.
 * This schema stores document metadata, tags, and relationships.
 * Vector embeddings are stored in the existing chunks_vec table via source='knowledge'.
 */
/**
 * Enhanced Knowledge Graph Schema
 * Extends the basic triples schema with entities, relations, and task management.
 */

export function ensureKnowledgeSchema(db: DatabaseSync): void {
  // Document metadata table
  db.exec(`
    CREATE TABLE IF NOT EXISTS kb_documents (
      id TEXT PRIMARY KEY,
      kb_id TEXT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      size INTEGER NOT NULL,
      hash TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_metadata TEXT,
      uploaded_at INTEGER NOT NULL,
      indexed_at INTEGER,
      owner_agent_id TEXT NOT NULL,
      description TEXT,
      UNIQUE(hash, owner_agent_id)
    )
  `);

  // Document tags (many-to-many relationship)
  db.exec(`
    CREATE TABLE IF NOT EXISTS kb_tags (
      document_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (document_id, tag),
      FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS kb_settings (
      owner_agent_id TEXT PRIMARY KEY,
      vector_config TEXT,
      graph_config TEXT,
      search_config TEXT,
      updated_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS kb_bases (
      id TEXT PRIMARY KEY,
      owner_agent_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT,
      visibility TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(owner_agent_id, name)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS kb_base_settings (
      kb_id TEXT PRIMARY KEY,
      owner_agent_id TEXT NOT NULL,
      vectorization_config TEXT NOT NULL,
      chunk_config TEXT NOT NULL,
      retrieval_config TEXT NOT NULL,
      index_config TEXT NOT NULL,
      graph_config TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (kb_id) REFERENCES kb_bases(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS kb_tag_defs (
      id TEXT PRIMARY KEY,
      owner_agent_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(owner_agent_id, name)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS kb_base_tags (
      kb_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      owner_agent_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (kb_id, tag_id),
      FOREIGN KEY (kb_id) REFERENCES kb_bases(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES kb_tag_defs(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_graph_runs (
      id TEXT PRIMARY KEY,
      kb_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      status TEXT NOT NULL,
      triples_path TEXT,
      extractor TEXT,
      model TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_graph_triples (
      id TEXT PRIMARY KEY,
      kb_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      h TEXT NOT NULL,
      r TEXT NOT NULL,
      t TEXT NOT NULL,
      props_json TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  try {
    db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_graph_fts USING fts5(\n` +
        `  content,\n` +
        `  triple_id UNINDEXED,\n` +
        `  kb_id UNINDEXED,\n` +
        `  document_id UNINDEXED,\n` +
        `  h UNINDEXED,\n` +
        `  r UNINDEXED,\n` +
        `  t UNINDEXED\n` +
        `);`,
    );
  } catch {
    // FTS5 may be unavailable; fallback to non-FTS search.
  }

  // ============================================================
  // Enhanced Knowledge Graph Tables (New)
  // ============================================================

  // Entities table - stores extracted entities with type and description
  db.exec(`
    CREATE TABLE IF NOT EXISTS kg_entities (
      id TEXT PRIMARY KEY,
      kb_id TEXT NOT NULL,
      document_id TEXT,
      name TEXT NOT NULL,
      type TEXT,
      description TEXT,
      source_text TEXT,
      embedding_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Relations table - stores relationships between entities
  db.exec(`
    CREATE TABLE IF NOT EXISTS kg_relations (
      id TEXT PRIMARY KEY,
      kb_id TEXT NOT NULL,
      source_entity_id TEXT NOT NULL,
      target_entity_id TEXT NOT NULL,
      keywords TEXT,
      description TEXT,
      weight REAL DEFAULT 1.0,
      document_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (source_entity_id) REFERENCES kg_entities(id) ON DELETE CASCADE,
      FOREIGN KEY (target_entity_id) REFERENCES kg_entities(id) ON DELETE CASCADE
    )
  `);

  // Entity descriptions history - for merging descriptions
  db.exec(`
    CREATE TABLE IF NOT EXISTS kg_entity_descriptions (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      kb_id TEXT NOT NULL,
      document_id TEXT,
      description TEXT NOT NULL,
      source_chunk_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (entity_id) REFERENCES kg_entities(id) ON DELETE CASCADE
    )
  `);

  // Graph build tasks - for async task management
  db.exec(`
    CREATE TABLE IF NOT EXISTS kg_build_tasks (
      id TEXT PRIMARY KEY,
      kb_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      progress INTEGER DEFAULT 0,
      total_chunks INTEGER DEFAULT 0,
      processed_chunks INTEGER DEFAULT 0,
      entities_count INTEGER DEFAULT 0,
      relations_count INTEGER DEFAULT 0,
      error TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `);

  // Indexes for enhanced graph tables
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kg_entities_kb ON kg_entities(kb_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kg_entities_name ON kg_entities(name)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kg_entities_type ON kg_entities(type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kg_entities_doc ON kg_entities(document_id)`);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_kg_relations_kb ON kg_relations(kb_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kg_relations_source ON kg_relations(source_entity_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kg_relations_target ON kg_relations(target_entity_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kg_relations_doc ON kg_relations(document_id)`);

  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_kg_entity_descriptions_entity ON kg_entity_descriptions(entity_id)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_kg_entity_descriptions_kb ON kg_entity_descriptions(kb_id)`,
  );

  db.exec(`CREATE INDEX IF NOT EXISTS idx_kg_build_tasks_kb ON kg_build_tasks(kb_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kg_build_tasks_doc ON kg_build_tasks(document_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kg_build_tasks_status ON kg_build_tasks(status)`);

  // Indexes for efficient queries
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_tags_tag ON kb_tags(tag)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_documents_agent ON kb_documents(owner_agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_documents_kb ON kb_documents(kb_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_documents_uploaded ON kb_documents(uploaded_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_settings_agent ON kb_settings(owner_agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_bases_agent ON kb_bases(owner_agent_id)`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_kb_base_settings_agent ON kb_base_settings(owner_agent_id)`,
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_tag_defs_agent ON kb_tag_defs(owner_agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_base_tags_agent ON kb_base_tags(owner_agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_base_tags_tag ON kb_base_tags(tag_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_graph_runs_kb ON knowledge_graph_runs(kb_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_graph_runs_doc ON knowledge_graph_runs(document_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_graph_triples_kb ON knowledge_graph_triples(kb_id)`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_kb_graph_triples_doc ON knowledge_graph_triples(document_id)`,
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_graph_triples_h ON knowledge_graph_triples(h)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kb_graph_triples_t ON knowledge_graph_triples(t)`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_kb_graph_triples_created ON knowledge_graph_triples(created_at)`,
  );

  ensureColumn(db, "kb_documents", "kb_id", "TEXT");
  ensureColumn(
    db,
    "kb_base_settings",
    "vectorization_config",
    `TEXT NOT NULL DEFAULT '{"enabled":true}'`,
  );
  ensureColumn(db, "kb_settings", "search_config", "TEXT");
}

/**
 * Document metadata stored in kb_documents table
 */
export type KnowledgeDocument = {
  id: string;
  kb_id?: string | null;
  filename: string;
  filepath: string;
  mimetype: string;
  size: number;
  hash: string;
  source_type: "web_api" | "chat_attachment";
  source_metadata?: string; // JSON string
  uploaded_at: number;
  indexed_at?: number;
  owner_agent_id: string;
  description?: string;
};

/**
 * Document tag association
 */
export type KnowledgeTag = {
  document_id: string;
  tag: string;
};

export type KnowledgeBaseSettings = {
  owner_agent_id: string;
  vector_config?: string | null;
  graph_config?: string | null;
  updated_at: number;
};

export type KnowledgeBaseEntry = {
  id: string;
  owner_agent_id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  visibility: "private" | "team" | "public";
  created_at: number;
  updated_at: number;
};

export type KnowledgeBaseTagDefinition = {
  id: string;
  owner_agent_id: string;
  name: string;
  color?: string | null;
  created_at: number;
  updated_at: number;
};

export type KnowledgeBaseTagBinding = {
  kb_id: string;
  tag_id: string;
  owner_agent_id: string;
  created_at: number;
};

export type KnowledgeChunkConfig = {
  enabled: boolean;
  size: number;
  overlap: number;
  separator: "auto" | "paragraph" | "sentence";
};

export type KnowledgeRetrievalConfig = {
  mode: "semantic" | "keyword" | "hybrid";
  topK: number;
  minScore: number;
  hybridAlpha: number;
};

export type KnowledgeIndexConfig = {
  mode: "high_quality" | "balanced";
};

export type KnowledgeBaseGraphConfig = {
  enabled: boolean;
  extractor?: "llm"; // 实体抽取器，默认 llm
  provider?: string; // LLM provider
  model?: string; // LLM model
  maxEntities?: number; // 最大实体数限制，默认 5000
  extractionTimeout?: number; // LLM 抽取超时（毫秒），默认 60000
  minTriples: number; // 每文档最小三元组数，默认 3
  maxTriples: number; // 每文档最大三元组数，默认 50
  triplesPerKTokens: number; // 每千token三元组数，默认 10
  maxDepth: number; // 最大遍历深度，默认 3
  rrfK?: number; // RRF 融合参数，默认 60
};

export type KnowledgeBaseRuntimeSettings = {
  vectorization: {
    enabled: boolean;
  };
  chunk: KnowledgeChunkConfig;
  retrieval: KnowledgeRetrievalConfig;
  index: KnowledgeIndexConfig;
  graph: KnowledgeBaseGraphConfig;
};

export type KnowledgeBaseSettingsEntry = {
  kb_id: string;
  owner_agent_id: string;
  vectorization_config: string;
  chunk_config: string;
  retrieval_config: string;
  index_config: string;
  graph_config: string;
  created_at: number;
  updated_at: number;
};

function ensureColumn(
  db: DatabaseSync,
  table: "kb_documents" | "kb_base_settings" | "kg_entities" | "kg_relations" | "kg_build_tasks",
  column: string,
  definition: string,
): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.some((row) => row.name === column)) {
    return;
  }
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export type KnowledgeGraphRun = {
  id: string;
  kb_id: string;
  document_id: string;
  status: "pending" | "running" | "success" | "failed";
  triples_path?: string | null;
  extractor?: string | null;
  model?: string | null;
  error?: string | null;
  created_at: number;
  updated_at: number;
};

export type KnowledgeGraphTriple = {
  id: string;
  kb_id: string;
  document_id: string;
  h: string;
  r: string;
  t: string;
  props_json?: string | null;
  created_at: number;
};

// ============================================================
// Enhanced Knowledge Graph Types (New)
// ============================================================

/**
 * Entity extracted from document text
 */
export type KnowledgeEntity = {
  id: string;
  kb_id: string;
  document_id?: string | null;
  name: string;
  type?: string | null;
  description?: string | null;
  source_text?: string | null;
  embedding_id?: string | null;
  created_at: number;
  updated_at: number;
};

/**
 * Relationship between entities
 */
export type KnowledgeRelation = {
  id: string;
  kb_id: string;
  source_entity_id: string;
  target_entity_id: string;
  keywords?: string | null; // JSON array of keywords
  description?: string | null;
  weight: number;
  document_id?: string | null;
  created_at: number;
};

/**
 * Entity description history entry
 */
export type KnowledgeEntityDescription = {
  id: string;
  entity_id: string;
  kb_id: string;
  document_id?: string | null;
  description: string;
  source_chunk_id?: string | null;
  created_at: number;
};

/**
 * Graph build task status
 */
export type KnowledgeGraphBuildTask = {
  id: string;
  kb_id: string;
  document_id: string;
  status: "pending" | "running" | "success" | "failed";
  progress: number;
  total_chunks: number;
  processed_chunks: number;
  entities_count: number;
  relations_count: number;
  error?: string | null;
  started_at?: number | null;
  completed_at?: number | null;
  created_at: number;
};

/**
 * Graph search result
 */
export type KnowledgeGraphSearchResult = {
  // Entity results
  entities: Array<{
    id: string;
    name: string;
    type: string | null;
    description: string | null;
    score: number;
  }>;

  // Relation results
  relations: Array<{
    id: string;
    sourceName: string;
    targetName: string;
    keywords: string[];
    description: string | null;
  }>;

  // Chunk results (from vector search)
  chunks: Array<{
    id: string;
    documentId: string;
    text: string;
    score: number;
  }>;
};

/**
 * Graph statistics for a knowledge base
 */
export type KnowledgeGraphStats = {
  totalEntities: number;
  totalRelations: number;
  entityTypes: Record<string, number>;
  topKeywords: string[];
  topEntities: Array<{ name: string; degree: number }>;
};
