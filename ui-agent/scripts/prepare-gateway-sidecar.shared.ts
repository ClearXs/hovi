import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { builtinModules } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DESKTOP_TARGET_ENV_KEY = "OPENCLAW_UI_AGENT_DESKTOP_TARGET";
const TARGET_NODE_VERSION = process.versions.node;
const MIN_SIDECAR_NODE_MAJOR = 22;
const MIN_SIDECAR_NODE_MINOR = 12;
const PNPM_VIRTUAL_STORE_MAX_LENGTH = 40;
const BAILEYS_LIBSIGNAL_DEPLOY_OVERRIDE_KEY = "@whiskeysockets/baileys>libsignal";
const BAILEYS_LIBSIGNAL_DEPLOY_OVERRIDE_VALUE =
  "https://codeload.github.com/whiskeysockets/libsignal-node/tar.gz/1c30d7d7e76a3b0aa120b04dc6a26f5a12dccf67";
const GATEWAY_SIDECAR_ENTRY_BASENAME = "gateway-sidecar-entry.js";
const GATEWAY_SIDECAR_BOOTSTRAP = `#!/usr/bin/env node\nimport "./dist/${GATEWAY_SIDECAR_ENTRY_BASENAME}";\n`;
const GATEWAY_SIDECAR_RUNTIME_LAYOUT_VERSION = 2;
const PREPARED_RUNTIME_HASH_BASENAME = ".prepare-gateway-sidecar.hash";
const PREPARED_UI_AGENT_HASH_BASENAME = ".prepare-gateway-sidecar.ui.hash";
const PREPARED_RUNTIME_HASH_IGNORED_RELATIVE_PATHS = new Set([
  "repo/dist/.buildstamp",
  "repo/dist/build-info.json",
]);
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
const JS_RUNTIME_FILE_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const PACKAGE_SPECIFIER_PATTERN = /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:\/[a-z0-9._-]+)*$/i;
const NODE_BUILTIN_MODULES = new Set<string>(
  builtinModules.flatMap((name) =>
    name.startsWith("node:") ? [name, name.slice(5)] : [name, `node:${name}`],
  ),
);

function debugPrepareGatewaySidecar(message: string): void {
  if (process.env.OPENCLAW_DEBUG_PREPARE_GATEWAY_SIDECAR === "1") {
    console.error(`[prepare-gateway-sidecar] ${message}`);
  }
}

// Bun exposes "undici" as builtin, but the gateway runtime (Node) loads it from node_modules.
NODE_BUILTIN_MODULES.delete("undici");
NODE_BUILTIN_MODULES.delete("node:undici");
NODE_BUILTIN_MODULES.delete("ws");
NODE_BUILTIN_MODULES.delete("node:ws");

// 扁平的 node_modules/ 下要删除的包名（pnpm deploy 产生扁平结构，不是 .pnpm store 格式）
const SIDECAR_UNWANTED_PACKAGES: readonly string[] = [
  // 本地 AI 推理（gateway 不需要）
  "node-llama-cpp",
  "koffi",
  "onnxruntime-common",
  "onnxruntime-node",
  // 其他工具库
  "pdfjs-dist",
  "@napi-rs/canvas",
  "sharp",
  "playwright-core",
  // 可选的对等依赖
  "@napi-rs/canvas",
] as const;

const SIDECAR_UNWANTED_VIRTUAL_STORE_PREFIXES: readonly string[] = [
  "node-llama-cpp@",
  "@node-llama-cpp+",
  "onnxruntime-common@",
  "onnxruntime-node@",
  "koffi@",
  "pdfjs-dist@",
  "sharp@",
  "playwright-core@",
  "@napi-rs+canvas@",
] as const;

function isSidecarPrunedOptionalPackage(packageName: string): boolean {
  return SIDECAR_UNWANTED_PACKAGES.some(
    (pkg) => packageName === pkg || packageName.startsWith(`${pkg}/`),
  );
}

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

export function isDirectScriptExecution(
  importMetaUrl: string,
  entryArg: string | undefined,
  currentWorkingDir: string = process.cwd(),
): boolean {
  if (!entryArg) {
    return false;
  }

  return importMetaUrl === pathToFileURL(path.resolve(currentWorkingDir, entryArg)).href;
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

type RenameLike = (from: string, to: string) => Promise<void>;

type CopyDirLike = (
  source: string,
  destination: string,
  options: {
    force: boolean;
    recursive: boolean;
  },
) => Promise<void>;

type DeployPortableOpenClawRuntimeLike = (options: {
  repoRoot: string;
  openclawRuntimeDir: string;
  execFileImpl?: ExecFileLike;
  renameImpl?: RenameLike;
  copyImpl?: CopyDirLike;
}) => Promise<void>;

type PrepareGatewaySidecarLike = typeof prepareGatewaySidecar;

function asNonEmptyText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value instanceof Buffer) {
    const trimmed = value.toString("utf8").trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function formatDeployFailure(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error(`pnpm deploy --prod --offline failed: ${String(error)}`);
  }

  const stderr = asNonEmptyText((error as { stderr?: unknown }).stderr);
  if (stderr) {
    return new Error(`pnpm deploy --prod --offline failed: ${stderr}`);
  }

  const stdout = asNonEmptyText((error as { stdout?: unknown }).stdout);
  if (stdout) {
    return new Error(`pnpm deploy --prod --offline failed (stdout): ${stdout}`);
  }

  return new Error(`pnpm deploy --prod --offline failed: ${error.message}`);
}

type RootPackageJsonLike = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  pnpm?: {
    overrides?: Record<string, string>;
  };
};

function collectRootRuntimeDependencyNames(rootPackageJson: RootPackageJsonLike): string[] {
  return [
    ...new Set([
      ...Object.keys(rootPackageJson.dependencies ?? {}),
      ...Object.keys(rootPackageJson.optionalDependencies ?? {}),
    ]),
  ].sort((left, right) => left.localeCompare(right));
}

function parseJsonRecord(value: string | undefined): Record<string, string> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

async function resolveDeployOverridesArg(
  repoRoot: string,
  baseEnv: NodeJS.ProcessEnv,
): Promise<string> {
  const rootPackageJsonRaw = await readFile(path.join(repoRoot, "package.json"), "utf8").catch(
    () => null,
  );
  const rootPackageJson = rootPackageJsonRaw
    ? (JSON.parse(rootPackageJsonRaw) as RootPackageJsonLike)
    : null;

  const overrides = {
    ...(rootPackageJson?.pnpm?.overrides ?? {}),
    ...parseJsonRecord(baseEnv.npm_config_overrides),
  };

  if (!overrides[BAILEYS_LIBSIGNAL_DEPLOY_OVERRIDE_KEY]) {
    overrides[BAILEYS_LIBSIGNAL_DEPLOY_OVERRIDE_KEY] = BAILEYS_LIBSIGNAL_DEPLOY_OVERRIDE_VALUE;
  }

  return `--config.overrides=${JSON.stringify(overrides)}`;
}

async function hashPathMetadata(
  hash: ReturnType<typeof createHash>,
  absolutePath: string,
  relativePath: string,
): Promise<void> {
  if (PREPARED_RUNTIME_HASH_IGNORED_RELATIVE_PATHS.has(relativePath)) {
    return;
  }

  const entry = await lstat(absolutePath).catch(() => null);
  if (!entry) {
    hash.update(relativePath);
    hash.update("\0missing\0");
    return;
  }

  if (entry.isSymbolicLink()) {
    hash.update(relativePath);
    hash.update("\0symlink\0");
    hash.update((await readlink(absolutePath).catch(() => "")) || "");
    hash.update("\0");
    return;
  }

  if (entry.isDirectory()) {
    hash.update(relativePath);
    hash.update("\0dir\0");
    const entries = await readdir(absolutePath);
    entries.sort((left, right) => left.localeCompare(right));
    for (const child of entries) {
      await hashPathMetadata(hash, path.join(absolutePath, child), `${relativePath}/${child}`);
    }
    return;
  }

  hash.update(relativePath);
  hash.update("\0file\0");
  hash.update(await readFile(absolutePath));
  hash.update("\0");
}

async function computePreparedOpenClawRuntimeHash(options: {
  repoRoot: string;
  targetPlatform: NodeJS.Platform;
}): Promise<string> {
  const hash = createHash("sha256");
  hash.update(`target:${options.targetPlatform}\0`);
  hash.update(`node:${TARGET_NODE_VERSION}\0`);
  hash.update(`runtime-layout:${GATEWAY_SIDECAR_RUNTIME_LAYOUT_VERSION}\0`);

  const inputs = [
    {
      absolutePath: path.join(options.repoRoot, "package.json"),
      relativePath: "repo/package.json",
    },
    {
      absolutePath: path.join(options.repoRoot, "pnpm-lock.yaml"),
      relativePath: "repo/pnpm-lock.yaml",
    },
    {
      absolutePath: path.join(options.repoRoot, "dist"),
      relativePath: "repo/dist",
    },
  ];

  for (const input of inputs) {
    await hashPathMetadata(hash, input.absolutePath, input.relativePath);
  }

  return hash.digest("hex");
}

async function computePreparedUiAgentHash(options: { uiAgentRoot: string }): Promise<string> {
  const hash = createHash("sha256");
  await hashPathMetadata(hash, path.join(options.uiAgentRoot, "out"), "ui-agent/out");
  return hash.digest("hex");
}

async function checkPreparedOpenClawRuntimeUpToDate(options: {
  runtimeDir: string;
  openclawRuntimeDir: string;
  bundledNodePath: string;
  bundledEntryPath: string;
  expectedHash: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const hashPath = path.join(options.runtimeDir, PREPARED_RUNTIME_HASH_BASENAME);
  const storedHash = (await readFile(hashPath, "utf8").catch(() => "")).trim();
  if (!storedHash || storedHash !== options.expectedHash) {
    return { ok: false, reason: `hash-mismatch:${storedHash || "missing"}` };
  }

  const requiredPaths = [
    options.openclawRuntimeDir,
    options.bundledNodePath,
    options.bundledEntryPath,
  ];
  for (const requiredPath of requiredPaths) {
    const exists = await stat(requiredPath)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      return { ok: false, reason: `missing:${requiredPath}` };
    }
  }

  const bootstrap = await readFile(
    path.join(options.openclawRuntimeDir, "openclaw.mjs"),
    "utf8",
  ).catch(() => null);
  if (bootstrap !== GATEWAY_SIDECAR_BOOTSTRAP) {
    return { ok: false, reason: "bootstrap-mismatch" };
  }

  return { ok: true };
}

async function checkPreparedUiAgentUpToDate(options: {
  runtimeDir: string;
  bundledUiAgentRoot: string;
  uiAgentOutDir: string;
  expectedHash: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const uiAgentOutExists = await stat(options.uiAgentOutDir)
    .then(() => true)
    .catch(() => false);
  if (!uiAgentOutExists) {
    return { ok: true };
  }

  const hashPath = path.join(options.runtimeDir, PREPARED_UI_AGENT_HASH_BASENAME);
  const storedHash = (await readFile(hashPath, "utf8").catch(() => "")).trim();
  if (!storedHash || storedHash !== options.expectedHash) {
    return { ok: false, reason: `ui-hash-mismatch:${storedHash || "missing"}` };
  }

  return stat(options.bundledUiAgentRoot)
    .then(() => ({ ok: true }) as const)
    .catch(() => ({ ok: false, reason: `missing:${options.bundledUiAgentRoot}` }) as const);
}

export async function deployPortableOpenClawRuntime(options: {
  repoRoot: string;
  openclawRuntimeDir: string;
  execFileImpl?: ExecFileLike;
  renameImpl?: RenameLike;
  copyImpl?: CopyDirLike;
}): Promise<void> {
  const execFileImpl = options.execFileImpl ?? execFileAsync;
  const renameImpl = options.renameImpl ?? rename;
  const copyImpl = options.copyImpl ?? cp;
  const tempDeployDir = await mkdtemp(path.join(os.tmpdir(), "openclaw-sidecar-deploy-"));
  let stagedFromInstalledNodeModules = false;

  try {
    const sourceRootPackageJsonRaw = await readFile(
      path.join(options.repoRoot, "package.json"),
      "utf8",
    ).catch(() => null);
    const sourceRootPackageJson = sourceRootPackageJsonRaw
      ? (JSON.parse(sourceRootPackageJsonRaw) as RootPackageJsonLike)
      : null;
    const sourceNodeModulesDir = path.join(options.repoRoot, "node_modules");
    const sourceDistDir = path.join(options.repoRoot, "dist");
    const canStageFromInstalledNodeModules =
      process.env.OPENCLAW_FORCE_PNPM_DEPLOY !== "1" &&
      !!sourceRootPackageJson &&
      (await stat(sourceNodeModulesDir)
        .then((entry) => entry.isDirectory())
        .catch(() => false)) &&
      (await stat(sourceDistDir)
        .then((entry) => entry.isDirectory())
        .catch(() => false));

    if (canStageFromInstalledNodeModules && sourceRootPackageJson) {
      debugPrepareGatewaySidecar("staging runtime from installed node_modules");
      stagedFromInstalledNodeModules = true;
      await stageRuntimeFromInstalledNodeModules({
        repoRoot: options.repoRoot,
        tempDeployDir,
        rootPackageJson: sourceRootPackageJson,
        sourceNodeModulesDir,
        copyImpl,
      });
    } else {
      stagedFromInstalledNodeModules = false;
      debugPrepareGatewaySidecar("falling back to pnpm deploy");
      const deployOverridesArg = await resolveDeployOverridesArg(options.repoRoot, process.env);
      try {
        await execFileImpl(
          resolvePnpmExecutable(process.platform),
          [
            `--config.virtual-store-dir-max-length=${PNPM_VIRTUAL_STORE_MAX_LENGTH}`,
            deployOverridesArg,
            "--filter",
            ".",
            "deploy",
            "--prod",
            "--offline",
            tempDeployDir,
          ],
          {
            cwd: options.repoRoot,
            env: process.env,
          },
        );
      } catch (error) {
        throw formatDeployFailure(error);
      }
    }
    await mkdir(path.dirname(options.openclawRuntimeDir), { recursive: true });
    try {
      await renameImpl(tempDeployDir, options.openclawRuntimeDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code !== "EXDEV") {
        throw error;
      }
      await copyImpl(tempDeployDir, options.openclawRuntimeDir, {
        force: true,
        recursive: true,
      });
    }
    await prunePortableOpenClawRuntime(options.openclawRuntimeDir, {
      skipRuntimeDependencyMaterialization: stagedFromInstalledNodeModules,
    });
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
  const nodeModulesDir = path.join(openclawRuntimeDir, "node_modules");
  const entries = await readdir(nodeModulesDir, { withFileTypes: true }).catch(() => null);
  if (!entries) {
    return;
  }

  const toRemove: string[] = [];

  for (const entry of entries) {
    // Handle scoped packages (@scope/name)
    if (entry.name.startsWith("@")) {
      if (!entry.isDirectory()) {
        continue;
      }
      const scopeDir = path.join(nodeModulesDir, entry.name);
      const scopeEntries = await readdir(scopeDir, { withFileTypes: true }).catch(() => null);
      if (!scopeEntries) {
        continue;
      }
      for (const subEntry of scopeEntries) {
        if (!subEntry.isDirectory() && !subEntry.isSymbolicLink()) {
          continue;
        }
        const fullName = `${entry.name}/${subEntry.name}`;
        if (
          SIDECAR_UNWANTED_PACKAGES.some(
            (pkg) => fullName === pkg || fullName.startsWith(`${pkg}/`),
          )
        ) {
          toRemove.push(path.join(scopeDir, subEntry.name));
        }
      }
    } else {
      // Unscoped packages
      if (
        (entry.isDirectory() || entry.isSymbolicLink()) &&
        SIDECAR_UNWANTED_PACKAGES.some((pkg) => !pkg.startsWith("@") && entry.name === pkg)
      ) {
        toRemove.push(path.join(nodeModulesDir, entry.name));
      }
    }
  }

  await Promise.all(toRemove.map((dir) => rm(dir, { force: true, recursive: true })));
}

async function pruneVirtualStoreForGatewaySidecar(openclawRuntimeDir: string): Promise<void> {
  const virtualStoreDir = path.join(openclawRuntimeDir, "node_modules", ".pnpm");
  const entries = await readdir(virtualStoreDir, { withFileTypes: true }).catch(() => null);
  if (!entries) {
    return;
  }

  const toRemove = entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        SIDECAR_UNWANTED_VIRTUAL_STORE_PREFIXES.some((prefix) => entry.name.startsWith(prefix)),
    )
    .map((entry) => path.join(virtualStoreDir, entry.name));

  await Promise.all(toRemove.map((targetPath) => rm(targetPath, { force: true, recursive: true })));
  await pruneDanglingSymlinksRecursively(virtualStoreDir);
}

async function pruneDanglingSymlinksRecursively(rootDir: string): Promise<void> {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => null);
  if (!entries) {
    return;
  }

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isSymbolicLink()) {
      const target = await readlink(entryPath).catch(() => null);
      if (!target) {
        continue;
      }
      const targetPath = path.resolve(path.dirname(entryPath), target);
      const targetExists = await stat(targetPath)
        .then(() => true)
        .catch(() => false);
      if (!targetExists) {
        await rm(entryPath, { force: true, recursive: true });
      }
      continue;
    }

    if (entry.isDirectory()) {
      await pruneDanglingSymlinksRecursively(entryPath);
    }
  }
}

function resolvePackagePathInNodeModules(nodeModulesDir: string, packageName: string): string {
  const parts = packageName.startsWith("@") ? packageName.split("/") : [packageName];
  return path.join(nodeModulesDir, ...parts);
}

async function resolveRealPackagePath(packagePath: string): Promise<string | null> {
  const packageStat = await lstat(packagePath).catch(() => null);
  if (!packageStat) {
    return null;
  }

  if (packageStat.isSymbolicLink()) {
    const linkTarget = await readlink(packagePath).catch(() => null);
    if (!linkTarget) {
      return null;
    }
    const resolvedLinkTarget = path.resolve(path.dirname(packagePath), linkTarget);
    const resolvedLinkTargetExists = await stat(resolvedLinkTarget)
      .then((entryStat) => entryStat.isDirectory())
      .catch(() => false);
    return resolvedLinkTargetExists ? resolvedLinkTarget : null;
  }

  if (packageStat.isDirectory()) {
    return packagePath;
  }

  return null;
}

async function resolvePackagePathInVirtualStore(
  nodeModulesDir: string,
  packageName: string,
): Promise<string | null> {
  const virtualStoreDir = path.join(nodeModulesDir, ".pnpm");
  const entries = await readdir(virtualStoreDir, { withFileTypes: true }).catch(() => null);
  if (!entries) {
    return null;
  }

  const parts = packageName.startsWith("@") ? packageName.split("/") : [packageName];
  const virtualStoreBaseName = packageName.startsWith("@")
    ? packageName.replace("/", "+")
    : packageName;
  const preferredPrefixes = [
    `${virtualStoreBaseName}@`,
    `${virtualStoreBaseName}_`,
    virtualStoreBaseName,
  ];

  const preferredEntries = entries.filter(
    (entry) =>
      entry.isDirectory() && preferredPrefixes.some((prefix) => entry.name.startsWith(prefix)),
  );

  for (const entry of preferredEntries) {
    const candidatePath = path.join(virtualStoreDir, entry.name, "node_modules", ...parts);
    const exists = await stat(candidatePath)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      return candidatePath;
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || preferredPrefixes.some((prefix) => entry.name.startsWith(prefix))) {
      continue;
    }
    const candidatePath = path.join(virtualStoreDir, entry.name, "node_modules", ...parts);
    const exists = await stat(candidatePath)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      return candidatePath;
    }
  }
  return null;
}

async function resolvePackagePathFromSourceNodeModulesDir(
  rootNodeModulesDir: string,
  sourceNodeModulesDir: string,
  packageName: string,
): Promise<string | null> {
  const sourceCandidate = resolvePackagePathInNodeModules(sourceNodeModulesDir, packageName);
  const sourceFromSourceDir = await resolveRealPackagePath(sourceCandidate);
  if (sourceFromSourceDir) {
    return sourceFromSourceDir;
  }

  if (sourceNodeModulesDir !== rootNodeModulesDir) {
    const sourceFromRootNodeModulesDir = await resolveRealPackagePath(
      resolvePackagePathInNodeModules(rootNodeModulesDir, packageName),
    );
    if (sourceFromRootNodeModulesDir) {
      return sourceFromRootNodeModulesDir;
    }
  }

  return resolvePackagePathInVirtualStore(rootNodeModulesDir, packageName);
}

async function stageRuntimeFromInstalledNodeModules(options: {
  repoRoot: string;
  tempDeployDir: string;
  rootPackageJson: RootPackageJsonLike;
  sourceNodeModulesDir: string;
  copyImpl?: CopyDirLike;
}): Promise<void> {
  const copyImpl = options.copyImpl ?? cp;
  const sourceDistDir = path.join(options.repoRoot, "dist");
  await copyImpl(sourceDistDir, path.join(options.tempDeployDir, "dist"), {
    force: true,
    recursive: true,
  });
  await writeFile(
    path.join(options.tempDeployDir, "package.json"),
    JSON.stringify(options.rootPackageJson, null, 2),
    "utf8",
  );

  const targetNodeModulesDir = path.join(options.tempDeployDir, "node_modules");
  await mkdir(targetNodeModulesDir, { recursive: true });
  const seen = new Set<string>();

  for (const dependencyName of collectRootRuntimeDependencyNames(options.rootPackageJson)) {
    if (
      NODE_BUILTIN_MODULES.has(dependencyName) ||
      isSidecarPrunedOptionalPackage(dependencyName)
    ) {
      continue;
    }

    await materializePackageDependencyTree(
      options.sourceNodeModulesDir,
      options.sourceNodeModulesDir,
      targetNodeModulesDir,
      dependencyName,
      seen,
    );
  }
}

async function copyPackageWithoutNestedNodeModules(
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  await cp(sourcePath, targetPath, {
    force: true,
    recursive: true,
    dereference: true,
    // Package-local node_modules get materialized separately via the dependency walk.
    filter: (entryPath) => {
      const relativePath = path.relative(sourcePath, entryPath);
      if (!relativePath) {
        return true;
      }
      return !relativePath.split(path.sep).includes("node_modules");
    },
  });
}

async function materializePackageAtNodeModulesPath(options: {
  sourceRootNodeModulesDir: string;
  sourceNodeModulesDir: string;
  targetNodeModulesDir: string;
  packageName: string;
}): Promise<{ sourcePath: string; targetPath: string } | null> {
  const sourcePath = await resolvePackagePathFromSourceNodeModulesDir(
    options.sourceRootNodeModulesDir,
    options.sourceNodeModulesDir,
    options.packageName,
  );
  if (!sourcePath) {
    return null;
  }

  const targetPath = resolvePackagePathInNodeModules(
    options.targetNodeModulesDir,
    options.packageName,
  );
  const targetPathIsRealDir = await resolveRealPackagePath(targetPath).then(
    (resolvedTargetPath) => resolvedTargetPath === targetPath,
  );
  if (!targetPathIsRealDir) {
    await rm(targetPath, { force: true, recursive: true });
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyPackageWithoutNestedNodeModules(sourcePath, targetPath);
  }

  return {
    sourcePath,
    targetPath,
  };
}

type PackageJsonLike = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

async function readNodeModulesPackageJson(packagePath: string): Promise<PackageJsonLike | null> {
  const packageJsonPath = path.join(packagePath, "package.json");
  const raw = await readFile(packageJsonPath, "utf8").catch(() => null);
  if (!raw) {
    return null;
  }

  return JSON.parse(raw) as PackageJsonLike;
}

function collectRequiredDependencyNames(packageJson: PackageJsonLike): string[] {
  return packageJson.dependencies ? Object.keys(packageJson.dependencies) : [];
}

async function materializePackageDependencyTree(
  rootNodeModulesDir: string,
  sourceNodeModulesDir: string,
  targetNodeModulesDir: string,
  packageName: string,
  seen: Set<string>,
): Promise<void> {
  const visitKey = `${targetNodeModulesDir}:${packageName}`;
  if (seen.has(visitKey)) {
    return;
  }
  seen.add(visitKey);

  const materialized = await materializePackageAtNodeModulesPath({
    sourceRootNodeModulesDir: rootNodeModulesDir,
    sourceNodeModulesDir,
    targetNodeModulesDir,
    packageName,
  });
  if (!materialized) {
    return;
  }

  const packageJson = await readNodeModulesPackageJson(materialized.targetPath);
  if (!packageJson || collectRequiredDependencyNames(packageJson).length === 0) {
    return;
  }

  const nextSourceNodeModulesDir = path.dirname(materialized.sourcePath);
  const nextTargetNodeModulesDir = path.join(materialized.targetPath, "node_modules");
  for (const dependencyName of collectRequiredDependencyNames(packageJson)) {
    if (
      NODE_BUILTIN_MODULES.has(dependencyName) ||
      isSidecarPrunedOptionalPackage(dependencyName)
    ) {
      continue;
    }
    await materializePackageDependencyTree(
      rootNodeModulesDir,
      nextSourceNodeModulesDir,
      nextTargetNodeModulesDir,
      dependencyName,
      seen,
    );
  }
}

async function resolveInstalledPackagePathForVerification(
  rootNodeModulesDir: string,
  targetNodeModulesDir: string,
  packageName: string,
): Promise<string | null> {
  const localPackagePath = await resolveRealPackagePath(
    resolvePackagePathInNodeModules(targetNodeModulesDir, packageName),
  );
  if (localPackagePath) {
    return localPackagePath;
  }

  if (targetNodeModulesDir !== rootNodeModulesDir) {
    return resolveRealPackagePath(resolvePackagePathInNodeModules(rootNodeModulesDir, packageName));
  }

  return null;
}

async function verifyPackageDependencyTree(
  rootNodeModulesDir: string,
  targetNodeModulesDir: string,
  packageName: string,
  seen: Set<string>,
  missingPackages: Set<string>,
): Promise<void> {
  const visitKey = `${targetNodeModulesDir}:${packageName}`;
  if (seen.has(visitKey)) {
    return;
  }
  seen.add(visitKey);

  const packagePath = await resolveInstalledPackagePathForVerification(
    rootNodeModulesDir,
    targetNodeModulesDir,
    packageName,
  );
  if (!packagePath) {
    missingPackages.add(packageName);
    return;
  }

  const packageJson = await readNodeModulesPackageJson(packagePath);
  if (!packageJson) {
    missingPackages.add(packageName);
    return;
  }

  const nextTargetNodeModulesDir = path.join(packagePath, "node_modules");
  for (const dependencyName of collectRequiredDependencyNames(packageJson)) {
    if (
      NODE_BUILTIN_MODULES.has(dependencyName) ||
      isSidecarPrunedOptionalPackage(dependencyName)
    ) {
      continue;
    }
    await verifyPackageDependencyTree(
      rootNodeModulesDir,
      nextTargetNodeModulesDir,
      dependencyName,
      seen,
      missingPackages,
    );
  }
}

async function materializeClackPromptDependencies(openclawRuntimeDir: string): Promise<void> {
  const nodeModulesDir = path.join(openclawRuntimeDir, "node_modules");
  const promptsPackageJsonPath = path.join(nodeModulesDir, "@clack", "prompts", "package.json");
  const promptsPackageJsonRaw = await readFile(promptsPackageJsonPath, "utf8").catch(() => null);
  if (!promptsPackageJsonRaw) {
    return;
  }

  const parsed = JSON.parse(promptsPackageJsonRaw) as { dependencies?: Record<string, string> };
  const deps = parsed.dependencies ? Object.keys(parsed.dependencies) : [];
  const seen = new Set<string>();
  for (const dep of deps) {
    await materializePackageDependencyTree(
      nodeModulesDir,
      nodeModulesDir,
      nodeModulesDir,
      dep,
      seen,
    );
  }
}

function resolveBareImportPackageName(specifier: string): string | null {
  const normalizedSpecifier = specifier.trim().split(/[?#]/, 1)[0] ?? "";
  if (!normalizedSpecifier || !PACKAGE_SPECIFIER_PATTERN.test(normalizedSpecifier)) {
    return null;
  }

  if (
    normalizedSpecifier.startsWith(".") ||
    normalizedSpecifier.startsWith("/") ||
    normalizedSpecifier.startsWith("node:") ||
    normalizedSpecifier.startsWith("file:") ||
    normalizedSpecifier.startsWith("data:")
  ) {
    return null;
  }

  if (normalizedSpecifier.startsWith("@")) {
    const [scope, name] = normalizedSpecifier.split("/");
    if (!scope || !name) {
      return null;
    }
    return `${scope}/${name}`;
  }

  const [name] = normalizedSpecifier.split("/");
  return name || null;
}

function collectImportSpecifiers(sourceCode: string): Set<string> {
  const specifiers = new Set<string>();
  const patterns = [
    /\bimport\s+[^'"]*?\sfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bexport\s+[^'"]*?\sfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g,
    /\brequire\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of sourceCode.matchAll(pattern)) {
      const specifier = match[1]?.trim();
      if (specifier) {
        specifiers.add(specifier);
      }
    }
  }

  return specifiers;
}

function normalizeRuntimeLocalImport(specifier: string): string {
  return specifier.trim().split(/[?#]/, 1)[0] ?? "";
}

async function resolveRuntimeLocalImport(
  fromFile: string,
  specifier: string,
): Promise<string | null> {
  const normalizedSpecifier = normalizeRuntimeLocalImport(specifier);
  if (!normalizedSpecifier || normalizedSpecifier.startsWith("/")) {
    return null;
  }
  if (!(normalizedSpecifier.startsWith("./") || normalizedSpecifier.startsWith("../"))) {
    return null;
  }

  const basePath = path.resolve(path.dirname(fromFile), normalizedSpecifier);
  const candidates = [
    basePath,
    ...[...JS_RUNTIME_FILE_EXTENSIONS].map((ext) => `${basePath}${ext}`),
    ...[...JS_RUNTIME_FILE_EXTENSIONS].map((ext) => path.join(basePath, `index${ext}`)),
  ];

  for (const candidate of candidates) {
    const isFile = await stat(candidate)
      .then((entryStat) => entryStat.isFile())
      .catch(() => false);
    if (isFile) {
      return candidate;
    }
  }

  return null;
}

async function collectRuntimeImportPackages(openclawRuntimeDir: string): Promise<Set<string>> {
  const runtimeEntryPath = path.join(openclawRuntimeDir, "dist", GATEWAY_SIDECAR_ENTRY_BASENAME);
  const runtimeEntryExists = await stat(runtimeEntryPath)
    .then(() => true)
    .catch(() => false);
  if (!runtimeEntryExists) {
    return new Set();
  }

  const pendingFiles = [runtimeEntryPath];
  const visitedFiles = new Set<string>();
  const packages = new Set<string>();
  while (pendingFiles.length > 0) {
    const runtimeFile = pendingFiles.pop();
    if (!runtimeFile || visitedFiles.has(runtimeFile)) {
      continue;
    }
    visitedFiles.add(runtimeFile);

    const sourceCode = await readFile(runtimeFile, "utf8").catch(() => null);
    if (!sourceCode) {
      continue;
    }
    const specifiers = collectImportSpecifiers(sourceCode);
    for (const specifier of specifiers) {
      const normalizedSpecifier = normalizeRuntimeLocalImport(specifier);
      if (normalizedSpecifier.startsWith("./") || normalizedSpecifier.startsWith("../")) {
        const resolvedLocalImport = await resolveRuntimeLocalImport(
          runtimeFile,
          normalizedSpecifier,
        );
        if (resolvedLocalImport && !visitedFiles.has(resolvedLocalImport)) {
          pendingFiles.push(resolvedLocalImport);
        }
        continue;
      }

      const packageName = resolveBareImportPackageName(specifier);
      if (
        !packageName ||
        NODE_BUILTIN_MODULES.has(packageName) ||
        isSidecarPrunedOptionalPackage(packageName)
      ) {
        continue;
      }
      packages.add(packageName);
    }
  }

  return packages;
}

async function materializeRuntimeImportPackages(openclawRuntimeDir: string): Promise<void> {
  const nodeModulesDir = path.join(openclawRuntimeDir, "node_modules");
  const packages = await collectRuntimeImportPackages(openclawRuntimeDir);
  const seen = new Set<string>();
  for (const packageName of packages) {
    await materializePackageDependencyTree(
      nodeModulesDir,
      nodeModulesDir,
      nodeModulesDir,
      packageName,
      seen,
    );
  }
}

async function verifyRuntimeImportPackages(openclawRuntimeDir: string): Promise<void> {
  const nodeModulesDir = path.join(openclawRuntimeDir, "node_modules");
  const packages = await collectRuntimeImportPackages(openclawRuntimeDir);
  const missingPackages = new Set<string>();
  const seen = new Set<string>();

  for (const packageName of packages) {
    await verifyPackageDependencyTree(
      nodeModulesDir,
      nodeModulesDir,
      packageName,
      seen,
      missingPackages,
    );
  }

  if (missingPackages.size === 0) {
    return;
  }

  const sortedMissingPackages = [...missingPackages].sort();
  throw new Error(
    `gateway sidecar runtime missing imported packages: ${sortedMissingPackages.join(", ")}`,
  );
}

export async function prunePortableOpenClawRuntime(
  openclawRuntimeDir: string,
  options?: {
    skipRuntimeDependencyMaterialization?: boolean;
  },
): Promise<void> {
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
  await pruneVirtualStoreForGatewaySidecar(openclawRuntimeDir);
  if (!options?.skipRuntimeDependencyMaterialization) {
    await materializeClackPromptDependencies(openclawRuntimeDir);
    await materializeRuntimeImportPackages(openclawRuntimeDir);
  }
  await pruneDanglingSymlinksRecursively(path.join(openclawRuntimeDir, "node_modules"));
  await verifyRuntimeImportPackages(openclawRuntimeDir);
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
  deployPortableOpenClawRuntimeImpl?: DeployPortableOpenClawRuntimeLike;
}): Promise<{
  runtimeDir: string;
  bundledNodePath: string;
  bundledEntryPath: string;
  bundledUiAgentRoot: string;
}> {
  debugPrepareGatewaySidecar("start");
  assertSupportedSidecarNodeVersion(TARGET_NODE_VERSION);
  const targetPlatform = resolveSidecarTargetPlatform(options.platform, options.env ?? process.env);
  const deployPortableOpenClawRuntimeImpl =
    options.deployPortableOpenClawRuntimeImpl ?? deployPortableOpenClawRuntime;
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
  const uiAgentOutDir = path.join(options.uiAgentRoot, "out");
  const preparedOpenClawRuntimeHashPath = path.join(runtimeDir, PREPARED_RUNTIME_HASH_BASENAME);
  const preparedUiAgentHashPath = path.join(runtimeDir, PREPARED_UI_AGENT_HASH_BASENAME);

  debugPrepareGatewaySidecar("verifying required inputs");
  await ensurePathExists(nodeExecutable, "Node 可执行文件");
  await ensurePathExists(
    path.join(options.repoRoot, "dist", GATEWAY_SIDECAR_ENTRY_BASENAME),
    "OpenClaw 桌面 sidecar 构建产物",
  );

  debugPrepareGatewaySidecar("computing openclaw runtime hash");
  const expectedPreparedOpenClawRuntimeHash = await computePreparedOpenClawRuntimeHash({
    repoRoot: options.repoRoot,
    targetPlatform,
  });
  debugPrepareGatewaySidecar("checking openclaw runtime cache");
  const openClawUpToDateCheck = await checkPreparedOpenClawRuntimeUpToDate({
    runtimeDir,
    openclawRuntimeDir,
    bundledNodePath,
    bundledEntryPath,
    expectedHash: expectedPreparedOpenClawRuntimeHash,
  });
  if (process.env.OPENCLAW_DEBUG_PREPARE_GATEWAY_SIDECAR === "1" && !openClawUpToDateCheck.ok) {
    console.error(`[prepare-gateway-sidecar] openclaw cache miss: ${openClawUpToDateCheck.reason}`);
  }

  if (!openClawUpToDateCheck.ok) {
    debugPrepareGatewaySidecar("refreshing openclaw runtime bundle");
    await rm(openclawRuntimeDir, { force: true, recursive: true });
    await rm(bundledNodePath, { force: true, recursive: true });
    await mkdir(bundledNodeDir, { recursive: true });
    await deployPortableOpenClawRuntimeImpl({
      repoRoot: options.repoRoot,
      openclawRuntimeDir,
    });

    await cp(nodeExecutable, bundledNodePath, { force: true });
    if (targetPlatform !== "win32") {
      await chmod(bundledNodePath, 0o755);
    }
    await writeFile(
      preparedOpenClawRuntimeHashPath,
      `${expectedPreparedOpenClawRuntimeHash}\n`,
      "utf8",
    );
  }

  debugPrepareGatewaySidecar("computing ui-agent runtime hash");
  const expectedPreparedUiAgentHash = await computePreparedUiAgentHash({
    uiAgentRoot: options.uiAgentRoot,
  });
  debugPrepareGatewaySidecar("checking ui-agent runtime cache");
  const uiAgentUpToDateCheck = await checkPreparedUiAgentUpToDate({
    runtimeDir,
    bundledUiAgentRoot,
    uiAgentOutDir,
    expectedHash: expectedPreparedUiAgentHash,
  });
  if (process.env.OPENCLAW_DEBUG_PREPARE_GATEWAY_SIDECAR === "1" && !uiAgentUpToDateCheck.ok) {
    console.error(`[prepare-gateway-sidecar] ui cache miss: ${uiAgentUpToDateCheck.reason}`);
  }
  try {
    debugPrepareGatewaySidecar("verifying ui-agent out directory");
    await stat(uiAgentOutDir);
    if (!uiAgentUpToDateCheck.ok) {
      debugPrepareGatewaySidecar("refreshing ui-agent runtime bundle");
      await rm(bundledUiAgentRoot, { force: true, recursive: true });
      await mkdir(uiAgentRuntimeDir, { recursive: true });
      await cp(uiAgentOutDir, uiAgentRuntimeDir, {
        force: true,
        recursive: true,
      });
      await writeFile(preparedUiAgentHashPath, `${expectedPreparedUiAgentHash}\n`, "utf8");
    }
  } catch {
    // Dev mode may run before static assets are exported. Packaged builds prepare them first.
  }

  debugPrepareGatewaySidecar("done");
  return {
    runtimeDir,
    bundledNodePath,
    bundledEntryPath,
    bundledUiAgentRoot,
  };
}

export async function runPrepareGatewaySidecarCli(params: {
  uiAgentRoot: string;
  repoRoot: string;
  nodeExecutable: string;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  prepareGatewaySidecarImpl?: PrepareGatewaySidecarLike;
  exit?: (code: number) => void;
  log?: (message: string) => void;
  error?: (message: string) => void;
}): Promise<void> {
  const prepareGatewaySidecarImpl = params.prepareGatewaySidecarImpl ?? prepareGatewaySidecar;
  const exit = params.exit ?? process.exit;
  const log = params.log ?? console.log;
  const error = params.error ?? console.error;

  try {
    const result = await prepareGatewaySidecarImpl({
      uiAgentRoot: params.uiAgentRoot,
      repoRoot: params.repoRoot,
      nodeExecutable: params.nodeExecutable,
      env: params.env,
      platform: params.platform,
    });
    log(`gateway runtime prepared at ${result.runtimeDir}`);
    log(`bundled node: ${result.bundledNodePath}`);
    log(`bundled entry: ${result.bundledEntryPath}`);
    exit(0);
  } catch (cause) {
    error(cause instanceof Error ? cause.message : String(cause));
    exit(1);
  }
}
