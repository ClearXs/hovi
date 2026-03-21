import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertSupportedSidecarNodeVersion,
  deployPortableOpenClawRuntime,
  resolveBundledNodeRelativePath,
  resolveBundledOpenClawEntryRelativePath,
  resolvePnpmExecutable,
  resolveSidecarTargetPlatform,
  resolveTargetNodeDownloadUrl,
  resolveBundledUiAgentRootRelativePath,
  resolveRuntimeResourceDir,
} from "./prepare-gateway-sidecar.shared";

describe("prepare-gateway-sidecar", () => {
  it("computes the expected runtime resource directory", () => {
    expect(resolveRuntimeResourceDir("/repo/ui-agent")).toBe(
      path.join("/repo/ui-agent", "src-tauri", "resources", "runtime"),
    );
  });

  it("computes the expected bundled node path", () => {
    expect(resolveBundledNodeRelativePath("darwin")).toBe(path.join("node", "node"));
    expect(resolveBundledNodeRelativePath("win32")).toBe("node.exe");
  });

  it("computes the expected bundled openclaw entry path", () => {
    expect(resolveBundledOpenClawEntryRelativePath()).toBe(path.join("openclaw", "openclaw.mjs"));
  });

  it("resolves the sidecar target platform from packaging env", () => {
    expect(resolveSidecarTargetPlatform("darwin", {})).toBe("darwin");
    expect(
      resolveSidecarTargetPlatform("darwin", { OPENCLAW_UI_AGENT_DESKTOP_TARGET: "win32" }),
    ).toBe("win32");
    expect(
      resolveSidecarTargetPlatform("darwin", { OPENCLAW_UI_AGENT_DESKTOP_TARGET: "linux" }),
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

  it("rejects sidecar node versions below the openclaw runtime minimum", () => {
    expect(() => assertSupportedSidecarNodeVersion("22.11.0")).toThrow(
      "桌面版内置 Node 运行时必须 >= 22.12.0，当前打包环境是 22.11.0",
    );
    expect(() => assertSupportedSidecarNodeVersion("22.12.0")).not.toThrow();
    expect(() => assertSupportedSidecarNodeVersion("22.22.0")).not.toThrow();
  });

  it("deploys a portable openclaw runtime trimmed for the gateway sidecar", async () => {
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-test-"));
    const runtimeDir = path.join(tempRoot, "runtime", "openclaw");

    try {
      await deployPortableOpenClawRuntime({
        repoRoot: "/repo",
        openclawRuntimeDir: runtimeDir,
        execFileImpl: async (_file, args) => {
          const deployDir = args.at(-1);
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
          await fsPromises.mkdir(path.join(deployDir, "node_modules", "@mariozechner"), {
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
          await fsPromises.writeFile(
            path.join(
              deployDir,
              "node_modules",
              ".pnpm",
              "@mariozechner+pi-tui@0.58.0",
              "node_modules",
              "@mariozechner",
              "pi-tui",
              "package.json",
            ),
            '{"name":"@mariozechner/pi-tui"}\n',
            "utf8",
          );
          await fsPromises.symlink(
            path.join(
              deployDir,
              "node_modules",
              ".pnpm",
              "@mariozechner+pi-tui@0.58.0",
              "node_modules",
              "@mariozechner",
              "pi-tui",
            ),
            path.join(deployDir, "node_modules", "@mariozechner", "pi-tui"),
            "dir",
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
      expect(
        fs.existsSync(
          path.join(runtimeDir, "node_modules", ".pnpm", "@mariozechner+pi-tui@0.58.0"),
        ),
      ).toBe(false);
      expect(
        fs.existsSync(path.join(runtimeDir, "node_modules", ".pnpm", "onnxruntime-node@1.24.2")),
      ).toBe(false);
      expect(
        fs.existsSync(path.join(runtimeDir, "node_modules", ".pnpm", "node-llama-cpp@3.16.2")),
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(runtimeDir, "node_modules", ".pnpm", "@node-llama-cpp+mac-arm64-metal@3.16.2"),
        ),
      ).toBe(false);
      expect(
        fs.existsSync(path.join(runtimeDir, "node_modules", ".pnpm", "onnxruntime-common@1.24.2")),
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(runtimeDir, "node_modules", ".pnpm", "@mariozechner+pi-tui@0.58.0"),
        ),
      ).toBe(false);
      expect(
        fs.existsSync(path.join(runtimeDir, "node_modules", ".pnpm", "onnxruntime-node@1.24.2")),
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(runtimeDir, "node_modules", ".pnpm", "node-llama-cpp@3.16.2_typescript@5.9.3"),
        ),
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(runtimeDir, "node_modules", ".pnpm", "@node-llama-cpp+mac-arm64-metal@3.16.2"),
        ),
      ).toBe(false);
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
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
    expect(packageJson.scripts?.["clean:tauri-runtime-staging"]).toContain(
      "clean-tauri-runtime-staging.ts",
    );
    expect(packageJson.scripts?.["prepare:nsis-tooling"]).toContain("prepare-nsis-tooling.ts");
    expect(tauriConfig.build?.beforeBuildCommand).toContain("pnpm -C .. build");
    expect(tauriConfig.build?.beforeBuildCommand).toContain("pnpm clean:tauri-runtime-staging");
    expect(tauriConfig.bundle?.resources).toEqual({
      "resources/runtime": "runtime",
    });
    expect(rootPackageJson.scripts?.["ui-agent:desktop:package:windows:xwin"]).toContain(
      "/opt/homebrew/opt/llvm/bin",
    );
    expect(rootPackageJson.scripts?.["ui-agent:desktop:package:windows:xwin"]).toContain(
      "OPENCLAW_UI_AGENT_DESKTOP_TARGET=win32",
    );
    expect(rootPackageJson.scripts?.["ui-agent:desktop:package:windows:xwin"]).toContain(
      "prepare:nsis-tooling",
    );
    expect(rootPackageJson.scripts?.["ui-agent:desktop:package:linux"]).toContain(
      "OPENCLAW_UI_AGENT_DESKTOP_TARGET=linux",
    );
    expect(rootPackageJson.scripts?.["ui-agent:desktop:package:windows:xwin"]).not.toContain(
      "--bundles nsis",
    );
    expect(tauriWindowsConfig.bundle?.targets).toBe("nsis");
  });
});
