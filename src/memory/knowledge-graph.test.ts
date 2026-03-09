import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  computeTargetTriples,
  extractTriplesViaLlm,
  parseTriplesOutput,
  TUPLE_DELIMITER,
  COMPLETION_DELIMITER,
  type KnowledgeGraphSettings,
} from "./knowledge-graph.js";

vi.mock("../agents/pi-embedded.js", () => ({
  runEmbeddedPiAgent: vi.fn(async () => ({
    payloads: [
      {
        text:
          `entity${TUPLE_DELIMITER}实体A${TUPLE_DELIMITER}Concept${TUPLE_DELIMITER}概念A${COMPLETION_DELIMITER}\n` +
          `entity${TUPLE_DELIMITER}实体B${TUPLE_DELIMITER}Concept${TUPLE_DELIMITER}概念B${COMPLETION_DELIMITER}\n` +
          `relation${TUPLE_DELIMITER}实体A${TUPLE_DELIMITER}实体B${TUPLE_DELIMITER}相关${TUPLE_DELIMITER}关系描述${COMPLETION_DELIMITER}\n`,
      },
    ],
  })),
}));

describe("knowledge-graph", () => {
  const settings: KnowledgeGraphSettings = {
    enabled: true,
    extractor: "llm",
    minTriples: 5,
    maxTriples: 50,
    triplesPerKTokens: 10,
    maxDepth: 2,
  };

  it("computes target triples based on text size", () => {
    const short = computeTargetTriples({ text: "short text", settings });
    expect(short).toBeGreaterThanOrEqual(settings.minTriples);
    const longText = "x".repeat(20_000);
    const long = computeTargetTriples({ text: longText, settings });
    expect(long).toBeGreaterThanOrEqual(short);
    expect(long).toBeLessThanOrEqual(settings.maxTriples);
  });

  it("extracts triples via LLM and parses JSONL", async () => {
    const cfg = { agents: { defaults: {} } } as OpenClawConfig;
    const result = await extractTriplesViaLlm({
      text: "alpha beta gamma",
      settings,
      cfg,
      agentId: "agent-1",
      workspaceDir: "/tmp",
      agentDir: "/tmp",
    });
    expect(result.triples.length).toBeGreaterThan(0);
    expect(result.triples[0]).toHaveProperty("h");
    expect(result.triples[0]).toHaveProperty("r");
    expect(result.triples[0]).toHaveProperty("t");
  });

  describe("parseTriplesOutput", () => {
    it("should parse entity line correctly", () => {
      const output = `entity${TUPLE_DELIMITER}特斯拉公司${TUPLE_DELIMITER}Organization${TUPLE_DELIMITER}电动汽车制造商${COMPLETION_DELIMITER}`;
      const result = parseTriplesOutput(output);

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe("特斯拉公司");
      expect(result.entities[0].type).toBe("Organization");
      expect(result.entities[0].description).toBe("电动汽车制造商");
    });

    it("should parse relation line correctly", () => {
      const output = `relation${TUPLE_DELIMITER}特斯拉公司${TUPLE_DELIMITER}Model Y${TUPLE_DELIMITER}发布、生产${TUPLE_DELIMITER}特斯拉发布了Model Y${COMPLETION_DELIMITER}`;
      const result = parseTriplesOutput(output);

      expect(result.relations).toHaveLength(1);
      expect(result.relations[0].source).toBe("特斯拉公司");
      expect(result.relations[0].target).toBe("Model Y");
      expect(result.relations[0].keywords).toBe("发布、生产");
      expect(result.relations[0].description).toBe("特斯拉发布了Model Y");
    });

    it("should handle multiple entities and relations", () => {
      // 只有最后一行有 COMPLETION_DELIMITER
      const output = `entity${TUPLE_DELIMITER}特斯拉公司${TUPLE_DELIMITER}Organization${TUPLE_DELIMITER}公司
entity${TUPLE_DELIMITER}Model Y${TUPLE_DELIMITER}Artifact${TUPLE_DELIMITER}车型
relation${TUPLE_DELIMITER}特斯拉公司${TUPLE_DELIMITER}Model Y${TUPLE_DELIMITER}发布${TUPLE_DELIMITER}发布车型
${COMPLETION_DELIMITER}`;

      const result = parseTriplesOutput(output);

      expect(result.entities).toHaveLength(2);
      expect(result.relations).toHaveLength(1);
      expect(result.entities[0].name).toBe("特斯拉公司");
      expect(result.entities[1].name).toBe("Model Y");
      expect(result.relations[0].source).toBe("特斯拉公司");
    });

    it("should use NaturalObject as default type for entity", () => {
      const output = `entity${TUPLE_DELIMITER}某物${TUPLE_DELIMITER}${TUPLE_DELIMITER}描述
${COMPLETION_DELIMITER}`;
      const result = parseTriplesOutput(output);

      expect(result.entities[0].type).toBe("NaturalObject");
    });

    it("should handle empty output", () => {
      const result = parseTriplesOutput("");
      expect(result.entities).toHaveLength(0);
      expect(result.relations).toHaveLength(0);
    });

    it("should ignore invalid lines", () => {
      const output = `invalid line
entity${TUPLE_DELIMITER}特斯拉公司${TUPLE_DELIMITER}Organization${TUPLE_DELIMITER}公司
another invalid
relation${TUPLE_DELIMITER}特斯拉公司${TUPLE_DELIMITER}Model Y${TUPLE_DELIMITER}发布${TUPLE_DELIMITER}发布车型
${COMPLETION_DELIMITER}`;

      const result = parseTriplesOutput(output);

      expect(result.entities).toHaveLength(1);
      expect(result.relations).toHaveLength(1);
    });
  });
});
