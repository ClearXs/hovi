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

describe("Sidebar collapsed mode", () => {
  it("shows quick action tooltips in collapsed sidebar", async () => {
    render(
      <TooltipProvider>
        <Sidebar isCollapsed />
      </TooltipProvider>,
    );

    const newTaskButton = screen.getByRole("button", { name: "新建任务" });
    const searchButton = screen.getByRole("button", { name: "搜索" });
    const knowledgeButton = screen.getByRole("button", { name: "知识库" });
    const channelButton = screen.getByRole("button", { name: "频道" });

    await userEvent.hover(newTaskButton);
    expect((await screen.findAllByText("新建任务 (Ctrl+Cmd+N)")).length).toBeGreaterThan(0);

    await userEvent.hover(searchButton);
    expect((await screen.findAllByText("搜索 (Ctrl+Cmd+K)")).length).toBeGreaterThan(0);

    await userEvent.hover(knowledgeButton);
    expect((await screen.findAllByText("知识库")).length).toBeGreaterThan(0);

    await userEvent.hover(channelButton);
    expect((await screen.findAllByText("频道")).length).toBeGreaterThan(0);
  });

  it("uses matching icon size for settings/about buttons", () => {
    render(
      <TooltipProvider>
        <Sidebar isCollapsed />
      </TooltipProvider>,
    );

    const settingsButton = screen.getByRole("button", { name: "设置" });
    const aboutButton = screen.getByRole("button", { name: "关于我" });

    const settingsIcon = settingsButton.querySelector("svg");
    const aboutIcon = aboutButton.querySelector("svg");

    expect(settingsIcon).not.toBeNull();
    expect(aboutIcon).not.toBeNull();
    expect(settingsIcon).toHaveClass("w-5", "h-5");
    expect(aboutIcon).toHaveClass("w-5", "h-5");
  });
});
