import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  clearTauriRuntimeStagingDirs,
  collectTauriRuntimeStagingDirs,
} from "./clean-tauri-runtime-staging.shared";

describe("clean-tauri-runtime-staging", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const tempRoot of tempRoots.splice(0, tempRoots.length)) {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it("collects direct and target-specific runtime staging directories", async () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "hovi-runtime-stage-"));
    tempRoots.push(tempRoot);

    const srcTauriRoot = path.join(tempRoot, "src-tauri");
    const directRuntime = path.join(srcTauriRoot, "target", "release", "runtime");
    const tripleRuntime = path.join(
      srcTauriRoot,
      "target",
      "x86_64-pc-windows-msvc",
      "release",
      "runtime",
    );
    mkdirSync(directRuntime, { recursive: true });
    mkdirSync(tripleRuntime, { recursive: true });

    const runtimeDirs = await collectTauriRuntimeStagingDirs(srcTauriRoot);

    expect(runtimeDirs).toEqual([directRuntime, tripleRuntime]);
  });

  it("removes stale runtime staging directories without touching adjacent build outputs", async () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "hovi-runtime-stage-"));
    tempRoots.push(tempRoot);

    const srcTauriRoot = path.join(tempRoot, "src-tauri");
    const directReleaseDir = path.join(srcTauriRoot, "target", "release");
    const tripleReleaseDir = path.join(srcTauriRoot, "target", "x86_64-pc-windows-msvc", "release");
    const directRuntime = path.join(directReleaseDir, "runtime");
    const tripleRuntime = path.join(tripleReleaseDir, "runtime");

    mkdirSync(path.join(directRuntime, "openclaw"), { recursive: true });
    mkdirSync(path.join(tripleRuntime, "openclaw", "dist"), { recursive: true });
    writeFileSync(path.join(directRuntime, "node"), "stale-file");
    writeFileSync(path.join(tripleRuntime, "node.exe"), "stale-win-file");
    writeFileSync(path.join(tripleRuntime, "openclaw.mjs"), "stale-entry");
    writeFileSync(path.join(tripleReleaseDir, "violet.exe"), "keep-me");

    const cleanedDirs = await clearTauriRuntimeStagingDirs(srcTauriRoot);

    expect(cleanedDirs).toEqual([directRuntime, tripleRuntime]);
    expect(existsSync(directRuntime)).toBe(false);
    expect(existsSync(tripleRuntime)).toBe(false);
    expect(existsSync(path.join(tripleReleaseDir, "violet.exe"))).toBe(true);
  });
});
