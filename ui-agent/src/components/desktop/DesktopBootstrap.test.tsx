import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockIsTauriRuntime = jest.fn();
const mockInvokeTauriCommand = jest.fn();

jest.mock("@/lib/runtime/desktop-env", () => ({
  isTauriRuntime: () => mockIsTauriRuntime(),
}));

jest.mock("@/lib/tauri/invoke", () => ({
  invokeTauriCommand: (...args: unknown[]) => mockInvokeTauriCommand(...args),
}));

const { DesktopBootstrap } = require("./DesktopBootstrap") as typeof import("./DesktopBootstrap");

describe("DesktopBootstrap", () => {
  beforeEach(() => {
    mockIsTauriRuntime.mockReset();
    mockInvokeTauriCommand.mockReset();
  });

  it("shows loading before gateway becomes healthy", async () => {
    mockIsTauriRuntime.mockReturnValue(true);
    mockInvokeTauriCommand
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        state: "starting",
        healthy: false,
      })
      .mockResolvedValueOnce({
        state: "running",
        healthy: true,
      });

    render(
      <DesktopBootstrap>
        <div>app</div>
      </DesktopBootstrap>,
    );

    expect(screen.getByText("正在启动本地服务")).toBeInTheDocument();
    expect(await screen.findByText("app")).toBeInTheDocument();
  });

  it("shows retry action when startup fails", async () => {
    mockIsTauriRuntime.mockReturnValue(true);
    mockInvokeTauriCommand.mockRejectedValueOnce(new Error("gateway start failed"));
    mockInvokeTauriCommand.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      state: "running",
      healthy: true,
    });

    render(
      <DesktopBootstrap>
        <div>app</div>
      </DesktopBootstrap>,
    );

    expect(await screen.findByText("本地服务启动失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试启动" }));

    await waitFor(() => {
      expect(screen.getByText("app")).toBeInTheDocument();
    });
  });

  it("shows the gateway runtime error instead of timing out", async () => {
    mockIsTauriRuntime.mockReturnValue(true);
    mockInvokeTauriCommand.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      state: "error",
      healthy: false,
      error:
        "failed to spawn gateway sidecar: The system cannot find the file specified. (os error 2)",
    });

    render(
      <DesktopBootstrap>
        <div>app</div>
      </DesktopBootstrap>,
    );

    expect(
      await screen.findByText(
        "failed to spawn gateway sidecar: The system cannot find the file specified. (os error 2)",
      ),
    ).toBeInTheDocument();
  });

  it("preserves string-shaped startup errors from tauri", async () => {
    mockIsTauriRuntime.mockReturnValue(true);
    mockInvokeTauriCommand.mockRejectedValueOnce("failed to spawn gateway sidecar: access denied");

    render(
      <DesktopBootstrap>
        <div>app</div>
      </DesktopBootstrap>,
    );

    expect(
      await screen.findByText("failed to spawn gateway sidecar: access denied"),
    ).toBeInTheDocument();
  });

  it("renders children directly outside tauri runtime", () => {
    mockIsTauriRuntime.mockReturnValue(false);

    render(
      <DesktopBootstrap>
        <div>app</div>
      </DesktopBootstrap>,
    );

    expect(screen.getByText("app")).toBeInTheDocument();
  });
});
