import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockFetchAgentIdentity = jest.fn();
const mockGetAgentFile = jest.fn();
const mockSetAgentFile = jest.fn();
const mockWsClient = {
  isConnected: () => true,
};

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const MockDynamicComponent = () => <div data-testid="persona-vrm-viewer" />;
    return MockDynamicComponent;
  },
}));

jest.mock("@/stores/connectionStore", () => ({
  useConnectionStore: (
    selector: (state: { wsClient: { isConnected: () => boolean } }) => unknown,
  ) =>
    selector({
      wsClient: mockWsClient,
    }),
}));

jest.mock("@/features/persona/services/personaApi", () => ({
  fetchAgentIdentity: (...args: unknown[]) => mockFetchAgentIdentity(...args),
  getAgentFile: (...args: unknown[]) => mockGetAgentFile(...args),
  setAgentFile: (...args: unknown[]) => mockSetAgentFile(...args),
}));

const { PersonaDetailView } =
  require("./PersonaDetailView") as typeof import("./PersonaDetailView");

describe("PersonaDetailView", () => {
  beforeEach(() => {
    mockFetchAgentIdentity.mockReset();
    mockGetAgentFile.mockReset();
    mockSetAgentFile.mockReset();
    window.alert = jest.fn();
  });

  it("loads persona detail by agent id", async () => {
    mockFetchAgentIdentity.mockResolvedValue({
      name: "测试角色",
    });
    mockGetAgentFile.mockResolvedValue({
      ok: true,
      content: JSON.stringify({
        name: "测试角色",
        description: "测试描述",
      }),
    });

    render(<PersonaDetailView agentId="agent-1" onBack={jest.fn()} />);

    await waitFor(() => {
      expect(mockFetchAgentIdentity).toHaveBeenCalled();
    });

    expect(await screen.findByDisplayValue("测试角色")).toBeInTheDocument();
    expect(screen.getByDisplayValue("测试描述")).toBeInTheDocument();
  });

  it("saves edited persona detail", async () => {
    mockFetchAgentIdentity.mockResolvedValue({
      name: "测试角色",
    });
    mockGetAgentFile.mockResolvedValue({
      ok: true,
      content: JSON.stringify({
        name: "测试角色",
        description: "旧描述",
      }),
    });
    mockSetAgentFile.mockResolvedValue({ ok: true });

    render(<PersonaDetailView agentId="agent-1" onBack={jest.fn()} />);

    const descriptionInput = await screen.findByDisplayValue("旧描述");
    fireEvent.change(descriptionInput, { target: { value: "新描述" } });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(mockSetAgentFile).toHaveBeenCalledWith(
        expect.anything(),
        "agent-1",
        ".identity.json",
        expect.stringContaining('"description": "新描述"'),
      );
    });
  });
});
