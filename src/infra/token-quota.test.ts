import { describe, it, expect } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { getUserQuota, checkQuota, calculateCost, USD_TO_CNY } from "./token-quota.js";

describe("token-quota", () => {
  const testConfig = {
    quota: { enabled: true, users: { testuser: { limit: 100, spent: 50 } } },
    modelPricing: { "claude-3-5-sonnet": { input: 3, output: 15 } },
  } as OpenClawConfig;

  describe("getUserQuota", () => {
    it("应返回用户配额", () => {
      expect(getUserQuota("testuser", testConfig)).toEqual({ limit: 100, spent: 50 });
    });

    it("功能关闭应返回 undefined", () => {
      const config = { quota: { enabled: false } } as OpenClawConfig;
      expect(getUserQuota("testuser", config)).toBeUndefined();
    });

    it("无限额(limit<=0)应返回 undefined", () => {
      const config = {
        quota: { enabled: true, users: { alice: { limit: 0, spent: 100 } } },
      } as OpenClawConfig;
      expect(getUserQuota("alice", config)).toBeUndefined();
    });

    it("用户不存在应返回 undefined", () => {
      expect(getUserQuota("nonexistent", testConfig)).toBeUndefined();
    });
  });

  describe("checkQuota", () => {
    it("配额足够应返回 true", () => {
      expect(checkQuota("testuser", 30, testConfig)).toBe(true);
    });

    it("配额不足应返回 false", () => {
      expect(checkQuota("testuser", 60, testConfig)).toBe(false);
    });

    it("无限额应返回 true", () => {
      expect(checkQuota("newuser", 1000, testConfig)).toBe(true);
    });
  });

  describe("calculateCost", () => {
    it("应正确计算费用", () => {
      // 100000 * 3 / 1000000 + 50000 * 15 / 1000000 = 1.05 USD = 7.56 CNY
      const cost = calculateCost(100000, 50000, "claude-3-5-sonnet", testConfig);
      expect(cost).toBeCloseTo(7.56, 1);
    });

    it("未配置模型应使用默认定价", () => {
      const cost = calculateCost(100000, 50000, "unknown-model", testConfig);
      expect(cost).toBeGreaterThan(0);
    });

    it("零 tokens 应返回 0", () => {
      const cost = calculateCost(0, 0, "claude-3-5-sonnet", testConfig);
      expect(cost).toBe(0);
    });
  });

  describe("USD_TO_CNY", () => {
    it("汇率应为 7.2", () => {
      expect(USD_TO_CNY).toBe(7.2);
    });
  });
});
