import { readdir, rm } from "node:fs/promises";
import path from "node:path";

const BUILD_PROFILES = ["debug", "release"] as const;

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await readdir(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function collectTauriRuntimeStagingDirs(srcTauriRoot: string): Promise<string[]> {
  const targetRoot = path.join(srcTauriRoot, "target");
  let targetEntries: string[] = [];

  try {
    targetEntries = await readdir(targetRoot);
  } catch {
    return [];
  }

  const runtimeDirs = new Set<string>();

  for (const profile of BUILD_PROFILES) {
    const directRuntimeDir = path.join(targetRoot, profile, "runtime");
    if (await pathExists(directRuntimeDir)) {
      runtimeDirs.add(directRuntimeDir);
    }
  }

  for (const entry of targetEntries) {
    for (const profile of BUILD_PROFILES) {
      const nestedRuntimeDir = path.join(targetRoot, entry, profile, "runtime");
      if (await pathExists(nestedRuntimeDir)) {
        runtimeDirs.add(nestedRuntimeDir);
      }
    }
  }

  return [...runtimeDirs].sort();
}

export async function clearTauriRuntimeStagingDirs(srcTauriRoot: string): Promise<string[]> {
  const runtimeDirs = await collectTauriRuntimeStagingDirs(srcTauriRoot);

  for (const runtimeDir of runtimeDirs) {
    await rm(runtimeDir, { force: true, recursive: true });
  }

  return runtimeDirs;
}
