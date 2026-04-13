import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { GatewayRequestHandlerOptions } from "./types.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cli-software-test-"));
}

function respond() {
  return vi.fn<(ok: boolean, result: unknown, error?: { code: string; message: string }) => void>();
}

function createOptions(overrides: Record<string, unknown> = {}): GatewayRequestHandlerOptions {
  return {
    req: { type: "req" as const, id: "1", method: "test", params: {} },
    params: {},
    client: null,
    isWebchatConnect: () => false,
    respond: respond(),
    context: {
      logGateway: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      },
    },
    ...overrides,
  } as unknown as GatewayRequestHandlerOptions;
}

function assertRespondOk(mock: ReturnType<typeof respond>, expectedResult: unknown) {
  expect(mock).toHaveBeenCalledTimes(1);
  const [ok, result, error] = mock.mock.calls[0];
  expect(ok).toBe(true);
  expect(result).toEqual(expectedResult);
  expect(error).toBeUndefined();
}

function assertRespondError(mock: ReturnType<typeof respond>, code: string, message: string) {
  expect(mock).toHaveBeenCalledTimes(1);
  const [ok, result, error] = mock.mock.calls[0];
  expect(ok).toBe(false);
  expect(result).toBeUndefined();
  expect(error).toEqual({ code, message });
}

describe("cli-software handlers", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    process.env.OPENCLAW_CLI_SOFTWARE_ROOT = tempDir;
  });

  afterEach(() => {
    delete process.env.OPENCLAW_CLI_SOFTWARE_ROOT;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("cli.software.list", () => {
    it("returns empty list when root dir does not exist", async () => {
      fs.rmSync(tempDir, { recursive: true, force: true });

      const { cliSoftwareList } = await import("./cli-software");
      const opts = createOptions({ params: {} });
      cliSoftwareList(opts);

      assertRespondOk(opts.respond, { items: [] });
    });

    it("returns one manifest card", async () => {
      const card = {
        id: "card-1",
        name: "TestTool",
        softwareKey: "test-tool",
        engine: "cli-anything",
        targetType: "url",
        source: "https://example.com",
        targetLocator: "//button",
        targetSummary: "A test button",
        generatedRelativePath: "test-tool/index.js",
      };
      fs.mkdirSync(path.join(tempDir, "test-tool"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "test-tool", "MANIFEST.json"), JSON.stringify(card));

      const { cliSoftwareList } = await import("./cli-software");
      const opts = createOptions({ params: {} });
      cliSoftwareList(opts);

      assertRespondOk(opts.respond, { items: [card] });
    });
  });

  describe("cli.software.binding.list", () => {
    it("returns empty list when bindings dir does not exist", async () => {
      fs.rmSync(tempDir, { recursive: true, force: true });

      const { cliSoftwareBindingList } = await import("./cli-software");
      const opts = createOptions({ params: {} });
      cliSoftwareBindingList(opts);

      assertRespondOk(opts.respond, { items: [] });
    });

    it("returns one binding", async () => {
      const binding = { softwareKey: "my-tool" };
      fs.mkdirSync(path.join(tempDir, "bindings"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "bindings", "session-abc.json"), JSON.stringify(binding));

      const { cliSoftwareBindingList } = await import("./cli-software");
      const opts = createOptions({ params: {} });
      cliSoftwareBindingList(opts);

      assertRespondOk(opts.respond, {
        items: [{ sessionKey: "session-abc", binding }],
      });
    });
  });

  describe("cli.software.binding.set", () => {
    it("writes binding file", async () => {
      const { cliSoftwareBindingSet } = await import("./cli-software");
      const opts = createOptions({
        params: { sessionKey: "session-xyz", softwareKey: "tool-a" },
      });
      cliSoftwareBindingSet(opts);

      const file = path.join(tempDir, "bindings", "session-xyz.json");
      expect(fs.existsSync(file)).toBe(true);
      expect(JSON.parse(fs.readFileSync(file, "utf-8"))).toEqual({
        softwareKey: "tool-a",
      });
      assertRespondOk(opts.respond, { ok: true });
    });

    it("requires sessionKey", async () => {
      const { cliSoftwareBindingSet } = await import("./cli-software");
      const opts = createOptions({ params: { softwareKey: "tool-a" } });
      cliSoftwareBindingSet(opts);

      assertRespondError(opts.respond, "INVALID_PARAMS", "sessionKey is required");
    });
  });

  describe("cli.software.binding.clear", () => {
    it("deletes binding file", async () => {
      const file = path.join(tempDir, "bindings", "session-del.json");
      fs.mkdirSync(path.join(tempDir, "bindings"), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ softwareKey: "tool-b" }));
      expect(fs.existsSync(file)).toBe(true);

      const { cliSoftwareBindingClear } = await import("./cli-software");
      const opts = createOptions({ params: { sessionKey: "session-del" } });
      cliSoftwareBindingClear(opts);

      expect(fs.existsSync(file)).toBe(false);
      assertRespondOk(opts.respond, { ok: true });
    });

    it("is idempotent when file is missing", async () => {
      const { cliSoftwareBindingClear } = await import("./cli-software");
      const opts = createOptions({ params: { sessionKey: "session-nonexistent" } });
      cliSoftwareBindingClear(opts);

      assertRespondOk(opts.respond, { ok: true });
    });

    it("requires sessionKey", async () => {
      const { cliSoftwareBindingClear } = await import("./cli-software");
      const opts = createOptions({ params: {} });
      cliSoftwareBindingClear(opts);

      assertRespondError(opts.respond, "INVALID_PARAMS", "sessionKey is required");
    });
  });

  describe("cli.software.generate", () => {
    it("cli-anything engine returns prompt with CLI-Anything and source", async () => {
      const { cliSoftwareGenerate } = await import("./cli-software");
      const opts = createOptions({
        params: {
          engine: "cli-anything",
          source: "https://example.com",
          targetLocator: "//button",
          targetSummary: "A button",
          targetType: "url",
          name: "MyTool",
        },
      });
      cliSoftwareGenerate(opts);

      expect(opts.respond).toHaveBeenCalledTimes(1);
      const [ok, result] = opts.respond.mock.calls[0]!;
      expect(ok).toBe(true);
      const r = result as Record<string, unknown>;
      expect(r.status).toBe("started");
      expect(typeof r.initialPrompt).toBe("string");
      expect(r.initialPrompt as string).toContain("CLI-Anything");
      expect(r.initialPrompt as string).toContain("https://example.com");
      expect(r.sessionKey).toBeDefined();
      expect(r.runId).toBeDefined();
      expect(r.softwareKey).toBeDefined();
    });

    it("opencli engine returns prompt with opencli and URL", async () => {
      const { cliSoftwareGenerate } = await import("./cli-software");
      const opts = createOptions({
        params: {
          engine: "opencli",
          source: "https://example.com/page",
          targetLocator: "//input[@id='search']",
          targetSummary: "A search input",
          targetType: "url",
          name: "MyOpenCliTool",
        },
      });
      cliSoftwareGenerate(opts);

      expect(opts.respond).toHaveBeenCalledTimes(1);
      const [ok, result] = opts.respond.mock.calls[0]!;
      expect(ok).toBe(true);
      const r = result as Record<string, unknown>;
      expect(r.status).toBe("started");
      expect(typeof r.initialPrompt).toBe("string");
      expect((r.initialPrompt as string).toLowerCase()).toContain("opencli");
      expect(r.initialPrompt as string).toContain("https://example.com/page");
      expect(r.initialPrompt as string).toContain("//input[@id='search']");
    });

    it("uses caller-provided sessionKey and runId", async () => {
      const { cliSoftwareGenerate } = await import("./cli-software");
      const opts = createOptions({
        params: {
          engine: "cli-anything",
          source: "https://example.com",
          targetLocator: "//button",
          targetSummary: "A button",
          targetType: "url",
          name: "MyTool",
          sessionKey: "my-session",
          runId: "my-run",
        },
      });
      cliSoftwareGenerate(opts);

      expect(opts.respond).toHaveBeenCalledTimes(1);
      const [ok, result] = opts.respond.mock.calls[0]!;
      expect(ok).toBe(true);
      const r = result as Record<string, unknown>;
      expect(r.sessionKey).toBe("my-session");
      expect(r.runId).toBe("my-run");
      expect(r.status).toBe("started");
    });

    it("unknown engine returns error", async () => {
      const { cliSoftwareGenerate } = await import("./cli-software");
      const opts = createOptions({
        params: {
          engine: "unknown-engine",
          source: "https://example.com",
        },
      });
      cliSoftwareGenerate(opts);

      assertRespondError(opts.respond, "INVALID_PARAMS", "Unsupported engine: unknown-engine");
    });
  });
});
