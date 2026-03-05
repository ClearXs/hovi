import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runEmbeddedPiAgent } from "../agents/pi-embedded.js";
import type { OpenClawConfig } from "../config/config.js";
import { hashText } from "./internal.js";

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
  const prompt = buildTripleExtractionPrompt(text, targetTriples);
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
    const triples = parseTriples(rawText).slice(0, targetTriples);
    return { triples, rawText, targetTriples };
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

function buildTripleExtractionPrompt(text: string, targetTriples: number): string {
  return [
    "Extract knowledge graph triples from the text below.",
    `Return up to ${targetTriples} triples in JSONL format.`,
    "Each line must be a JSON object with keys: h, r, t.",
    "h and t must include a name field. r must include a type field.",
    "Do not include explanations, code fences, or markdown. JSONL only.",
    "",
    "Text:",
    text.slice(0, 16000),
  ].join("\n");
}

function extractResponseText(payloads: Array<{ text?: string }>): string {
  const text = payloads.map((payload) => payload.text ?? "").join("\n");
  return text.trim();
}

function parseTriples(rawText: string): KnowledgeGraphTripleInput[] {
  const cleaned = stripCodeFences(rawText);
  if (!cleaned) {
    return [];
  }
  const trimmed = cleaned.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed) as KnowledgeGraphTripleInput[];
      return parsed
        .map(normalizeTriple)
        .filter((triple): triple is KnowledgeGraphTripleInput => Boolean(triple));
    } catch {
      return [];
    }
  }
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const triples: KnowledgeGraphTripleInput[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as KnowledgeGraphTripleInput;
      const normalized = normalizeTriple(parsed);
      if (normalized) {
        triples.push(normalized);
      }
    } catch {
      continue;
    }
  }
  return triples;
}

function stripCodeFences(text: string): string {
  let output = text.replace(/```(?:jsonl|json)?/gi, "");
  output = output.replace(/```/g, "");
  return output.trim();
}

export function hashTripleKey(triple: KnowledgeGraphTripleInput): string {
  const h = typeof triple.h === "string" ? triple.h : triple.h.name;
  const t = typeof triple.t === "string" ? triple.t : triple.t.name;
  const r = typeof triple.r === "string" ? triple.r : triple.r.type;
  return hashText(`${h}::${r}::${t}`);
}
