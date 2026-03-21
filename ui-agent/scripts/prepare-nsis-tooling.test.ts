import path from "node:path";
import {
  resolveNsisTauriUtilsCachePath,
  shouldPrepareNsisTooling,
} from "./prepare-nsis-tooling.shared";

describe("prepare-nsis-tooling", () => {
  it("prepares the NSIS helper only on macOS hosts", () => {
    expect(shouldPrepareNsisTooling("darwin")).toBe(true);
    expect(shouldPrepareNsisTooling("linux")).toBe(false);
    expect(shouldPrepareNsisTooling("win32")).toBe(false);
  });

  it("uses the Tauri NSIS cache path expected by the bundler", () => {
    expect(resolveNsisTauriUtilsCachePath("/Users/demo")).toBe(
      path.join(
        "/Users/demo",
        "Library",
        "Caches",
        "tauri",
        "NSIS",
        "Plugins",
        "x86-unicode",
        "additional",
        "nsis_tauri_utils.dll",
      ),
    );
  });
});
