import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareGatewaySidecar } from "./prepare-gateway-sidecar.shared";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_UI_AGENT_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_REPO_ROOT = path.resolve(DEFAULT_UI_AGENT_ROOT, "..");

async function main() {
  const result = await prepareGatewaySidecar({
    uiAgentRoot: DEFAULT_UI_AGENT_ROOT,
    repoRoot: DEFAULT_REPO_ROOT,
    nodeExecutable: process.execPath,
    env: process.env,
    platform: process.platform,
  });
  console.log(`gateway runtime prepared at ${result.runtimeDir}`);
  console.log(`bundled node: ${result.bundledNodePath}`);
  console.log(`bundled entry: ${result.bundledEntryPath}`);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
