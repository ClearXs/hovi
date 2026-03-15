import { describe, it, expect } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SubagentList } from "./SubagentList";

describe("SubagentList", () => {
  const mockSubagents = [
    {
      id: "test-1",
      label: "Agent 1",
      task: "task 1",
      status: "running" as const,
      createdAt: new Date(),
    },
    {
      id: "test-2",
      label: "Agent 2",
      task: "task 2",
      status: "completed" as const,
      createdAt: new Date(),
    },
  ];

  it("should render subagent count", () => {
    render(<SubagentList subagents={mockSubagents} />);
    expect(screen.getByText("子 Agent (2)")).toBeDefined();
  });

  it("should render empty when no subagents", () => {
    const { container } = render(<SubagentList subagents={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("should render all subagent cards", () => {
    render(<SubagentList subagents={mockSubagents} />);
    expect(screen.getByText("Agent 1")).toBeDefined();
    expect(screen.getByText("Agent 2")).toBeDefined();
  });
});
