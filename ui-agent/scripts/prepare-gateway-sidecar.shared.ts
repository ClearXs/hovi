import { execFile } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DESKTOP_TARGET_ENV_KEY = "OPENCLAW_UI_AGENT_DESKTOP_TARGET";
const TARGET_NODE_VERSION = process.versions.node;
const MIN_SIDECAR_NODE_MAJOR = 22;
const MIN_SIDECAR_NODE_MINOR = 12;
const GATEWAY_SIDECAR_ENTRY_BASENAME = "gateway-sidecar-entry.js";
const GATEWAY_SIDECAR_BOOTSTRAP = `#!/usr/bin/env node\nimport "./dist/${GATEWAY_SIDECAR_ENTRY_BASENAME}";\n`;
const SIDEcar_RUNTIME_PRUNE_PATHS = [
  "assets",
  "docs",
  "extensions",
  "skills",
  "CHANGELOG.md",
  "README-header.png",
  "README.md",
] as const;
const DIST_PRUNE_PREFIXES = ["tui-", "tui-cli-"] as const;
const PNPM_OPTIONAL_PACKAGE_PREFIXES = [
  "@mariozechner+pi-tui@",
  "@node-llama-cpp+",
  "node-llama-cpp@",
  "onnxruntime-common@",
  "onnxruntime-node@",
  // Gateway 运行时不会用到这些包
  "koffi@",
  "pdfjs-dist@",
  "@larksuiteoapi+node-sdk@",
  "@napi-rs+canvas@",
] as const;

function parseNodeVersion(version: string): { major: number; minor: number } {
  const normalized = version.startsWith("v") ? version.slice(1) : version;
  const [majorRaw = "0", minorRaw = "0"] = normalized.split(".");
  return {
    major: Number(majorRaw),
    minor: Number(minorRaw),
  };
}

export function assertSupportedSidecarNodeVersion(version: string): void {
  const normalized = version.startsWith("v") ? version.slice(1) : version;
  const parsed = parseNodeVersion(normalized);
  const isSupported =
    parsed.major > MIN_SIDECAR_NODE_MAJOR ||
    (parsed.major === MIN_SIDECAR_NODE_MAJOR && parsed.minor >= MIN_SIDECAR_NODE_MINOR);

  if (isSupported) {
    return;
  }

  throw new Error(
    `桌面版内置 Node 运行时必须 >= ${MIN_SIDECAR_NODE_MAJOR}.${MIN_SIDECAR_NODE_MINOR}.0，当前打包环境是 ${normalized}`,
  );
}

export function resolveRuntimeResourceDir(uiAgentRoot: string): string {
  return path.join(uiAgentRoot, "src-tauri", "resources", "runtime");
}

export function resolveBundledNodeRelativePath(platform: NodeJS.Platform): string {
  return platform === "win32" ? "node.exe" : path.join("node", "node");
}

export function resolveBundledOpenClawEntryRelativePath(): string {
  return path.join("openclaw", "openclaw.mjs");
}

export function resolveBundledUiAgentRootRelativePath(): string {
  return "ui-agent";
}

export function resolveSidecarTargetPlatform(
  hostPlatform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): NodeJS.Platform {
  const requested = env[DESKTOP_TARGET_ENV_KEY]?.trim();
  if (requested === "darwin" || requested === "linux" || requested === "win32") {
    return requested;
  }

  return hostPlatform;
}

export function resolveTargetNodeDownloadUrl(
  nodeVersion: string,
  targetPlatform: NodeJS.Platform,
): string | null {
  const normalizedVersion = nodeVersion.startsWith("v") ? nodeVersion.slice(1) : nodeVersion;

  if (targetPlatform === "win32") {
    return `https://nodejs.org/dist/v${normalizedVersion}/win-x64/node.exe`;
  }

  if (targetPlatform === "linux") {
    return `https://nodejs.org/dist/v${normalizedVersion}/node-v${normalizedVersion}-linux-x64.tar.xz`;
  }

  return null;
}

export function resolvePnpmExecutable(platform: NodeJS.Platform): string {
  return platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function resolveDesktopNodeCacheDir(): string {
  switch (process.platform) {
    case "darwin":
      return path.join(os.homedir(), "Library", "Caches", "hovi-ui-agent", "sidecar-node");
    case "win32":
      return path.join(
        process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
        "Hovi",
        "Cache",
        "sidecar-node",
      );
    default:
      return path.join(
        process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"),
        "hovi-ui-agent",
        "sidecar-node",
      );
  }
}

async function downloadFile(url: string, targetPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载 Node 运行时失败: ${response.status} ${response.statusText}`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  await writeFile(targetPath, body);
}

async function ensureCrossPlatformNodeExecutable(targetPlatform: NodeJS.Platform): Promise<string> {
  const normalizedVersion = TARGET_NODE_VERSION.startsWith("v")
    ? TARGET_NODE_VERSION.slice(1)
    : TARGET_NODE_VERSION;
  const cacheDir = resolveDesktopNodeCacheDir();
  await mkdir(cacheDir, { recursive: true });

  if (targetPlatform === "win32") {
    const nodeExePath = path.join(cacheDir, `node-v${normalizedVersion}-win-x64.exe`);
    try {
      await stat(nodeExePath);
      return nodeExePath;
    } catch {}

    const downloadUrl = resolveTargetNodeDownloadUrl(normalizedVersion, targetPlatform);
    if (!downloadUrl) {
      throw new Error(`不支持的 sidecar Node 目标平台: ${targetPlatform}`);
    }

    const tempPath = `${nodeExePath}.tmp`;
    await rm(tempPath, { force: true });
    await downloadFile(downloadUrl, tempPath);
    await rm(nodeExePath, { force: true });
    await cp(tempPath, nodeExePath, { force: true });
    await rm(tempPath, { force: true });
    return nodeExePath;
  }

  if (targetPlatform === "linux") {
    const extractedRoot = path.join(cacheDir, `node-v${normalizedVersion}-linux-x64`);
    const nodeBinaryPath = path.join(extractedRoot, "bin", "node");
    try {
      await stat(nodeBinaryPath);
      return nodeBinaryPath;
    } catch {}

    const downloadUrl = resolveTargetNodeDownloadUrl(normalizedVersion, targetPlatform);
    if (!downloadUrl) {
      throw new Error(`不支持的 sidecar Node 目标平台: ${targetPlatform}`);
    }

    const archivePath = path.join(cacheDir, `node-v${normalizedVersion}-linux-x64.tar.xz`);
    await rm(archivePath, { force: true });
    await rm(extractedRoot, { force: true, recursive: true });
    await downloadFile(downloadUrl, archivePath);
    await execFileAsync("tar", ["-xJf", archivePath, "-C", cacheDir]);
    await chmod(nodeBinaryPath, 0o755);
    return nodeBinaryPath;
  }

  throw new Error(`不支持的 sidecar Node 目标平台: ${targetPlatform}`);
}

async function ensurePathExists(targetPath: string, description: string): Promise<void> {
  try {
    await stat(targetPath);
  } catch {
    throw new Error(`${description} 不存在: ${targetPath}`);
  }
}

type ExecFileLike = (
  file: string,
  args: readonly string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  },
) => Promise<{ stdout: string; stderr: string }>;

export async function deployPortableOpenClawRuntime(options: {
  repoRoot: string;
  openclawRuntimeDir: string;
  execFileImpl?: ExecFileLike;
}): Promise<void> {
  const execFileImpl = options.execFileImpl ?? execFileAsync;
  const tempDeployDir = await mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-deploy-"));

  try {
    await execFileImpl(
      resolvePnpmExecutable(process.platform),
      ["--filter", ".", "deploy", "--prod", tempDeployDir],
      {
        cwd: options.repoRoot,
        env: process.env,
      },
    );
    await cp(tempDeployDir, options.openclawRuntimeDir, {
      force: true,
      recursive: true,
      dereference: true,
    });
    await prunePortableOpenClawRuntime(options.openclawRuntimeDir);
    await writeGatewaySidecarBootstrap(options.openclawRuntimeDir);
  } finally {
    await rm(tempDeployDir, { force: true, recursive: true });
  }
}

async function pruneDistForGatewaySidecar(openclawRuntimeDir: string): Promise<void> {
  const distDir = path.join(openclawRuntimeDir, "dist");
  const entries = await readdir(distDir, { withFileTypes: true }).catch(() => null);
  if (!entries) {
    return;
  }

  await Promise.all(
    entries
      .filter((entry) =>
        DIST_PRUNE_PREFIXES.some((prefix) => entry.isFile() && entry.name.startsWith(prefix)),
      )
      .map((entry) => rm(path.join(distDir, entry.name), { force: true })),
  );
}

async function pruneNodeModulesForGatewaySidecar(openclawRuntimeDir: string): Promise<void> {
  const pnpmDir = path.join(openclawRuntimeDir, "node_modules", ".pnpm");
  const pnpmEntries = await readdir(pnpmDir, { withFileTypes: true }).catch(() => null);
  if (!pnpmEntries) {
    return;
  }

  await Promise.all(
    pnpmEntries
      .filter((entry) =>
        PNPM_OPTIONAL_PACKAGE_PREFIXES.some((prefix) => entry.name.startsWith(prefix)),
      )
      .map((entry) => rm(path.join(pnpmDir, entry.name), { force: true, recursive: true })),
  );
}

export async function prunePortableOpenClawRuntime(openclawRuntimeDir: string): Promise<void> {
  await Promise.all(
    SIDEcar_RUNTIME_PRUNE_PATHS.map((relativePath) =>
      rm(path.join(openclawRuntimeDir, relativePath), {
        force: true,
        recursive: true,
      }),
    ),
  );
  await pruneDistForGatewaySidecar(openclawRuntimeDir);
  await pruneNodeModulesForGatewaySidecar(openclawRuntimeDir);
}

export async function writeGatewaySidecarBootstrap(openclawRuntimeDir: string): Promise<void> {
  await writeFile(path.join(openclawRuntimeDir, "openclaw.mjs"), GATEWAY_SIDECAR_BOOTSTRAP, "utf8");
}

export async function prepareGatewaySidecar(options: {
  uiAgentRoot: string;
  repoRoot: string;
  nodeExecutable: string;
  platform: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}): Promise<{
  runtimeDir: string;
  bundledNodePath: string;
  bundledEntryPath: string;
  bundledUiAgentRoot: string;
}> {
  assertSupportedSidecarNodeVersion(TARGET_NODE_VERSION);
  const targetPlatform = resolveSidecarTargetPlatform(options.platform, options.env ?? process.env);
  const nodeExecutable =
    targetPlatform === options.platform
      ? options.nodeExecutable
      : await ensureCrossPlatformNodeExecutable(targetPlatform);
  const runtimeDir = resolveRuntimeResourceDir(options.uiAgentRoot);
  const openclawRuntimeDir = path.join(runtimeDir, "openclaw");
  const uiAgentRuntimeDir = path.join(runtimeDir, resolveBundledUiAgentRootRelativePath());
  const bundledNodePath = path.join(runtimeDir, resolveBundledNodeRelativePath(targetPlatform));
  const bundledNodeDir = path.dirname(bundledNodePath);
  const bundledEntryPath = path.join(runtimeDir, resolveBundledOpenClawEntryRelativePath());
  const bundledUiAgentRoot = path.join(runtimeDir, resolveBundledUiAgentRootRelativePath());

  await ensurePathExists(nodeExecutable, "Node 可执行文件");
  await ensurePathExists(
    path.join(options.repoRoot, "dist", GATEWAY_SIDECAR_ENTRY_BASENAME),
    "OpenClaw 桌面 sidecar 构建产物",
  );

  await rm(runtimeDir, { force: true, recursive: true });
  await mkdir(bundledNodeDir, { recursive: true });
  await deployPortableOpenClawRuntime({
    repoRoot: options.repoRoot,
    openclawRuntimeDir,
  });

  await cp(nodeExecutable, bundledNodePath, { force: true });
  if (targetPlatform !== "win32") {
    await chmod(bundledNodePath, 0o755);
  }

  const uiAgentOutDir = path.join(options.uiAgentRoot, "out");
  try {
    await stat(uiAgentOutDir);
    await mkdir(uiAgentRuntimeDir, { recursive: true });
    await cp(uiAgentOutDir, uiAgentRuntimeDir, {
      force: true,
      recursive: true,
    });
  } catch {
    // Dev mode may run before static assets are exported. Packaged builds prepare them first.
  }

  return {
    runtimeDir,
    bundledNodePath,
    bundledEntryPath,
    bundledUiAgentRoot,
  };
}
