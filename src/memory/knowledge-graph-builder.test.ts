import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  KnowledgeGraphSearcher,
  clearKnowledgeGraph,
  getGraphBuildTask,
} from "./knowledge-graph-builder.js";
import { ensureKnowledgeSchema } from "./knowledge-schema.js";

// Mock the logger
vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock extractTriplesViaLlm
vi.mock("./knowledge-graph.js", () => ({
  extractTriplesViaLlm: vi.fn(async () => ({
    triples: [],
    rawText: "",
    targetTriples: 0,
    entities: [],
    relations: [],
  })),
}));

// Only import builder for task creation test
import { KnowledgeGraphBuilder } from "./knowledge-graph-builder.js";

describe("KnowledgeGraphBuilder", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new DatabaseSync(":memory:");
    ensureKnowledgeSchema(db);
  });

  it("creates a build task", () => {
    const builder = new KnowledgeGraphBuilder({
      db,
      kbId: "kb-1",
      documentId: "doc-1",
      agentId: "agent-1",
      maxEntities: 10,
      extractionTimeout: 5000,
      cfg: {} as OpenClawConfig,
      workspaceDir: "/tmp",
      agentDir: "/tmp",
      settings: {
        enabled: true,
        extractor: "llm",
        minTriples: 3,
        maxTriples: 50,
        triplesPerKTokens: 10,
        maxDepth: 3,
      },
    });

    const task = builder.getTaskStatus();
    expect(task.id).toBeDefined();
    expect(task.kb_id).toBe("kb-1");
    expect(task.document_id).toBe("doc-1");
    expect(task.status).toBe("pending");
  });
});

describe("KnowledgeGraphSearcher", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    ensureKnowledgeSchema(db);

    const now = Date.now();

    // Insert test entities
    db.prepare(
      `INSERT INTO kg_entities (id, kb_id, document_id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("e1", "kb-1", "doc-1", "Apple", "组织", now, now);

    db.prepare(
      `INSERT INTO kg_entities (id, kb_id, document_id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("e2", "kb-1", "doc-1", "Tim Cook", "人物", now, now);

    db.prepare(
      `INSERT INTO kg_entity_descriptions (id, entity_id, kb_id, document_id, description, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("d1", "e1", "kb-1", "doc-1", "Apple Inc. is a technology company", now);
  });

  it("performs local search", async () => {
    const searcher = new KnowledgeGraphSearcher(db, "kb-1");
    const results = await searcher.hybridSearch("Apple", {
      mode: "local",
      topK: 10,
    });

    expect(results.entities.length).toBeGreaterThan(0);
    expect(results.entities[0].name).toBe("Apple");
  });

  it("performs global search", async () => {
    const searcher = new KnowledgeGraphSearcher(db, "kb-1");
    const results = await searcher.hybridSearch("technology", {
      mode: "global",
      topK: 10,
    });

    // Should find Apple via its description
    expect(results.entities.length).toBeGreaterThan(0);
  });

  it("performs naive search", async () => {
    const searcher = new KnowledgeGraphSearcher(db, "kb-1");
    const results = await searcher.hybridSearch("Apple", {
      mode: "naive",
      topK: 10,
    });

    expect(results.entities.length).toBeGreaterThan(0);
    expect(results.entities[0].name).toBe("Apple");
  });

  it("returns stats correctly", () => {
    const searcher = new KnowledgeGraphSearcher(db, "kb-1");
    const stats = searcher.getStats();

    expect(stats.totalEntities).toBe(2);
    expect(stats.entityTypes).toHaveProperty("组织");
    expect(stats.entityTypes["组织"]).toBe(1);
  });
});

describe("getGraphBuildTask", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    ensureKnowledgeSchema(db);

    const now = Date.now();
    // Insert a task
    db.prepare(
      `INSERT INTO kg_build_tasks (id, kb_id, document_id, status, progress, total_chunks, processed_chunks, entities_count, relations_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("task-1", "kb-1", "doc-1", "running", 50, 10, 5, 0, 0, now);
  });

  it("retrieves task by id", () => {
    const task = getGraphBuildTask(db, "task-1");
    expect(task).not.toBeNull();
    expect(task?.id).toBe("task-1");
    expect(task?.status).toBe("running");
    expect(task?.progress).toBe(50);
  });

  it("returns null for non-existent task", () => {
    const task = getGraphBuildTask(db, "non-existent");
    expect(task).toBeNull();
  });
});

describe("clearKnowledgeGraph", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    ensureKnowledgeSchema(db);

    const now = Date.now();

    // Insert test data - need e2 first due to FK
    db.prepare(
      `INSERT INTO kg_entities (id, kb_id, document_id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("e2", "kb-1", "doc-1", "Tim Cook", "人物", now, now);

    db.prepare(
      `INSERT INTO kg_entities (id, kb_id, document_id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("e1", "kb-1", "doc-1", "Apple", "组织", now, now);

    db.prepare(
      `INSERT INTO kg_relations (id, kb_id, source_entity_id, target_entity_id, keywords, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("r1", "kb-1", "e1", "e2", "related", now);

    db.prepare(
      `INSERT INTO kg_build_tasks (id, kb_id, document_id, status, progress, total_chunks, processed_chunks, entities_count, relations_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("task-1", "kb-1", "doc-1", "success", 100, 10, 10, 1, 1, now);
  });

  it("clears all graph data for a kb", () => {
    clearKnowledgeGraph(db, "kb-1");

    const entities = db.prepare("SELECT * FROM kg_entities WHERE kb_id = ?").all("kb-1");
    const relations = db.prepare("SELECT * FROM kg_relations WHERE kb_id = ?").all("kb-1");
    const tasks = db.prepare("SELECT * FROM kg_build_tasks WHERE kb_id = ?").all("kb-1");

    expect(entities.length).toBe(0);
    expect(relations.length).toBe(0);
    expect(tasks.length).toBe(0);
  });

  it("only clears specified kb", () => {
    const now = Date.now();
    // Insert data for another kb
    db.prepare(
      `INSERT INTO kg_entities (id, kb_id, document_id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("e3", "kb-2", "doc-1", "Google", "组织", now, now);

    clearKnowledgeGraph(db, "kb-1");

    const kb1Entities = db.prepare("SELECT * FROM kg_entities WHERE kb_id = ?").all("kb-1");
    const kb2Entities = db.prepare("SELECT * FROM kg_entities WHERE kb_id = ?").all("kb-2");

    expect(kb1Entities.length).toBe(0);
    expect(kb2Entities.length).toBe(1);
  });
});
