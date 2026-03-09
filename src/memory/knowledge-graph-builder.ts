/**
 * Knowledge Graph Builder
 * Handles entity/relation extraction and graph construction
 */

import type { DatabaseSync } from "node:sqlite";
import type { OpenClawConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { extractTriplesViaLlm, hashText, type KnowledgeGraphSettings } from "./knowledge-graph.js";
import {
  type KnowledgeGraphBuildTask,
  type KnowledgeGraphSearchResult,
  type KnowledgeGraphStats,
} from "./knowledge-schema.js";

const log = createSubsystemLogger("knowledge-graph-builder");

// ============================================================
// Knowledge Graph Builder
// ============================================================

export class KnowledgeGraphBuilder {
  private db: DatabaseSync;
  private kbId: string;
  private documentId: string;
  private agentId: string;
  private maxEntities: number;
  private extractionTimeout: number;
  private task: KnowledgeGraphBuildTask;
  private cfg: OpenClawConfig;
  private workspaceDir: string;
  private agentDir: string;
  private settings: KnowledgeGraphSettings;

  constructor(params: {
    db: DatabaseSync;
    kbId: string;
    documentId: string;
    agentId: string;
    maxEntities?: number;
    extractionTimeout?: number;
    cfg: OpenClawConfig;
    workspaceDir: string;
    agentDir: string;
    settings: KnowledgeGraphSettings;
  }) {
    this.db = params.db;
    this.kbId = params.kbId;
    this.documentId = params.documentId;
    this.agentId = params.agentId;
    this.maxEntities = params.maxEntities || 100;
    this.extractionTimeout = params.extractionTimeout || 60000;
    this.cfg = params.cfg;
    this.workspaceDir = params.workspaceDir;
    this.agentDir = params.agentDir;
    this.settings = params.settings;

    // Initialize task
    this.task = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      kb_id: this.kbId,
      document_id: this.documentId,
      status: "pending",
      progress: 0,
      total_chunks: 0,
      processed_chunks: 0,
      entities_count: 0,
      relations_count: 0,
      created_at: Date.now(),
    };

    // Create task record
    this.createTaskRecord();
  }

  private createTaskRecord(): void {
    this.db
      .prepare(
        `INSERT INTO kg_build_tasks (id, kb_id, document_id, status, progress, total_chunks, processed_chunks, entities_count, relations_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        this.task.id,
        this.task.kb_id,
        this.task.document_id,
        this.task.status,
        this.task.progress,
        this.task.total_chunks,
        this.task.processed_chunks,
        this.task.entities_count,
        this.task.relations_count,
        this.task.created_at,
      );
  }

  getTaskStatus(): KnowledgeGraphBuildTask {
    return this.task;
  }

  async build(): Promise<void> {
    this.task.status = "running";
    this.task.started_at = Date.now();
    this.updateTask();

    try {
      // Get document chunks
      const chunks = this.getChunks();
      this.task.total_chunks = chunks.length;
      this.updateTask();

      if (chunks.length === 0) {
        this.task.status = "success";
        this.task.progress = 100;
        this.updateTask();
        return;
      }

      // Process each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        await this.processChunk(chunk);
        this.task.processed_chunks = i + 1;
        this.task.progress = Math.round(((i + 1) / chunks.length) * 100);
        this.updateTask();
      }

      this.task.status = "success";
      this.task.completed_at = Date.now();
      this.updateTask();
    } catch (error) {
      log.error(`Graph build failed: ${String(error)}`);
      this.task.status = "failed";
      this.task.error = error instanceof Error ? error.message : String(error);
      this.task.completed_at = Date.now();
      this.updateTask();
      throw error;
    }
  }

  private getChunks(): Array<{ id: string; text: string }> {
    const pathKey = `knowledge/${this.documentId}`;
    const rows = this.db
      .prepare(
        `SELECT id, text FROM chunks WHERE path = ? AND source = 'knowledge' ORDER BY start_line`,
      )
      .all(pathKey) as Array<{ id: string; text: string }>;
    return rows;
  }

  private async processChunk(chunk: { id: string; text: string }): Promise<void> {
    // Use LLM-based extraction (LightRAG format)
    const result = await extractTriplesViaLlm({
      text: chunk.text,
      settings: this.settings,
      cfg: this.cfg,
      agentId: this.agentId,
      workspaceDir: this.workspaceDir,
      agentDir: this.agentDir,
    });

    // Insert entities
    if (result.entities) {
      for (const entity of result.entities) {
        const entityId = this.insertEntity(entity.name, entity.type);
        if (entity.description) {
          this.insertEntityDescription(entityId, entity.description);
        }
      }
    }

    // Insert relations
    if (result.relations) {
      for (const relation of result.relations) {
        this.insertRelation({
          source: relation.source,
          target: relation.target,
          keywords: relation.keywords,
        });
      }
    }
  }

  private extractSimpleEntities(text: string): Array<{
    name: string;
    type: string | null;
    description?: string;
  }> {
    // Simple extraction based on patterns
    // In real implementation, this would call LLM
    const entities: Array<{ name: string; type: string | null; description?: string }> = [];

    // Capitalized words (simple pattern)
    const wordPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    const matches = text.matchAll(wordPattern);

    const seen = new Set<string>();
    for (const match of matches) {
      const name = match[1];
      if (!seen.has(name) && name.length > 1) {
        seen.add(name);
        entities.push({
          name,
          type: this.guessEntityType(name),
          description: undefined,
        });
      }
    }

    return entities.slice(0, this.maxEntities);
  }

  private guessEntityType(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes("公司") || lower.includes("Corp") || lower.includes("Inc")) {
      return "组织";
    }
    if (lower.includes("教授") || lower.includes("博士") || lower.includes("CEO")) {
      return "人物";
    }
    if (lower.includes("市") || lower.includes("省") || lower.includes("国家")) {
      return "地点";
    }
    if (lower.includes("技术") || lower.includes("方法") || lower.includes("系统")) {
      return "技术";
    }
    return "其他";
  }

  private extractSimpleRelations(
    text: string,
    entities: Array<{ name: string; type: string | null }>,
  ): Array<{
    source: string;
    target: string;
    keywords: string;
  }> {
    // Simple relation extraction
    const relations: Array<{ source: string; target: string; keywords: string }> = [];

    // Look for patterns like "X is Y's CEO" or "X works at Y"
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const e1 = entities[i];
        const e2 = entities[j];

        // Check if both entities appear in text
        if (text.includes(e1.name) && text.includes(e2.name)) {
          // Simple keyword extraction
          relations.push({
            source: e1.name,
            target: e2.name,
            keywords: "相关",
          });
        }
      }
    }

    return relations;
  }

  private insertEntity(name: string, type: string | null): string {
    const id = hashText(`${this.kbId}:${this.documentId}:${name}:${Date.now()}`);

    try {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO kg_entities (id, kb_id, document_id, name, type, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(id, this.kbId, this.documentId, name, type, Date.now());
    } catch {
      // Ignore duplicate
    }

    return id;
  }

  private insertEntityDescription(entityId: string, description: string): void {
    const id = hashText(`${entityId}:desc:${Date.now()}`);

    try {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO kg_entity_descriptions (id, entity_id, description, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(id, entityId, description, Date.now());
    } catch {
      // Ignore duplicate
    }
  }

  private insertRelation(params: { source: string; target: string; keywords: string }): void {
    // Get entity IDs
    const sourceEntity = this.db
      .prepare("SELECT id FROM kg_entities WHERE name = ? AND kb_id = ? LIMIT 1")
      .get(params.source, this.kbId) as { id: string } | undefined;

    const targetEntity = this.db
      .prepare("SELECT id FROM kg_entities WHERE name = ? AND kb_id = ? LIMIT 1")
      .get(params.target, this.kbId) as { id: string } | undefined;

    if (!sourceEntity || !targetEntity) {
      return;
    }

    const id = hashText(`${sourceEntity.id}:${targetEntity.id}:${params.keywords}:${Date.now()}`);

    try {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO kg_relations (id, kb_id, document_id, source_entity_id, target_entity_id, keywords, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          this.kbId,
          this.documentId,
          sourceEntity.id,
          targetEntity.id,
          params.keywords,
          Date.now(),
        );
    } catch {
      // Ignore duplicate
    }
  }

  private updateTask(): void {
    this.db
      .prepare(
        `UPDATE kg_build_tasks SET status = ?, progress = ?, total_chunks = ?, processed_chunks = ?, entities_count = ?, relations_count = ?, error = ?, started_at = ?, completed_at = ? WHERE id = ?`,
      )
      .run(
        this.task.status,
        this.task.progress,
        this.task.total_chunks,
        this.task.processed_chunks,
        this.task.entities_count,
        this.task.relations_count,
        this.task.error ?? null,
        this.task.started_at ?? null,
        this.task.completed_at ?? null,
        this.task.id,
      );
  }
}

// ============================================================
// Knowledge Graph Searcher
// ============================================================

export class KnowledgeGraphSearcher {
  private db: DatabaseSync;
  private kbId: string;

  constructor(db: DatabaseSync, kbId: string) {
    this.db = db;
    this.kbId = kbId;
  }

  async hybridSearch(
    query: string,
    options: {
      mode: "local" | "global" | "hybrid" | "naive";
      topK: number;
      rrfK?: number;
    },
  ): Promise<KnowledgeGraphSearchResult> {
    const rrfK = options.rrfK || 60;

    switch (options.mode) {
      case "local":
        return this.localSearch(query, options.topK);
      case "global":
        return this.globalSearch(query, options.topK);
      case "hybrid":
        return this.hybridSearchInternal(query, options.topK, rrfK);
      case "naive":
      default:
        return this.naiveSearch(query, options.topK);
    }
  }

  private async localSearch(query: string, topK: number): Promise<KnowledgeGraphSearchResult> {
    // Local search: find entities that match the query directly
    const entities = this.db
      .prepare(
        `SELECT e.id, e.name, e.type, d.description,
           (CASE WHEN e.name LIKE ? THEN 1.0 ELSE 0.0 END) as score
         FROM kg_entities e
         LEFT JOIN kg_entity_descriptions d ON e.id = d.entity_id
         WHERE e.kb_id = ? AND (e.name LIKE ? OR d.description LIKE ?)
         ORDER BY score DESC
         LIMIT ?`,
      )
      .all(`%${query}%`, this.kbId, `%${query}%`, `%${query}%`, topK) as Array<{
      id: string;
      name: string;
      type: string | null;
      description: string | null;
      score: number;
    }>;

    return {
      entities: entities.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        description: e.description,
        score: e.score,
      })),
      relations: [],
      chunks: [],
    };
  }

  private async globalSearch(query: string, topK: number): Promise<KnowledgeGraphSearchResult> {
    // Global search: use keyword matching across all entities
    const queryTerms = query.toLowerCase().split(/\s+/);

    const entities = this.db
      .prepare(
        `SELECT e.id, e.name, e.type, d.description
         FROM kg_entities e
         LEFT JOIN kg_entity_descriptions d ON e.id = d.entity_id
         WHERE e.kb_id = ?
         ORDER BY e.name
         LIMIT ?`,
      )
      .all(this.kbId, topK * 2) as Array<{
      id: string;
      name: string;
      type: string | null;
      description: string | null;
    }>;

    // Score by keyword matching
    const scored = entities.map((e) => {
      let score = 0;
      const text = `${e.name} ${e.description || ""}`.toLowerCase();
      for (const term of queryTerms) {
        if (text.includes(term)) {
          score += 1;
        }
      }
      return { ...e, score: score / queryTerms.length };
    });

    return {
      entities: scored
        .filter((e) => e.score > 0)
        .toSorted((a, b) => b.score - a.score)
        .slice(0, topK)
        .map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          description: e.description,
          score: e.score,
        })),
      relations: [],
      chunks: [],
    };
  }

  private async hybridSearchInternal(
    query: string,
    topK: number,
    rrfK: number,
  ): Promise<KnowledgeGraphSearchResult> {
    // RRF (Reciprocal Rank Fusion) combination
    const localResults = await this.localSearch(query, topK);
    const globalResults = await this.globalSearch(query, topK);

    // RRF fusion
    const entityScores = new Map<string, number>();

    // Add local scores
    for (const e of localResults.entities) {
      entityScores.set(e.id, 1 / (rrfK + 1));
    }

    // Add global scores with offset
    for (let i = 0; i < globalResults.entities.length; i++) {
      const e = globalResults.entities[i];
      const existing = entityScores.get(e.id) || 0;
      entityScores.set(e.id, existing + 1 / (rrfK + i + 1));
    }

    // Get final entities
    const finalEntities = Array.from(entityScores.entries())
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, topK);

    const entities = finalEntities.map(([id, score]) => {
      const local = localResults.entities.find((e) => e.id === id);
      const global = globalResults.entities.find((e) => e.id === id);
      return {
        id,
        name: local?.name || global?.name || "",
        type: local?.type || global?.type || null,
        description: local?.description || global?.description || null,
        score,
      };
    });

    return { entities, relations: [], chunks: [] };
  }

  private async naiveSearch(query: string, topK: number): Promise<KnowledgeGraphSearchResult> {
    // Simple name-based search
    const entities = this.db
      .prepare(
        `SELECT e.id, e.name, e.type, d.description,
           (CASE WHEN e.name = ? THEN 1.0
                 WHEN e.name LIKE ? THEN 0.8
                 ELSE 0.0 END) as score
         FROM kg_entities e
         LEFT JOIN kg_entity_descriptions d ON e.id = d.entity_id
         WHERE e.kb_id = ?
         ORDER BY score DESC
         LIMIT ?`,
      )
      .all(query, `%${query}%`, this.kbId, topK) as Array<{
      id: string;
      name: string;
      type: string | null;
      description: string | null;
      score: number;
    }>;

    return {
      entities: entities
        .filter((e) => e.score > 0)
        .map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          description: e.description,
          score: e.score,
        })),
      relations: [],
      chunks: [],
    };
  }

  getStats(): KnowledgeGraphStats {
    // Total entities
    const entityCount = this.db
      .prepare("SELECT COUNT(*) as count FROM kg_entities WHERE kb_id = ?")
      .get(this.kbId) as { count: number };

    // Total relations
    const relationCount = this.db
      .prepare("SELECT COUNT(*) as count FROM kg_relations WHERE kb_id = ?")
      .get(this.kbId) as { count: number };

    // Entity types
    const typeRows = this.db
      .prepare(`SELECT type, COUNT(*) as count FROM kg_entities WHERE kb_id = ? GROUP BY type`)
      .all(this.kbId) as Array<{ type: string; count: number }>;

    const entityTypes: Record<string, number> = {};
    for (const row of typeRows) {
      entityTypes[row.type || "其他"] = row.count;
    }

    // Top keywords
    const keywordRows = this.db
      .prepare(
        `SELECT keywords, COUNT(*) as count FROM kg_relations WHERE kb_id = ? GROUP BY keywords ORDER BY count DESC LIMIT 10`,
      )
      .all(this.kbId) as Array<{ keywords: string; count: number }>;

    const topKeywords = keywordRows.map((k) => k.keywords).filter(Boolean);

    // Top entities by degree
    const degreeRows = this.db
      .prepare(
        `SELECT e.name, COUNT(r.id) as degree
         FROM kg_entities e
         LEFT JOIN kg_relations r ON e.id = r.source_entity_id OR e.id = r.target_entity_id
         WHERE e.kb_id = ?
         GROUP BY e.id
         ORDER BY degree DESC
         LIMIT 10`,
      )
      .all(this.kbId) as Array<{ name: string; degree: number }>;

    return {
      totalEntities: entityCount.count,
      totalRelations: relationCount.count,
      entityTypes,
      topKeywords,
      topEntities: degreeRows,
    };
  }
}

// ============================================================
// Helper Functions
// ============================================================

export function getGraphBuildTask(
  db: DatabaseSync,
  taskId: string,
): KnowledgeGraphBuildTask | null {
  const row = db.prepare("SELECT * FROM kg_build_tasks WHERE id = ?").get(taskId) as
    | KnowledgeGraphBuildTask
    | undefined;

  return row || null;
}

export function clearKnowledgeGraph(db: DatabaseSync, kbId: string): void {
  // Delete in order due to foreign keys
  db.prepare("DELETE FROM kg_relations WHERE kb_id = ?").run(kbId);
  db.prepare(
    "DELETE FROM kg_entity_descriptions WHERE entity_id IN (SELECT id FROM kg_entities WHERE kb_id = ?)",
  ).run(kbId);
  db.prepare("DELETE FROM kg_entities WHERE kb_id = ?").run(kbId);
  db.prepare("DELETE FROM kg_build_tasks WHERE kb_id = ?").run(kbId);
}
