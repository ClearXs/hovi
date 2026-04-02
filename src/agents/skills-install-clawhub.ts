import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { extractArchive } from "../infra/archive.js";
import { fetchWithSsrFGuard } from "../infra/net/fetch-guard.js";
import { scanDirectoryWithSummary } from "../security/skill-scanner.js";
import { ensureDir } from "../utils.js";
import type { SkillInstallResult } from "./skills-install.js";

const CLAWHUB_API_BASE = "https://clawhub.ai";
const INSTALL_ORIGIN_FILE = ".clawhub-origin.json";

export type ClawHubInstallRequest = {
  slug: string;
  version?: string;
  managedSkillsDir: string;
  timeoutMs?: number;
};

type ClawHubSkillMetadata = {
  latestVersion?: {
    version?: string;
  };
};

type ClawHubInstallOrigin = {
  slug: string;
  installedVersion: string;
  installedAt: number;
};

function sanitizeSlug(rawSlug: string): string | null {
  const slug = rawSlug.trim();
  if (!slug) {
    return null;
  }
  if (slug.includes("/") || slug.includes("\\") || slug.includes("..")) {
    return null;
  }
  if (!/^[a-z0-9][a-z0-9-_]*$/i.test(slug)) {
    return null;
  }
  return slug;
}

function withWarnings(result: SkillInstallResult, warnings: string[]): SkillInstallResult {
  if (warnings.length === 0) {
    return result;
  }
  return { ...result, warnings };
}

async function findSkillRootDir(extractDir: string): Promise<string | null> {
  const rootSkillMd = path.join(extractDir, "SKILL.md");
  try {
    const stat = await fs.stat(rootSkillMd);
    if (stat.isFile()) {
      return extractDir;
    }
  } catch {
    // continue
  }

  const entries = await fs.readdir(extractDir, { withFileTypes: true });
  const matches: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = path.join(extractDir, entry.name);
    try {
      const stat = await fs.stat(path.join(candidate, "SKILL.md"));
      if (stat.isFile()) {
        matches.push(candidate);
      }
    } catch {
      // ignore
    }
  }

  if (matches.length === 1) {
    return matches[0] ?? null;
  }
  return null;
}

function asNodeReadableStream(
  value: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
): NodeJS.ReadableStream {
  if (typeof (value as NodeJS.ReadableStream).pipe === "function") {
    return value as NodeJS.ReadableStream;
  }
  return Readable.fromWeb(value as NodeReadableStream);
}

function buildDownloadUrl(params: { slug: string; version?: string }): string {
  const url = new URL("/api/v1/download", CLAWHUB_API_BASE);
  url.searchParams.set("slug", params.slug);
  if (params.version?.trim()) {
    url.searchParams.set("version", params.version.trim());
  }
  return url.toString();
}

function buildSkillMetadataUrl(slug: string): string {
  return new URL(`/api/v1/skills/${encodeURIComponent(slug)}`, CLAWHUB_API_BASE).toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) {
    return null;
  }
  const trimmed = headerValue.trim();
  if (!trimmed) {
    return null;
  }
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    // Some upstreams incorrectly send unix timestamps in Retry-After.
    // Heuristic:
    // - very large numbers are treated as absolute timestamps (sec or ms)
    // - smaller numbers are treated as relative seconds per RFC
    if (seconds > 1_000_000_000_000) {
      const deltaMs = Math.floor(seconds - Date.now());
      return deltaMs > 0 ? deltaMs : 0;
    }
    if (seconds > 1_000_000_000) {
      const deltaMs = Math.floor(seconds * 1000 - Date.now());
      return deltaMs > 0 ? deltaMs : 0;
    }
    return Math.floor(seconds * 1000);
  }
  const at = Date.parse(trimmed);
  if (!Number.isFinite(at)) {
    return null;
  }
  const delta = at - Date.now();
  return delta > 0 ? delta : 0;
}

function parseRateLimitResetMs(headerValue: string | null): number | null {
  if (!headerValue) {
    return null;
  }
  const raw = Number(headerValue.trim());
  if (!Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  // ClawHub typically exposes x-ratelimit-reset as unix timestamp in seconds.
  // Be tolerant to milliseconds for compatibility.
  const resetAtMs = raw > 1_000_000_000_000 ? Math.floor(raw) : Math.floor(raw * 1000);
  const delta = resetAtMs - Date.now();
  return delta > 0 ? delta : 0;
}

function clampWaitMs(waitMs: number, timeoutMs: number): number {
  if (!Number.isFinite(waitMs) || waitMs < 0) {
    return 0;
  }
  // UX guardrail: never ask users to wait absurd durations due to bad headers.
  const capped = Math.min(waitMs, 5 * 60 * 1000);
  return Math.min(capped, timeoutMs);
}

function remainingBudgetMs(params: { startedAt: number; timeoutMs: number }): number {
  return Math.max(0, params.timeoutMs - (Date.now() - params.startedAt));
}

function resolveMaxRateLimitRetries(timeoutMs: number): number {
  // Allow more retries for rate-limit-heavy installs while keeping an upper bound.
  // 1 retry budget per second (capped), with a conservative floor for short timeouts.
  const byTimeout = Math.floor(Math.max(1_000, timeoutMs) / 1_000);
  return Math.max(5, Math.min(120, byTimeout));
}

function classifyHttpFailure(params: {
  status: number | null;
  slug: string;
  stage: "resolve" | "download";
  waitSeconds?: number | null;
}): string {
  const { status, slug, stage, waitSeconds } = params;
  if (status === 404) {
    return `ClawHub skill "${slug}" not found`;
  }
  if (status === 429) {
    return `ClawHub rate limited ${stage} for ${slug}; retry after ${waitSeconds ?? 30}s`;
  }
  if (typeof status === "number" && status >= 500) {
    return `ClawHub service is temporarily unavailable (${status}); retry shortly`;
  }
  if (typeof status === "number" && status >= 400) {
    return `ClawHub ${stage} failed for ${slug} (${status})`;
  }
  return `ClawHub ${stage} failed for ${slug}`;
}

async function readInstallOrigin(targetDir: string): Promise<ClawHubInstallOrigin | null> {
  try {
    const raw = await fs.readFile(path.join(targetDir, INSTALL_ORIGIN_FILE), "utf8");
    const parsed = JSON.parse(raw) as Partial<ClawHubInstallOrigin>;
    if (
      typeof parsed.slug === "string" &&
      typeof parsed.installedVersion === "string" &&
      typeof parsed.installedAt === "number"
    ) {
      return {
        slug: parsed.slug,
        installedVersion: parsed.installedVersion,
        installedAt: parsed.installedAt,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

async function writeInstallOrigin(targetDir: string, origin: ClawHubInstallOrigin): Promise<void> {
  await fs.writeFile(
    path.join(targetDir, INSTALL_ORIGIN_FILE),
    JSON.stringify(origin, null, 2),
    "utf8",
  );
}

async function resolveTargetVersion(params: {
  slug: string;
  requestedVersion?: string;
  timeoutMs: number;
}): Promise<{ ok: true; version: string } | { ok: false; result: SkillInstallResult }> {
  const requestedVersion = params.requestedVersion?.trim();
  if (requestedVersion) {
    return { ok: true, version: requestedVersion };
  }

  const url = buildSkillMetadataUrl(params.slug);
  const startedAt = Date.now();
  const maxRetries = resolveMaxRateLimitRetries(params.timeoutMs);
  let attempt = 0;
  let lastStatus: number | null = null;
  let lastBody = "";
  let lastRateLimitWaitMs: number | null = null;

  while (attempt <= maxRetries) {
    attempt += 1;
    const fetchTimeoutMs = remainingBudgetMs({ startedAt, timeoutMs: params.timeoutMs });
    if (fetchTimeoutMs <= 0) {
      break;
    }
    const { response, release } = await fetchWithSsrFGuard({
      url,
      timeoutMs: fetchTimeoutMs,
    });
    try {
      if (response.ok) {
        const payload = (await response.json()) as ClawHubSkillMetadata;
        const version = payload?.latestVersion?.version?.trim();
        if (!version) {
          return {
            ok: false,
            result: {
              ok: false,
              message: `ClawHub skill "${params.slug}" has no installable version`,
              stdout: "",
              stderr: "",
              code: null,
            },
          };
        }
        return { ok: true, version };
      }

      lastStatus = response.status;
      lastBody = await response.text().catch(() => "");
      const isRateLimited = response.status === 429;
      if (!isRateLimited || attempt > maxRetries) {
        break;
      }

      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      const rateLimitResetMs = parseRateLimitResetMs(response.headers.get("x-ratelimit-reset"));
      const backoffMs = Math.min(4_000, 500 * 2 ** (attempt - 1));
      const waitMs = clampWaitMs(
        Math.max(0, retryAfterMs ?? rateLimitResetMs ?? backoffMs),
        remainingBudgetMs({ startedAt, timeoutMs: params.timeoutMs }),
      );
      lastRateLimitWaitMs = waitMs;
      const elapsed = Date.now() - startedAt;
      if (elapsed + waitMs >= params.timeoutMs) {
        break;
      }
      await sleep(waitMs);
    } catch (err) {
      return {
        ok: false,
        result: {
          ok: false,
          message: `Failed to resolve ${params.slug} version from ClawHub`,
          stdout: "",
          stderr: err instanceof Error ? err.message : String(err),
          code: null,
        },
      };
    } finally {
      await release();
    }
  }

  const isRateLimited = lastStatus === 429;
  const waitSeconds =
    isRateLimited && typeof lastRateLimitWaitMs === "number"
      ? Math.max(1, Math.ceil(lastRateLimitWaitMs / 1000))
      : null;
  return {
    ok: false,
    result: {
      ok: false,
      message: classifyHttpFailure({
        status: lastStatus,
        slug: params.slug,
        stage: "resolve",
        waitSeconds,
      }),
      stdout: "",
      stderr: lastBody.trim(),
      code: lastStatus,
    },
  };
}

export async function installClawHubSkill(
  params: ClawHubInstallRequest,
): Promise<SkillInstallResult> {
  const slug = sanitizeSlug(params.slug);
  if (!slug) {
    return {
      ok: false,
      message: `Invalid ClawHub slug: "${params.slug}"`,
      stdout: "",
      stderr: "",
      code: null,
    };
  }

  const timeoutMs = Math.min(Math.max(params.timeoutMs ?? 120_000, 1_000), 900_000);
  const managedDir = path.resolve(params.managedSkillsDir);
  const targetDir = path.join(managedDir, slug);
  await ensureDir(managedDir);
  const tempBase = await fs.mkdtemp(path.join(managedDir, ".clawhub-install-"));
  const zipPath = path.join(tempBase, `${slug}.zip`);
  const extractDir = path.join(tempBase, "extract");

  const warnings: string[] = [];
  try {
    const resolved = await resolveTargetVersion({
      slug,
      requestedVersion: params.version,
      timeoutMs,
    });
    if (!resolved.ok) {
      return resolved.result;
    }
    const targetVersion = resolved.version;

    const currentOrigin = await readInstallOrigin(targetDir);
    if (currentOrigin?.installedVersion === targetVersion) {
      return {
        ok: true,
        message: `${slug}@${targetVersion} is already installed`,
        stdout: `Already installed in ${targetDir}`,
        stderr: "",
        code: 0,
      };
    }

    await ensureDir(extractDir);

    const url = buildDownloadUrl({ slug, version: targetVersion });
    const startedAt = Date.now();
    const maxRetries = resolveMaxRateLimitRetries(timeoutMs);
    let downloaded = false;
    let attempt = 0;
    let lastStatus: number | null = null;
    let lastBody = "";
    let lastRateLimitWaitMs: number | null = null;

    while (attempt <= maxRetries && !downloaded) {
      attempt += 1;
      const fetchTimeoutMs = remainingBudgetMs({ startedAt, timeoutMs });
      if (fetchTimeoutMs <= 0) {
        break;
      }
      const { response, release } = await fetchWithSsrFGuard({ url, timeoutMs: fetchTimeoutMs });
      try {
        if (response.ok && response.body) {
          const file = await fs.open(zipPath, "w");
          try {
            await pipeline(asNodeReadableStream(response.body), file.createWriteStream());
          } finally {
            await file.close();
          }
          downloaded = true;
          break;
        }

        lastStatus = response.status;
        lastBody = await response.text().catch(() => "");
        const isRateLimited = response.status === 429;
        if (!isRateLimited || attempt > maxRetries) {
          break;
        }

        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        const rateLimitResetMs = parseRateLimitResetMs(response.headers.get("x-ratelimit-reset"));
        const backoffMs = Math.min(4_000, 500 * 2 ** (attempt - 1));
        const waitMs = clampWaitMs(
          Math.max(0, retryAfterMs ?? rateLimitResetMs ?? backoffMs),
          remainingBudgetMs({ startedAt, timeoutMs }),
        );
        lastRateLimitWaitMs = waitMs;
        const elapsed = Date.now() - startedAt;
        if (elapsed + waitMs >= timeoutMs) {
          break;
        }
        warnings.push(`ClawHub rate limit hit; retrying in ${Math.ceil(waitMs / 1000)}s.`);
        await sleep(waitMs);
      } finally {
        await release();
      }
    }

    if (!downloaded) {
      const code = lastStatus;
      const isRateLimited = code === 429;
      const waitSeconds =
        isRateLimited && typeof lastRateLimitWaitMs === "number"
          ? Math.max(1, Math.ceil(lastRateLimitWaitMs / 1000))
          : null;
      return {
        ok: false,
        message: classifyHttpFailure({
          status: code,
          slug,
          stage: "download",
          waitSeconds,
        }),
        stdout: "",
        stderr: lastBody.trim(),
        code,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }

    await extractArchive({
      archivePath: zipPath,
      destDir: extractDir,
      kind: "zip",
      timeoutMs,
    });

    const skillRoot = await findSkillRootDir(extractDir);
    if (!skillRoot) {
      return {
        ok: false,
        message: `Downloaded archive for ${slug} has an unexpected layout`,
        stdout: "",
        stderr: "Unable to locate SKILL.md in archive root",
        code: null,
      };
    }

    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.cp(skillRoot, targetDir, { recursive: true, force: true });
    await writeInstallOrigin(targetDir, {
      slug,
      installedVersion: targetVersion,
      installedAt: Date.now(),
    });

    const summary = await scanDirectoryWithSummary(targetDir);
    if (summary.critical > 0) {
      warnings.push(
        `WARNING: Skill "${slug}" contains ${summary.critical} critical code-safety finding(s). Run "openclaw security audit --deep".`,
      );
    } else if (summary.warn > 0) {
      warnings.push(
        `Skill "${slug}" has ${summary.warn} suspicious code pattern(s). Run "openclaw security audit --deep".`,
      );
    }

    return withWarnings(
      {
        ok: true,
        message: `Installed ${slug}@${targetVersion} from ClawHub`,
        stdout: `Installed to ${targetDir}`,
        stderr: "",
        code: 0,
      },
      warnings,
    );
  } catch (err) {
    return withWarnings(
      {
        ok: false,
        message: `Failed to install ${slug} from ClawHub`,
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        code: null,
      },
      warnings,
    );
  } finally {
    await fs.rm(tempBase, { recursive: true, force: true }).catch(() => undefined);
  }
}
