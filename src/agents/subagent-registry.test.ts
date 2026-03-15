import { describe, expect, it, vi, beforeEach } from "vitest";
import { resetSubagentRegistryForTests } from "./subagent-registry.js";

const callGatewayMock = vi.fn();

vi.mock("../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGatewayMock(opts),
}));

vi.mock("./subagent-announce.js", () => ({
  runSubagentAnnounceFlow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./subagent-announce-queue.js", () => ({
  resetAnnounceQueuesForTests: vi.fn(),
}));

describe("registerSubagentRun with type", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSubagentRegistryForTests();
  });

  it("should store type when registering subagent", async () => {
    const { registerSubagentRun, listSubagentRunsForRequester } =
      await import("./subagent-registry.js");

    registerSubagentRun({
      runId: "test-run",
      childSessionKey: "child-key",
      requesterSessionKey: "parent-key",
      requesterDisplayKey: "display",
      task: "search docs",
      cleanup: "delete",
      type: "search",
    });

    const runs = listSubagentRunsForRequester("parent-key");
    expect(runs).toHaveLength(1);
    expect(runs[0]?.type).toBe("search");
  });

  it("should store different types correctly", async () => {
    const { registerSubagentRun, listSubagentRunsForRequester } =
      await import("./subagent-registry.js");

    registerSubagentRun({
      runId: "test-run-1",
      childSessionKey: "child-key-1",
      requesterSessionKey: "parent-key",
      requesterDisplayKey: "display",
      task: "search docs",
      cleanup: "delete",
      type: "search",
    });

    registerSubagentRun({
      runId: "test-run-2",
      childSessionKey: "child-key-2",
      requesterSessionKey: "parent-key",
      requesterDisplayKey: "display",
      task: "write report",
      cleanup: "delete",
      type: "write",
    });

    const runs = listSubagentRunsForRequester("parent-key");
    expect(runs).toHaveLength(2);
    expect(runs[0]?.type).toBe("search");
    expect(runs[1]?.type).toBe("write");
  });

  it("should allow undefined type", async () => {
    const { registerSubagentRun, listSubagentRunsForRequester } =
      await import("./subagent-registry.js");

    registerSubagentRun({
      runId: "test-run",
      childSessionKey: "child-key",
      requesterSessionKey: "parent-key",
      requesterDisplayKey: "display",
      task: "some task",
      cleanup: "delete",
    });

    const runs = listSubagentRunsForRequester("parent-key");
    expect(runs).toHaveLength(1);
    expect(runs[0]?.type).toBeUndefined();
  });
});
