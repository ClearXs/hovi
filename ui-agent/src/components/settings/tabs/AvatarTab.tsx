"use client";

import { Bot, Loader2, AlertCircle, RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useSettingsStore, type OpenClawConfigPartial } from "@/stores/settingsStore";
import { useToastStore } from "@/stores/toastStore";

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-text-tertiary">{icon}</span>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
    </div>
  );
}

function FieldRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-text-primary">{label}</div>
        {description && <div className="text-xs text-text-tertiary mt-0.5">{description}</div>}
      </div>
      <div className="flex-shrink-0 w-[260px]">{children}</div>
    </div>
  );
}

export function AvatarTab({ onClose }: { onClose?: () => void }) {
  const { config, isLoadingConfig, isSavingConfig, configError, loadConfig, patchConfig } =
    useSettingsStore();
  const { addToast } = useToastStore();

  const [enabled, setEnabled] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [originalEnabled, setOriginalEnabled] = useState(false);

  // Sync remote config → local state when loaded
  useEffect(() => {
    if (config) {
      const val = (config as OpenClawConfigPartial).ui?.assistant?.enabled;
      const resolved = val === true; // default false
      setEnabled(resolved);
      setOriginalEnabled(resolved);
      setDirty(false);
    }
  }, [config]);

  const handleToggle = useCallback(
    (checked: boolean) => {
      setEnabled(checked);
      setDirty(checked !== originalEnabled);
    },
    [originalEnabled],
  );

  const handleSave = async () => {
    const result = await patchConfig({
      ui: {
        ...((config as Record<string, unknown>)?.ui as Record<string, unknown> | undefined),
        assistant: {
          ...((config as OpenClawConfigPartial).ui?.assistant as
            | Record<string, unknown>
            | undefined),
          enabled,
        },
      },
    });

    if (result.ok) {
      setOriginalEnabled(enabled);
      setDirty(false);
      if (result.needsRestart) {
        addToast({
          title: "配置已保存，网关即将重启",
          description: "设置页面将关闭，请稍候重新打开",
        });
        setTimeout(() => {
          onClose?.();
        }, 1500);
      } else {
        addToast({
          title: "配置已保存",
          description: "设置已成功更新",
        });
      }
    } else {
      addToast({
        title: "保存失败",
        description: result.error ?? "未知错误",
        variant: "error",
      });
    }
  };

  const handleReset = () => {
    setEnabled(originalEnabled);
    setDirty(false);
  };

  if (isLoadingConfig) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
        <Loader2 className="w-8 h-8 text-text-tertiary animate-spin mb-3" />
        <p className="text-sm text-text-tertiary">加载配置中...</p>
      </div>
    );
  }

  if (configError && !config) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
        <AlertCircle className="w-10 h-10 text-error mb-3" />
        <p className="text-sm text-text-primary mb-1">加载配置失败</p>
        <p className="text-xs text-text-tertiary mb-4">{configError}</p>
        <Button size="sm" variant="outline" onClick={() => void loadConfig()}>
          <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* ---- 顶部操作栏 ---- */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-border-light">
        <div>
          {configError && (
            <p className="text-xs text-error flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {configError}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!dirty || isSavingConfig}
          >
            重置
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || isSavingConfig}>
            {isSavingConfig ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                保存中...
              </>
            ) : (
              "保存设置"
            )}
          </Button>
        </div>
      </div>

      {/* ---- 虚拟角色 ---- */}
      <section>
        <SectionHeader icon={<Bot className="w-4 h-4" />} title="虚拟角色" />

        <FieldRow label="开启桌面虚拟角色" description="启用后将在桌面版显示虚拟角色浮动图标">
          <label className="flex items-center gap-2 cursor-pointer justify-end">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => handleToggle(e.target.checked)}
              className="rounded border-border-light"
            />
          </label>
        </FieldRow>
      </section>
    </div>
  );
}
