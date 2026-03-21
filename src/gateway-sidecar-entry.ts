import { enableCompileCache } from "node:module";
import process from "node:process";
import { runGatewayCommandForSidecar, type GatewayRunOpts } from "./cli/gateway-cli/run.js";
import { normalizeWindowsArgv } from "./cli/windows-argv.js";
import { loadDotEnv } from "./infra/dotenv.js";
import { normalizeEnv } from "./infra/env.js";
import { assertSupportedRuntime } from "./infra/runtime-guard.js";
import { installProcessWarningFilter } from "./infra/warning-filter.js";

const BOOLEAN_FLAG_MAP = {
  "--tailscale-reset-on-exit": "tailscaleResetOnExit",
  "--allow-unconfigured": "allowUnconfigured",
  "--force": "force",
  "--verbose": "verbose",
  "--claude-cli-logs": "claudeCliLogs",
  "--compact": "compact",
  "--raw-stream": "rawStream",
  "--dev": "dev",
  "--reset": "reset",
} as const satisfies Record<string, keyof GatewayRunOpts>;

const VALUE_FLAG_MAP = {
  "--port": "port",
  "--bind": "bind",
  "--token": "token",
  "--auth": "auth",
  "--password": "password",
  "--password-file": "passwordFile",
  "--tailscale": "tailscale",
  "--ws-log": "wsLog",
  "--raw-stream-path": "rawStreamPath",
} as const satisfies Record<string, keyof GatewayRunOpts>;

function stripGatewayRunPrefix(argv: string[]): string[] {
  const next = [...argv];
  if (next[0] === "gateway") {
    next.shift();
  }
  if (next[0] === "run") {
    next.shift();
  }
  return next;
}

function parseGatewaySidecarArgs(argv: string[]): GatewayRunOpts {
  const opts: GatewayRunOpts = {};
  const args = stripGatewayRunPrefix(argv);

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token) {
      continue;
    }
    if (token in BOOLEAN_FLAG_MAP) {
      const key = BOOLEAN_FLAG_MAP[token as keyof typeof BOOLEAN_FLAG_MAP];
      opts[key] = true;
      continue;
    }
    if (token in VALUE_FLAG_MAP) {
      const key = VALUE_FLAG_MAP[token as keyof typeof VALUE_FLAG_MAP];
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${token}`);
      }
      opts[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unsupported gateway sidecar argument: ${token}`);
  }

  return opts;
}

export async function runGatewaySidecarEntry(argv: string[] = process.argv): Promise<void> {
  process.title = "openclaw-gateway";
  installProcessWarningFilter();
  loadDotEnv({ quiet: true });
  normalizeEnv();
  assertSupportedRuntime();

  if (!process.env.NODE_DISABLE_COMPILE_CACHE) {
    try {
      enableCompileCache();
    } catch {
      // Best-effort only.
    }
  }

  const normalizedArgv = normalizeWindowsArgv(argv);
  const opts = parseGatewaySidecarArgs(normalizedArgv.slice(2));
  await runGatewayCommandForSidecar(opts);
}

await runGatewaySidecarEntry();
