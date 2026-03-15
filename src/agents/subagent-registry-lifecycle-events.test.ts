import { describe, expect, it, vi, beforeEach } from "vitest";
import { resetSubagentRegistryForTests } from "./subagent-registry.js";

vi.mock("../infra/agent-events.js", () => ({
  emitAgentEvent: vi.fn(),
  onAgentEvent: vi.fn(() => () => {}),
}));

vi.mock("../gateway/call.js", () => ({
  callGateway: vi.fn().mockResolvedValue({ status: "ok" }),
}));

vi.mock("./subagent-announce.js", () => ({
  runSubagentAnnounceFlow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./subagent-announce-queue.js", () => ({
  resetAnnounceQueuesForTests: vi.fn(),
}));

import { emitAgentEvent } from "../infra/agent-events.js";

describe("subagent lifecycle events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSubagentRegistryForTests();
  });

  it("should emit start event when registering subagent with type", async () => {
    const { registerSubagentRun } = await import("./subagent-registry.js");

    registerSubagentRun({
      runId: "test-run",
      childSessionKey: "child-key",
      requesterSessionKey: "parent-key",
      requesterDisplayKey: "display",
      task: "search docs",
      cleanup: "delete",
      type: "search",
    });

    expect(emitAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "test-run",
        stream: "lifecycle",
        data: expect.objectContaining({
          phase: "start",
          subagent: expect.objectContaining({
            type: "search",
            status: "running",
          }),
        }),
      }),
    );
  });

  it("should not emit event when type is not provided", async () => {
    const { registerSubagentRun } = await import("./subagent-registry.js");

    registerSubagentRun({
      runId: "test-run",
      childSessionKey: "child-key",
      requesterSessionKey: "parent-key",
      requesterDisplayKey: "display",
      task: "test task",
      cleanup: "delete",
    });

    expect(emitAgentEvent).not.toHaveBeenCalled();
  });
});
