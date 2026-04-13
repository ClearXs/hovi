import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { GatewayRequestHandler } from "./types.js";

function getRoot(): string {
  return process.env.OPENCLAW_CLI_SOFTWARE_ROOT ?? path.join(os.homedir(), "clawd", "cli-software");
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CliSoftwareCard = {
  id: string;
  name: string;
  softwareKey: string;
  packageName?: string;
  cliCommand?: string;
  engine: string;
  targetType: string;
  source: string;
  targetLocator: string;
  targetSummary: string;
  generatedRelativePath: string;
};

type CliSoftwareBinding = {
  softwareKey: string;
};

type RespondFn = (ok: boolean, result: unknown, error?: { code: string; message: string }) => void;

// ─── cli.software.list ────────────────────────────────────────────────────────

export const cliSoftwareList: GatewayRequestHandler = function (req) {
  const { params, respond } = req as { params: Record<string, unknown>; respond: RespondFn };
  void params;

  const root = getRoot();
  if (!fs.existsSync(root)) {
    respond(true, { items: [] });
    return;
  }

  const items: CliSoftwareCard[] = [];

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifestPath = path.join(root, entry.name, "MANIFEST.json");
    if (!fs.existsSync(manifestPath)) {
      continue;
    }
    try {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      items.push(JSON.parse(raw) as CliSoftwareCard);
    } catch {
      // skip malformed manifest
    }
  }

  respond(true, { items });
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function deriveSoftwareKey(source: string): string {
  try {
    const url = new URL(source);
    return url.hostname.replace(/[^a-z0-9]/gi, "").toLowerCase();
  } catch {
    // Not a URL: use the last path component, stripped of non-alphanumerics
    const last = source.split("/").filter(Boolean).at(-1) ?? source;
    return last.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  }
}

// ─── cli.software.generate ────────────────────────────────────────────────────

function buildCliAnythingPrompt(params: {
  name?: string;
  source: string;
  targetLocator: string;
  targetSummary: string;
  targetType: string;
}): string {
  const parts = [
    "# CLI-Anything: Software CLI Packaging Session",
    "",
    "Welcome! Let's build a CLI wrapper for your software using the 7-phase methodology.",
    "",
    "## Phase 1 — Codebase Analysis",
    `Source: ${params.source}`,
    `Target type: ${params.targetType}`,
    `Locator: ${params.targetLocator}`,
    `Summary: ${params.targetSummary}`,
    "",
    "## Your Turn",
    "",
    "Please tell me:",
    "1. What software is this? (name, description)",
    "2. What CLI commands or actions should be exposed?",
    "3. Any specific flags, subcommands, or interaction patterns you want?",
  ];
  return parts.join("\n");
}

function buildOpenCliPrompt(params: {
  name?: string;
  source: string;
  targetLocator: string;
  targetSummary: string;
}): string {
  const parts = [
    "# OpenCLI Generation Session",
    "",
    "Let's generate a CLI wrapper for your software using the `opencli` CLI generator.",
    "",
    "## Target Details",
    `URL: ${params.source}`,
    `Locator: ${params.targetLocator}`,
    `Summary: ${params.targetSummary}`,
    "",
    "## Getting Started",
    "",
    "Run the following command to generate the CLI wrapper:",
    "",
    "```bash",
    `opencli generate ${params.source}`,
    "```",
    "",
    "This will parse the page, extract the locator, and scaffold a CLI wrapper ready for customization.",
    "",
    "Once generated, let me know if you'd like help configuring subcommands, adding flags, or publishing the package.",
  ];
  return parts.join("\n");
}

export const cliSoftwareGenerate: GatewayRequestHandler = function (req) {
  const { params, respond } = req as { params: Record<string, unknown>; respond: RespondFn };

  const engine = params.engine as string | undefined;
  if (!engine || (engine !== "cli-anything" && engine !== "opencli")) {
    respond(false, undefined, {
      code: "INVALID_PARAMS",
      message: `Unsupported engine: ${engine}`,
    });
    return;
  }

  const rawSessionKey = (params.sessionKey as string | undefined)?.trim();
  const rawRunId = (params.runId as string | undefined)?.trim();
  const rawSoftwareKey = (params.softwareKey as string | undefined)?.trim();

  const sessionKey = rawSessionKey || `session-${crypto.randomUUID().slice(0, 8)}`;
  const runId = rawRunId || `run-${crypto.randomUUID().slice(0, 8)}`;
  const softwareKey =
    rawSoftwareKey || (params.name as string) || deriveSoftwareKey((params.source as string) ?? "");

  let initialPrompt: string;

  if (engine === "cli-anything") {
    initialPrompt = buildCliAnythingPrompt({
      name: params.name as string,
      source: (params.source as string) ?? "",
      targetLocator: (params.targetLocator as string) ?? "",
      targetSummary: (params.targetSummary as string) ?? "",
      targetType: (params.targetType as string) ?? "url",
    });
  } else {
    initialPrompt = buildOpenCliPrompt({
      name: params.name as string,
      source: (params.source as string) ?? "",
      targetLocator: (params.targetLocator as string) ?? "",
      targetSummary: (params.targetSummary as string) ?? "",
    });
  }

  respond(true, {
    runId,
    sessionKey,
    status: "started",
    softwareKey,
    initialPrompt,
  });
};

// ─── cli.software.binding.list ────────────────────────────────────────────────

export const cliSoftwareBindingList: GatewayRequestHandler = function (req) {
  const { params, respond } = req as { params: Record<string, unknown>; respond: RespondFn };
  void params;

  const bindingsDir = path.join(getRoot(), "bindings");
  if (!fs.existsSync(bindingsDir)) {
    respond(true, { items: [] });
    return;
  }

  const items: Array<{ sessionKey: string; binding: CliSoftwareBinding }> = [];

  for (const file of fs.readdirSync(bindingsDir)) {
    if (!file.endsWith(".json")) {
      continue;
    }
    const sessionKey = file.replace(/\.json$/, "");
    try {
      const raw = fs.readFileSync(path.join(bindingsDir, file), "utf-8");
      items.push({ sessionKey, binding: JSON.parse(raw) as CliSoftwareBinding });
    } catch {
      // skip malformed files
    }
  }

  respond(true, { items });
};

// ─── cli.software.binding.set ────────────────────────────────────────────────

export const cliSoftwareBindingSet: GatewayRequestHandler = function (req) {
  const { params, respond } = req as { params: Record<string, unknown>; respond: RespondFn };

  const sessionKey = params.sessionKey as string | undefined;
  if (!sessionKey) {
    respond(false, undefined, {
      code: "INVALID_PARAMS",
      message: "sessionKey is required",
    });
    return;
  }

  const bindingsDir = path.join(getRoot(), "bindings");
  ensureDir(bindingsDir);

  const binding: CliSoftwareBinding = {
    softwareKey: (params.softwareKey as string) ?? "",
  };

  fs.writeFileSync(path.join(bindingsDir, `${sessionKey}.json`), JSON.stringify(binding, null, 2));

  respond(true, { ok: true });
};

// ─── cli.software.binding.clear ──────────────────────────────────────────────

export const cliSoftwareBindingClear: GatewayRequestHandler = function (req) {
  const { params, respond } = req as { params: Record<string, unknown>; respond: RespondFn };

  const sessionKey = params.sessionKey as string | undefined;
  if (!sessionKey) {
    respond(false, undefined, {
      code: "INVALID_PARAMS",
      message: "sessionKey is required",
    });
    return;
  }

  const filePath = path.join(getRoot(), "bindings", `${sessionKey}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  respond(true, { ok: true });
};

// ─── Handler group export ───────────────────────────────────────────────────

export const cliSoftwareHandlers = {
  "cli.software.list": cliSoftwareList,
  "cli.software.generate": cliSoftwareGenerate,
  "cli.software.binding.list": cliSoftwareBindingList,
  "cli.software.binding.set": cliSoftwareBindingSet,
  "cli.software.binding.clear": cliSoftwareBindingClear,
};
