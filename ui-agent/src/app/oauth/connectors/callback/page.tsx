"use client";

import { useEffect, useMemo } from "react";
import {
  getConnectorOAuthCallbackUrlFromLocation,
  getConnectorOAuthOpenerOriginFromLocation,
} from "@/lib/runtime/desktop-env";

const MESSAGE_TYPE = "openclaw.connector.oauth";

export default function ConnectorOAuthCallbackPage() {
  const payload = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const url = new URL(window.location.href);
    const id = (url.searchParams.get("id") ?? "").trim();
    const code = (url.searchParams.get("code") ?? "").trim();
    const state = (url.searchParams.get("state") ?? "").trim();
    const error = (url.searchParams.get("error") ?? "").trim();
    const callbackUrl = getConnectorOAuthCallbackUrlFromLocation({
      currentUrl: url.toString(),
    });
    const openerOrigin = getConnectorOAuthOpenerOriginFromLocation({
      currentUrl: url.toString(),
    });
    return {
      id,
      code,
      state,
      error,
      callbackUrl,
      openerOrigin,
    };
  }, []);

  useEffect(() => {
    if (
      !payload ||
      !payload.id ||
      payload.error ||
      !payload.code ||
      !payload.state ||
      !payload.callbackUrl ||
      !payload.openerOrigin
    ) {
      return;
    }

    if (window.opener) {
      window.opener.postMessage(
        {
          type: MESSAGE_TYPE,
          payload,
        },
        payload.openerOrigin,
      );
      window.setTimeout(() => {
        window.close();
      }, 500);
    }
  }, [payload]);

  const status = useMemo(() => {
    if (!payload) {
      return "授权回调参数无效";
    }
    if (!payload.id) {
      return "缺少连接器 ID，无法完成授权";
    }
    if (payload.error) {
      return `授权失败: ${payload.error}`;
    }
    if (!payload.code || !payload.state || !payload.callbackUrl) {
      return "缺少 code 或 state，无法完成授权";
    }
    if (!window.opener) {
      return "请返回原窗口继续完成连接";
    }
    return "授权成功，正在返回应用...";
  }, [payload]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-text-primary px-6">
      <div className="max-w-md w-full rounded-xl border border-border-light bg-surface p-6 shadow-sm text-center space-y-3">
        <h1 className="text-lg font-semibold">连接器授权</h1>
        <p className="text-sm text-text-secondary">{status}</p>
      </div>
    </div>
  );
}
