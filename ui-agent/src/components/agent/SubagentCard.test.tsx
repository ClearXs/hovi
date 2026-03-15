import { describe, it, expect } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SubagentCard } from "./SubagentCard";

describe("SubagentCard", () => {
  const mockSubagent = {
    id: "test-id",
    label: "测试Agent",
    task: "搜索相关文档",
    type: "search" as const,
    status: "running" as const,
    createdAt: new Date(),
  };

  it("should render subagent label", () => {
    render(<SubagentCard subagent={mockSubagent} />);
    expect(screen.getByText("测试Agent")).toBeDefined();
  });

  it("should render task description", () => {
    render(<SubagentCard subagent={mockSubagent} />);
    expect(screen.getByText("搜索相关文档")).toBeDefined();
  });

  it("should show running status", () => {
    render(<SubagentCard subagent={mockSubagent} />);
    expect(screen.getByText("运行中")).toBeDefined();
  });

  it("should show completed status", () => {
    const completedSubagent = { ...mockSubagent, status: "completed" as const };
    render(<SubagentCard subagent={completedSubagent} />);
    expect(screen.getByText("完成")).toBeDefined();
  });

  it("should show failed status", () => {
    const failedSubagent = { ...mockSubagent, status: "failed" as const };
    render(<SubagentCard subagent={failedSubagent} />);
    expect(screen.getByText("失败")).toBeDefined();
  });
});
