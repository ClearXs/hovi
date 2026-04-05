import { openPathInSystem, revealPathInSystem } from "@/services/desktop-file-actions";

const mockIsTauriRuntime = jest.fn();
const mockInvokeTauriCommand = jest.fn();

jest.mock("@/lib/runtime/desktop-env", () => ({
  isTauriRuntime: () => mockIsTauriRuntime(),
}));

jest.mock("@/lib/tauri/invoke", () => ({
  invokeTauriCommand: (...args: unknown[]) => mockInvokeTauriCommand(...args),
}));

describe("desktop-file-actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns unsupported-runtime outside tauri", async () => {
    mockIsTauriRuntime.mockReturnValue(false);
    const result = await revealPathInSystem("/tmp/demo.txt");
    expect(result).toEqual({
      ok: false,
      code: "unsupported-runtime",
      message: "当前为 Web 调试环境，无法调用系统文件能力。",
    });
  });

  test("maps reveal_finder invoke failure into safe error result", async () => {
    mockIsTauriRuntime.mockReturnValue(true);
    mockInvokeTauriCommand.mockRejectedValue(new Error("bridge failed"));

    const result = await revealPathInSystem("/tmp/demo.txt");
    expect(result).toEqual({
      ok: false,
      code: "invoke-failed",
      message: "bridge failed",
    });
    expect(mockInvokeTauriCommand).toHaveBeenCalledWith("reveal_finder", {
      path: "/tmp/demo.txt",
    });
  });

  test("open path alias reuses reveal_finder in v1", async () => {
    mockIsTauriRuntime.mockReturnValue(true);
    mockInvokeTauriCommand.mockResolvedValue(undefined);

    const result = await openPathInSystem("/tmp/demo.txt");
    expect(result).toEqual({ ok: true });
    expect(mockInvokeTauriCommand).toHaveBeenCalledWith("reveal_finder", {
      path: "/tmp/demo.txt",
    });
  });
});
