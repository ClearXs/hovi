"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type DesktopStartupErrorProps = {
  error: string;
  onRetry: () => void;
};

export function DesktopStartupError({ error, onRetry }: DesktopStartupErrorProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-8">
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-surface p-8 shadow-lg">
        <div className="mb-5 flex items-center gap-3 text-error">
          <AlertTriangle className="h-6 w-6" />
          <h1 className="text-xl font-semibold text-text-primary">本地服务启动失败</h1>
        </div>
        <p className="mb-6 text-sm leading-6 text-text-secondary">
          Hovi 未能启动内置 gateway，请重试；如果问题持续存在，再查看错误信息定位原因。
        </p>
        <pre className="mb-6 max-h-[45vh] min-h-24 w-full overflow-auto whitespace-pre-wrap break-all rounded-xl bg-background-secondary p-4 text-xs leading-6 text-text-secondary">
          {error}
        </pre>
        <Button onClick={onRetry}>重试启动</Button>
      </div>
    </div>
  );
}
