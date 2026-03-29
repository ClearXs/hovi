import { fireEvent, render, screen } from "@testing-library/react";
import type { GatewaySessionRow } from "@/types/clawdbot";
import { TaskSearchDialog } from "./TaskSearchDialog";

function makeSession(
  params: Partial<GatewaySessionRow> & Pick<GatewaySessionRow, "key">,
): GatewaySessionRow {
  return {
    key: params.key,
    kind: params.kind ?? "direct",
    updatedAt: params.updatedAt ?? Date.now(),
    label: params.label,
    derivedTitle: params.derivedTitle,
    displayName: params.displayName,
    lastMessagePreview: params.lastMessagePreview,
  };
}

describe("TaskSearchDialog", () => {
  it("filters sessions by title only", () => {
    const onSelectSession = jest.fn();
    const onOpenChange = jest.fn();

    const sessions: GatewaySessionRow[] = [
      makeSession({
        key: "s1",
        label: "Alpha Project",
        lastMessagePreview: "irrelevant",
      }),
      makeSession({
        key: "s2",
        label: "Beta Task",
        lastMessagePreview: "contains Alpha in content",
      }),
    ];

    render(
      <TaskSearchDialog
        open={true}
        sessions={sessions}
        currentSessionKey={null}
        onSelectSession={onSelectSession}
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("搜索任务..."), { target: { value: "Alpha" } });

    expect(screen.getByText("Alpha Project")).toBeInTheDocument();
    expect(screen.queryByText("Beta Task")).not.toBeInTheDocument();
  });

  it("supports arrow navigation and enter to open highlighted session", () => {
    const onSelectSession = jest.fn();
    const onOpenChange = jest.fn();

    const sessions: GatewaySessionRow[] = [
      makeSession({ key: "s1", label: "Alpha Project" }),
      makeSession({ key: "s2", label: "Beta Task" }),
    ];

    render(
      <TaskSearchDialog
        open={true}
        sessions={sessions}
        currentSessionKey={null}
        onSelectSession={onSelectSession}
        onOpenChange={onOpenChange}
      />,
    );

    const input = screen.getByPlaceholderText("搜索任务...");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelectSession).toHaveBeenCalledWith("s2");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows clear icon and clears query quickly", () => {
    const onSelectSession = jest.fn();
    const onOpenChange = jest.fn();

    const sessions: GatewaySessionRow[] = [
      makeSession({ key: "s1", label: "Alpha Project" }),
      makeSession({ key: "s2", label: "Beta Task" }),
    ];

    render(
      <TaskSearchDialog
        open={true}
        sessions={sessions}
        currentSessionKey={null}
        onSelectSession={onSelectSession}
        onOpenChange={onOpenChange}
      />,
    );

    const input = screen.getByPlaceholderText("搜索任务...");
    fireEvent.change(input, { target: { value: "Alpha" } });

    const clearButton = screen.getByRole("button", { name: "清空搜索" });
    fireEvent.click(clearButton);

    expect(input).toHaveValue("");
    expect(screen.getByText("Alpha Project")).toBeInTheDocument();
    expect(screen.getByText("Beta Task")).toBeInTheDocument();
  });

  it("exposes listbox semantics for keyboard navigation", () => {
    const onSelectSession = jest.fn();
    const onOpenChange = jest.fn();

    const sessions: GatewaySessionRow[] = [
      makeSession({ key: "s1", label: "Alpha Project" }),
      makeSession({ key: "s2", label: "Beta Task" }),
    ];

    render(
      <TaskSearchDialog
        open={true}
        sessions={sessions}
        currentSessionKey={null}
        onSelectSession={onSelectSession}
        onOpenChange={onOpenChange}
      />,
    );

    expect(screen.getByRole("listbox", { name: "任务搜索结果" })).toBeInTheDocument();

    const input = screen.getByPlaceholderText("搜索任务...");
    const optionsBefore = screen.getAllByRole("option");
    expect(optionsBefore).toHaveLength(2);

    fireEvent.keyDown(input, { key: "ArrowDown" });

    const activeOption = screen.getByRole("option", { name: /Beta Task/ });
    expect(activeOption).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", activeOption.getAttribute("id"));
  });

  it("groups results by relative age buckets", () => {
    const onSelectSession = jest.fn();
    const onOpenChange = jest.fn();
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const sessions: GatewaySessionRow[] = [
      makeSession({ key: "d1", label: "Today Task", updatedAt: now - day / 2 }),
      makeSession({ key: "d3", label: "Three Day Task", updatedAt: now - day * 2 }),
      makeSession({ key: "d7", label: "Seven Day Task", updatedAt: now - day * 5 }),
      makeSession({ key: "old", label: "Old Task", updatedAt: now - day * 12 }),
    ];

    render(
      <TaskSearchDialog
        open={true}
        sessions={sessions}
        currentSessionKey={null}
        onSelectSession={onSelectSession}
        onOpenChange={onOpenChange}
      />,
    );

    expect(screen.getByText("最近（1天内）")).toBeInTheDocument();
    expect(screen.getByText("3天前")).toBeInTheDocument();
    expect(screen.getByText("7天前")).toBeInTheDocument();
    expect(screen.getByText("更早")).toBeInTheDocument();
  });
});
