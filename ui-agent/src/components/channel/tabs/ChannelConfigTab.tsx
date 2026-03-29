"use client";

import { useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ChannelAccountSnapshot } from "@/services/channelApi";

interface ChannelConfigTabProps {
  channelId: string;
  draft: string;
  isLoadingConfig: boolean;
  isSavingConfig: boolean;
  isProbing: boolean;
  configError: string | null;
  saveMessage: string | null;
  probeMessage: string | null;
  probeDetails: ChannelAccountSnapshot[];
  probeSuggestions: string[];
  onDraftChange: (next: string) => void;
  onReload: () => void;
  onSave: () => void;
  onProbe: () => void;
  onUseTemplate: () => void;
}

type ConfigMode = "guided" | "json";
type SuggestionTargetField = "botToken" | "token" | "appToken";

function parseDraftObject(draft: string): { value: Record<string, unknown>; error: string | null } {
  const trimmed = draft.trim();
  if (!trimmed) {
    return { value: {}, error: null };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { value: {}, error: "当前配置不是 JSON 对象，请切换 JSON 模式修正。" };
    }
    return { value: parsed as Record<string, unknown>, error: null };
  } catch (error) {
    return {
      value: {},
      error: error instanceof Error ? `JSON 解析失败：${error.message}` : "JSON 解析失败",
    };
  }
}

export function ChannelConfigTab({
  channelId,
  draft,
  isLoadingConfig,
  isSavingConfig,
  isProbing,
  configError,
  saveMessage,
  probeMessage,
  probeDetails,
  probeSuggestions,
  onDraftChange,
  onReload,
  onSave,
  onProbe,
  onUseTemplate,
}: ChannelConfigTabProps) {
  const [mode, setMode] = useState<ConfigMode>("guided");
  const [localValidationError, setLocalValidationError] = useState<string | null>(null);
  const [probeDialogOpen, setProbeDialogOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const botTokenInputRef = useRef<HTMLInputElement | null>(null);
  const tokenInputRef = useRef<HTMLInputElement | null>(null);
  const appTokenInputRef = useRef<HTMLInputElement | null>(null);
  const parsed = useMemo(() => parseDraftObject(draft), [draft]);
  const configObject = parsed.value;
  const parseError = parsed.error;

  const writeNext = (next: Record<string, unknown>) => {
    onDraftChange(JSON.stringify(next, null, 2));
  };

  const setStringField = (key: string, value: string) => {
    setLocalValidationError(null);
    writeNext({
      ...configObject,
      [key]: value,
    });
  };

  const setBooleanField = (key: string, value: boolean) => {
    setLocalValidationError(null);
    writeNext({
      ...configObject,
      [key]: value,
    });
  };

  const validateBeforeSave = (): string | null => {
    if (mode !== "guided") {
      return null;
    }
    if (parseError) {
      return parseError;
    }
    const enabled = configObject.enabled !== false;
    if (!enabled) {
      return null;
    }
    if (channelId === "telegram" && !String(configObject.botToken ?? "").trim()) {
      return "Bot Token 为必填项";
    }
    if (channelId === "discord" && !String(configObject.token ?? "").trim()) {
      return "Bot Token 为必填项";
    }
    if (channelId === "slack") {
      if (!String(configObject.botToken ?? "").trim()) {
        return "Bot Token 为必填项";
      }
      if (!String(configObject.appToken ?? "").trim()) {
        return "App Token 为必填项";
      }
    }
    return null;
  };

  const handleSave = () => {
    const validationMessage = validateBeforeSave();
    if (validationMessage) {
      setLocalValidationError(validationMessage);
      return;
    }
    setLocalValidationError(null);
    onSave();
  };

  const visibleError = localValidationError ?? configError ?? parseError;

  const resolveSuggestionTarget = (suggestion: string): SuggestionTargetField | null => {
    const lower = suggestion.toLowerCase();
    if (channelId === "telegram") {
      return lower.includes("token") ? "botToken" : null;
    }
    if (channelId === "discord") {
      if (lower.includes("bot token")) {
        return "token";
      }
      return null;
    }
    if (channelId === "slack") {
      if (lower.includes("app token")) {
        return "appToken";
      }
      if (lower.includes("bot token") || lower.includes("token")) {
        return "botToken";
      }
      return null;
    }
    return null;
  };

  const focusTargetField = (target: SuggestionTargetField) => {
    const focusField = () => {
      const targetInput =
        target === "botToken"
          ? botTokenInputRef.current
          : target === "token"
            ? tokenInputRef.current
            : appTokenInputRef.current;
      targetInput?.focus();
      if (typeof targetInput?.scrollIntoView === "function") {
        targetInput.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };
    if (mode === "guided") {
      focusField();
      return;
    }
    setMode("guided");
    setTimeout(focusField, 0);
  };

  const groupedSuggestions = useMemo(() => {
    const blocking: string[] = [];
    const recommended: string[] = [];
    for (const item of probeSuggestions) {
      const lower = item.toLowerCase();
      const isBlocking =
        lower.includes("token") ||
        lower.includes("补全") ||
        lower.includes("鉴权") ||
        lower.includes("凭证");
      if (isBlocking) {
        blocking.push(item);
      } else {
        recommended.push(item);
      }
    }
    return { blocking, recommended };
  }, [probeSuggestions]);

  const checklistText = useMemo(() => {
    const parts: string[] = ["排查建议"];
    if (groupedSuggestions.blocking.length > 0) {
      parts.push("阻断项");
      groupedSuggestions.blocking.forEach((item) => parts.push(`- ${item}`));
    }
    if (groupedSuggestions.recommended.length > 0) {
      parts.push("建议项");
      groupedSuggestions.recommended.forEach((item) => parts.push(`- ${item}`));
    }
    return parts.join("\n");
  }, [groupedSuggestions]);

  const handleCopyChecklist = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setCopyStatus("当前环境不支持复制");
      return;
    }
    try {
      await navigator.clipboard.writeText(checklistText);
      setCopyStatus("已复制排查清单");
    } catch {
      setCopyStatus("复制失败，请手动复制");
    }
  };

  return (
    <div className="rounded-lg border border-border-light bg-background-secondary p-md">
      <div className="mb-sm flex items-center justify-between gap-sm">
        <div>
          <div className="text-sm font-medium text-text-primary">频道配置</div>
          <div className="text-xs text-text-tertiary">当前频道：{channelId}</div>
        </div>
        <div className="flex items-center gap-sm">
          <button
            type="button"
            className={`h-8 rounded-md border px-sm text-xs ${
              mode === "guided"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border-light text-text-secondary hover:bg-background"
            }`}
            onClick={() => {
              setMode("guided");
              setLocalValidationError(null);
            }}
          >
            向导模式
          </button>
          <button
            type="button"
            className={`h-8 rounded-md border px-sm text-xs ${
              mode === "json"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border-light text-text-secondary hover:bg-background"
            }`}
            onClick={() => {
              setMode("json");
              setLocalValidationError(null);
            }}
          >
            JSON 模式
          </button>
          <button
            type="button"
            className="h-8 rounded-md border border-border-light px-sm text-xs text-text-secondary hover:bg-background"
            onClick={onUseTemplate}
          >
            使用模板
          </button>
          <button
            type="button"
            className="h-8 rounded-md border border-border-light px-sm text-xs text-text-secondary hover:bg-background"
            onClick={onReload}
          >
            {isLoadingConfig ? "加载中..." : "重新加载"}
          </button>
          <button
            type="button"
            className="h-8 rounded-md border border-border-light px-sm text-xs text-text-secondary hover:bg-background disabled:opacity-60"
            onClick={onProbe}
            disabled={isProbing}
          >
            {isProbing ? "探测中..." : "连通性探测"}
          </button>
          <button
            type="button"
            className="h-8 rounded-md bg-primary px-sm text-xs text-white"
            onClick={handleSave}
            disabled={isSavingConfig}
          >
            {isSavingConfig ? "保存中..." : "保存配置"}
          </button>
        </div>
      </div>

      {visibleError ? (
        <div className="mb-sm rounded-md border border-red-500/30 bg-red-500/10 px-sm py-xs text-xs text-red-500">
          {visibleError}
        </div>
      ) : null}
      {probeMessage ? (
        <div className="mb-sm flex items-center justify-between gap-sm rounded-md border border-primary/20 bg-primary/5 px-sm py-xs text-xs text-text-secondary">
          <span>{probeMessage}</span>
          {probeDetails.length > 0 ? (
            <button
              type="button"
              className="rounded border border-border-light px-2 py-0.5 text-[11px] text-text-secondary hover:bg-background"
              onClick={() => setProbeDialogOpen(true)}
            >
              查看探测详情
            </button>
          ) : null}
        </div>
      ) : null}
      {saveMessage ? (
        <div className="mb-sm rounded-md border border-green-500/30 bg-green-500/10 px-sm py-xs text-xs text-green-600">
          {saveMessage}
        </div>
      ) : null}
      {probeSuggestions.length > 0 ? (
        <div className="mb-sm rounded-md border border-border-light bg-background px-sm py-sm text-xs text-text-secondary">
          <div className="mb-1 flex items-center justify-between gap-sm">
            <div className="font-medium text-text-primary">排查建议</div>
            <button
              type="button"
              className="h-6 rounded border border-border-light px-2 text-[11px] text-text-secondary hover:bg-background"
              onClick={() => void handleCopyChecklist()}
            >
              复制排查清单
            </button>
          </div>
          {copyStatus ? <div className="mb-1 text-[11px] text-primary">{copyStatus}</div> : null}
          {groupedSuggestions.blocking.length > 0 ? (
            <div className="mb-1">
              <div className="mb-1 font-medium text-red-500">阻断项</div>
              <ul className="space-y-1">
                {groupedSuggestions.blocking.map((item) => {
                  const target = resolveSuggestionTarget(item);
                  return (
                    <li
                      key={`blocking:${item}`}
                      className="flex items-center justify-between gap-sm"
                    >
                      <span className="mr-sm">• {item}</span>
                      {target ? (
                        <button
                          type="button"
                          className="h-6 rounded border border-border-light px-2 text-[11px] text-text-secondary hover:bg-background"
                          onClick={() => focusTargetField(target)}
                        >
                          去配置
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {groupedSuggestions.recommended.length > 0 ? (
            <div>
              <div className="mb-1 font-medium text-text-primary">建议项</div>
              <ul className="space-y-1">
                {groupedSuggestions.recommended.map((item) => {
                  const target = resolveSuggestionTarget(item);
                  return (
                    <li
                      key={`recommended:${item}`}
                      className="flex items-center justify-between gap-sm"
                    >
                      <span className="mr-sm">• {item}</span>
                      {target ? (
                        <button
                          type="button"
                          className="h-6 rounded border border-border-light px-2 text-[11px] text-text-secondary hover:bg-background"
                          onClick={() => focusTargetField(target)}
                        >
                          去配置
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "guided" ? (
        <div className="space-y-sm rounded-md border border-border-light bg-background p-sm text-xs">
          <label className="flex items-center gap-2 text-text-primary">
            <input
              type="checkbox"
              checked={configObject.enabled !== false}
              onChange={(event) => setBooleanField("enabled", event.target.checked)}
            />
            启用频道
          </label>

          {channelId === "telegram" ? (
            <>
              <label className="block">
                <span className="mb-1 block text-text-secondary">Bot Token</span>
                <input
                  ref={botTokenInputRef}
                  aria-label="Bot Token"
                  className="h-8 w-full rounded-md border border-border-light bg-background px-sm text-xs text-text-primary outline-none focus:border-primary"
                  value={String(configObject.botToken ?? "")}
                  onChange={(event) => setStringField("botToken", event.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-text-secondary">DM Policy</span>
                <select
                  className="h-8 w-full rounded-md border border-border-light bg-background px-sm text-xs text-text-primary outline-none focus:border-primary"
                  value={String(configObject.dmPolicy ?? "pairing")}
                  onChange={(event) => setStringField("dmPolicy", event.target.value)}
                >
                  <option value="pairing">pairing</option>
                  <option value="allowlist">allowlist</option>
                  <option value="open">open</option>
                  <option value="disabled">disabled</option>
                </select>
              </label>
            </>
          ) : channelId === "discord" ? (
            <>
              <label className="block">
                <span className="mb-1 block text-text-secondary">Bot Token</span>
                <input
                  ref={tokenInputRef}
                  aria-label="Bot Token"
                  className="h-8 w-full rounded-md border border-border-light bg-background px-sm text-xs text-text-primary outline-none focus:border-primary"
                  value={String(configObject.token ?? "")}
                  onChange={(event) => setStringField("token", event.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-text-secondary">Group Policy</span>
                <select
                  className="h-8 w-full rounded-md border border-border-light bg-background px-sm text-xs text-text-primary outline-none focus:border-primary"
                  value={String(configObject.groupPolicy ?? "allowlist")}
                  onChange={(event) => setStringField("groupPolicy", event.target.value)}
                >
                  <option value="allowlist">allowlist</option>
                  <option value="open">open</option>
                  <option value="disabled">disabled</option>
                </select>
              </label>
            </>
          ) : channelId === "slack" ? (
            <>
              <label className="block">
                <span className="mb-1 block text-text-secondary">Bot Token</span>
                <input
                  ref={botTokenInputRef}
                  aria-label="Bot Token"
                  className="h-8 w-full rounded-md border border-border-light bg-background px-sm text-xs text-text-primary outline-none focus:border-primary"
                  value={String(configObject.botToken ?? "")}
                  onChange={(event) => setStringField("botToken", event.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-text-secondary">App Token</span>
                <input
                  ref={appTokenInputRef}
                  aria-label="App Token"
                  className="h-8 w-full rounded-md border border-border-light bg-background px-sm text-xs text-text-primary outline-none focus:border-primary"
                  value={String(configObject.appToken ?? "")}
                  onChange={(event) => setStringField("appToken", event.target.value)}
                />
              </label>
            </>
          ) : (
            <div className="rounded bg-primary/5 px-sm py-sm text-text-secondary">
              当前频道暂未提供专属向导字段，可切到 JSON 模式编辑完整配置。
            </div>
          )}
        </div>
      ) : (
        <textarea
          className="min-h-[20rem] w-full rounded-md border border-border-light bg-background p-sm text-xs text-text-primary outline-none focus:border-primary"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          spellCheck={false}
          placeholder='例如：{"enabled": true}'
        />
      )}
      <div className="mt-sm text-[11px] text-text-tertiary">
        提示：本页保存会调用网关 `config.patch`，仅更新当前频道对应配置块。
      </div>
      <Dialog open={probeDialogOpen} onOpenChange={setProbeDialogOpen}>
        <DialogContent className="max-w-[36rem]">
          <DialogHeader>
            <DialogTitle>探测详情</DialogTitle>
            <DialogDescription>查看当前频道账号的连通性探测结果明细。</DialogDescription>
          </DialogHeader>
          <div className="max-h-[24rem] space-y-sm overflow-auto scrollbar-default text-xs">
            {probeDetails.map((account) => (
              <div
                key={account.accountId}
                className="rounded-md border border-border-light bg-background p-sm text-text-secondary"
              >
                <div className="mb-1 font-medium text-text-primary">{account.accountId}</div>
                <div>连接状态：{account.connected ? "已连接" : "未连接"}</div>
                <div>配置状态：{account.configured === false ? "未配置" : "已配置"}</div>
                <div>运行状态：{account.running === false ? "未运行" : "运行中 / 未知"}</div>
                {typeof account.reconnectAttempts === "number" ? (
                  <div>重连次数：{account.reconnectAttempts}</div>
                ) : null}
                {account.lastError ? <div>{account.lastError}</div> : null}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
