import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const NSIS_TAURI_UTILS_URL =
  "https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.1/nsis_tauri_utils.dll";
export const NSIS_TAURI_UTILS_SHA1 = "B053B2E5FDB97257954C8F935D80964F056520AE";

export function shouldPrepareNsisTooling(platform: NodeJS.Platform): boolean {
  return platform === "darwin";
}

export function resolveNsisTauriUtilsCachePath(homeDir: string): string {
  return path.join(
    homeDir,
    "Library",
    "Caches",
    "tauri",
    "NSIS",
    "Plugins",
    "x86-unicode",
    "additional",
    "nsis_tauri_utils.dll",
  );
}

async function sha1ForFile(filePath: string): Promise<string | null> {
  try {
    const contents = await readFile(filePath);
    return createHash("sha1").update(contents).digest("hex").toUpperCase();
  } catch {
    return null;
  }
}

export async function prepareNsisTooling(options: {
  env?: NodeJS.ProcessEnv;
  homeDir: string;
  platform: NodeJS.Platform;
}): Promise<{
  downloaded: boolean;
  skipped: boolean;
  targetPath: string;
}> {
  const targetPath = resolveNsisTauriUtilsCachePath(options.homeDir);

  if (!shouldPrepareNsisTooling(options.platform)) {
    return {
      downloaded: false,
      skipped: true,
      targetPath,
    };
  }

  if ((await sha1ForFile(targetPath)) === NSIS_TAURI_UTILS_SHA1) {
    return {
      downloaded: false,
      skipped: false,
      targetPath,
    };
  }

  await mkdir(path.dirname(targetPath), { recursive: true });

  const tempPath = `${targetPath}.tmp`;
  await rm(tempPath, { force: true });
  await execFileAsync(
    "curl",
    ["-L", "--fail", "--silent", "--show-error", NSIS_TAURI_UTILS_URL, "-o", tempPath],
    { env: options.env },
  );

  const downloadedSha1 = await sha1ForFile(tempPath);
  if (downloadedSha1 !== NSIS_TAURI_UTILS_SHA1) {
    await rm(tempPath, { force: true });
    throw new Error(`NSIS 插件校验失败: ${tempPath}`);
  }

  await rename(tempPath, targetPath);

  return {
    downloaded: true,
    skipped: false,
    targetPath,
  };
}
