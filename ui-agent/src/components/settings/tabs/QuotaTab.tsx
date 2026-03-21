"use client";

import { Save, RefreshCcw, Loader2, AlertCircle, Calculator } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettingsStore, type OpenClawConfigPartial } from "@/stores/settingsStore";
import { useToastStore } from "@/stores/toastStore";

// Gateway invoke 类型声明
declare global {
  interface Window {
    __gateway?: {
      invoke: (
        method: string,
        params?: Record<string, unknown>,
      ) => Promise<{
        success: boolean;
        data?: unknown;
        error?: unknown;
      }>;
    };
  }
}

type QuotaConfig = {
  enabled: boolean;
  limit: number;
  spent: number;
};

type UsageData = {
  totalTokens: number;
  totalCost: number;
};

export function QuotaTab({ onClose }: { onClose?: () => void }) {
  const { config, isLoadingConfig, isSavingConfig, loadConfig, patchConfig } = useSettingsStore();
  const { addToast } = useToastStore();

  const [enabled, setEnabled] = useState(false);
  const [limit, setLimit] = useState("");
  const [spent, setSpent] = useState("");
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [dirty, setDirty] = useState(false);

  // 从配置加载数据
  useEffect(() => {
    if (config) {
      const quotaConfig = config.quota;
      setEnabled(quotaConfig?.enabled ?? false);
      setLimit(quotaConfig?.users?.["default"]?.limit?.toString() ?? "");
      setSpent(quotaConfig?.users?.["default"]?.spent?.toString() ?? "0");
      setDirty(false);
    }
  }, [config]);

  // 加载使用量数据
  useEffect(() => {
    async function fetchUsage() {
      setLoadingUsage(true);
      try {
        const res = (await window.__gateway?.invoke("usage.cost", { days: 1 })) as
          | {
              success: boolean;
              data?: { totals?: { totalTokens?: number; totalCost?: number } };
            }
          | undefined;
        if (res?.success && res.data?.totals) {
          setUsage({
            totalTokens: res.data.totals.totalTokens ?? 0,
            totalCost: res.data.totals.totalCost ?? 0,
          });
        }
      } catch (e) {
        // Ignore error
      } finally {
        setLoadingUsage(false);
      }
    }
    fetchUsage();
  }, []);

  const handleLimitChange = (value: string) => {
    setLimit(value);
    setDirty(true);
  };

  const handleSpentChange = (value: string) => {
    setSpent(value);
    setDirty(true);
  };

  const handleEnabledChange = (value: boolean) => {
    setEnabled(value);
    setDirty(true);
  };

  const handleReset = () => {
    if (config) {
      const quotaConfig = config.quota;
      setEnabled(quotaConfig?.enabled ?? false);
      setLimit(quotaConfig?.users?.["default"]?.limit?.toString() ?? "");
      setSpent(quotaConfig?.users?.["default"]?.spent?.toString() ?? "0");
      setDirty(false);
    }
  };

  const handleSave = async () => {
    const limitNum = parseFloat(limit) || 0;
    const spentNum = parseFloat(spent) || 0;

    // 如果没有设置限额，不保存quota用户
    const patch: Partial<OpenClawConfigPartial> = {
      quota: {
        enabled,
        ...(limitNum > 0
          ? {
              users: {
                default: {
                  limit: limitNum,
                  spent: spentNum,
                },
              },
            }
          : {}),
      },
    };

    const result = await patchConfig(patch);
    if (result.ok) {
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
          title: "配额设置已保存",
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

  // 格式化数字显示
  const fmtNumber = (n: number | undefined | null, decimals = 0): string => {
    if (n == null || isNaN(n)) return "0";
    return n.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  // 计算已用百分比
  const limitNum = parseFloat(limit) || 0;
  const spentNum = parseFloat(spent) || 0;
  const percent = limitNum > 0 ? Math.min(100, (spentNum / limitNum) * 100) : 0;

  if (isLoadingConfig) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
        <Loader2 className="w-8 h-8 text-text-tertiary animate-spin mb-3" />
        <p className="text-sm text-text-tertiary">加载配额设置...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 启用开关 + 操作按钮 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="quota-enabled"
            checked={enabled}
            onChange={(e) => handleEnabledChange(e.target.checked)}
            className="w-4 h-4"
          />
          <label htmlFor="quota-enabled" className="text-sm font-medium">
            启用配额限制
          </label>
          {dirty && <span className="text-xs text-primary">有变更</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!dirty || isSavingConfig}
          >
            <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
            重置
          </Button>

          <Button size="sm" onClick={handleSave} disabled={!dirty || isSavingConfig}>
            {isSavingConfig ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 mr-1.5" />
                保存
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 当前使用量 */}
      <div className="p-4 bg-background-secondary rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">今日使用量</span>
          {loadingUsage && <Loader2 className="w-4 h-4 animate-spin text-text-tertiary" />}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-text-tertiary mb-1">Token 数量</div>
            <div className="text-lg font-semibold">{fmtNumber(usage?.totalTokens)}</div>
          </div>
          <div>
            <div className="text-xs text-text-tertiary mb-1">预估费用</div>
            <div className="text-lg font-semibold">{fmtNumber(usage?.totalCost, 2)}</div>
          </div>
        </div>
      </div>

      {/* 计算说明 */}
      <div className="p-4 bg-background-secondary rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <Calculator className="w-4 h-4 text-text-tertiary" />
          <span className="text-sm font-medium">如何计算额度</span>
        </div>
        <div className="text-xs text-text-secondary space-y-2">
          <p>费用 = (输入Token ÷ 1,000,000) × 输入单价 + (输出Token ÷ 1,000,000) × 输出单价</p>
          <p className="text-text-tertiary">
            例如: 使用 Claude-3.5-Sonnet，输入10万Token，输出5万Token
          </p>
          <p className="text-text-tertiary">
            费用 = (100,000 ÷ 1,000,000) × $3 + (50,000 ÷ 1,000,000) × $15 = $0.3 + $0.75 = $1.05
          </p>
          <p className="text-text-tertiary">按汇率7.2计算，约等于 7.56</p>
        </div>
      </div>

      {/* 额度设置 */}
      <div className="p-4 bg-background-secondary rounded-lg space-y-4">
        <span className="text-sm font-medium">额度设置</span>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-text-tertiary mb-1">额度</label>
            <Input
              type="number"
              value={limit}
              onChange={(e) => handleLimitChange(e.target.value)}
              placeholder="0"
              className="h-9"
            />
          </div>
          <div>
            <label className="block text-xs text-text-tertiary mb-1">已消耗</label>
            <Input
              type="number"
              value={spent}
              onChange={(e) => handleSpentChange(e.target.value)}
              placeholder="0"
              className="h-9"
            />
          </div>
        </div>

        {/* 进度条 */}
        {enabled && limitNum > 0 && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-text-tertiary mb-1">
              <span>已使用 {percent.toFixed(1)}%</span>
              <span>
                {fmtNumber(spentNum, 2)} / {fmtNumber(limitNum)}
              </span>
            </div>
            <div className="h-2 bg-background rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  percent >= 90 ? "bg-error" : percent >= 70 ? "bg-warning" : "bg-primary"
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
