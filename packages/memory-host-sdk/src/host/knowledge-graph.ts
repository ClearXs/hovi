import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runEmbeddedPiAgent } from "../../../../src/agents/pi-embedded.js";
import { resolveAgentTimeoutMs } from "../../../../src/agents/timeout.js";
import type { OpenClawConfig } from "../../../../src/config/config.js";
import { createSubsystemLogger } from "../../../../src/logging/subsystem.js";
import { hashText } from "./internal.js";

const log = createSubsystemLogger("knowledge-graph");

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
  const timeoutMs = resolveAgentTimeoutMs({ cfg, minMs: 60_000 });
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
      timeoutMs,
      runId: `kb-graph-${Date.now()}`,
      disableTools: true,
    });
    const rawText = extractResponseText(result.payloads ?? []);
    log.info(
      `knowledge-graph: LLM raw response (${rawText.length} chars): ${rawText.slice(0, 500)}`,
    );
    // 解析 LightRAG 格式输出
    const parsed = parseTriplesOutput(rawText);
    log.info(
      `knowledge-graph: parsed ${parsed.entities.length} entities, ${parsed.relations.length} relations`,
    );
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
  const _entityTypes =
    language === "zh"
      ? "人物、生物、组织、地点、事件、概念、方法、内容、数据、产物、自然物体"
      : "Person, Creature, Organization, Location, Event, Concept, Method, Content, Data, Artifact, NaturalObject";

  // 分隔符 - 必须严格使用
  const D = "<|#|>";

  const systemPrompt = `---Role---
You are a Knowledge Graph Specialist responsible for extracting entities and relationships from the input text.

---CRITICAL: Use "${D}" as delimiter---
Between each field, you MUST use the exact string: ${D}
DO NOT use spaces, commas, pipes, or tabs as delimiters. Only use "${D}".

---Output Format---
Entity line (use ${D} between each field):
entity${D}entity_name${D}entity_type${D}entity_description

Relation line (use ${D} between each field):
relation${D}source_entity${D}target_entity${D}relationship_keywords${D}relationship_description

---Instructions---
1. Extract entities from the text. Each entity on its own line.
2. Extract relationships between entities. Each relation on its own line.
3. Output ONLY the extraction lines - no introductions or explanations.
4. Use "${D}" as the delimiter between EVERY field.
5. End your output with: ${COMPLETION_DELIMITER}
6. Output in ${language} language.

---Example Output---
entity${D}OpenAI${D}Organization${D}人工智能研究公司
entity${D}Sam Altman${D}Person${D}OpenAI CEO
relation${D}Sam Altman${D}OpenAI${D}担任CEO,领导${D}Sam Altman是OpenAI的CEO
${COMPLETION_DELIMITER}
`;

  const userPrompt = `---Task---
Extract entities and relationships from the text below. Use "${D}" as the delimiter between every field.

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
 * 支持两种格式:
 *   1. 标准格式: entity<|#|>name<|#|>type<|#|>description
 *   2. 空格分隔: entity name type description (LLM 常用此格式)
 *       relation source target keywords description
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
    // 首先尝试用 TUPLE_DELIMITER (<|#|>) 分隔
    let parts = line.split(TUPLE_DELIMITER);
    // 如果用分隔符拆分后 parts 只有 1 个（说明 LLM 没按格式来，用的是空格分隔）
    if (parts.length === 1) {
      // 用空格分隔: entity NAME TYPE DESCRIPTION
      parts = line.split(/\s+/);
    }

    if (parts[0] === "entity" && parts.length >= 4) {
      // entity NAME TYPE DESCRIPTION
      // parts[1] = name, parts[2] = type, parts[3+] = description
      entities.push({
        name: parts[1]?.trim() || "",
        type: parts[2]?.trim() || "NaturalObject",
        description: parts.slice(3).join(" ").trim() || "",
      });
    } else if (parts[0] === "relation" && parts.length >= 5) {
      // relation SOURCE TARGET KEYWORDS DESCRIPTION
      // parts[1] = source, parts[2] = target, parts[3] = keywords, parts[4+] = description
      relations.push({
        source: parts[1]?.trim() || "",
        target: parts[2]?.trim() || "",
        keywords: parts[3]?.trim() || "",
        description: parts.slice(4).join(" ").trim() || "",
      });
    }
  }

  return { entities, relations };
}
