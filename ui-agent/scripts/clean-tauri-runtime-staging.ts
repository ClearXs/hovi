import path from "node:path";
import { clearTauriRuntimeStagingDirs } from "./clean-tauri-runtime-staging.shared";

async function main(): Promise<void> {
  const uiAgentRoot = path.resolve(__dirname, "..");
  const srcTauriRoot = path.join(uiAgentRoot, "src-tauri");
  const cleanedDirs = await clearTauriRuntimeStagingDirs(srcTauriRoot);

  if (cleanedDirs.length === 0) {
    console.log(`tauri runtime staging already clean under ${srcTauriRoot}`);
    return;
  }

  console.log(`cleaned tauri runtime staging under ${srcTauriRoot}`);
  for (const cleanedDir of cleanedDirs) {
    console.log(`removed ${cleanedDir}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
