import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithSsrFGuardMock = vi.fn();
const extractArchiveMock = vi.fn();
const scanDirectoryWithSummaryMock = vi.fn();

vi.mock("../infra/net/fetch-guard.js", () => ({
  fetchWithSsrFGuard: (...args: unknown[]) => fetchWithSsrFGuardMock(...args),
}));

vi.mock("../infra/archive.js", () => ({
  extractArchive: (...args: unknown[]) => extractArchiveMock(...args),
}));

vi.mock("../security/skill-scanner.js", () => ({
  scanDirectoryWithSummary: (...args: unknown[]) => scanDirectoryWithSummaryMock(...args),
}));

const { installClawHubSkill } = await import("./skills-install-clawhub.js");

function rateLimitedResponse(): Response {
  return new Response("Rate limit exceeded", {
    status: 429,
    headers: {
      "retry-after": "0",
      "x-ratelimit-reset": String(Math.floor(Date.now() / 1000)),
    },
  });
}

describe("skills-install-clawhub", () => {
  let managedSkillsDir: string;

  beforeEach(async () => {
    fetchWithSsrFGuardMock.mockReset();
    extractArchiveMock.mockReset();
    scanDirectoryWithSummaryMock.mockReset();
    scanDirectoryWithSummaryMock.mockResolvedValue({ critical: 0, warn: 0 });
    managedSkillsDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-clawhub-install-"));
  });

  afterEach(async () => {
    await fs.rm(managedSkillsDir, { recursive: true, force: true });
  });

  it("retries resolve calls when ClawHub skill detail endpoint is rate limited", async () => {
    fetchWithSsrFGuardMock.mockImplementation(async () => ({
      response: rateLimitedResponse(),
      release: async () => undefined,
    }));

    const result = await installClawHubSkill({
      slug: "ontology",
      managedSkillsDir,
      timeoutMs: 10_000,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("ClawHub rate limited resolve for ontology");

    const resolveCalls = fetchWithSsrFGuardMock.mock.calls.filter((call) => {
      const arg = call[0] as { url?: string };
      return typeof arg?.url === "string" && arg.url.includes("/api/v1/skills/ontology");
    });
    expect(resolveCalls.length).toBeGreaterThan(1);
  });

  it("skips resolve endpoint when caller already provides a version", async () => {
    fetchWithSsrFGuardMock.mockImplementation(async (params: { url: string }) => {
      if (params.url.includes("/api/v1/download")) {
        return { response: rateLimitedResponse(), release: async () => undefined };
      }
      return {
        response: new Response(JSON.stringify({ latestVersion: { version: "1.0.4" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
        release: async () => undefined,
      };
    });

    const result = await installClawHubSkill({
      slug: "ontology",
      version: "1.0.4",
      managedSkillsDir,
      timeoutMs: 10_000,
    });

    expect(result.ok).toBe(false);
    const resolveCalls = fetchWithSsrFGuardMock.mock.calls.filter((call) => {
      const arg = call[0] as { url?: string };
      return typeof arg?.url === "string" && arg.url.includes("/api/v1/skills/ontology");
    });
    expect(resolveCalls).toHaveLength(0);
  });

  it("retries download calls beyond legacy retry cap when rate limited", async () => {
    fetchWithSsrFGuardMock.mockImplementation(async (params: { url: string }) => {
      if (params.url.includes("/api/v1/download")) {
        return { response: rateLimitedResponse(), release: async () => undefined };
      }
      return {
        response: new Response(JSON.stringify({ latestVersion: { version: "1.0.4" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
        release: async () => undefined,
      };
    });

    const result = await installClawHubSkill({
      slug: "ontology",
      version: "1.0.4",
      managedSkillsDir,
      timeoutMs: 10_000,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("ClawHub rate limited download for ontology");

    const downloadCalls = fetchWithSsrFGuardMock.mock.calls.filter((call) => {
      const arg = call[0] as { url?: string };
      return typeof arg?.url === "string" && arg.url.includes("/api/v1/download");
    });
    // Historical behavior stopped after 6 attempts (maxRetries=5).
    expect(downloadCalls.length).toBeGreaterThan(6);
  });
});
