"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { isTauriRuntime } from "@/lib/runtime/desktop-env";
import { invokeTauriCommand } from "@/lib/tauri/invoke";
import { DesktopStartupError } from "./DesktopStartupError";

type GatewayStatus = {
  state?: "stopped" | "starting" | "running" | "error";
  healthy?: boolean;
  error?: string | null;
};

type DesktopBootstrapProps = {
  children: React.ReactNode;
};

type BootstrapState = "loading" | "ready" | "error";

const HEALTH_CHECK_INTERVAL_MS = 600;
const HEALTH_CHECK_TIMEOUT_MS = 20_000;

function toStartupErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return "unknown startup error";
}

async function waitForGatewayReady(): Promise<void> {
  await invokeTauriCommand("app_start_gateway");

  const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await invokeTauriCommand<GatewayStatus>("app_gateway_status");
    if (status.healthy) {
      return;
    }
    if (status.state === "error") {
      throw new Error(status.error || "gateway exited before health check passed");
    }

    await new Promise((resolve) => window.setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS));
  }

  throw new Error("gateway health check timed out");
}

export function DesktopBootstrap({ children }: DesktopBootstrapProps) {
  const [state, setState] = useState<BootstrapState>(() =>
    isTauriRuntime() ? "loading" : "ready",
  );
  const [error, setError] = useState("");

  const startGateway = useCallback(async () => {
    if (!isTauriRuntime()) {
      setState("ready");
      return;
    }

    try {
      setState("loading");
      setError("");
      await waitForGatewayReady();
      setState("ready");
    } catch (startupError) {
      setError(toStartupErrorMessage(startupError));
      setState("error");
    }
  }, []);

  useEffect(() => {
    void startGateway();
  }, [startGateway]);

  if (state === "ready") {
    return <>{children}</>;
  }

  if (state === "error") {
    return <DesktopStartupError error={error} onRetry={() => void startGateway()} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-8 shadow-lg">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="space-y-2 text-center">
          <h1 className="text-lg font-semibold text-text-primary">正在启动本地服务</h1>
          <p className="text-sm text-text-secondary">
            正在拉起 gateway 并等待健康检查通过，完成后会自动进入主界面。
          </p>
        </div>
      </div>
    </div>
  );
}
