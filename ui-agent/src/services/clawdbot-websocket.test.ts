import { resolveRpcRequestTimeoutMs } from "./clawdbot-websocket";

describe("resolveRpcRequestTimeoutMs", () => {
  it("uses long-running timeout for skills.install", () => {
    expect(resolveRpcRequestTimeoutMs("skills.install", undefined)).toBe(180000);
  });

  it("uses long-running timeout for skills.delete", () => {
    expect(resolveRpcRequestTimeoutMs("skills.delete", undefined)).toBe(180000);
  });

  it("honors timeoutMs params when larger than method default", () => {
    expect(resolveRpcRequestTimeoutMs("skills.install", { timeoutMs: 240000 })).toBe(245000);
  });

  it("keeps default timeout for normal methods", () => {
    expect(resolveRpcRequestTimeoutMs("skills.status", undefined)).toBe(30000);
  });
});
