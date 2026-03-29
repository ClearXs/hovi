import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";
import Sidebar from "./Sidebar";

jest.mock("@/stores/settingsStore", () => ({
  useSettingsStore: jest.fn((selector?: (state: { openSettings: () => void }) => unknown) => {
    const state = { openSettings: jest.fn() };
    return typeof selector === "function" ? selector(state) : state;
  }),
}));

jest.mock("@/components/quota/SidebarQuotaBar", () => ({
  SidebarQuotaBar: () => <div data-testid="sidebar-quota-bar" />,
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    onSelect,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    onSelect?: () => void;
  }) => (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        onSelect?.();
        onClick?.();
      }}
    >
      {children}
    </div>
  ),
}));

describe("Sidebar cursor", () => {
  it("shows pointer cursor on each history task item", () => {
    render(
      <TooltipProvider>
        <Sidebar
          sessions={[
            {
              key: "session-1",
              kind: "direct",
              label: "历史任务一",
              updatedAt: Date.now(),
            },
          ]}
        />
      </TooltipProvider>,
    );

    const taskItem = screen.getByRole("button", { name: /历史任务一/ });
    expect(taskItem).toHaveClass("cursor-pointer");
  });

  it("triggers filter and sort callbacks from dropdown menu", async () => {
    const onFilterChange = jest.fn();
    const onSortChange = jest.fn();

    render(
      <TooltipProvider>
        <Sidebar
          sessions={[
            {
              key: "session-1",
              kind: "direct",
              label: "历史任务一",
              updatedAt: Date.now(),
            },
          ]}
          onFilterChange={onFilterChange}
          onSortChange={onSortChange}
        />
      </TooltipProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "排序" }));
    await userEvent.click(screen.getByText("名称"));
    expect(onSortChange).toHaveBeenCalledWith("name");

    await userEvent.click(screen.getByRole("button", { name: "过滤" }));
    await userEvent.click(screen.getByText("私聊"));
    expect(onFilterChange).toHaveBeenCalledWith("direct");
  });
});
