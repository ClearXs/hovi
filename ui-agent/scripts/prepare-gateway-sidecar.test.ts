import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertSupportedSidecarNodeVersion,
  deployPortableOpenClawRuntime,
  isDirectScriptExecution,
  runPrepareGatewaySidecarCli,
  prepareGatewaySidecar,
  resolveBundledNodeRelativePath,
  resolveBundledOpenClawEntryRelativePath,
  resolvePnpmExecutable,
  resolveSidecarTargetPlatform,
  resolveTargetNodeDownloadUrl,
  resolveBundledUiAgentRootRelativePath,
  resolveRuntimeResourceDir,
} from "./prepare-gateway-sidecar.shared";

function withNodeEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...overrides };
}

function lastItem<T>(values: readonly T[] | null | undefined): T | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }
  return values[values.length - 1];
}

describe("prepare-gateway-sidecar", () => {
  it("computes the expected runtime resource directory", () => {
    expect(resolveRuntimeResourceDir("/repo/ui-agent")).toBe(
      path.join("/repo/ui-agent", "src-tauri", "resources", "runtime"),
    );
  });

  it("recognizes direct script execution when argv uses a relative path", () => {
    expect(
      isDirectScriptExecution(
        "file:///Users/test/repo/ui-agent/scripts/prepare-gateway-sidecar.ts",
        "scripts/prepare-gateway-sidecar.ts",
        "/Users/test/repo/ui-agent",
      ),
    ).toBe(true);
  });

  it("computes the expected bundled node path", () => {
    expect(resolveBundledNodeRelativePath("darwin")).toBe(path.join("node", "node"));
    expect(resolveBundledNodeRelativePath("win32")).toBe("node.exe");
  });

  it("computes the expected bundled openclaw entry path", () => {
    expect(resolveBundledOpenClawEntryRelativePath()).toBe(path.join("openclaw", "openclaw.mjs"));
  });

  it("resolves the sidecar target platform from packaging env", () => {
    expect(resolveSidecarTargetPlatform("darwin", withNodeEnv())).toBe("darwin");
    expect(
      resolveSidecarTargetPlatform(
        "darwin",
        withNodeEnv({ OPENCLAW_UI_AGENT_DESKTOP_TARGET: "win32" }),
      ),
    ).toBe("win32");
    expect(
      resolveSidecarTargetPlatform(
        "darwin",
        withNodeEnv({ OPENCLAW_UI_AGENT_DESKTOP_TARGET: "linux" }),
      ),
    ).toBe("linux");
  });

  it("computes the expected node download URL for cross-platform sidecars", () => {
    expect(resolveTargetNodeDownloadUrl("22.22.0", "win32")).toBe(
      "https://nodejs.org/dist/v22.22.0/win-x64/node.exe",
    );
    expect(resolveTargetNodeDownloadUrl("22.22.0", "linux")).toBe(
      "https://nodejs.org/dist/v22.22.0/node-v22.22.0-linux-x64.tar.xz",
    );
    expect(resolveTargetNodeDownloadUrl("22.22.0", "darwin")).toBeNull();
  });

  it("computes the expected bundled ui-agent root path", () => {
    expect(resolveBundledUiAgentRootRelativePath()).toBe("ui-agent");
  });

  it("resolves the correct pnpm executable for the host platform", () => {
    expect(resolvePnpmExecutable("darwin")).toBe("pnpm");
    expect(resolvePnpmExecutable("linux")).toBe("pnpm");
    expect(resolvePnpmExecutable("win32")).toBe("pnpm.cmd");
  });

  it("runs pnpm deploy in offline mode for desktop sidecar packaging", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");
    let deployArgs: readonly string[] | null = null;

    try {
      await expect(
        deployPortableOpenClawRuntime({
          repoRoot: "/repo",
          openclawRuntimeDir: runtimeDir,
          execFileImpl: async (_file, args) => {
            deployArgs = args;
            throw new Error("stop-after-arg-capture");
          },
        }),
      ).rejects.toThrow("stop-after-arg-capture");

      expect(deployArgs).not.toBeNull();
      expect(deployArgs).toContain("--offline");
      expect(deployArgs).toContain("--prod");
      expect(deployArgs).toContain("--config.virtual-store-dir-max-length=40");
      expect(lastItem(deployArgs)).toMatch(/^\/.+openclaw-sidecar-deploy-/);
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("stages the sidecar runtime from installed node_modules before falling back to pnpm deploy", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");
    let execCalled = false;

    try {
      await fsPromises.mkdir(path.join(tempRoot, "dist"), { recursive: true });
      await fsPromises.mkdir(path.join(tempRoot, "node_modules", "foo"), { recursive: true });
      await fsPromises.mkdir(path.join(tempRoot, "node_modules", "bar"), { recursive: true });
      await fsPromises.mkdir(path.join(tempRoot, "node_modules", "baz"), { recursive: true });
      await fsPromises.mkdir(path.join(tempRoot, "node_modules", "foo", "node_modules", "qux"), {
        recursive: true,
      });

      await fsPromises.writeFile(
        path.join(tempRoot, "package.json"),
        JSON.stringify({
          name: "tmp-root",
          version: "1.0.0",
          dependencies: {
            foo: "1.0.0",
          },
        }),
        "utf8",
      );
      await fsPromises.writeFile(
        path.join(tempRoot, "dist", "gateway-sidecar-entry.js"),
        'import "foo";\n',
        "utf8",
      );
      await fsPromises.writeFile(
        path.join(tempRoot, "node_modules", "foo", "package.json"),
        JSON.stringify({
          name: "foo",
          version: "1.0.0",
          main: "index.js",
          dependencies: {
            bar: "1.0.0",
          },
        }),
        "utf8",
      );
      await fsPromises.writeFile(
        path.join(tempRoot, "node_modules", "foo", "index.js"),
        'import "bar";\nexport const foo = "foo";\n',
        "utf8",
      );
      await fsPromises.writeFile(
        path.join(tempRoot, "node_modules", "foo", "node_modules", "qux", "package.json"),
        JSON.stringify({
          name: "qux",
          version: "1.0.0",
          main: "index.js",
        }),
        "utf8",
      );
      await fsPromises.writeFile(
        path.join(tempRoot, "node_modules", "foo", "node_modules", "qux", "index.js"),
        'export const qux = "qux";\n',
        "utf8",
      );
      await fsPromises.writeFile(
        path.join(tempRoot, "node_modules", "bar", "package.json"),
        JSON.stringify({
          name: "bar",
          version: "1.0.0",
          main: "index.js",
        }),
        "utf8",
      );
      await fsPromises.writeFile(
        path.join(tempRoot, "node_modules", "bar", "index.js"),
        'export const bar = "bar";\n',
        "utf8",
      );
      await fsPromises.writeFile(
        path.join(tempRoot, "node_modules", "baz", "package.json"),
        JSON.stringify({
          name: "baz",
          version: "1.0.0",
          main: "index.js",
        }),
        "utf8",
      );
      await fsPromises.writeFile(
        path.join(tempRoot, "node_modules", "baz", "index.js"),
        'export const baz = "baz";\n',
        "utf8",
      );

      await deployPortableOpenClawRuntime({
        repoRoot: tempRoot,
        openclawRuntimeDir: runtimeDir,
        execFileImpl: async (_file, args) => {
          execCalled = true;
          const deployDir = lastItem(args);
          if (!deployDir) {
            throw new Error("missing deploy dir");
          }
          await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
            'import "foo";\n',
            "utf8",
          );
        },
      });

      expect(execCalled).toBe(false);
      await expect(
        fsPromises.readFile(path.join(runtimeDir, "dist", "gateway-sidecar-entry.js"), "utf8"),
      ).resolves.toContain('import "foo";');
      await expect(
        fsPromises.readFile(path.join(runtimeDir, "node_modules", "foo", "package.json"), "utf8"),
      ).resolves.toContain('"name":"foo"');
      await expect(
        fsPromises.readFile(
          path.join(runtimeDir, "node_modules", "foo", "node_modules", "bar", "package.json"),
          "utf8",
        ),
      ).resolves.toContain('"name":"bar"');
      await expect(
        fsPromises.stat(path.join(runtimeDir, "node_modules", "baz")),
      ).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(
        fsPromises.stat(path.join(runtimeDir, "node_modules", "foo", "node_modules", "qux")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("injects libsignal npm override into deploy args while preserving existing overrides", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");
    let deployArgs: readonly string[] | undefined;

    try {
      await fsPromises.writeFile(
        path.join(tempRoot, "package.json"),
        JSON.stringify({
          name: "tmp-root",
          pnpm: {
            overrides: {
              hono: "4.12.7",
            },
          },
        }),
        "utf8",
      );

      await expect(
        deployPortableOpenClawRuntime({
          repoRoot: tempRoot,
          openclawRuntimeDir: runtimeDir,
          execFileImpl: async (_file, args) => {
            deployArgs = args;
            throw new Error("stop-after-env-capture");
          },
        }),
      ).rejects.toThrow("stop-after-env-capture");

      const overridesArg = deployArgs?.find((arg) => arg.startsWith("--config.overrides="));
      expect(typeof overridesArg).toBe("string");
      const overridesRaw = (overridesArg as string).slice("--config.overrides=".length);
      const overrides = JSON.parse(overridesRaw) as Record<string, string>;
      expect(overrides.hono).toBe("4.12.7");
      expect(overrides["@whiskeysockets/baileys>libsignal"]).toBe(
        "https://codeload.github.com/whiskeysockets/libsignal-node/tar.gz/1c30d7d7e76a3b0aa120b04dc6a26f5a12dccf67",
      );
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("includes pnpm stderr in deploy failures", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await expect(
        deployPortableOpenClawRuntime({
          repoRoot: "/repo",
          openclawRuntimeDir: runtimeDir,
          execFileImpl: async () => {
            const error = Object.assign(new Error("Command failed with exit code 1"), {
              stderr: "ssh: connect to host github.com port 22: Operation timed out",
              stdout: "pnpm progress output",
            });
            throw error;
          },
        }),
      ).rejects.toThrow(
        "pnpm deploy --prod --offline failed: ssh: connect to host github.com port 22: Operation timed out",
      );
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("preserves pnpm virtual-store symlink layout for transitive deps", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await deployPortableOpenClawRuntime({
        repoRoot: "/repo",
        openclawRuntimeDir: runtimeDir,
        execFileImpl: async (_file, args) => {
          const deployDir = lastItem(args);
          if (!deployDir) {
            throw new Error("missing deploy dir");
          }

          const promptsStoreDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "@clack+prompts@1.1.0",
            "node_modules",
            "@clack",
            "prompts",
          );
          const promptsScopeDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "@clack+prompts@1.1.0",
            "node_modules",
            "@clack",
          );
          const coreStoreDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "@clack+core@1.1.0",
            "node_modules",
            "@clack",
            "core",
          );
          const rootClackDir = path.join(deployDir, "node_modules", "@clack");
          const rootPromptsLink = path.join(rootClackDir, "prompts");
          const promptsCoreLink = path.join(promptsScopeDir, "core");
          const linkType = process.platform === "win32" ? "junction" : "dir";

          await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
          await fsPromises.writeFile(path.join(deployDir, "openclaw.mjs"), "export {};\n", "utf8");
          await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
            "export {};\n",
            "utf8",
          );
          await fsPromises.mkdir(promptsStoreDir, { recursive: true });
          await fsPromises.mkdir(coreStoreDir, { recursive: true });
          await fsPromises.mkdir(rootClackDir, { recursive: true });
          await fsPromises.writeFile(
            path.join(promptsStoreDir, "package.json"),
            '{"name":"@clack/prompts"}\n',
            "utf8",
          );
          await fsPromises.writeFile(
            path.join(coreStoreDir, "package.json"),
            '{"name":"@clack/core"}\n',
            "utf8",
          );
          await fsPromises.symlink(
            path.relative(rootClackDir, promptsStoreDir),
            rootPromptsLink,
            linkType,
          );
          await fsPromises.symlink(
            path.relative(promptsScopeDir, coreStoreDir),
            promptsCoreLink,
            linkType,
          );

          return { stdout: "", stderr: "" };
        },
      });

      const promptsStat = await fsPromises.lstat(
        path.join(runtimeDir, "node_modules", "@clack", "prompts"),
      );
      expect(promptsStat.isSymbolicLink()).toBe(true);
      expect(
        fs.existsSync(
          path.join(
            runtimeDir,
            "node_modules",
            ".pnpm",
            "@clack+core@1.1.0",
            "node_modules",
            "@clack",
            "core",
            "package.json",
          ),
        ),
      ).toBe(true);
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("removes dangling virtual-store symlinks after pruning optional heavy deps", async () => {
    if (process.platform === "win32") {
      // Windows symlink/junction behavior differs across CI environments.
      return;
    }

    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await deployPortableOpenClawRuntime({
        repoRoot: "/repo",
        openclawRuntimeDir: runtimeDir,
        execFileImpl: async (_file, args) => {
          const deployDir = lastItem(args);
          if (!deployDir) {
            throw new Error("missing deploy dir");
          }

          const baileysNodeModulesDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "@whiskeysockets+baileys@7.0.0-rc.9",
            "node_modules",
          );
          const sharpStoreDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "sharp@0.34.5",
            "node_modules",
            "sharp",
          );
          const sharpLinkPath = path.join(baileysNodeModulesDir, "sharp");

          await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
          await fsPromises.writeFile(path.join(deployDir, "openclaw.mjs"), "export {};\n", "utf8");
          await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
            "export {};\n",
            "utf8",
          );
          await fsPromises.mkdir(baileysNodeModulesDir, { recursive: true });
          await fsPromises.mkdir(sharpStoreDir, { recursive: true });
          await fsPromises.symlink(
            path.relative(baileysNodeModulesDir, sharpStoreDir),
            sharpLinkPath,
            "dir",
          );

          return { stdout: "", stderr: "" };
        },
      });

      expect(
        fs.existsSync(
          path.join(
            runtimeDir,
            "node_modules",
            ".pnpm",
            "@whiskeysockets+baileys@7.0.0-rc.9",
            "node_modules",
          ),
        ),
      ).toBe(true);
      await expect(
        fsPromises.lstat(
          path.join(
            runtimeDir,
            "node_modules",
            ".pnpm",
            "@whiskeysockets+baileys@7.0.0-rc.9",
            "node_modules",
            "sharp",
          ),
        ),
      ).rejects.toThrow();
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("removes top-level symlinked optional packages after pruning", async () => {
    if (process.platform === "win32") {
      return;
    }

    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await deployPortableOpenClawRuntime({
        repoRoot: "/repo",
        openclawRuntimeDir: runtimeDir,
        execFileImpl: async (_file, args) => {
          const deployDir = lastItem(args);
          if (!deployDir) {
            throw new Error("missing deploy dir");
          }

          const playwrightStoreDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "playwright-core@1.58.2",
            "node_modules",
            "playwright-core",
          );
          const topLevelNodeModulesDir = path.join(deployDir, "node_modules");
          const topLevelPlaywrightLink = path.join(topLevelNodeModulesDir, "playwright-core");

          await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
          await fsPromises.writeFile(path.join(deployDir, "openclaw.mjs"), "export {};\n", "utf8");
          await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
            "export {};\n",
            "utf8",
          );
          await fsPromises.mkdir(playwrightStoreDir, { recursive: true });
          await fsPromises.symlink(
            path.relative(topLevelNodeModulesDir, playwrightStoreDir),
            topLevelPlaywrightLink,
            "dir",
          );

          return { stdout: "", stderr: "" };
        },
      });

      await expect(
        fsPromises.lstat(path.join(runtimeDir, "node_modules", "playwright-core")),
      ).rejects.toThrow();
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("materializes @clack/prompt deps as real top-level packages", async () => {
    if (process.platform === "win32") {
      return;
    }

    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await deployPortableOpenClawRuntime({
        repoRoot: "/repo",
        openclawRuntimeDir: runtimeDir,
        execFileImpl: async (_file, args) => {
          const deployDir = lastItem(args);
          if (!deployDir) {
            throw new Error("missing deploy dir");
          }

          const clackScopeDir = path.join(deployDir, "node_modules", "@clack");
          const promptsStoreDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "@clack+prompts@1.1.0",
            "node_modules",
            "@clack",
            "prompts",
          );
          const coreStoreDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "@clack+core@1.1.0",
            "node_modules",
            "@clack",
            "core",
          );
          const sisteransiStoreDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "sisteransi@1.0.5",
            "node_modules",
            "sisteransi",
          );

          await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
          await fsPromises.writeFile(path.join(deployDir, "openclaw.mjs"), "export {};\n", "utf8");
          await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
            "export {};\n",
            "utf8",
          );
          await fsPromises.mkdir(clackScopeDir, { recursive: true });
          await fsPromises.mkdir(promptsStoreDir, { recursive: true });
          await fsPromises.mkdir(coreStoreDir, { recursive: true });
          await fsPromises.mkdir(sisteransiStoreDir, { recursive: true });
          await fsPromises.writeFile(
            path.join(promptsStoreDir, "package.json"),
            JSON.stringify({
              name: "@clack/prompts",
              dependencies: {
                "@clack/core": "^1.1.0",
                sisteransi: "^1.0.5",
              },
            }),
            "utf8",
          );
          await fsPromises.writeFile(
            path.join(coreStoreDir, "package.json"),
            '{"name":"@clack/core"}\n',
            "utf8",
          );
          await fsPromises.writeFile(
            path.join(sisteransiStoreDir, "package.json"),
            '{"name":"sisteransi"}\n',
            "utf8",
          );
          await fsPromises.symlink(
            path.relative(clackScopeDir, promptsStoreDir),
            path.join(clackScopeDir, "prompts"),
            "dir",
          );

          return { stdout: "", stderr: "" };
        },
      });

      const clackCoreStat = await fsPromises.lstat(
        path.join(runtimeDir, "node_modules", "@clack", "core"),
      );
      expect(clackCoreStat.isSymbolicLink()).toBe(false);
      expect(
        fs.existsSync(path.join(runtimeDir, "node_modules", "@clack", "core", "package.json")),
      ).toBe(true);
      const sisteransiStat = await fsPromises.lstat(
        path.join(runtimeDir, "node_modules", "sisteransi"),
      );
      expect(sisteransiStat.isSymbolicLink()).toBe(false);
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("materializes runtime-imported packages as real top-level packages", async () => {
    if (process.platform === "win32") {
      return;
    }

    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await deployPortableOpenClawRuntime({
        repoRoot: "/repo",
        openclawRuntimeDir: runtimeDir,
        execFileImpl: async (_file, args) => {
          const deployDir = lastItem(args);
          if (!deployDir) {
            throw new Error("missing deploy dir");
          }

          const topLevelNodeModulesDir = path.join(deployDir, "node_modules");
          const tslogStoreDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "tslog@4.10.2",
            "node_modules",
            "tslog",
          );
          const tslogLink = path.join(topLevelNodeModulesDir, "tslog");

          await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
          await fsPromises.writeFile(path.join(deployDir, "openclaw.mjs"), "export {};\n", "utf8");
          await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
            'import "tslog";\nexport {};\n',
            "utf8",
          );
          await fsPromises.mkdir(tslogStoreDir, { recursive: true });
          await fsPromises.writeFile(
            path.join(tslogStoreDir, "package.json"),
            '{"name":"tslog","version":"4.10.2"}\n',
            "utf8",
          );
          await fsPromises.symlink(
            path.relative(topLevelNodeModulesDir, tslogStoreDir),
            tslogLink,
            "dir",
          );

          return { stdout: "", stderr: "" };
        },
      });

      const tslogStat = await fsPromises.lstat(path.join(runtimeDir, "node_modules", "tslog"));
      expect(tslogStat.isSymbolicLink()).toBe(false);
      expect(fs.existsSync(path.join(runtimeDir, "node_modules", "tslog", "package.json"))).toBe(
        true,
      );
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("materializes runtime-imported scoped packages from hashed virtual-store dirs", async () => {
    if (process.platform === "win32") {
      return;
    }

    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await deployPortableOpenClawRuntime({
        repoRoot: "/repo",
        openclawRuntimeDir: runtimeDir,
        execFileImpl: async (_file, args) => {
          const deployDir = lastItem(args);
          if (!deployDir) {
            throw new Error("missing deploy dir");
          }

          const topLevelScopeDir = path.join(deployDir, "node_modules", "@buape");
          const carbonStoreDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "@buape+carbon_nksmt6rltdtco2p27e43qr32ma",
            "node_modules",
            "@buape",
            "carbon",
          );
          const carbonLink = path.join(topLevelScopeDir, "carbon");

          await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
          await fsPromises.writeFile(path.join(deployDir, "openclaw.mjs"), "export {};\n", "utf8");
          await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
            'import "@buape/carbon";\nexport {};\n',
            "utf8",
          );
          await fsPromises.mkdir(carbonStoreDir, { recursive: true });
          await fsPromises.mkdir(topLevelScopeDir, { recursive: true });
          await fsPromises.writeFile(
            path.join(carbonStoreDir, "package.json"),
            '{"name":"@buape/carbon","version":"0.0.0"}\n',
            "utf8",
          );
          await fsPromises.symlink(
            path.relative(topLevelScopeDir, carbonStoreDir),
            carbonLink,
            "dir",
          );

          return { stdout: "", stderr: "" };
        },
      });

      const carbonStat = await fsPromises.lstat(
        path.join(runtimeDir, "node_modules", "@buape", "carbon"),
      );
      expect(carbonStat.isSymbolicLink()).toBe(false);
      expect(
        fs.existsSync(path.join(runtimeDir, "node_modules", "@buape", "carbon", "package.json")),
      ).toBe(true);
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("materializes undici when runtime dist imports it", async () => {
    if (process.platform === "win32") {
      return;
    }

    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await deployPortableOpenClawRuntime({
        repoRoot: "/repo",
        openclawRuntimeDir: runtimeDir,
        execFileImpl: async (_file, args) => {
          const deployDir = lastItem(args);
          if (!deployDir) {
            throw new Error("missing deploy dir");
          }

          const topLevelNodeModulesDir = path.join(deployDir, "node_modules");
          const undiciStoreDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "undici@7.24.1",
            "node_modules",
            "undici",
          );
          const undiciLink = path.join(topLevelNodeModulesDir, "undici");

          await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
          await fsPromises.writeFile(path.join(deployDir, "openclaw.mjs"), "export {};\n", "utf8");
          await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
            'import { EnvHttpProxyAgent } from "undici";\nvoid EnvHttpProxyAgent;\nexport {};\n',
            "utf8",
          );
          await fsPromises.mkdir(undiciStoreDir, { recursive: true });
          await fsPromises.writeFile(
            path.join(undiciStoreDir, "package.json"),
            '{"name":"undici","version":"7.24.1"}\n',
            "utf8",
          );
          await fsPromises.symlink(
            path.relative(topLevelNodeModulesDir, undiciStoreDir),
            undiciLink,
            "dir",
          );

          return { stdout: "", stderr: "" };
        },
      });

      const undiciStat = await fsPromises.lstat(path.join(runtimeDir, "node_modules", "undici"));
      expect(undiciStat.isSymbolicLink()).toBe(false);
      expect(fs.existsSync(path.join(runtimeDir, "node_modules", "undici", "package.json"))).toBe(
        true,
      );
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("follows only gateway entry reachable imports when verifying runtime packages", async () => {
    if (process.platform === "win32") {
      return;
    }

    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await deployPortableOpenClawRuntime({
        repoRoot: "/repo",
        openclawRuntimeDir: runtimeDir,
        execFileImpl: async (_file, args) => {
          const deployDir = lastItem(args);
          if (!deployDir) {
            throw new Error("missing deploy dir");
          }

          const topLevelNodeModulesDir = path.join(deployDir, "node_modules");
          const tslogStoreDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "tslog@4.10.2",
            "node_modules",
            "tslog",
          );

          await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
          await fsPromises.writeFile(path.join(deployDir, "openclaw.mjs"), "export {};\n", "utf8");
          await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
            'import "./reachable.js";\nexport {};\n',
            "utf8",
          );
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "reachable.js"),
            'import "tslog";\nexport {};\n',
            "utf8",
          );
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "unrelated.js"),
            'import "pkg-that-does-not-exist";\nexport {};\n',
            "utf8",
          );
          await fsPromises.mkdir(tslogStoreDir, { recursive: true });
          await fsPromises.writeFile(
            path.join(tslogStoreDir, "package.json"),
            '{"name":"tslog","version":"4.10.2"}\n',
            "utf8",
          );
          await fsPromises.symlink(
            path.relative(topLevelNodeModulesDir, tslogStoreDir),
            path.join(topLevelNodeModulesDir, "tslog"),
            "dir",
          );

          return { stdout: "", stderr: "" };
        },
      });

      expect(fs.existsSync(path.join(runtimeDir, "node_modules", "tslog", "package.json"))).toBe(
        true,
      );
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("follows reachable local dynamic imports and materializes their static package deps", async () => {
    if (process.platform === "win32") {
      return;
    }

    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await deployPortableOpenClawRuntime({
        repoRoot: "/repo",
        openclawRuntimeDir: runtimeDir,
        execFileImpl: async (_file, args) => {
          const deployDir = lastItem(args);
          if (!deployDir) {
            throw new Error("missing deploy dir");
          }

          const topLevelNodeModulesDir = path.join(deployDir, "node_modules");
          const wsStoreDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "ws@8.19.0",
            "node_modules",
            "ws",
          );

          await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
          await fsPromises.writeFile(path.join(deployDir, "openclaw.mjs"), "export {};\n", "utf8");
          await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
            'await import("./lazy.js");\nexport {};\n',
            "utf8",
          );
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "lazy.js"),
            'import WebSocket from "ws";\nvoid WebSocket;\nexport {};\n',
            "utf8",
          );
          await fsPromises.mkdir(wsStoreDir, { recursive: true });
          await fsPromises.writeFile(
            path.join(wsStoreDir, "package.json"),
            '{"name":"ws","version":"8.19.0"}\n',
            "utf8",
          );
          await fsPromises.symlink(
            path.relative(topLevelNodeModulesDir, wsStoreDir),
            path.join(topLevelNodeModulesDir, "ws"),
            "dir",
          );

          return { stdout: "", stderr: "" };
        },
      });

      const wsStat = await fsPromises.lstat(path.join(runtimeDir, "node_modules", "ws"));
      expect(wsStat.isSymbolicLink()).toBe(false);
      expect(fs.existsSync(path.join(runtimeDir, "node_modules", "ws", "package.json"))).toBe(true);
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("ignores Node builtin bare imports in runtime verification", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await expect(
        deployPortableOpenClawRuntime({
          repoRoot: "/repo",
          openclawRuntimeDir: runtimeDir,
          execFileImpl: async (_file, args) => {
            const deployDir = lastItem(args);
            if (!deployDir) {
              throw new Error("missing deploy dir");
            }

            await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
            await fsPromises.writeFile(
              path.join(deployDir, "openclaw.mjs"),
              "export {};\n",
              "utf8",
            );
            await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");
            await fsPromises.writeFile(
              path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
              'import fs from "fs";\nimport path from "path";\nvoid fs;\nvoid path;\nexport {};\n',
              "utf8",
            );

            return { stdout: "", stderr: "" };
          },
        }),
      ).resolves.toBeUndefined();
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("fails fast when runtime imports cannot be materialized", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await expect(
        deployPortableOpenClawRuntime({
          repoRoot: "/repo",
          openclawRuntimeDir: runtimeDir,
          execFileImpl: async (_file, args) => {
            const deployDir = lastItem(args);
            if (!deployDir) {
              throw new Error("missing deploy dir");
            }

            await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
            await fsPromises.writeFile(
              path.join(deployDir, "openclaw.mjs"),
              "export {};\n",
              "utf8",
            );
            await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");
            await fsPromises.writeFile(
              path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
              'import "pkg-that-does-not-exist";\nexport {};\n',
              "utf8",
            );

            return { stdout: "", stderr: "" };
          },
        }),
      ).rejects.toThrow(
        "gateway sidecar runtime missing imported packages: pkg-that-does-not-exist",
      );
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("allows missing packages that are explicitly pruned for sidecar runtime", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await expect(
        deployPortableOpenClawRuntime({
          repoRoot: "/repo",
          openclawRuntimeDir: runtimeDir,
          execFileImpl: async (_file, args) => {
            const deployDir = lastItem(args);
            if (!deployDir) {
              throw new Error("missing deploy dir");
            }

            await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
            await fsPromises.writeFile(
              path.join(deployDir, "openclaw.mjs"),
              "export {};\n",
              "utf8",
            );
            await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");
            await fsPromises.writeFile(
              path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
              'import "playwright-core";\nimport "onnxruntime-node";\nexport {};\n',
              "utf8",
            );

            return { stdout: "", stderr: "" };
          },
        }),
      ).resolves.toBeUndefined();
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("materializes transitive dependencies under the importing package node_modules", async () => {
    if (process.platform === "win32") {
      return;
    }

    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await deployPortableOpenClawRuntime({
        repoRoot: "/repo",
        openclawRuntimeDir: runtimeDir,
        execFileImpl: async (_file, args) => {
          const deployDir = lastItem(args);
          if (!deployDir) {
            throw new Error("missing deploy dir");
          }

          const topLevelNodeModulesDir = path.join(deployDir, "node_modules");
          const mcpScopeDir = path.join(topLevelNodeModulesDir, "@modelcontextprotocol");
          const sdkStoreDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "@modelcontextprotocol+sdk@1.27.1",
            "node_modules",
            "@modelcontextprotocol",
            "sdk",
          );
          const crossSpawnStoreDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "cross-spawn@7.0.6",
            "node_modules",
            "cross-spawn",
          );

          await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
          await fsPromises.writeFile(path.join(deployDir, "openclaw.mjs"), "export {};\n", "utf8");
          await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
            'import "@modelcontextprotocol/sdk";\nexport {};\n',
            "utf8",
          );
          await fsPromises.mkdir(mcpScopeDir, { recursive: true });
          await fsPromises.mkdir(sdkStoreDir, { recursive: true });
          await fsPromises.mkdir(crossSpawnStoreDir, { recursive: true });
          await fsPromises.writeFile(
            path.join(sdkStoreDir, "package.json"),
            JSON.stringify({
              name: "@modelcontextprotocol/sdk",
              version: "1.27.1",
              dependencies: {
                "cross-spawn": "^7.0.6",
              },
            }),
            "utf8",
          );
          await fsPromises.writeFile(
            path.join(crossSpawnStoreDir, "package.json"),
            '{"name":"cross-spawn","version":"7.0.6"}\n',
            "utf8",
          );
          await fsPromises.symlink(
            path.relative(mcpScopeDir, sdkStoreDir),
            path.join(mcpScopeDir, "sdk"),
            "dir",
          );
          await fsPromises.symlink(
            path.relative(topLevelNodeModulesDir, crossSpawnStoreDir),
            path.join(topLevelNodeModulesDir, "cross-spawn"),
            "dir",
          );

          return { stdout: "", stderr: "" };
        },
      });

      const crossSpawnStat = await fsPromises.lstat(
        path.join(
          runtimeDir,
          "node_modules",
          "@modelcontextprotocol",
          "sdk",
          "node_modules",
          "cross-spawn",
        ),
      );
      expect(crossSpawnStat.isSymbolicLink()).toBe(false);
      expect(
        fs.existsSync(
          path.join(
            runtimeDir,
            "node_modules",
            "@modelcontextprotocol",
            "sdk",
            "node_modules",
            "cross-spawn",
            "package.json",
          ),
        ),
      ).toBe(true);
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("materializes dependency versions relative to the importing package", async () => {
    if (process.platform === "win32") {
      return;
    }

    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await deployPortableOpenClawRuntime({
        repoRoot: "/repo",
        openclawRuntimeDir: runtimeDir,
        execFileImpl: async (_file, args) => {
          const deployDir = lastItem(args);
          if (!deployDir) {
            throw new Error("missing deploy dir");
          }

          const topLevelNodeModulesDir = path.join(deployDir, "node_modules");
          const grammyScopeDir = topLevelNodeModulesDir;
          const grammyStoreNodeModulesDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "grammy@1.41.1",
            "node_modules",
          );
          const grammyStoreDir = path.join(grammyStoreNodeModulesDir, "grammy");
          const nodeFetchV2StoreDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "node-fetch@2.7.0",
            "node_modules",
            "node-fetch",
          );
          const nodeFetchV3StoreDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "node-fetch@3.3.2",
            "node_modules",
            "node-fetch",
          );

          await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
          await fsPromises.writeFile(path.join(deployDir, "openclaw.mjs"), "export {};\n", "utf8");
          await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
            'import "grammy";\nimport "node-fetch";\nexport {};\n',
            "utf8",
          );
          await fsPromises.mkdir(grammyStoreDir, { recursive: true });
          await fsPromises.mkdir(nodeFetchV2StoreDir, { recursive: true });
          await fsPromises.mkdir(nodeFetchV3StoreDir, { recursive: true });
          await fsPromises.writeFile(
            path.join(grammyStoreDir, "package.json"),
            JSON.stringify({
              name: "grammy",
              version: "1.41.1",
              dependencies: {
                "node-fetch": "^2.7.0",
              },
            }),
            "utf8",
          );
          await fsPromises.writeFile(
            path.join(nodeFetchV2StoreDir, "package.json"),
            '{"name":"node-fetch","version":"2.7.0"}\n',
            "utf8",
          );
          await fsPromises.writeFile(
            path.join(nodeFetchV3StoreDir, "package.json"),
            '{"name":"node-fetch","version":"3.3.2"}\n',
            "utf8",
          );
          await fsPromises.symlink(
            path.relative(topLevelNodeModulesDir, grammyStoreDir),
            path.join(grammyScopeDir, "grammy"),
            "dir",
          );
          await fsPromises.symlink(
            path.relative(grammyStoreNodeModulesDir, nodeFetchV2StoreDir),
            path.join(grammyStoreNodeModulesDir, "node-fetch"),
            "dir",
          );
          await fsPromises.symlink(
            path.relative(topLevelNodeModulesDir, nodeFetchV3StoreDir),
            path.join(topLevelNodeModulesDir, "node-fetch"),
            "dir",
          );

          return { stdout: "", stderr: "" };
        },
      });

      const topLevelNodeFetch = JSON.parse(
        await fsPromises.readFile(
          path.join(runtimeDir, "node_modules", "node-fetch", "package.json"),
          "utf8",
        ),
      ) as { version?: string };
      expect(topLevelNodeFetch.version).toBe("3.3.2");

      const grammyNodeFetch = JSON.parse(
        await fsPromises.readFile(
          path.join(
            runtimeDir,
            "node_modules",
            "grammy",
            "node_modules",
            "node-fetch",
            "package.json",
          ),
          "utf8",
        ),
      ) as { version?: string };
      expect(grammyNodeFetch.version).toBe("2.7.0");
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("preserves top-level symlink-resolved version when multiple virtual-store versions exist", async () => {
    if (process.platform === "win32") {
      return;
    }

    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await deployPortableOpenClawRuntime({
        repoRoot: "/repo",
        openclawRuntimeDir: runtimeDir,
        execFileImpl: async (_file, args) => {
          const deployDir = lastItem(args);
          if (!deployDir) {
            throw new Error("missing deploy dir");
          }

          const topLevelNodeModulesDir = path.join(deployDir, "node_modules");
          const chalkV5StoreDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "chalk@5.6.2",
            "node_modules",
            "chalk",
          );
          const chalkV4StoreDir = path.join(
            deployDir,
            "node_modules",
            ".pnpm",
            "chalk@4.1.2",
            "node_modules",
            "chalk",
          );

          await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
          await fsPromises.writeFile(path.join(deployDir, "openclaw.mjs"), "export {};\n", "utf8");
          await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
            'import "chalk";\nexport {};\n',
            "utf8",
          );
          await fsPromises.mkdir(chalkV5StoreDir, { recursive: true });
          await fsPromises.mkdir(chalkV4StoreDir, { recursive: true });
          await fsPromises.writeFile(
            path.join(chalkV5StoreDir, "package.json"),
            '{"name":"chalk","version":"5.6.2"}\n',
            "utf8",
          );
          await fsPromises.writeFile(
            path.join(chalkV4StoreDir, "package.json"),
            '{"name":"chalk","version":"4.1.2"}\n',
            "utf8",
          );
          await fsPromises.symlink(
            path.relative(topLevelNodeModulesDir, chalkV5StoreDir),
            path.join(topLevelNodeModulesDir, "chalk"),
            "dir",
          );

          return { stdout: "", stderr: "" };
        },
      });

      const chalkPackageJson = JSON.parse(
        await fsPromises.readFile(
          path.join(runtimeDir, "node_modules", "chalk", "package.json"),
          "utf8",
        ),
      ) as { version?: string };
      expect(chalkPackageJson.version).toBe("5.6.2");
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("fails fast when transitive dependencies of runtime-imported packages are missing", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await expect(
        deployPortableOpenClawRuntime({
          repoRoot: "/repo",
          openclawRuntimeDir: runtimeDir,
          execFileImpl: async (_file, args) => {
            const deployDir = lastItem(args);
            if (!deployDir) {
              throw new Error("missing deploy dir");
            }

            const topLevelNodeModulesDir = path.join(deployDir, "node_modules");
            const mcpScopeDir = path.join(topLevelNodeModulesDir, "@modelcontextprotocol");
            const sdkStoreDir = path.join(
              deployDir,
              "node_modules",
              ".pnpm",
              "@modelcontextprotocol+sdk@1.27.1",
              "node_modules",
              "@modelcontextprotocol",
              "sdk",
            );

            await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
            await fsPromises.writeFile(
              path.join(deployDir, "openclaw.mjs"),
              "export {};\n",
              "utf8",
            );
            await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");
            await fsPromises.writeFile(
              path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
              'import "@modelcontextprotocol/sdk";\nexport {};\n',
              "utf8",
            );
            await fsPromises.mkdir(mcpScopeDir, { recursive: true });
            await fsPromises.mkdir(sdkStoreDir, { recursive: true });
            await fsPromises.writeFile(
              path.join(sdkStoreDir, "package.json"),
              JSON.stringify({
                name: "@modelcontextprotocol/sdk",
                version: "1.27.1",
                dependencies: {
                  "cross-spawn": "^7.0.6",
                },
              }),
              "utf8",
            );
            await fsPromises.symlink(
              path.relative(mcpScopeDir, sdkStoreDir),
              path.join(mcpScopeDir, "sdk"),
              "dir",
            );

            return { stdout: "", stderr: "" };
          },
        }),
      ).rejects.toThrow("gateway sidecar runtime missing imported packages: cross-spawn");
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects sidecar node versions below the openclaw runtime minimum", () => {
    expect(() => assertSupportedSidecarNodeVersion("22.11.0")).toThrow(
      "桌面版内置 Node 运行时必须 >= 22.12.0，当前打包环境是 22.11.0",
    );
    expect(() => assertSupportedSidecarNodeVersion("22.12.0")).not.toThrow();
    expect(() => assertSupportedSidecarNodeVersion("22.22.0")).not.toThrow();
  });

  it("moves the deployed runtime into place when rename succeeds", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");
    let renamedFrom: string | null = null;
    let renamedTo: string | null = null;
    let copied = false;

    try {
      await deployPortableOpenClawRuntime({
        repoRoot: "/repo",
        openclawRuntimeDir: runtimeDir,
        execFileImpl: async (_file, args) => {
          const deployDir = lastItem(args);
          if (!deployDir) {
            throw new Error("missing deploy dir");
          }

          await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
            'console.log("sidecar");\n',
            "utf8",
          );
          await fsPromises.writeFile(path.join(deployDir, "openclaw.mjs"), "export {};\n", "utf8");
          await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");

          return { stdout: "", stderr: "" };
        },
        renameImpl: async (from, to) => {
          renamedFrom = from;
          renamedTo = to;
          await fsPromises.mkdir(path.dirname(to), { recursive: true });
          await fsPromises.rename(from, to);
        },
        copyImpl: async () => {
          copied = true;
          throw new Error("copy should not run when rename succeeds");
        },
      });

      expect(renamedFrom).toMatch(/^\/.+openclaw-sidecar-deploy-/);
      expect(renamedTo).toBe(runtimeDir);
      expect(copied).toBe(false);
      expect(fs.existsSync(path.join(runtimeDir, "dist", "gateway-sidecar-entry.js"))).toBe(true);
      expect(fs.readFileSync(path.join(runtimeDir, "openclaw.mjs"), "utf8")).toContain(
        "./dist/gateway-sidecar-entry.js",
      );
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("falls back to recursive copy when rename crosses devices", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");
    let renameAttempts = 0;
    let copiedFrom: string | null = null;
    let copiedTo: string | null = null;

    try {
      await deployPortableOpenClawRuntime({
        repoRoot: "/repo",
        openclawRuntimeDir: runtimeDir,
        execFileImpl: async (_file, args) => {
          const deployDir = lastItem(args);
          if (!deployDir) {
            throw new Error("missing deploy dir");
          }

          await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
            'console.log("sidecar");\n',
            "utf8",
          );
          await fsPromises.writeFile(path.join(deployDir, "openclaw.mjs"), "export {};\n", "utf8");
          await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");

          return { stdout: "", stderr: "" };
        },
        renameImpl: async () => {
          renameAttempts += 1;
          const error = new Error("cross-device rename") as NodeJS.ErrnoException;
          error.code = "EXDEV";
          throw error;
        },
        copyImpl: async (from, to, options) => {
          copiedFrom = from;
          copiedTo = to;
          await fsPromises.mkdir(path.dirname(to), { recursive: true });
          await fsPromises.cp(from, to, options);
        },
      });

      expect(renameAttempts).toBe(1);
      expect(copiedFrom).toMatch(/^\/.+openclaw-sidecar-deploy-/);
      expect(copiedTo).toBe(runtimeDir);
      expect(fs.existsSync(path.join(runtimeDir, "dist", "gateway-sidecar-entry.js"))).toBe(true);
      expect(fs.readFileSync(path.join(runtimeDir, "openclaw.mjs"), "utf8")).toContain(
        "./dist/gateway-sidecar-entry.js",
      );
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("deploys a portable openclaw runtime trimmed for the gateway sidecar", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await deployPortableOpenClawRuntime({
        repoRoot: "/repo",
        openclawRuntimeDir: runtimeDir,
        execFileImpl: async (_file, args) => {
          const deployDir = lastItem(args);
          if (!deployDir) {
            throw new Error("missing deploy dir");
          }

          await fsPromises.mkdir(path.join(deployDir, "dist"), { recursive: true });
          await fsPromises.mkdir(path.join(deployDir, "node_modules", "chalk"), {
            recursive: true,
          });
          await fsPromises.mkdir(
            path.join(
              deployDir,
              "node_modules",
              ".pnpm",
              "@mariozechner+pi-tui@0.58.0",
              "node_modules",
              "@mariozechner",
              "pi-tui",
            ),
            {
              recursive: true,
            },
          );
          await fsPromises.mkdir(
            path.join(deployDir, "node_modules", ".pnpm", "onnxruntime-node@1.24.2"),
            {
              recursive: true,
            },
          );
          await fsPromises.mkdir(
            path.join(deployDir, "node_modules", ".pnpm", "node-llama-cpp@3.16.2"),
            {
              recursive: true,
            },
          );
          await fsPromises.mkdir(
            path.join(deployDir, "node_modules", ".pnpm", "@node-llama-cpp+mac-arm64-metal@3.16.2"),
            {
              recursive: true,
            },
          );
          await fsPromises.mkdir(
            path.join(deployDir, "node_modules", ".pnpm", "onnxruntime-common@1.24.2"),
            {
              recursive: true,
            },
          );
          await fsPromises.mkdir(
            path.join(
              deployDir,
              "node_modules",
              ".pnpm",
              "@clack+core@1.1.0",
              "node_modules",
              "@clack",
              "core",
            ),
            {
              recursive: true,
            },
          );
          await fsPromises.mkdir(path.join(deployDir, "node_modules", "@mariozechner"), {
            recursive: true,
          });
          await fsPromises.mkdir(path.join(deployDir, "node_modules", "@larksuiteoapi"), {
            recursive: true,
          });
          await fsPromises.mkdir(path.join(deployDir, "node_modules", "onnxruntime-node"), {
            recursive: true,
          });
          await fsPromises.mkdir(path.join(deployDir, "node_modules", "node-llama-cpp"), {
            recursive: true,
          });
          await fsPromises.mkdir(path.join(deployDir, "node_modules", "@node-llama-cpp"), {
            recursive: true,
          });
          await fsPromises.mkdir(
            path.join(deployDir, "node_modules", "@node-llama-cpp", "mac-arm64-metal"),
            {
              recursive: true,
            },
          );
          await fsPromises.mkdir(path.join(deployDir, "node_modules", "onnxruntime-common"), {
            recursive: true,
          });
          await fsPromises.mkdir(path.join(deployDir, "docs"), { recursive: true });
          await fsPromises.mkdir(path.join(deployDir, "extensions"), { recursive: true });
          await fsPromises.mkdir(path.join(deployDir, "skills"), { recursive: true });
          await fsPromises.mkdir(path.join(deployDir, "assets"), { recursive: true });
          await fsPromises.writeFile(path.join(deployDir, "openclaw.mjs"), "export {};\n", "utf8");
          await fsPromises.writeFile(path.join(deployDir, "package.json"), "{}\n", "utf8");
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "entry.js"),
            "export {};\n",
            "utf8",
          );
          await fsPromises.writeFile(
            path.join(deployDir, "dist", "gateway-sidecar-entry.js"),
            "export {};\n",
            "utf8",
          );
          await fsPromises.writeFile(
            path.join(deployDir, "node_modules", "chalk", "package.json"),
            '{"name":"chalk"}\n',
            "utf8",
          );
          await fsPromises.writeFile(path.join(deployDir, "README.md"), "readme\n", "utf8");
          await fsPromises.writeFile(path.join(deployDir, "CHANGELOG.md"), "changelog\n", "utf8");
          // pnpm deploy produces a flat node_modules/ structure.
          // The pruning function scans node_modules/ directly for packages to remove.
          // We create real directories (not symlinks) to avoid cp/dereference issues.
          await fsPromises.mkdir(path.join(deployDir, "node_modules", "@mariozechner", "pi-tui"), {
            recursive: true,
          });
          await fsPromises.mkdir(path.join(deployDir, "node_modules", "node-llama-cpp"), {
            recursive: true,
          });
          await fsPromises.mkdir(
            path.join(deployDir, "node_modules", "@larksuiteoapi", "node-sdk"),
            {
              recursive: true,
            },
          );
          await fsPromises.mkdir(path.join(deployDir, "node_modules", "onnxruntime-node"), {
            recursive: true,
          });
          await fsPromises.writeFile(
            path.join(deployDir, "node_modules", "@mariozechner", "pi-tui", "package.json"),
            '{"name":"@mariozechner/pi-tui"}\n',
            "utf8",
          );
          await fsPromises.writeFile(
            path.join(deployDir, "node_modules", "node-llama-cpp", "package.json"),
            '{"name":"node-llama-cpp"}\n',
            "utf8",
          );
          await fsPromises.writeFile(
            path.join(deployDir, "node_modules", "@larksuiteoapi", "node-sdk", "package.json"),
            '{"name":"@larksuiteoapi/node-sdk"}\n',
            "utf8",
          );
          await fsPromises.writeFile(
            path.join(deployDir, "node_modules", "onnxruntime-node", "package.json"),
            '{"name":"onnxruntime-node"}\n',
            "utf8",
          );

          return { stdout: "", stderr: "" };
        },
      });

      expect(fs.existsSync(path.join(runtimeDir, "dist", "entry.js"))).toBe(true);
      expect(fs.existsSync(path.join(runtimeDir, "node_modules", "chalk", "package.json"))).toBe(
        true,
      );
      expect(fs.readFileSync(path.join(runtimeDir, "openclaw.mjs"), "utf8")).toContain(
        "./dist/gateway-sidecar-entry.js",
      );
      expect(fs.existsSync(path.join(runtimeDir, "docs"))).toBe(false);
      expect(fs.existsSync(path.join(runtimeDir, "extensions"))).toBe(false);
      expect(fs.existsSync(path.join(runtimeDir, "skills"))).toBe(false);
      expect(fs.existsSync(path.join(runtimeDir, "assets"))).toBe(false);
      expect(fs.existsSync(path.join(runtimeDir, "README.md"))).toBe(false);
      expect(fs.existsSync(path.join(runtimeDir, "CHANGELOG.md"))).toBe(false);
      expect(fs.existsSync(path.join(runtimeDir, "node_modules", ".pnpm"))).toBe(true);
      expect(
        fs.existsSync(path.join(runtimeDir, "node_modules", ".pnpm", "node-llama-cpp@3.16.2")),
      ).toBe(false);
      expect(
        fs.existsSync(path.join(runtimeDir, "node_modules", ".pnpm", "@clack+core@1.1.0")),
      ).toBe(true);

      // pi-coding-agent imports @mariozechner/pi-tui at startup; keep it in sidecar runtime.
      expect(fs.existsSync(path.join(runtimeDir, "node_modules", "@mariozechner", "pi-tui"))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(runtimeDir, "node_modules", "node-llama-cpp"))).toBe(false);
      expect(
        fs.existsSync(path.join(runtimeDir, "node_modules", "@larksuiteoapi", "node-sdk")),
      ).toBe(true);
      expect(fs.existsSync(path.join(runtimeDir, "node_modules", "onnxruntime-node"))).toBe(false);

      // Valid packages should still be present
      expect(fs.existsSync(path.join(runtimeDir, "node_modules", "chalk", "package.json"))).toBe(
        true,
      );
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("skips redeploying the desktop runtime when inputs are unchanged", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const repoRoot = path.join(tempRoot, "repo");
    const uiAgentRoot = path.join(repoRoot, "ui-agent");
    const nodeExecutable = path.join(tempRoot, "fake-node");
    let deployCalls = 0;

    try {
      await fsPromises.mkdir(path.join(repoRoot, "dist"), { recursive: true });
      await fsPromises.mkdir(path.join(uiAgentRoot, "out"), { recursive: true });
      await fsPromises.writeFile(path.join(repoRoot, "package.json"), "{}\n", "utf8");
      await fsPromises.writeFile(path.join(repoRoot, "pnpm-lock.yaml"), "lockfile\n", "utf8");
      await fsPromises.writeFile(
        path.join(repoRoot, "dist", "gateway-sidecar-entry.js"),
        'console.log("entry");\n',
        "utf8",
      );
      await fsPromises.writeFile(
        path.join(uiAgentRoot, "out", "index.html"),
        "<html></html>\n",
        "utf8",
      );
      await fsPromises.writeFile(nodeExecutable, "#!/usr/bin/env node\n", "utf8");

      const deployPortableOpenClawRuntimeImpl = async ({
        openclawRuntimeDir,
      }: {
        repoRoot: string;
        openclawRuntimeDir: string;
      }) => {
        deployCalls += 1;
        await fsPromises.mkdir(path.join(openclawRuntimeDir, "dist"), { recursive: true });
        await fsPromises.writeFile(
          path.join(openclawRuntimeDir, "dist", "gateway-sidecar-entry.js"),
          'console.log("entry");\n',
          "utf8",
        );
        await fsPromises.writeFile(
          path.join(openclawRuntimeDir, "openclaw.mjs"),
          '#!/usr/bin/env node\nimport "./dist/gateway-sidecar-entry.js";\n',
          "utf8",
        );
        await fsPromises.writeFile(path.join(openclawRuntimeDir, "package.json"), "{}\n", "utf8");
      };

      await prepareGatewaySidecar({
        repoRoot,
        uiAgentRoot,
        nodeExecutable,
        platform: "darwin",
        deployPortableOpenClawRuntimeImpl,
      });
      await prepareGatewaySidecar({
        repoRoot,
        uiAgentRoot,
        nodeExecutable,
        platform: "darwin",
        deployPortableOpenClawRuntimeImpl,
      });

      expect(deployCalls).toBe(1);
      expect(
        fs.readFileSync(
          path.join(resolveRuntimeResourceDir(uiAgentRoot), "openclaw", "openclaw.mjs"),
          "utf8",
        ),
      ).toContain("./dist/gateway-sidecar-entry.js");
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rebuilds the desktop runtime when hashed inputs change", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const repoRoot = path.join(tempRoot, "repo");
    const uiAgentRoot = path.join(repoRoot, "ui-agent");
    const nodeExecutable = path.join(tempRoot, "fake-node");
    let deployCalls = 0;

    try {
      await fsPromises.mkdir(path.join(repoRoot, "dist"), { recursive: true });
      await fsPromises.mkdir(path.join(uiAgentRoot, "out"), { recursive: true });
      await fsPromises.writeFile(path.join(repoRoot, "package.json"), "{}\n", "utf8");
      await fsPromises.writeFile(path.join(repoRoot, "pnpm-lock.yaml"), "lockfile\n", "utf8");
      await fsPromises.writeFile(
        path.join(repoRoot, "dist", "gateway-sidecar-entry.js"),
        'console.log("entry");\n',
        "utf8",
      );
      await fsPromises.writeFile(
        path.join(uiAgentRoot, "out", "index.html"),
        "<html>v1</html>\n",
        "utf8",
      );
      await fsPromises.writeFile(nodeExecutable, "#!/usr/bin/env node\n", "utf8");

      const deployPortableOpenClawRuntimeImpl = async ({
        openclawRuntimeDir,
      }: {
        repoRoot: string;
        openclawRuntimeDir: string;
      }) => {
        deployCalls += 1;
        await fsPromises.mkdir(path.join(openclawRuntimeDir, "dist"), { recursive: true });
        await fsPromises.writeFile(
          path.join(openclawRuntimeDir, "dist", "gateway-sidecar-entry.js"),
          'console.log("entry");\n',
          "utf8",
        );
        await fsPromises.writeFile(
          path.join(openclawRuntimeDir, "openclaw.mjs"),
          '#!/usr/bin/env node\nimport "./dist/gateway-sidecar-entry.js";\n',
          "utf8",
        );
        await fsPromises.writeFile(path.join(openclawRuntimeDir, "package.json"), "{}\n", "utf8");
      };

      await prepareGatewaySidecar({
        repoRoot,
        uiAgentRoot,
        nodeExecutable,
        platform: "darwin",
        deployPortableOpenClawRuntimeImpl,
      });
      await fsPromises.writeFile(
        path.join(repoRoot, "dist", "gateway-sidecar-entry.js"),
        'console.log("entry-v2");\n',
        "utf8",
      );
      await prepareGatewaySidecar({
        repoRoot,
        uiAgentRoot,
        nodeExecutable,
        platform: "darwin",
        deployPortableOpenClawRuntimeImpl,
      });

      expect(deployCalls).toBe(2);
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("ignores volatile dist metadata when deciding to redeploy the desktop runtime", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const repoRoot = path.join(tempRoot, "repo");
    const uiAgentRoot = path.join(repoRoot, "ui-agent");
    const nodeExecutable = path.join(tempRoot, "fake-node");
    let deployCalls = 0;

    try {
      await fsPromises.mkdir(path.join(repoRoot, "dist"), { recursive: true });
      await fsPromises.mkdir(path.join(uiAgentRoot, "out"), { recursive: true });
      await fsPromises.writeFile(path.join(repoRoot, "package.json"), "{}\n", "utf8");
      await fsPromises.writeFile(path.join(repoRoot, "pnpm-lock.yaml"), "lockfile\n", "utf8");
      await fsPromises.writeFile(
        path.join(repoRoot, "dist", "gateway-sidecar-entry.js"),
        'console.log("entry");\n',
        "utf8",
      );
      await fsPromises.writeFile(
        path.join(repoRoot, "dist", ".buildstamp"),
        '{"builtAt":1}\n',
        "utf8",
      );
      await fsPromises.writeFile(
        path.join(repoRoot, "dist", "build-info.json"),
        '{"version":"1","commit":"abc","builtAt":"2026-04-08T00:00:00.000Z"}\n',
        "utf8",
      );
      await fsPromises.writeFile(
        path.join(uiAgentRoot, "out", "index.html"),
        "<html>v1</html>\n",
        "utf8",
      );
      await fsPromises.writeFile(nodeExecutable, "#!/usr/bin/env node\n", "utf8");

      const deployPortableOpenClawRuntimeImpl = async ({
        openclawRuntimeDir,
      }: {
        repoRoot: string;
        openclawRuntimeDir: string;
      }) => {
        deployCalls += 1;
        await fsPromises.mkdir(path.join(openclawRuntimeDir, "dist"), { recursive: true });
        await fsPromises.writeFile(
          path.join(openclawRuntimeDir, "dist", "gateway-sidecar-entry.js"),
          'console.log("entry");\n',
          "utf8",
        );
        await fsPromises.writeFile(
          path.join(openclawRuntimeDir, "openclaw.mjs"),
          '#!/usr/bin/env node\nimport "./dist/gateway-sidecar-entry.js";\n',
          "utf8",
        );
        await fsPromises.writeFile(path.join(openclawRuntimeDir, "package.json"), "{}\n", "utf8");
      };

      await prepareGatewaySidecar({
        repoRoot,
        uiAgentRoot,
        nodeExecutable,
        platform: "darwin",
        deployPortableOpenClawRuntimeImpl,
      });
      await fsPromises.writeFile(
        path.join(repoRoot, "dist", ".buildstamp"),
        '{"builtAt":2}\n',
        "utf8",
      );
      await fsPromises.writeFile(
        path.join(repoRoot, "dist", "build-info.json"),
        '{"version":"1","commit":"abc","builtAt":"2026-04-08T00:00:01.000Z"}\n',
        "utf8",
      );
      await prepareGatewaySidecar({
        repoRoot,
        uiAgentRoot,
        nodeExecutable,
        platform: "darwin",
        deployPortableOpenClawRuntimeImpl,
      });

      expect(deployCalls).toBe(1);
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("refreshes bundled ui-agent assets without redeploying openclaw runtime", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const repoRoot = path.join(tempRoot, "repo");
    const uiAgentRoot = path.join(repoRoot, "ui-agent");
    const nodeExecutable = path.join(tempRoot, "fake-node");
    let deployCalls = 0;

    try {
      await fsPromises.mkdir(path.join(repoRoot, "dist"), { recursive: true });
      await fsPromises.mkdir(path.join(uiAgentRoot, "out"), { recursive: true });
      await fsPromises.writeFile(path.join(repoRoot, "package.json"), "{}\n", "utf8");
      await fsPromises.writeFile(path.join(repoRoot, "pnpm-lock.yaml"), "lockfile\n", "utf8");
      await fsPromises.writeFile(
        path.join(repoRoot, "dist", "gateway-sidecar-entry.js"),
        'console.log("entry");\n',
        "utf8",
      );
      await fsPromises.writeFile(
        path.join(uiAgentRoot, "out", "index.html"),
        "<html>v1</html>\n",
        "utf8",
      );
      await fsPromises.writeFile(nodeExecutable, "#!/usr/bin/env node\n", "utf8");

      const deployPortableOpenClawRuntimeImpl = async ({
        openclawRuntimeDir,
      }: {
        repoRoot: string;
        openclawRuntimeDir: string;
      }) => {
        deployCalls += 1;
        await fsPromises.mkdir(path.join(openclawRuntimeDir, "dist"), { recursive: true });
        await fsPromises.writeFile(
          path.join(openclawRuntimeDir, "dist", "gateway-sidecar-entry.js"),
          'console.log("entry");\n',
          "utf8",
        );
        await fsPromises.writeFile(
          path.join(openclawRuntimeDir, "openclaw.mjs"),
          '#!/usr/bin/env node\nimport "./dist/gateway-sidecar-entry.js";\n',
          "utf8",
        );
        await fsPromises.writeFile(path.join(openclawRuntimeDir, "package.json"), "{}\n", "utf8");
      };

      await prepareGatewaySidecar({
        repoRoot,
        uiAgentRoot,
        nodeExecutable,
        platform: "darwin",
        deployPortableOpenClawRuntimeImpl,
      });
      await fsPromises.writeFile(
        path.join(uiAgentRoot, "out", "index.html"),
        "<html>v2</html>\n",
        "utf8",
      );
      await prepareGatewaySidecar({
        repoRoot,
        uiAgentRoot,
        nodeExecutable,
        platform: "darwin",
        deployPortableOpenClawRuntimeImpl,
      });

      expect(deployCalls).toBe(1);
      expect(
        fs.readFileSync(
          path.join(resolveRuntimeResourceDir(uiAgentRoot), "ui-agent", "index.html"),
          "utf8",
        ),
      ).toContain("v2");
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("exits the CLI process after a successful prepare run", async () => {
    const exitCalls: number[] = [];
    const logs: string[] = [];

    await runPrepareGatewaySidecarCli({
      prepareGatewaySidecarImpl: async () => ({
        runtimeDir: "/tmp/runtime",
        bundledNodePath: "/tmp/runtime/node/node",
        bundledEntryPath: "/tmp/runtime/openclaw/openclaw.mjs",
        bundledUiAgentRoot: "/tmp/runtime/ui-agent",
      }),
      exit: (code) => {
        exitCalls.push(code);
      },
      log: (message) => {
        logs.push(message);
      },
      error: () => {
        throw new Error("unexpected error log");
      },
    });

    expect(exitCalls).toEqual([0]);
    expect(logs).toEqual([
      "gateway runtime prepared at /tmp/runtime",
      "bundled node: /tmp/runtime/node/node",
      "bundled entry: /tmp/runtime/openclaw/openclaw.mjs",
    ]);
  });

  it("exits the CLI process with code 1 when prepare fails", async () => {
    const exitCalls: number[] = [];
    const errors: string[] = [];

    await runPrepareGatewaySidecarCli({
      prepareGatewaySidecarImpl: async () => {
        throw new Error("boom");
      },
      exit: (code) => {
        exitCalls.push(code);
      },
      log: () => {
        throw new Error("unexpected success log");
      },
      error: (message) => {
        errors.push(message);
      },
    });

    expect(exitCalls).toEqual([1]);
    expect(errors).toEqual(["boom"]);
  });

  it("rebuilds openclaw before desktop dev and package flows", () => {
    const rootPackageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };
    const tauriConfig = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "src-tauri", "tauri.conf.json"), "utf8"),
    ) as {
      build?: {
        beforeBuildCommand?: string;
      };
      bundle?: {
        resources?: Record<string, string>;
      };
    };
    const tauriWindowsConfig = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "src-tauri", "tauri.windows.conf.json"), "utf8"),
    ) as {
      bundle?: {
        targets?: string | string[];
      };
    };

    expect(packageJson.scripts?.["dev:desktop"]).toContain("pnpm -C .. build");
    expect(packageJson.scripts?.["dev:desktop"]).toContain("pnpm clean:tauri-runtime-staging");
    expect(packageJson.scripts?.["build:desktop"]).toContain("pnpm -C .. build");
    expect(packageJson.scripts?.["build:desktop"]).toContain("pnpm clean:tauri-runtime-staging");
    expect(packageJson.scripts?.["clean:tauri-runtime-staging"]).toBe(
      "node --import tsx scripts/clean-tauri-runtime-staging.ts",
    );
    expect(packageJson.scripts?.["prepare:gateway-sidecar"]).toBe(
      "node --import tsx scripts/prepare-gateway-sidecar.ts",
    );
    expect(packageJson.scripts?.["prepare:nsis-tooling"]).toBe(
      "node --import tsx scripts/prepare-nsis-tooling.ts",
    );
    expect(tauriConfig.build?.beforeBuildCommand).toContain("pnpm -C .. build");
    expect(tauriConfig.build?.beforeBuildCommand).toContain("pnpm clean:tauri-runtime-staging");
    expect(tauriConfig.bundle?.resources).toEqual({
      "resources/runtime": "runtime",
    });
    expect(rootPackageJson.scripts?.["ui-agent:desktop:package:windows:xwin"]).toContain(
      "/opt/homebrew/opt/llvm/bin",
    );
    expect(rootPackageJson.scripts?.["ui-agent:desktop:package:windows"]).toContain(
      "/opt/homebrew/opt/llvm/bin",
    );
    expect(rootPackageJson.scripts?.["ui-agent:desktop:package:windows:xwin"]).toContain(
      "OPENCLAW_UI_AGENT_DESKTOP_TARGET=win32",
    );
    expect(rootPackageJson.scripts?.["ui-agent:desktop:package:windows"]).toContain(
      "OPENCLAW_UI_AGENT_DESKTOP_TARGET=win32",
    );
    expect(rootPackageJson.scripts?.["ui-agent:desktop:package:windows:xwin"]).toContain(
      "prepare:nsis-tooling",
    );
    expect(rootPackageJson.scripts?.["ui-agent:desktop:package:windows"]).toContain(
      "prepare:nsis-tooling",
    );
    expect(rootPackageJson.scripts?.["ui-agent:desktop:package:windows"]).toContain("cargo-xwin");
    expect(rootPackageJson.scripts?.["ui-agent:desktop:package:linux"]).toContain(
      "OPENCLAW_UI_AGENT_DESKTOP_TARGET=linux",
    );
    expect(rootPackageJson.scripts?.["ui-agent:desktop:package:windows:xwin"]).not.toContain(
      "--bundles nsis",
    );
    expect(tauriWindowsConfig.bundle?.targets).toBe("nsis");
  });
});
