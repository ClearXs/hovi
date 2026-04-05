import type { FileItemProps } from "@/components/files/FileList";
import { buildGatewayUrl } from "@/lib/runtime/desktop-env";

const WRAPPER_PREFIX_RE = /^[("'`[{<]+/;
const WRAPPER_SUFFIX_RE = /[)"'`\]}>.,;:!?，。；：！？]+$/;
const INLINE_ANNOTATION_START_RE = /[`([{（【<《]/;
const HAS_PATH_MARKER_RE = /[\\/]|[A-Za-z]:|file:\/\//;
const MARKDOWN_LINK_RE = /\[[^\]]*]\(([^)\n]+)\)/g;
const FENCED_CODE_RE = /```(?:[^\n`]*)\n([\s\S]*?)```/g;
const INLINE_CODE_RE = /`([^`\n]+)`/g;
const QUOTED_PATH_RE = /["']([^"'`\n]*[\\/][^"'`\n]*)["']/g;
const PATH_SCAN_RE =
  /file:\/\/[^\s`"'<>|，。；：！？,;]+|[A-Za-z]:[\\/][^\s`"'<>|，。；：！？,;]+|\\\\[^\\\/\s]+[\\/][^\s`"'<>|，。；：！？,;]+|(?:~[\\/]|\.{1,2}[\\/]|\/|[^\s\\/`"'<>|，。；：！？,;]+[\\/])[^\s`"'<>|，。；：！？,;]+/g;
const URL_SCHEME_RE = /^https?:\/\//i;
const FILE_URI_RE = /^file:\/\//i;
const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_RE = /^\\\\[^\\\/]+[\\/][^\\\/]+/;
const POSIX_ABS_RE = /^\/(?!\/)/;
const HOME_RE = /^~[\\/]/;
const RELATIVE_DOT_RE = /^\.\.?[\\/]/;
const RELATIVE_SEGMENT_RE =
  /^(?!-)(?!https?:\/\/)(?!file:\/\/)(?![A-Za-z]:[\\/])(?!\\\\)(?!\/)(?!~[\\/])[^\n\r\t\\/]+[\\/][^\n\r\t]+$/;
const TRAILING_DIR_SEP_RE = /[\\/]$/;
const EXTENSION_RE = /\.([A-Za-z0-9]{1,12})$/;
const KNOWN_RELATIVE_ROOTS = new Set([
  "src",
  "app",
  "apps",
  "docs",
  "doc",
  "packages",
  "package",
  "scripts",
  "script",
  "test",
  "tests",
  "__tests__",
  "ui",
  "ui-agent",
  "assets",
  "public",
  "config",
  "configs",
  "lib",
  "bin",
  "tmp",
  "data",
  "logs",
  "extensions",
  "dist",
  "build",
]);
const BLACKLISTED_SLASH_TERMS = new Set([
  "docker/k8s",
  "docker/kubernetes",
  "k8s/docker",
  "gdb/k8s",
  "k8s/gdb",
  "ci/cd",
  "cd/ci",
  "ui/ux",
  "ux/ui",
  "api/sdk",
  "sdk/api",
  "dev/prod",
  "prod/dev",
  "tcp/ip",
  "ip/tcp",
  "cpu/gpu",
  "gpu/cpu",
  "ios/android",
  "android/ios",
  "frontend/backend",
  "backend/frontend",
  "b2b/b2c",
  "b2c/b2b",
  "llm/rag",
  "rag/llm",
]);
const BLACKLISTED_SLASH_SEGMENTS = new Set([
  "docker",
  "k8s",
  "kubernetes",
  "ci",
  "cd",
  "ui",
  "ux",
  "api",
  "sdk",
  "dev",
  "prod",
  "tcp",
  "ip",
  "cpu",
  "gpu",
  "ios",
  "android",
  "frontend",
  "backend",
  "b2b",
  "b2c",
  "llm",
  "rag",
]);
const BLACKLISTED_CONTEXT_TERMS = new Set([
  "部署",
  "策略",
  "方案",
  "架构",
  "选型",
  "对比",
  "实践",
  "治理",
  "strategy",
  "architecture",
  "deployment",
  "stack",
  "plan",
  "practice",
]);
const KNOWN_SINGLE_SEGMENT_ROOT_PATHS = new Set([
  "bin",
  "sbin",
  "etc",
  "usr",
  "var",
  "tmp",
  "opt",
  "dev",
  "proc",
  "sys",
  "run",
  "home",
  "root",
  "users",
  "mnt",
  "media",
  "srv",
  "volumes",
  "private",
  "library",
  "applications",
  "workspace",
]);
const CONTROL_CHAR_RE = /[\u0000-\u001F]/;
const WINDOWS_ILLEGAL_SEGMENT_RE = /[<>:"|?*]/;

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);
const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "yaml",
  "yml",
  "csv",
  "log",
  "xml",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "rs",
  "go",
  "java",
  "kt",
  "swift",
  "css",
  "scss",
  "html",
  "sql",
  "sh",
  "bash",
  "zsh",
]);
const PDF_EXTENSIONS = new Set(["pdf"]);

export type DetectedPathCardOptions = {
  sessionKey?: string | null;
  maxPerMessage?: number;
  workspaceDir?: string;
};

type PathKind = "file" | "directory" | "unknown";
type CandidateMatch = {
  raw: string;
  index: number;
};

function stripWrappers(token: string): string {
  let cleaned = token.trim();
  while (WRAPPER_PREFIX_RE.test(cleaned)) {
    cleaned = cleaned.replace(WRAPPER_PREFIX_RE, "");
  }
  while (WRAPPER_SUFFIX_RE.test(cleaned)) {
    cleaned = cleaned.replace(WRAPPER_SUFFIX_RE, "");
  }
  const separatorIndex = cleaned.search(/[，。；、,;]/);
  if (separatorIndex > 0) {
    cleaned = cleaned.slice(0, separatorIndex);
  }
  const annotationIndex = cleaned.search(INLINE_ANNOTATION_START_RE);
  if (annotationIndex > 0) {
    cleaned = cleaned.slice(0, annotationIndex);
  }
  return cleaned.trim();
}

function decodeFileUri(candidate: string): string {
  if (!FILE_URI_RE.test(candidate)) {
    return candidate;
  }
  try {
    const url = new URL(candidate);
    const pathname = decodeURIComponent(url.pathname || "");
    if (/^\/[A-Za-z]:/.test(pathname)) {
      return pathname.slice(1);
    }
    if (url.host) {
      return `\\\\${url.host}${pathname.replace(/\//g, "\\")}`;
    }
    return pathname || candidate;
  } catch {
    return candidate;
  }
}

function collectRegexMatches(
  text: string,
  regex: RegExp,
  groupIndex = 0,
  offset = 0,
): CandidateMatch[] {
  const matches: CandidateMatch[] = [];
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
  for (const match of text.matchAll(re)) {
    const full = match[0];
    const captured = match[groupIndex] ?? full;
    if (!captured) continue;
    const fullIndex = match.index ?? 0;
    const localOffset = groupIndex > 0 ? full.indexOf(captured) : 0;
    matches.push({
      raw: captured,
      index: offset + fullIndex + Math.max(0, localOffset),
    });
  }
  return matches;
}

function normalizeMarkdownDestination(destination: string): string {
  let normalized = destination.trim();
  if (!normalized) return normalized;
  if (normalized.startsWith("<") && normalized.endsWith(">")) {
    normalized = normalized.slice(1, -1).trim();
  }
  const titleMatch = /^(.*?)(?:\s+["'][^"']*["'])$/.exec(normalized);
  if (titleMatch?.[1]) {
    normalized = titleMatch[1].trim();
  }
  return normalized;
}

function collectPathCandidates(content: string): CandidateMatch[] {
  const matches: CandidateMatch[] = [];
  const fencedRanges: Array<{ start: number; end: number }> = [];

  for (const fenced of collectRegexMatches(content, FENCED_CODE_RE, 1)) {
    const start = Math.max(0, fenced.index - 3);
    const end = Math.min(content.length, start + fenced.raw.length + 6);
    fencedRanges.push({ start, end });
    matches.push(...collectRegexMatches(fenced.raw, QUOTED_PATH_RE, 1, fenced.index));
    matches.push(...collectRegexMatches(fenced.raw, PATH_SCAN_RE, 0, fenced.index));
  }

  for (const link of collectRegexMatches(content, MARKDOWN_LINK_RE, 1)) {
    const normalized = normalizeMarkdownDestination(link.raw);
    if (!normalized) continue;
    matches.push({ raw: normalized, index: link.index });
  }

  for (const inline of collectRegexMatches(content, INLINE_CODE_RE, 1)) {
    const insideFence = fencedRanges.some(
      (range) => inline.index >= range.start && inline.index <= range.end,
    );
    if (insideFence) continue;
    matches.push(inline);
  }

  matches.push(...collectRegexMatches(content, QUOTED_PATH_RE, 1));
  matches.push(...collectRegexMatches(content, PATH_SCAN_RE, 0));

  const unique = new Set<string>();
  const longestByIndex = new Map<number, CandidateMatch>();
  for (const match of matches) {
    const raw = match.raw.trim();
    if (!raw) continue;
    const key = `${match.index}:${raw}`;
    if (unique.has(key)) continue;
    unique.add(key);
    const current = longestByIndex.get(match.index);
    if (!current || raw.length > current.raw.length) {
      longestByIndex.set(match.index, { raw, index: match.index });
    }
  }

  const deduped = Array.from(longestByIndex.values());
  deduped.sort((a, b) => a.index - b.index);
  return deduped;
}

function normalizeSlashes(path: string): string {
  if (WINDOWS_DRIVE_RE.test(path) || WINDOWS_UNC_RE.test(path)) {
    return path.replace(/\//g, "\\");
  }
  return path.replace(/\\/g, "/");
}

function isLikelyPath(candidate: string): boolean {
  if (!candidate || candidate.length < 3) {
    return false;
  }
  if (URL_SCHEME_RE.test(candidate)) {
    return false;
  }
  if (FILE_URI_RE.test(candidate)) {
    return hasRealisticPathStructure(candidate);
  }
  if (WINDOWS_DRIVE_RE.test(candidate) || WINDOWS_UNC_RE.test(candidate)) {
    return hasRealisticPathStructure(candidate);
  }
  if (POSIX_ABS_RE.test(candidate) || HOME_RE.test(candidate) || RELATIVE_DOT_RE.test(candidate)) {
    return hasRealisticPathStructure(candidate);
  }
  if (!RELATIVE_SEGMENT_RE.test(candidate)) {
    return false;
  }
  if (!hasRealisticPathStructure(candidate)) {
    return false;
  }
  return isLikelyRelativePathSegment(candidate);
}

function isLikelyRelativePathSegment(candidate: string): boolean {
  const normalized = candidate.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length < 2) {
    return false;
  }
  const last = segments[segments.length - 1] ?? "";
  if (EXTENSION_RE.test(last)) {
    return true;
  }
  if (segments.length >= 3) {
    return true;
  }
  const first = (segments[0] ?? "").toLowerCase();
  return KNOWN_RELATIVE_ROOTS.has(first);
}

function isBlacklistedSlashTerm(candidate: string): boolean {
  const normalized = candidate.replace(/\\/g, "/").toLowerCase();
  if (BLACKLISTED_SLASH_TERMS.has(normalized)) {
    return true;
  }
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length !== 2) {
    return false;
  }
  const [first = "", second = ""] = segments;
  const tokenRe = /^[a-z][a-z0-9+_-]{0,15}$/;
  if (!tokenRe.test(first) || !tokenRe.test(second)) {
    return false;
  }
  if (KNOWN_RELATIVE_ROOTS.has(first)) {
    return false;
  }
  if (BLACKLISTED_SLASH_SEGMENTS.has(first) && BLACKLISTED_SLASH_SEGMENTS.has(second)) {
    return true;
  }
  if (EXTENSION_RE.test(second)) {
    return false;
  }
  return false;
}

function normalizeContextWord(token: string): string {
  return stripWrappers(token)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff+_-]/g, "");
}

function isBlacklistedByNearbyContext(
  content: string,
  candidateIndex: number,
  candidate: string,
): boolean {
  if (
    FILE_URI_RE.test(candidate) ||
    WINDOWS_DRIVE_RE.test(candidate) ||
    WINDOWS_UNC_RE.test(candidate) ||
    POSIX_ABS_RE.test(candidate) ||
    HOME_RE.test(candidate) ||
    RELATIVE_DOT_RE.test(candidate)
  ) {
    return false;
  }

  const normalized = candidate.replace(/\\/g, "/").toLowerCase();
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length !== 2) {
    return false;
  }
  const [first = "", second = ""] = segments;
  if (KNOWN_RELATIVE_ROOTS.has(first) || EXTENSION_RE.test(second)) {
    return false;
  }
  const tokenRe = /^[a-z][a-z0-9+_-]{0,15}$/;
  if (!tokenRe.test(first) || !tokenRe.test(second)) {
    return false;
  }

  const start = Math.max(0, candidateIndex - 64);
  const end = Math.min(content.length, candidateIndex + candidate.length + 64);
  const context = content.slice(start, end);
  const rawWords = context.split(/\s+/);
  for (const rawWord of rawWords) {
    const normalizedWord = normalizeContextWord(rawWord);
    if (!normalizedWord) continue;
    if (BLACKLISTED_CONTEXT_TERMS.has(normalizedWord)) {
      return true;
    }
  }

  return false;
}

function hasRealisticPathStructure(candidate: string): boolean {
  const normalized = candidate.replace(/\\/g, "/");
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return false;
  }

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index] ?? "";
    if (!segment || segment === "." || segment === "..") {
      continue;
    }
    if (segment.length > 140) {
      return false;
    }
    if (CONTROL_CHAR_RE.test(segment)) {
      return false;
    }
    if (WINDOWS_ILLEGAL_SEGMENT_RE.test(segment)) {
      const isDriveSegment = index === 0 && /^[A-Za-z]:$/.test(segment);
      if (!isDriveSegment) {
        return false;
      }
    }
  }

  return true;
}

function isSlashCommandLike(candidate: string): boolean {
  if (!POSIX_ABS_RE.test(candidate)) {
    return false;
  }
  const normalized = candidate.replace(/\\/g, "/").trim();
  if (normalized.indexOf("/", 1) !== -1) {
    return false;
  }

  const commandWithArgsMatch = /^\/([a-z][a-z0-9-]{1,31})(?:\s+.+)?$/i.exec(normalized);
  if (!commandWithArgsMatch?.[1]) {
    return false;
  }

  const command = commandWithArgsMatch[1].toLowerCase();
  if (KNOWN_SINGLE_SEGMENT_ROOT_PATHS.has(command)) {
    return false;
  }

  if (/\s+/.test(normalized)) {
    return true;
  }

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length !== 1) {
    return false;
  }
  const segment = (segments[0] ?? "").toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(segment)) {
    return false;
  }
  if (KNOWN_SINGLE_SEGMENT_ROOT_PATHS.has(segment)) {
    return false;
  }
  if (segment.includes("-")) {
    return true;
  }
  return segment.length >= 4;
}

function isRelativePath(candidate: string): boolean {
  if (!candidate) return false;
  if (FILE_URI_RE.test(candidate)) return false;
  if (WINDOWS_DRIVE_RE.test(candidate) || WINDOWS_UNC_RE.test(candidate)) return false;
  if (POSIX_ABS_RE.test(candidate) || HOME_RE.test(candidate)) return false;
  return RELATIVE_DOT_RE.test(candidate) || RELATIVE_SEGMENT_RE.test(candidate);
}

function toNormalizedKey(path: string): string {
  const normalized = normalizeSlashes(path).trim();
  if (WINDOWS_DRIVE_RE.test(normalized) || WINDOWS_UNC_RE.test(normalized)) {
    return normalized.toLowerCase();
  }
  return normalized;
}

function splitBasename(path: string): string {
  const normalized = normalizeSlashes(path);
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  if (segments.length === 0) {
    return normalized;
  }
  return segments[segments.length - 1] ?? normalized;
}

function inferKind(path: string): PathKind {
  if (TRAILING_DIR_SEP_RE.test(path)) {
    return "directory";
  }
  const base = splitBasename(path);
  if (!base || base === "." || base === "..") {
    return "unknown";
  }
  if (EXTENSION_RE.test(base)) {
    return "file";
  }
  return "unknown";
}

function inferPreviewable(path: string, kind: PathKind): boolean {
  if (kind !== "file") {
    return false;
  }
  const ext = EXTENSION_RE.exec(splitBasename(path))?.[1]?.toLowerCase();
  if (!ext) return false;
  return IMAGE_EXTENSIONS.has(ext) || PDF_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has(ext);
}

function inferFileType(path: string, kind: PathKind): FileItemProps["type"] | undefined {
  if (kind === "directory" || kind === "unknown") {
    return undefined;
  }
  const ext = EXTENSION_RE.exec(splitBasename(path))?.[1]?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "pdf";
    case "doc":
    case "docx":
      return "docx";
    case "xls":
    case "xlsx":
      return "xlsx";
    case "ppt":
    case "pptx":
      return "pptx";
    case "png":
      return "png";
    case "jpg":
    case "jpeg":
      return "jpg";
    case "zip":
    case "rar":
    case "7z":
    case "tar":
    case "gz":
      return "zip";
    default:
      return undefined;
  }
}

function toWorkspaceRelative(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("./")) {
    return normalized.slice(2);
  }
  return normalized;
}

function getPathBasename(path: string): string | null {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) return null;
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  return segments[segments.length - 1] ?? null;
}

function normalizeRelativeAgainstWorkspace(relativePath: string, workspaceDir?: string): string {
  const normalizedRelative = toWorkspaceRelative(relativePath);
  if (!workspaceDir) {
    return normalizedRelative;
  }
  const workspaceBase = getPathBasename(workspaceDir)?.toLowerCase();
  if (!workspaceBase) {
    return normalizedRelative;
  }
  const segments = normalizedRelative.split("/").filter(Boolean);
  if (segments.length >= 2 && (segments[0] ?? "").toLowerCase() === workspaceBase) {
    return segments.slice(1).join("/");
  }
  return normalizedRelative;
}

function joinWorkspacePath(workspaceDir: string, relativePath: string): string {
  const ws = workspaceDir.replace(/[\\/]+$/, "");
  const relUnix = relativePath.replace(/^[\\/]+/, "");
  const useWindowsSep = WINDOWS_DRIVE_RE.test(ws) || ws.includes("\\");
  if (useWindowsSep) {
    return `${ws}\\${relUnix.replace(/\//g, "\\")}`;
  }
  return `${ws}/${relUnix}`;
}

function buildWorkspacePreviewUrl(agentId: string, relativePath: string): string {
  const safeRelative = toWorkspaceRelative(relativePath);
  const encodedSegments = safeRelative
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment));
  return buildGatewayUrl(`/files/${encodeURIComponent(agentId)}/${encodedSegments.join("/")}`);
}

export function parseAgentIdFromSessionKey(sessionKey?: string | null): string {
  if (!sessionKey) return "main";
  const match = /^agent:([^:]+):/.exec(sessionKey.trim());
  if (!match || !match[1]) {
    return "main";
  }
  return match[1];
}

export function detectPathCardsFromAssistantMessage(
  content: string,
  options: DetectedPathCardOptions = {},
): FileItemProps[] {
  const text = content.trim();
  if (!text || !HAS_PATH_MARKER_RE.test(text)) {
    return [];
  }

  const agentId = parseAgentIdFromSessionKey(options.sessionKey);
  const maxPerMessage = Math.max(1, options.maxPerMessage ?? 20);
  const candidates = collectPathCandidates(text);
  const dedup = new Set<string>();
  const cards: FileItemProps[] = [];

  for (const candidateMatch of candidates) {
    if (cards.length >= maxPerMessage) break;
    const cleaned = stripWrappers(candidateMatch.raw);
    if (!cleaned) continue;
    const decoded = decodeFileUri(cleaned);
    if (isSlashCommandLike(decoded)) continue;
    if (isBlacklistedSlashTerm(decoded)) continue;
    if (isBlacklistedByNearbyContext(text, candidateMatch.index, decoded)) continue;
    if (!isLikelyPath(decoded)) continue;

    const normalized = normalizeSlashes(decoded);
    const dedupKey = toNormalizedKey(normalized);
    if (dedup.has(dedupKey)) continue;
    dedup.add(dedupKey);

    const kind = inferKind(normalized);
    const previewable = inferPreviewable(normalized, kind);
    const relative = isRelativePath(normalized) ? toWorkspaceRelative(normalized) : null;
    const workspaceRelative = relative
      ? normalizeRelativeAgainstWorkspace(relative, options.workspaceDir)
      : null;
    const resolvedPath =
      workspaceRelative &&
      options.workspaceDir &&
      !workspaceRelative.startsWith("../") &&
      !workspaceRelative.startsWith("..\\")
        ? joinWorkspacePath(options.workspaceDir, workspaceRelative)
        : normalized;
    const previewUrl =
      previewable &&
      workspaceRelative &&
      !workspaceRelative.startsWith("../") &&
      !workspaceRelative.startsWith("..\\")
        ? buildWorkspacePreviewUrl(agentId, workspaceRelative)
        : undefined;

    cards.push({
      name: splitBasename(resolvedPath),
      path: previewUrl ?? resolvedPath,
      type: inferFileType(normalized, kind),
      description: normalized,
      source: "detected-path",
      rawPath: cleaned,
      resolvedPath,
      kind,
      access: "unknown",
      previewable,
      previewUrl,
      agentId,
    });
  }

  return cards;
}
