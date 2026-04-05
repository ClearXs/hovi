import fs from "node:fs/promises";
import path from "node:path";
import {
  listAgentIds,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../../agents/agent-scope.js";
import { installSkillFromClawHub, updateSkillsFromClawHub } from "../../agents/skills-clawhub.js";
import { installClawHubSkill } from "../../agents/skills-install-clawhub.js";
import { installSkill } from "../../agents/skills-install.js";
import { buildWorkspaceSkillStatus } from "../../agents/skills-status.js";
import { loadWorkspaceSkillEntries, type SkillEntry } from "../../agents/skills.js";
import { listAgentWorkspaceDirs } from "../../agents/workspace-dirs.js";
import type { OpenClawConfig } from "../../config/config.js";
import { loadConfig, writeConfigFile } from "../../config/config.js";
import { isWithinDir } from "../../infra/path-safety.js";
import { getRemoteSkillEligibility } from "../../infra/skills-remote.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { CONFIG_DIR } from "../../utils.js";
import { normalizeSecretInput } from "../../utils/normalize-secret-input.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateSkillsBinsParams,
  validateSkillsDeleteParams,
  validateSkillsInstallParams,
  validateSkillsStatusParams,
  validateSkillsUpdateParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

const REMOVABLE_SKILL_SOURCES = new Set(["openclaw-managed", "openclaw-installed"]);

function collectSkillBins(entries: SkillEntry[]): string[] {
  const bins = new Set<string>();
  for (const entry of entries) {
    const required = entry.metadata?.requires?.bins ?? [];
    const anyBins = entry.metadata?.requires?.anyBins ?? [];
    const install = entry.metadata?.install ?? [];
    for (const bin of required) {
      const trimmed = bin.trim();
      if (trimmed) {
        bins.add(trimmed);
      }
    }
    for (const bin of anyBins) {
      const trimmed = bin.trim();
      if (trimmed) {
        bins.add(trimmed);
      }
    }
    for (const spec of install) {
      const specBins = spec?.bins ?? [];
      for (const bin of specBins) {
        const trimmed = String(bin).trim();
        if (trimmed) {
          bins.add(trimmed);
        }
      }
    }
  }
  return [...bins].toSorted();
}

export const skillsHandlers: GatewayRequestHandlers = {
  "skills.status": ({ params, respond }) => {
    if (!validateSkillsStatusParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid skills.status params: ${formatValidationErrors(validateSkillsStatusParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const agentIdRaw = typeof params?.agentId === "string" ? params.agentId.trim() : "";
    const agentId = agentIdRaw ? normalizeAgentId(agentIdRaw) : resolveDefaultAgentId(cfg);
    if (agentIdRaw) {
      const knownAgents = listAgentIds(cfg);
      if (!knownAgents.includes(agentId)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `unknown agent id "${agentIdRaw}"`),
        );
        return;
      }
    }
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const report = buildWorkspaceSkillStatus(workspaceDir, {
      config: cfg,
      eligibility: { remote: getRemoteSkillEligibility() },
    });
    respond(true, report, undefined);
  },
  "skills.bins": ({ params, respond }) => {
    if (!validateSkillsBinsParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid skills.bins params: ${formatValidationErrors(validateSkillsBinsParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const workspaceDirs = listAgentWorkspaceDirs(cfg);
    const bins = new Set<string>();
    for (const workspaceDir of workspaceDirs) {
      const entries = loadWorkspaceSkillEntries(workspaceDir, { config: cfg });
      for (const bin of collectSkillBins(entries)) {
        bins.add(bin);
      }
    }
    respond(true, { bins: [...bins].toSorted() }, undefined);
  },
  "skills.install": async ({ params, respond }) => {
    if (!validateSkillsInstallParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid skills.install params: ${formatValidationErrors(validateSkillsInstallParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const workspaceDirRaw = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
    if (params && typeof params === "object" && "source" in params && params.source === "clawhub") {
      const p = params as {
        source: "clawhub";
        slug: string;
        version?: string;
        force?: boolean;
      };
      const result = await installSkillFromClawHub({
        workspaceDir: workspaceDirRaw,
        slug: p.slug,
        version: p.version,
        force: Boolean(p.force),
      });
      respond(
        result.ok,
        result.ok
          ? {
              ok: true,
              message: `Installed ${result.slug}@${result.version}`,
              stdout: "",
              stderr: "",
              code: 0,
              slug: result.slug,
              version: result.version,
              targetDir: result.targetDir,
            }
          : result,
        result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.error),
      );
      return;
    }
    const p = params as {
      name: string;
      installId: string;
      version?: string;
      dangerouslyForceUnsafeInstall?: boolean;
      timeoutMs?: number;
    };
    if (p.installId === "clawhub") {
      const result = await installClawHubSkill({
        slug: p.name,
        version: p.version,
        timeoutMs: p.timeoutMs,
        managedSkillsDir: path.join(CONFIG_DIR, "skills"),
      });
      respond(
        result.ok,
        result,
        result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.message),
      );
      return;
    }
    const result = await installSkill({
      workspaceDir: workspaceDirRaw,
      skillName: p.name,
      installId: p.installId,
      dangerouslyForceUnsafeInstall: p.dangerouslyForceUnsafeInstall,
      timeoutMs: p.timeoutMs,
      config: cfg,
    });
    respond(
      result.ok,
      result,
      result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.message),
    );
  },
  "skills.delete": async ({ params, respond }) => {
    if (!validateSkillsDeleteParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid skills.delete params: ${formatValidationErrors(validateSkillsDeleteParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as { skillKeys: string[] };
    const cfg = loadConfig();
    const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
    const status = buildWorkspaceSkillStatus(workspaceDir, {
      config: cfg,
      eligibility: { remote: getRemoteSkillEligibility() },
    });
    const bySkillKey = new Map(status.skills.map((entry) => [entry.skillKey, entry]));
    const managedSkillsRoot = path.resolve(status.managedSkillsDir);
    const uniqueSkillKeys = Array.from(
      new Set(
        p.skillKeys.map((skillKey) => skillKey.trim()).filter((skillKey) => skillKey.length > 0),
      ),
    );

    const nextEntries = cfg.skills?.entries ? { ...cfg.skills.entries } : {};
    let configChanged = false;
    const results: Array<{ skillKey: string; ok: boolean; source?: string; message: string }> = [];

    for (const skillKey of uniqueSkillKeys) {
      const entry = bySkillKey.get(skillKey);
      if (!entry) {
        results.push({ skillKey, ok: false, message: `skill not found: ${skillKey}` });
        continue;
      }
      if (!REMOVABLE_SKILL_SOURCES.has(entry.source)) {
        results.push({
          skillKey,
          source: entry.source,
          ok: false,
          message: `source "${entry.source}" is not removable`,
        });
        continue;
      }
      const targetDir = path.resolve(entry.baseDir);
      if (!isWithinDir(managedSkillsRoot, targetDir)) {
        results.push({
          skillKey,
          source: entry.source,
          ok: false,
          message: `refusing to delete outside managed skills directory: ${targetDir}`,
        });
        continue;
      }
      try {
        await fs.rm(targetDir, { recursive: true, force: true });
        if (Object.hasOwn(nextEntries, skillKey)) {
          delete nextEntries[skillKey];
          configChanged = true;
        }
        results.push({
          skillKey,
          source: entry.source,
          ok: true,
          message: `deleted ${skillKey}`,
        });
      } catch (err) {
        results.push({
          skillKey,
          source: entry.source,
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (configChanged) {
      const nextSkills = cfg.skills
        ? {
            ...cfg.skills,
            entries: nextEntries,
          }
        : { entries: nextEntries };
      await writeConfigFile({
        ...cfg,
        skills: nextSkills,
      });
    }

    const failures = results.filter((result) => !result.ok);
    const ok = failures.length === 0;
    respond(
      ok,
      {
        ok,
        removed: results.length - failures.length,
        results,
      },
      ok
        ? undefined
        : errorShape(
            ErrorCodes.UNAVAILABLE,
            failures.map((result) => `${result.skillKey}: ${result.message}`).join("; "),
          ),
    );
  },
  "skills.getCode": async ({ params, respond }) => {
    const p = params as {
      skillKey?: unknown;
      filePath?: unknown;
    };
    const skillKey = typeof p.skillKey === "string" ? p.skillKey.trim() : "";
    if (!skillKey) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "skills.getCode requires skillKey"),
      );
      return;
    }

    const requestedFile = typeof p.filePath === "string" ? p.filePath.trim() : "SKILL.md";
    if (!requestedFile) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "skills.getCode requires filePath"),
      );
      return;
    }
    if (path.isAbsolute(requestedFile)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "filePath must be relative"),
      );
      return;
    }

    const cfg = loadConfig();
    const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
    const entries = loadWorkspaceSkillEntries(workspaceDir, { config: cfg });
    const entry = entries.find((item) => {
      const entrySkillKey = item.metadata?.skillKey ?? item.skill.name;
      return entrySkillKey === skillKey;
    });
    if (!entry) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `skill not found: ${skillKey}`),
      );
      return;
    }

    const baseDir = path.resolve(entry.skill.baseDir);
    const resolvedPath = path.resolve(baseDir, requestedFile);
    if (!isWithinDir(baseDir, resolvedPath)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "filePath escapes skill directory"),
      );
      return;
    }

    try {
      const stat = await fs.stat(resolvedPath);
      if (!stat.isFile()) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `file not found: ${requestedFile}`),
        );
        return;
      }
      const MAX_PREVIEW_BYTES = 256_000;
      if (stat.size > MAX_PREVIEW_BYTES) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `file too large for preview (${stat.size} bytes, max ${MAX_PREVIEW_BYTES})`,
          ),
        );
        return;
      }
      const content = await fs.readFile(resolvedPath, "utf8");
      respond(true, { content, files: [requestedFile] }, undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, message));
    }
  },
  "skills.update": async ({ params, respond }) => {
    if (!validateSkillsUpdateParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid skills.update params: ${formatValidationErrors(validateSkillsUpdateParams.errors)}`,
        ),
      );
      return;
    }
    if (params && typeof params === "object" && "source" in params && params.source === "clawhub") {
      const p = params as {
        source: "clawhub";
        slug?: string;
        all?: boolean;
      };
      if (!p.slug && !p.all) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, 'clawhub skills.update requires "slug" or "all"'),
        );
        return;
      }
      if (p.slug && p.all) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            'clawhub skills.update accepts either "slug" or "all", not both',
          ),
        );
        return;
      }
      const cfg = loadConfig();
      const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
      const results = await updateSkillsFromClawHub({
        workspaceDir,
        slug: p.slug,
      });
      const errors = results.filter((result) => !result.ok);
      respond(
        errors.length === 0,
        {
          ok: errors.length === 0,
          skillKey: p.slug ?? "*",
          config: {
            source: "clawhub",
            results,
          },
        },
        errors.length === 0
          ? undefined
          : errorShape(ErrorCodes.UNAVAILABLE, errors.map((result) => result.error).join("; ")),
      );
      return;
    }
    const p = params as {
      skillKey: string;
      enabled?: boolean;
      apiKey?: string;
      env?: Record<string, string>;
    };
    const cfg = loadConfig();
    const skills = cfg.skills ? { ...cfg.skills } : {};
    const entries = skills.entries ? { ...skills.entries } : {};
    const current = entries[p.skillKey] ? { ...entries[p.skillKey] } : {};
    if (typeof p.enabled === "boolean") {
      current.enabled = p.enabled;
    }
    if (typeof p.apiKey === "string") {
      const trimmed = normalizeSecretInput(p.apiKey);
      if (trimmed) {
        current.apiKey = trimmed;
      } else {
        delete current.apiKey;
      }
    }
    if (p.env && typeof p.env === "object") {
      const nextEnv = current.env ? { ...current.env } : {};
      for (const [key, value] of Object.entries(p.env)) {
        const trimmedKey = key.trim();
        if (!trimmedKey) {
          continue;
        }
        const trimmedVal = value.trim();
        if (!trimmedVal) {
          delete nextEnv[trimmedKey];
        } else {
          nextEnv[trimmedKey] = trimmedVal;
        }
      }
      current.env = nextEnv;
    }
    entries[p.skillKey] = current;
    skills.entries = entries;
    const nextConfig: OpenClawConfig = {
      ...cfg,
      skills,
    };
    await writeConfigFile(nextConfig);
    respond(true, { ok: true, skillKey: p.skillKey, config: current }, undefined);
  },
};
