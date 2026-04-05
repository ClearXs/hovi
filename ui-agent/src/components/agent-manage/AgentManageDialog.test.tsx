import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { AgentManageDialog } from "./AgentManageDialog";

const mockFetchAgents = jest.fn();
const mockCreateAgent = jest.fn();
const mockDeleteAgent = jest.fn();

const mockUseResponsive = jest.fn(() => ({ isMobile: false }));
const mockUseConnectionStore = jest.fn();

jest.mock("@/hooks/useResponsive", () => ({
  useResponsive: () => mockUseResponsive(),
}));

jest.mock("@/stores/connectionStore", () => ({
  useConnectionStore: (selector: (state: { wsClient: unknown }) => unknown) =>
    mockUseConnectionStore(selector),
}));

jest.mock("@/features/agent-manage/api/agentManageApi", () => ({
  fetchAgents: (...args: unknown[]) => mockFetchAgents(...args),
  createAgent: (...args: unknown[]) => mockCreateAgent(...args),
  deleteAgent: (...args: unknown[]) => mockDeleteAgent(...args),
}));

jest.mock("./AgentForm", () => ({
  AgentForm: () => <div>mock-agent-form</div>,
}));

jest.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

jest.mock("./AgentList", () => ({
  AgentList: ({
    agents,
    onCardClick,
  }: {
    agents: Array<{ id: string; name: string }>;
    onCardClick: (agent: { id: string; name: string }) => void;
  }) => (
    <button onClick={() => onCardClick(agents[0])} type="button">
      open-agent-config
    </button>
  ),
}));

jest.mock("./AgentConfigEditor", () => ({
  AgentConfigEditor: ({ mobile }: { mobile?: boolean; agentName?: string }) => (
    <div>{mobile ? "mock-editor-mobile" : "mock-editor-desktop"}</div>
  ),
}));

describe("AgentManageDialog", () => {
  const wsClient = {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseResponsive.mockReturnValue({ isMobile: false });
    mockUseConnectionStore.mockImplementation(
      (selector: (state: { wsClient: unknown }) => unknown) => selector({ wsClient }),
    );
    mockFetchAgents.mockResolvedValue([{ id: "main", name: "Main Agent" }]);
  });

  it("uses wider desktop dialogs for list and config views", async () => {
    render(<AgentManageDialog open onOpenChange={jest.fn()} />);

    await screen.findByText("open-agent-config");

    const listDialog = screen.getByRole("dialog");
    expect(listDialog.className).toContain("max-w-[88rem]");
    expect(listDialog.className).toContain("w-[96vw]");

    await userEvent.click(screen.getByText("open-agent-config"));

    const configEditor = await screen.findByText("mock-editor-desktop");
    const configDialog = configEditor.closest('[role="dialog"]');
    expect(configDialog?.className).toContain("max-w-[88rem]");
    expect(configDialog?.className).toContain("w-[96vw]");
  });

  it("passes mobile mode to config editor on mobile", async () => {
    mockUseResponsive.mockReturnValue({ isMobile: true });

    render(<AgentManageDialog open onOpenChange={jest.fn()} />);

    await waitFor(() => expect(mockFetchAgents).toHaveBeenCalled());
    await userEvent.click(await screen.findByText("open-agent-config"));

    expect(await screen.findByText("mock-editor-mobile")).toBeInTheDocument();
  });
});
