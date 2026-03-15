import { describe, it, expect } from "vitest";
import type { SubagentType } from "./subagent-registry.types.js";

describe("SubagentType", () => {
  it("should have valid type values", () => {
    const validTypes: SubagentType[] = ["search", "write", "code", "analysis", "read", "agent"];
    validTypes.forEach((type) => {
      expect(type).toBeDefined();
    });
  });

  it("should accept all valid type strings", () => {
    const type1: SubagentType = "search";
    const type2: SubagentType = "write";
    const type3: SubagentType = "code";
    const type4: SubagentType = "analysis";
    const type5: SubagentType = "read";
    const type6: SubagentType = "agent";

    expect(type1).toBe("search");
    expect(type2).toBe("write");
    expect(type3).toBe("code");
    expect(type4).toBe("analysis");
    expect(type5).toBe("read");
    expect(type6).toBe("agent");
  });
});
