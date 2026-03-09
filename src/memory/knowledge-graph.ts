import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runEmbeddedPiAgent } from "../agents/pi-embedded.js";
import type { OpenClawConfig } from "../config/config.js";
import { hashText } from "./internal.js";

// LightRAG 常量（参考 https://github.com/HKUDS/LightRAG）
export const TUPLE_DELIMITER = "<|#|>";
export const COMPLETION_DELIMITER = "<|COMPLETE|>";

export const DEFAULT_ENTITY_TYPES = [
  "Person", // 人物
  "Creature", // 生物
  "Organization", // 组织
  "Location", // 地点
  "Event", // 事件
  "Concept", // 概念
  "Method", // 方法
  "Content", // 内容
  "Data", // 数据
  "Artifact", // 产物
  "NaturalObject", // 自然物体
];

export type KnowledgeGraphSettings = {
  enabled: boolean;
  extractor: "llm";
  provider?: string;
  model?: string;
  minTriples: number;
  maxTriples: number;
  triplesPerKTokens: number;
  maxDepth: number;
};

export type KnowledgeGraphTripleInput = {
  h: { name: string; [key: string]: unknown } | string;
  r: { type: string; [key: string]: unknown } | string;
  t: { name: string; [key: string]: unknown } | string;
};

export type KnowledgeGraphExtractionResult = {
  triples: KnowledgeGraphTripleInput[];
  rawText: string;
  targetTriples: number;
  // LightRAG 格式解析结果
  entities?: Array<{ name: string; type: string; description: string }>;
  relations?: Array<{ source: string; target: string; keywords: string; description: string }>;
};

export function computeTargetTriples(params: {
  text: string;
  settings: KnowledgeGraphSettings;
}): number {
  const { text, settings } = params;
  const approxTokens = Math.max(1, Math.ceil(text.length / 4));
  const perK = Math.max(1, settings.triplesPerKTokens);
  const target = Math.ceil((approxTokens / 1000) * perK);
  const clamped = Math.max(settings.minTriples, Math.min(settings.maxTriples, target));
  return clamped;
}

export async function extractTriplesViaLlm(params: {
  text: string;
  settings: KnowledgeGraphSettings;
  cfg: OpenClawConfig;
  agentId: string;
  workspaceDir: string;
  agentDir: string;
}): Promise<KnowledgeGraphExtractionResult> {
  const { text, settings, cfg, agentId, workspaceDir, agentDir } = params;
  const targetTriples = computeTargetTriples({ text, settings });
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-kg-"));
  const sessionFile = path.join(tempDir, "session.jsonl");
  // 使用 LightRAG 格式的 prompt
  const prompt = buildTripleExtractionPrompt(text);
  try {
    const result = await runEmbeddedPiAgent({
      sessionId: `kb-graph-${agentId}-${Date.now()}`,
      sessionKey: `kb-graph:${agentId}`,
      sessionFile,
      workspaceDir,
      agentDir,
      config: cfg,
      prompt,
      provider: settings.provider,
      model: settings.model,
      timeoutMs: 60_000,
      runId: `kb-graph-${Date.now()}`,
      disableTools: true,
    });
    const rawText = extractResponseText(result.payloads ?? []);
    // 解析 LightRAG 格式输出
    const parsed = parseTriplesOutput(rawText);
    // 转换为旧格式以保持兼容性
    const triples = parsed.entities.map((e) => ({
      h: { name: e.name },
      r: { type: e.type },
      t: { name: e.description },
    }));
    // 同时保留新的解析结果
    return {
      triples: triples.slice(0, targetTriples),
      rawText,
      targetTriples,
      entities: parsed.entities,
      relations: parsed.relations,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function writeTriplesJsonl(params: {
  filePath: string;
  triples: KnowledgeGraphTripleInput[];
}): Promise<void> {
  const lines = params.triples.map((triple) => JSON.stringify(triple));
  await fs.mkdir(path.dirname(params.filePath), { recursive: true });
  await fs.writeFile(params.filePath, lines.join("\n") + (lines.length ? "\n" : ""));
}

export function normalizeTriple(
  triple: KnowledgeGraphTripleInput,
): KnowledgeGraphTripleInput | null {
  const h = normalizeNode(triple.h);
  const t = normalizeNode(triple.t);
  const r = normalizeRelation(triple.r);
  if (!h || !t || !r) {
    return null;
  }
  return { h, r, t };
}

function normalizeNode(
  node: KnowledgeGraphTripleInput["h"],
): { name: string; [key: string]: unknown } | null {
  if (typeof node === "string") {
    const name = node.trim();
    return name ? { name } : null;
  }
  const name = String(node.name ?? "").trim();
  if (!name) {
    return null;
  }
  return { ...node, name };
}

function normalizeRelation(
  relation: KnowledgeGraphTripleInput["r"],
): { type: string; [key: string]: unknown } | null {
  if (typeof relation === "string") {
    const type = relation.trim();
    return type ? { type } : null;
  }
  const type = String(relation.type ?? "").trim();
  if (!type) {
    return null;
  }
  return { ...relation, type };
}

function buildTripleExtractionPrompt(text: string, language: string = "zh"): string {
  const entityTypes =
    language === "zh"
      ? "人物、生物、组织、地点、事件、概念、方法、内容、数据、产物、自然物体"
      : "Person, Creature, Organization, Location, Event, Concept, Method, Content, Data, Artifact, NaturalObject";

  const systemPrompt = `---Role---
You are a Knowledge Graph Specialist responsible for extracting entities and relationships from the input text.

---Instructions---
1. **Entity Extraction:**
   - Identify meaningful entities
   - Extract: entity_name, entity_type, entity_description
   - Format: entity${TUPLE_DELIMITER}entity_name${TUPLE_DELIMITER}entity_type${TUPLE_DELIMITER}entity_description

2. **Relationship Extraction:**
   - Identify direct relationships between entities
   - Decompose N-ary relationships into binary pairs
   - Extract: source_entity, target_entity, relationship_keywords, relationship_description
   - Format: relation${TUPLE_DELIMITER}source${TUPLE_DELIMITER}target${TUPLE_DELIMITER}keywords${TUPLE_DELIMITER}description

3. Use ${TUPLE_DELIMITER} as delimiter

4. Entity types: ${entityTypes}

5. Output in ${language}

6. Output ${COMPLETION_DELIMITER} when complete
`;

  const userPrompt = `---Task---
Extract entities and relationships from the text below.

---Data---
${text.slice(0, 16000)}

---Output---
`;

  return [systemPrompt, userPrompt].join("\n");
}

function extractResponseText(payloads: Array<{ text?: string }>): string {
  const text = payloads.map((payload) => payload.text ?? "").join("\n");
  return text.trim();
}

export function hashTripleKey(triple: KnowledgeGraphTripleInput): string {
  const h = typeof triple.h === "string" ? triple.h : triple.h.name;
  const t = typeof triple.t === "string" ? triple.t : triple.t.name;
  const r = typeof triple.r === "string" ? triple.r : triple.r.type;
  return hashText(`${h}::${r}::${t}`);
}

/**
 * 解析 LightRAG 格式的输出
 * 格式: entity<|#|>name<|#|>type<|#|>description
 *       relation<|#|>source<|#|>target<|#|>keywords<|#|>description
 */
export function parseTriplesOutput(output: string): {
  entities: Array<{ name: string; type: string; description: string }>;
  relations: Array<{ source: string; target: string; keywords: string; description: string }>;
} {
  // 先移除 COMPLETION_DELIMITER 及其后的内容
  const cleanOutput = output.split(COMPLETION_DELIMITER)[0];
  const lines = cleanOutput
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const entities: Array<{ name: string; type: string; description: string }> = [];
  const relations: Array<{
    source: string;
    target: string;
    keywords: string;
    description: string;
  }> = [];

  for (const line of lines) {
    const parts = line.split(TUPLE_DELIMITER);
    if (parts[0] === "entity" && parts.length >= 4) {
      entities.push({
        name: parts[1]?.trim() || "",
        type: parts[2]?.trim() || "NaturalObject",
        description: parts[3]?.trim() || "",
      });
    } else if (parts[0] === "relation" && parts.length >= 5) {
      relations.push({
        source: parts[1]?.trim() || "",
        target: parts[2]?.trim() || "",
        keywords: parts[3]?.trim() || "",
        description: parts[4]?.trim() || "",
      });
    }
  }

  return { entities, relations };
}
