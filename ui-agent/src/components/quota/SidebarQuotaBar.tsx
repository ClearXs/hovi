import { useEffect, useState } from "react";

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

type QuotaStatus = {
  enabled: boolean;
  unlimited?: boolean;
  limit?: number | null;
  spent?: number;
  remaining?: number | null;
  spentPercent?: number;
};

type UsageStatus = {
  totalTokens?: number;
  totalCost?: number;
};

export function SidebarQuotaBar() {
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // 不传userId，使用后端默认的"default"用户
        const quotaRes = (await window.__gateway?.invoke("quota.status")) as
          | { success: boolean; data?: QuotaStatus }
          | undefined;
        if (quotaRes?.success && quotaRes.data) {
          setQuota(quotaRes.data);
        }

        const usageRes = (await window.__gateway?.invoke("usage.cost", { days: 1 })) as
          | { success: boolean; data?: { totals?: { totalTokens?: number; totalCost?: number } } }
          | undefined;
        if (usageRes?.success && usageRes.data?.totals) {
          setUsage({
            totalTokens: usageRes.data.totals.totalTokens ?? 0,
            totalCost: usageRes.data.totals.totalCost ?? 0,
          });
        }
      } catch (e) {
        // Ignore error
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return <span className="text-xs text-text-tertiary">...</span>;
  }

  const fmtNumber = (n: number | null | undefined, decimals = 0): string => {
    if (n == null || n <= 0) return "0";
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const tokenDisplay = fmtNumber(usage?.totalTokens);
  const costDisplay = fmtNumber(usage?.totalCost, 2);

  // 紧凑的一行显示
  return (
    <div className="flex items-center gap-2 text-xs text-text-tertiary">
      <span>{tokenDisplay}</span>
      <span className="text-text-tertiary">|</span>
      <span>{costDisplay}</span>

      {quota?.enabled && !quota?.unlimited && quota?.limit && (
        <>
          <span className="text-text-tertiary">|</span>
          <span>{fmtNumber(quota.limit)}</span>
          <span className="text-text-tertiary">|</span>
          <span>{fmtNumber(quota.remaining)}</span>
        </>
      )}

      {quota?.enabled && quota?.unlimited && (
        <>
          <span className="text-text-tertiary">|</span>
          <span>∞</span>
        </>
      )}
    </div>
  );
}
