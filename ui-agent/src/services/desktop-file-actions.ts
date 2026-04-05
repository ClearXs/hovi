import { isTauriRuntime } from "@/lib/runtime/desktop-env";
import { invokeTauriCommand } from "@/lib/tauri/invoke";

export type DesktopFileActionResult =
  | { ok: true }
  | {
      ok: false;
      code: "unsupported-runtime" | "invalid-input" | "invoke-failed";
      message: string;
    };

function normalizePathInput(path: string): string {
  return path.trim();
}

async function invokeRevealFinder(path: string): Promise<DesktopFileActionResult> {
  const normalizedPath = normalizePathInput(path);
  if (!normalizedPath) {
    return { ok: false, code: "invalid-input", message: "路径为空，无法打开。" };
  }
  if (!isTauriRuntime()) {
    return {
      ok: false,
      code: "unsupported-runtime",
      message: "当前为 Web 调试环境，无法调用系统文件能力。",
    };
  }
  try {
    await invokeTauriCommand<void>("reveal_finder", { path: normalizedPath });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      code: "invoke-failed",
      message: error instanceof Error ? error.message : "系统打开失败",
    };
  }
}

export async function revealPathInSystem(path: string): Promise<DesktopFileActionResult> {
  return invokeRevealFinder(path);
}

export async function openPathInSystem(path: string): Promise<DesktopFileActionResult> {
  // v1: use reveal_finder as a cross-platform fallback.
  return invokeRevealFinder(path);
}
