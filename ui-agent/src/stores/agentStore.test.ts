import { describe, it, expect, beforeEach } from "@jest/globals";
import { useAgentStore } from "./agentStore";

describe("agentStore - subagents", () => {
  beforeEach(() => {
    useAgentStore.getState().clearSubagents();
  });

  it("should add subagent", () => {
    const subagent = {
      id: "test-id",
      label: "test",
      task: "test task",
      status: "running" as const,
      createdAt: new Date(),
    };

    useAgentStore.getState().addSubagent(subagent);

    expect(useAgentStore.getState().subagents.get("test-id")).toEqual(subagent);
  });

  it("should update subagent", () => {
    const subagent = {
      id: "test-id",
      label: "test",
      task: "test task",
      status: "running" as const,
      createdAt: new Date(),
    };

    useAgentStore.getState().addSubagent(subagent);
    useAgentStore.getState().updateSubagent("test-id", { status: "completed" as const });

    expect(useAgentStore.getState().subagents.get("test-id")?.status).toBe("completed");
  });

  it("should remove subagent", () => {
    const subagent = {
      id: "test-id",
      label: "test",
      task: "test task",
      status: "running" as const,
      createdAt: new Date(),
    };

    useAgentStore.getState().addSubagent(subagent);
    useAgentStore.getState().removeSubagent("test-id");

    expect(useAgentStore.getState().subagents.get("test-id")).toBeUndefined();
  });

  it("should clear all subagents", () => {
    const subagent1 = {
      id: "test-1",
      task: "task 1",
      status: "running" as const,
      createdAt: new Date(),
    };
    const subagent2 = {
      id: "test-2",
      task: "task 2",
      status: "running" as const,
      createdAt: new Date(),
    };

    useAgentStore.getState().addSubagent(subagent1);
    useAgentStore.getState().addSubagent(subagent2);
    useAgentStore.getState().clearSubagents();

    expect(useAgentStore.getState().subagents.size).toBe(0);
  });
});
