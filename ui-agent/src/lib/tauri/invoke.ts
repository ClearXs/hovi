import { isTauriRuntime } from "@/lib/runtime/desktop-env";

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type TauriWindow = Window & {
  __TAURI__?: {
    invoke?: TauriInvoke;
    core?: {
      invoke?: TauriInvoke;
    };
  };
  __TAURI_INTERNALS__?: {
    invoke?: TauriInvoke;
  };
};

function getTauriInvoke(): TauriInvoke | null {
  if (typeof window === "undefined") {
    return null;
  }

  const tauriWindow = window as TauriWindow;
  return (
    tauriWindow.__TAURI_INTERNALS__?.invoke ??
    tauriWindow.__TAURI__?.core?.invoke ??
    tauriWindow.__TAURI__?.invoke ??
    null
  );
}

export async function invokeTauriCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error(`Tauri runtime is not available for command "${command}"`);
  }

  const invoke = getTauriInvoke();
  if (!invoke) {
    throw new Error(`Tauri invoke bridge is not available for command "${command}"`);
  }

  return invoke<T>(command, args);
}
