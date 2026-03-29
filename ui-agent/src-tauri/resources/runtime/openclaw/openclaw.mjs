#!/usr/bin/env node

import fs from "node:fs";
import module from "node:module";
import { fileURLToPath } from "node:url";

const MIN_NODE_MAJOR = 22;
const MIN_NODE_MINOR = 12;
const MIN_NODE_VERSION = `${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}`;

const parseNodeVersion = (rawVersion) => {
  const [majorRaw = "0", minorRaw = "0"] = rawVersion.split(".");
  return {
    major: Number(majorRaw),
    minor: Number(minorRaw),
  };
};

const isSupportedNodeVersion = (version) =>
  version.major > MIN_NODE_MAJOR ||
  (version.major === MIN_NODE_MAJOR && version.minor >= MIN_NODE_MINOR);

const ensureSupportedNodeVersion = () => {
  if (isSupportedNodeVersion(parseNodeVersion(process.versions.node))) {
    return;
  }

  process.stderr.write(
    `openclaw: Node.js v${MIN_NODE_VERSION}+ is required (current: v${process.versions.node}).\n` +
      "If you use nvm, run:\n" +
      `  nvm install ${MIN_NODE_MAJOR}\n` +
      `  nvm use ${MIN_NODE_MAJOR}\n` +
      `  nvm alias default ${MIN_NODE_MAJOR}\n`,
  );
  process.exit(1);
};

ensureSupportedNodeVersion();

// https://nodejs.org/api/module.html#module-compile-cache
if (module.enableCompileCache && !process.env.NODE_DISABLE_COMPILE_CACHE) {
  try {
    module.enableCompileCache();
  } catch {
    // Ignore errors
  }
}

const isModuleNotFoundError = (err) =>
  err && typeof err === "object" && "code" in err && err.code === "ERR_MODULE_NOT_FOUND";

const installProcessWarningFilter = async () => {
  // Keep bootstrap warnings consistent with the TypeScript runtime.
  for (const specifier of ["./dist/warning-filter.js", "./dist/warning-filter.mjs"]) {
    try {
      const mod = await import(specifier);
      if (typeof mod.installProcessWarningFilter === "function") {
        mod.installProcessWarningFilter();
        return;
      }
    } catch (err) {
      if (isModuleNotFoundError(err)) {
        continue;
      }
      throw err;
    }
  }
};

await installProcessWarningFilter();

const tryImport = async (specifier) => {
  try {
    await import(specifier);
    return { ok: true };
  } catch (err) {
    // Only swallow missing-module errors; rethrow real runtime errors.
    if (isModuleNotFoundError(err)) {
      return { ok: false, error: err };
    }
    throw err;
  }
};

const localSpecifierExists = (specifier) => {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    return false;
  }

  return fs.existsSync(fileURLToPath(new URL(specifier, import.meta.url)));
};

const entrySpecifiers = ["./dist/entry.js", "./dist/entry.mjs", "../entry.js", "../entry.mjs"];

let lastMissingModuleError = null;
for (const specifier of entrySpecifiers) {
  const entryExists = localSpecifierExists(specifier);
  const result = await tryImport(specifier);
  if (result.ok) {
    lastMissingModuleError = null;
    break;
  }

  if (entryExists && result.error) {
    throw new Error(
      `openclaw: failed to load CLI entry ${specifier}.\n` +
        `Module-not-found while loading existing entry: ${result.error.message}`,
    );
  }

  lastMissingModuleError = result.error ?? lastMissingModuleError;
}

if (lastMissingModuleError) {
  throw new Error(
    `openclaw: failed to load CLI entry. Tried ${entrySpecifiers.join(", ")}.\n` +
      `Last module-not-found error: ${lastMissingModuleError.message}`,
  );
}
