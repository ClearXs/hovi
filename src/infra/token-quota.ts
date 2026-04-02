// Token Quota Module
// 提供配额检查、费用计算等功能

import { loadConfig, writeConfigFile } from "../config/config.js";
import type { OpenClawConfig } from "../config/config.js";

// 默认汇率 (USD -> CNY)
export const USD_TO_CNY = 7.2;

export type QuotaUser = {
  limit: number;
  spent: number;
};

export type QuotaConfig = {
  enabled?: boolean;
  users?: Record<string, QuotaUser>;
};

export type ModelPricing = Record<string, { input?: number; output?: number }>;

export interface QuotaResult {
  success: boolean;
  remaining: number;
  error?: string;
}

/**
 * 获取用户配额
 * 如果未配置配额，或 limit <= 0，返回 undefined 表示无限额
 */
export function getUserQuota(userId: string, config: OpenClawConfig): QuotaUser | undefined {
  const quota = config.quota;
  if (!quota?.enabled) {
    return undefined;
  }
  const userQuota = quota.users?.[userId];
  // limit <= 0 视为无限额
  if (!userQuota || (userQuota.limit ?? 0) <= 0) {
    return undefined;
  }
  return userQuota as QuotaUser;
}

/**
 * 检查配额是否足够
 * 无配额配置或无限额时返回 true
 */
export function checkQuota(userId: string, amount: number, config: OpenClawConfig): boolean {
  const quota = getUserQuota(userId, config);
  if (!quota) {
    return true;
  } // No quota or unlimited, allow all
  const remaining = quota.limit - (quota.spent ?? 0);
  return amount <= remaining;
}

/**
 * 获取剩余配额
 * 无限额时返回 null
 */
export function getRemainingQuota(userId: string, config: OpenClawConfig): number | null {
  const quota = getUserQuota(userId, config);
  if (!quota) {
    return null;
  } // unlimited
  return quota.limit - (quota.spent ?? 0);
}

/**
 * 计算费用 (基于 token 数量和模型定价)
 * @param inputTokens 输入 token 数
 * @param outputTokens 输出 token 数
 * @param model 模型名称
 * @param config 配置
 * @returns 费用 (CNY)
 */
export function calculateCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
  config: OpenClawConfig,
): number {
  const pricing = config.modelPricing?.[model];
  const defaultPrice = 0.5;
  const inputPrice = pricing?.input ?? defaultPrice;
  const outputPrice = pricing?.output ?? defaultPrice;

  const inputCostUSD = (inputTokens * inputPrice) / 1_000_000;
  const outputCostUSD = (outputTokens * outputPrice) / 1_000_000;

  return (inputCostUSD + outputCostUSD) * USD_TO_CNY;
}

/**
 * 消费配额 (异步扣减)
 * 异步更新配置文件中的 spent 值
 */
export async function consumeQuota(userId: string, cost: number): Promise<QuotaResult> {
  const config = loadConfig();
  const quota = getUserQuota(userId, config);

  if (!quota) {
    return { success: true, remaining: -1 }; // unlimited
  }

  const newSpent = (quota.spent ?? 0) + cost;
  const remaining = quota.limit - newSpent;

  // 异步更新配置文件
  queueMicrotask(async () => {
    try {
      if (!config.quota?.users?.[userId]) {
        return;
      }
      config.quota.users[userId].spent = newSpent;
      await writeConfigFile(config);
    } catch (e) {
      console.error("Failed to update quota:", e);
    }
  });

  return { success: true, remaining };
}
