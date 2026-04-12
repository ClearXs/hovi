import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isDirectScriptExecution,
  runPrepareGatewaySidecarCli,
} from "./prepare-gateway-sidecar.shared";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_UI_AGENT_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_REPO_ROOT = path.resolve(DEFAULT_UI_AGENT_ROOT, "..");

if (isDirectScriptExecution(import.meta.url, process.argv[1])) {
  void runPrepareGatewaySidecarCli({
    uiAgentRoot: DEFAULT_UI_AGENT_ROOT,
    repoRoot: DEFAULT_REPO_ROOT,
    nodeExecutable: process.execPath,
    env: process.env,
    platform: process.platform,
  });
}
