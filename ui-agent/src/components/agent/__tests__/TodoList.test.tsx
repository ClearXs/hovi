import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TodoList } from "@/components/agent/TodoList";

describe("TodoList", () => {
  const steps = [
    {
      step_number: 1,
      action: "Step 1",
      observation: "",
      status: "completed" as const,
    },
    {
      step_number: 2,
      action: "Step 2",
      observation: "",
      status: "running" as const,
    },
    {
      step_number: 3,
      action: "Step 3",
      observation: "",
      status: "pending" as const,
    },
  ];

  it("renders todo list items", () => {
    render(<TodoList steps={steps} currentStep={steps[1]} />);

    expect(screen.getByText("Step 1")).toBeInTheDocument();
    expect(screen.getByText("Step 2")).toBeInTheDocument();
    expect(screen.getByText("Step 3")).toBeInTheDocument();
  });

  it("shows an empty state when there are no steps", () => {
    render(<TodoList steps={[]} />);

    expect(screen.getByText("暂无执行计划")).toBeInTheDocument();
  });

  it("shows step status labels", () => {
    render(<TodoList steps={steps} currentStep={steps[1]} />);

    expect(screen.getByText("已完成")).toBeInTheDocument();
    expect(screen.getByText("执行中")).toBeInTheDocument();
    expect(screen.getByText("等待执行")).toBeInTheDocument();
  });
});
