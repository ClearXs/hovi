import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockFetchScene = jest.fn();
const mockUpdateScene = jest.fn();
const mockWsClient = {
  isConnected: () => true,
};

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const MockDynamicComponent = () => <div data-testid="scene-viewer" />;
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

jest.mock("@/features/scene/api/sceneApi", () => ({
  fetchScene: (...args: unknown[]) => mockFetchScene(...args),
  updateScene: (...args: unknown[]) => mockUpdateScene(...args),
}));

const { SceneDetailView } = require("./SceneDetailView") as typeof import("./SceneDetailView");

describe("SceneDetailView", () => {
  beforeEach(() => {
    mockFetchScene.mockReset();
    mockUpdateScene.mockReset();
    window.alert = jest.fn();
  });

  it("loads scene detail by scene id", async () => {
    mockFetchScene.mockResolvedValue({
      id: "scene-1",
      name: "测试场景",
      description: "场景描述",
      r_path: "/assets/scenes/demo",
      main_file: "scene.glb",
    });

    render(<SceneDetailView sceneId="scene-1" onBack={jest.fn()} />);

    expect(await screen.findByDisplayValue("测试场景")).toBeInTheDocument();
    expect(screen.getByDisplayValue("/assets/scenes/demo")).toBeInTheDocument();
  });

  it("saves edited scene detail", async () => {
    mockFetchScene.mockResolvedValue({
      id: "scene-1",
      name: "测试场景",
      description: "场景描述",
      r_path: "/assets/scenes/demo",
      main_file: "scene.glb",
      thumb: "/assets/scenes/thumb.png",
    });
    mockUpdateScene.mockResolvedValue({ ok: true });

    render(<SceneDetailView sceneId="scene-1" onBack={jest.fn()} />);

    const nameInput = await screen.findByDisplayValue("测试场景");
    fireEvent.change(nameInput, { target: { value: "更新场景" } });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(mockUpdateScene).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          sceneId: "scene-1",
          name: "更新场景",
        }),
      );
    });
  });
});
