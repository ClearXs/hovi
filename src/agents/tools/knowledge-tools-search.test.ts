import { describe, expect, it } from "vitest";
import type { MemorySearchResult } from "../../../packages/memory-host-sdk/src/host/types.js";
import { rankKnowledgeResults } from "./knowledge-tools.js";

function makeResult(params: {
  path: string;
  snippet: string;
  score: number;
  source?: "memory" | "sessions";
}): MemorySearchResult {
  return {
    path: params.path,
    snippet: params.snippet,
    score: params.score,
    source: params.source ?? "memory",
    startLine: 1,
    endLine: 3,
  };
}

describe("rankKnowledgeResults", () => {
  const results: MemorySearchResult[] = [
    makeResult({
      path: "knowledge/doc-a",
      snippet: "alpha beta details",
      score: 0.2,
    }),
    makeResult({
      path: "knowledge/doc-b",
      snippet: "gamma only",
      score: 0.9,
    }),
    makeResult({
      path: "knowledge/doc-c",
      snippet: "alpha appears once",
      score: 0.5,
    }),
  ];

  it("uses semantic mode scores directly", () => {
    const ranked = rankKnowledgeResults({
      results,
      query: "alpha",
      retrievalMode: "semantic",
      minScore: 0.3,
      hybridAlpha: 0.5,
      maxResults: 3,
    });
    expect(ranked.map((item) => item.path)).toEqual(["knowledge/doc-b", "knowledge/doc-c"]);
  });

  it("uses keyword mode and drops non-matching snippets", () => {
    const ranked = rankKnowledgeResults({
      results,
      query: "alpha beta",
      retrievalMode: "keyword",
      minScore: 0.5,
      hybridAlpha: 0.5,
      maxResults: 3,
    });
    expect(ranked.map((item) => item.path)).toEqual(["knowledge/doc-a", "knowledge/doc-c"]);
  });

  it("uses hybrid mode with configurable alpha", () => {
    const ranked = rankKnowledgeResults({
      results,
      query: "alpha",
      retrievalMode: "hybrid",
      minScore: 0,
      hybridAlpha: 0.2,
      maxResults: 2,
    });
    expect(ranked).toHaveLength(2);
    expect(ranked[0].path).toBe("knowledge/doc-c");
  });
});
