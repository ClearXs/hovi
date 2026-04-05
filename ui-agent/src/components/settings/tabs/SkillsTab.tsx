"use client";

import {
  Zap,
  Plus,
  Upload,
  Github,
  Globe,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  AlertTriangle,
  RefreshCcw,
  Download,
  Trash2,
  ChevronDown,
  ExternalLink,
  Search,
  FileText,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useConnectionStore } from "@/stores/connectionStore";
import { useToastStore } from "@/stores/toastStore";

/* ------------------------------------------------------------------ */
/*  Types matching the backend skills API                                */
/* ------------------------------------------------------------------ */

interface SkillInstallOption {
  id: string;
  kind: string;
  label: string;
  bins: string[];
}

interface SkillStatusEntry {
  name: string;
  description: string;
  source: string;
  filePath: string;
  baseDir: string;
  skillKey: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  requirements: {
    bins: string[];
    anyBins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  missing: {
    bins: string[];
    anyBins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  install: SkillInstallOption[];
}

interface SkillStatusReport {
  workspaceDir: string;
  managedSkillsDir: string;
  skills: SkillStatusEntry[];
}

interface ClawHubSkillListItem {
  slug: string;
  displayName: string;
  summary?: string;
  updatedAt?: number;
  latestVersion?: {
    version?: string;
  };
  stats?: {
    downloads?: number;
    stars?: number;
  };
}

interface ClawHubSearchItem {
  slug: string;
  displayName: string;
  summary?: string;
  version?: string;
  updatedAt?: number;
}

interface ClawHubSearchResponse {
  results?: ClawHubSearchItem[];
  items?: ClawHubSearchItem[];
}

interface ClawHubBrowseItem {
  slug: string;
  displayName: string;
  summary: string;
  version?: string;
  updatedAt?: number;
  downloads?: number;
  stars?: number;
}

interface ClawHubSkillDetailResponse {
  skill?: {
    slug?: string;
    displayName?: string;
    summary?: string;
    tags?: Record<string, string>;
    stats?: {
      comments?: number;
      downloads?: number;
      installsAllTime?: number;
      installsCurrent?: number;
      stars?: number;
      versions?: number;
    };
    createdAt?: number;
    updatedAt?: number;
  };
  latestVersion?: {
    version?: string;
    createdAt?: number;
    changelog?: string;
  };
  owner?: {
    handle?: string;
    userId?: string;
    displayName?: string;
    image?: string;
  };
  moderation?: {
    reason?: string;
  } | null;
}

interface ClawHubSkillVersionsResponse {
  items?: Array<{
    version?: string;
    createdAt?: number;
    changelog?: string;
    changelogSource?: string | null;
  }>;
}

interface InstallHistoryEntry {
  id: string;
  at: number;
  source: string;
  title: string;
  status: "success" | "failed";
  message: string;
}

const CLAWHUB_BASE_URL = "https://clawhub.ai";
const CLAWHUB_PAGE_LIMIT = 24;
const CLAWHUB_DISCOVERY_QUERIES = ["openclaw", "agent", "skill"];
const CLAWHUB_SEARCH_DEBOUNCE_MS = 2000;

function parseRetryAfterSeconds(message: string): number | null {
  const match = message.match(/retry after\s+(\d+)s/i);
  if (!match?.[1]) {
    return null;
  }
  const seconds = Number.parseInt(match[1], 10);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  return seconds;
}

function isVersionParamError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("at /version: must be string") ||
    lower.includes("unexpected property 'version'") ||
    lower.includes('unexpected property "version"')
  );
}

function isSourceInstallShapeError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("unexpected property 'source'") ||
    lower.includes('unexpected property "source"') ||
    lower.includes("must have required property 'installid'") ||
    lower.includes('must have required property "installid"') ||
    lower.includes("must have required property 'name'") ||
    lower.includes('must have required property "name"')
  );
}

function isLegacyInstallShapeError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("unexpected property 'name'") ||
    lower.includes('unexpected property "name"') ||
    lower.includes("unexpected property 'installid'") ||
    lower.includes('unexpected property "installid"') ||
    lower.includes("must have required property 'source'") ||
    lower.includes('must have required property "source"') ||
    lower.includes("must have required property 'slug'") ||
    lower.includes('must have required property "slug"')
  );
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function canBulkDeleteSkill(skill: SkillStatusEntry): boolean {
  return skill.source === "openclaw-managed" || skill.source === "openclaw-installed";
}

/* ------------------------------------------------------------------ */
/*  Source badge                                                          */
/* ------------------------------------------------------------------ */

function SourceBadge({ source }: { source: string }) {
  const variants: Record<string, { bg: string; text: string; label: string }> = {
    "openclaw-workspace": { bg: "bg-green-100", text: "text-green-700", label: "工作区" },
    "openclaw-bundled": { bg: "bg-blue-100", text: "text-blue-700", label: "内置" },
    "openclaw-installed": { bg: "bg-amber-100", text: "text-amber-700", label: "已安装" },
    "openclaw-managed": { bg: "bg-orange-100", text: "text-orange-700", label: "托管" },
    "openclaw-extra": { bg: "bg-purple-100", text: "text-purple-700", label: "扩展" },
    clawhub: { bg: "bg-cyan-100", text: "text-cyan-700", label: "ClawHub" },
  };
  const v = variants[source] ?? { bg: "bg-gray-100", text: "text-gray-600", label: source };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${v.bg} ${v.text}`}
    >
      {v.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Skill Code Preview Dialog                                            */
/* ------------------------------------------------------------------ */

function SkillCodePreviewDialog({
  open,
  skill,
  onClose,
}: {
  open: boolean;
  skill: SkillStatusEntry | null;
  onClose: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsClient = useConnectionStore((s) => s.wsClient);

  useEffect(() => {
    if (!open || !skill || !wsClient) {
      return;
    }
    let cancelled = false;
    const loadCode = async () => {
      setIsLoading(true);
      setError(null);
      setContent(null);
      try {
        const result = await wsClient.sendRequest<{ content: string; files?: string[] }>(
          "skills.getCode",
          {
            skillKey: skill.skillKey,
            filePath: "SKILL.md",
          },
        );
        if (!cancelled) {
          setContent(result?.content ?? "无法读取 SKILL.md 内容");
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "无法加载 Skill 代码预览";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    void loadCode();

    return () => {
      cancelled = true;
    };
  }, [open, skill, wsClient]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[48rem] h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {skill?.emoji && <span>{skill.emoji}</span>}
            {skill?.name ?? "Skill"} - SKILL.md
          </DialogTitle>
          <DialogDescription>查看 Skill 定义文件,了解其功能和指令内容。</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden rounded-md border border-border-light bg-surface-subtle">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 text-text-tertiary animate-spin" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <AlertCircle className="w-8 h-8 text-text-tertiary mb-3" />
              <p className="text-sm text-text-primary mb-1">预览不可用</p>
              <p className="text-xs text-text-tertiary">{error}</p>
              {skill?.filePath && (
                <p className="text-xs text-text-tertiary mt-2 font-mono">
                  文件路径: {skill.filePath}
                </p>
              )}
            </div>
          ) : (
            <pre className="p-4 text-xs text-text-primary overflow-auto scrollbar-default h-full whitespace-pre-wrap break-words font-mono leading-relaxed">
              {content}
            </pre>
          )}
        </div>

        <DialogFooter>
          {skill?.homepage && (
            <a
              href={skill.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1 mr-auto"
            >
              <ExternalLink className="w-3 h-3" />
              文档
            </a>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
/* ------------------------------------------------------------------ */
/*  Skill card                                                           */
/* ------------------------------------------------------------------ */

function SkillCard({
  skill,
  onToggle,
  onInstall,
  onSetApiKey,
  onPreviewCode,
  bulkDeleteMode,
  selectedForDelete,
  onToggleDeleteSelection,
}: {
  skill: SkillStatusEntry;
  onToggle: (skillKey: string, enabled: boolean) => void;
  onInstall: (skillName: string, installId: string) => void;
  onSetApiKey: (skillKey: string, envKey: string, value: string) => void;
  onPreviewCode: (skill: SkillStatusEntry) => void;
  bulkDeleteMode: boolean;
  selectedForDelete: boolean;
  onToggleDeleteSelection: (skillKey: string, selected: boolean) => void;
}) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");

  const hasMissing =
    skill.missing.bins.length > 0 ||
    skill.missing.env.length > 0 ||
    skill.missing.config.length > 0 ||
    skill.missing.os.length > 0;
  const removable = canBulkDeleteSkill(skill);

  return (
    <div className="border border-border-light rounded-lg p-4 hover:border-border transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          {skill.emoji && <span className="text-lg flex-shrink-0 mt-0.5">{skill.emoji}</span>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-text-primary">{skill.name}</span>
              <SourceBadge source={skill.source} />
              {skill.always && (
                <span className="text-[10px] text-text-tertiary bg-surface-subtle px-1.5 py-0.5 rounded">
                  常驻
                </span>
              )}
            </div>
            <p className="text-xs text-text-tertiary mt-1 line-clamp-2">{skill.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {bulkDeleteMode && (
            <label
              className={`inline-flex items-center gap-1 text-xs ${
                removable ? "text-text-secondary" : "text-text-tertiary"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedForDelete}
                disabled={!removable}
                onChange={(e) => onToggleDeleteSelection(skill.skillKey, e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border-light"
              />
              删除
            </label>
          )}

          {/* Preview code button */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-text-tertiary hover:text-text-primary"
            onClick={() => onPreviewCode(skill)}
            title="查看 SKILL.md"
          >
            <FileText className="w-3.5 h-3.5" />
          </Button>

          {/* Toggle */}
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={!skill.disabled}
              onChange={(e) => onToggle(skill.skillKey, e.target.checked)}
              disabled={!skill.eligible || skill.blockedByAllowlist}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary peer-disabled:opacity-40" />
          </label>
        </div>
      </div>

      {/* Missing deps warning */}
      {hasMissing && (
        <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-md">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700 space-y-0.5">
              {skill.missing.bins.length > 0 && (
                <div>缺少程序: {skill.missing.bins.join(", ")}</div>
              )}
              {skill.missing.env.length > 0 && (
                <div>缺少环境变量: {skill.missing.env.join(", ")}</div>
              )}
              {skill.missing.config.length > 0 && (
                <div>缺少配置: {skill.missing.config.join(", ")}</div>
              )}
              {skill.missing.os.length > 0 && <div>不支持当前操作系统</div>}
            </div>
          </div>
        </div>
      )}

      {/* API Key input */}
      {skill.primaryEnv && (
        <div className="mt-3">
          <label className="text-xs text-text-tertiary mb-1 block">{skill.primaryEnv}</label>
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Input
                type={showApiKey ? "text" : "password"}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={`输入 ${skill.primaryEnv}`}
                className="h-7 text-xs pr-7"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
              >
                {showApiKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2"
              onClick={() => {
                if (apiKeyInput.trim()) {
                  onSetApiKey(skill.skillKey, skill.primaryEnv!, apiKeyInput.trim());
                  setApiKeyInput("");
                }
              }}
              disabled={!apiKeyInput.trim()}
            >
              保存
            </Button>
          </div>
        </div>
      )}

      {/* Install options */}
      {skill.install.length > 0 && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {skill.install.map((opt) => (
            <Button
              key={opt.id}
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => onInstall(skill.name, opt.id)}
            >
              <Download className="w-3 h-3 mr-1" />
              {opt.label}
            </Button>
          ))}
        </div>
      )}

      {/* Footer: homepage link */}
      {skill.homepage && (
        <div className="mt-3 pt-2 border-t border-border-light">
          <a
            href={skill.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            查看文档
          </a>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Install confirm dialog                                               */
/* ------------------------------------------------------------------ */

function InstallConfirmDialog({
  open,
  title,
  source,
  description,
  isInstalling,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  source: string;
  description: string;
  isInstalling: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>确认安装 Skill?</DialogTitle>
          <DialogDescription>
            即将安装 <strong>{title}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {description && <p className="text-sm text-text-secondary">{description}</p>}

          <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700 space-y-1">
                <p className="font-semibold">安全提示</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>仅从可信来源安装 Skills</li>
                  <li>安装前请检查 Skill 代码和作者声誉</li>
                  <li>Skills 可能执行系统命令或访问文件</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="text-xs text-text-tertiary">
            来源: <SourceBadge source={source} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isInstalling}>
            取消
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={isInstalling}>
            {isInstalling ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                安装中...
              </>
            ) : (
              "确认安装"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkDeleteConfirmDialog({
  open,
  skillKeys,
  isDeleting,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  skillKeys: string[];
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const preview = skillKeys.slice(0, 8);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>确认批量删除 Skills?</DialogTitle>
          <DialogDescription>
            即将删除 <strong>{skillKeys.length}</strong> 个已安装 Skills，此操作不可撤销。
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border-light bg-surface-subtle p-3 text-xs text-text-secondary space-y-1 max-h-40 overflow-auto">
          {preview.map((skillKey) => (
            <div key={skillKey} className="font-mono break-all">
              {skillKey}
            </div>
          ))}
          {skillKeys.length > preview.length && (
            <div className="text-text-tertiary">
              ... 还有 {skillKeys.length - preview.length} 个
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isDeleting}>
            取消
          </Button>
          <Button size="sm" variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                删除中...
              </>
            ) : (
              "确认删除"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  GitHub install dialog                                                */
/* ------------------------------------------------------------------ */

function GitHubInstallDialog({
  open,
  onClose,
  onInstall,
}: {
  open: boolean;
  onClose: () => void;
  onInstall: (url: string) => void;
}) {
  const [url, setUrl] = useState("");

  const isValid = /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/.test(url);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>从 GitHub 安装 Skill</DialogTitle>
          <DialogDescription>输入包含 SKILL.md 的 GitHub 仓库 URL</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/user/repo"
            className="h-9 text-sm"
            autoFocus
          />
          {url && !isValid && <p className="text-xs text-error">请输入有效的 GitHub 仓库 URL</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onInstall(url);
              setUrl("");
            }}
            disabled={!isValid}
          >
            <Github className="w-3.5 h-3.5 mr-1.5" />
            安装
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Local Upload Dialog                                                  */
/* ------------------------------------------------------------------ */

function LocalUploadDialog({
  open,
  onClose,
  onUpload,
}: {
  open: boolean;
  onClose: () => void;
  onUpload: (skillName: string, skillMdContent: string, files: File[]) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [skillMdContent, setSkillMdContent] = useState<string | null>(null);
  const [skillName, setSkillName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFiles([]);
    setSkillMdContent(null);
    setSkillName("");
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFilesSelected = async (fileList: FileList) => {
    const fileArray = Array.from(fileList);
    setFiles(fileArray);
    setError(null);

    const skillMdFile = fileArray.find(
      (f) => f.name === "SKILL.md" || f.webkitRelativePath.endsWith("/SKILL.md"),
    );

    if (!skillMdFile) {
      setError("所选文件夹中未找到 SKILL.md 文件。Skill 必须包含 SKILL.md 定义文件。");
      setSkillMdContent(null);
      setSkillName("");
      return;
    }

    try {
      const text = await skillMdFile.text();
      setSkillMdContent(text);
      const nameMatch = text.match(/^---[\s\S]*?name:\s*(.+?)[\s\r\n]/m);
      if (nameMatch) {
        setSkillName(nameMatch[1].trim());
      } else {
        const parts = skillMdFile.webkitRelativePath.split("/");
        setSkillName(parts.length > 1 ? parts[0] : "my-skill");
      }
    } catch {
      setError("无法读取 SKILL.md 文件内容");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>上传本地 Skill</DialogTitle>
          <DialogDescription>选择包含 SKILL.md 的 Skill 文件夹</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              /* @ts-expect-error webkitdirectory is a non-standard attribute */
              webkitdirectory=""
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  void handleFilesSelected(e.target.files);
                }
              }}
            />
            <Button
              variant="outline"
              className="w-full h-20 border-dashed border-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex flex-col items-center gap-1">
                <Upload className="w-5 h-5 text-text-tertiary" />
                <span className="text-xs text-text-tertiary">
                  {files.length > 0
                    ? `已选择 ${files.length} 个文件`
                    : "拖拽文件夹到此处，或点击选择 Skill 文件夹"}
                </span>
              </div>
            </Button>
          </div>

          <div className="space-y-2 text-sm text-text-secondary">
            <div className="font-medium text-text-primary">文件要求</div>
            <ul className="list-disc pl-5 space-y-1 text-text-secondary">
              <li>.zip 或 .skill 文件（根目录包含 SKILL.md）</li>
              <li>SKILL.md 包含 skill 名称与描述（YAML）</li>
            </ul>
            <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>
                <a
                  href="https://agentskills.io/what-are-skills"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-primary"
                >
                  了解如何创建 Skills
                </a>{" "}
                或{" "}
                <a
                  href="/examples/example-skill.zip"
                  download
                  className="underline hover:text-primary"
                >
                  查看示例
                </a>
              </span>
            </div>
            <p className="text-[11px] text-text-tertiary">
              当前上传方式为选择文件夹，示例 zip 仅用于参考 Skill 目录结构。
            </p>
          </div>

          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-md">
              <p className="text-xs text-red-700 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {error}
              </p>
            </div>
          )}

          {skillMdContent && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Skill 名称</label>
                <Input
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">SKILL.md 预览</label>
                <pre className="p-3 bg-surface-subtle rounded-md text-xs text-text-primary max-h-[200px] overflow-auto scrollbar-default whitespace-pre-wrap break-words font-mono">
                  {skillMdContent.slice(0, 2000)}
                  {skillMdContent.length > 2000 && "\n\n... (内容已截断)"}
                </pre>
              </div>
              <p className="text-xs text-text-tertiary">共 {files.length} 个文件</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            取消
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (skillMdContent && skillName.trim()) {
                onUpload(skillName.trim(), skillMdContent, files);
                reset();
              }
            }}
            disabled={!skillMdContent || !skillName.trim()}
          >
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            上传
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  ClawHub browse dialog                                                */
/* ------------------------------------------------------------------ */

function ClawHubDialog({
  open,
  onClose,
  onInstall,
  cooldownUntilBySlug,
}: {
  open: boolean;
  onClose: () => void;
  onInstall: (item: {
    slug: string;
    displayName: string;
    summary?: string;
    version?: string;
  }) => void;
  cooldownUntilBySlug: Record<string, number>;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<ClawHubBrowseItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<ClawHubBrowseItem | null>(null);
  const [detail, setDetail] = useState<ClawHubSkillDetailResponse | null>(null);
  const [detailVersions, setDetailVersions] = useState<
    Array<{ version?: string; createdAt?: number; changelog?: string }>
  >([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  const trimmedQuery = query.trim();
  const debouncedTrimmedQuery = debouncedQuery.trim();

  const fetchClawHubSearchItems = useCallback(
    async (searchQuery: string): Promise<ClawHubBrowseItem[]> => {
      const searchUrl = new URL("/api/v1/search", CLAWHUB_BASE_URL);
      searchUrl.searchParams.set("q", searchQuery);
      searchUrl.searchParams.set("limit", String(CLAWHUB_PAGE_LIMIT));
      searchUrl.searchParams.set("nonSuspiciousOnly", "true");

      const response = await fetch(searchUrl.toString());
      if (!response.ok) {
        throw new Error(`ClawHub 搜索失败 (${response.status})`);
      }

      const data = (await response.json()) as ClawHubSearchResponse;
      const results = Array.isArray(data.results)
        ? data.results
        : Array.isArray(data.items)
          ? data.items
          : [];

      const mapped: ClawHubBrowseItem[] = [];
      for (const item of results) {
        const slug = typeof item.slug === "string" ? item.slug.trim() : "";
        if (!slug) {
          continue;
        }
        const displayName =
          typeof item.displayName === "string" && item.displayName.trim() ? item.displayName : slug;
        const version =
          typeof item.version === "string" && item.version.trim() ? item.version.trim() : undefined;
        mapped.push({
          slug,
          displayName,
          summary: item.summary ?? "暂无简介",
          version,
          updatedAt: item.updatedAt,
        });
      }

      return mapped;
    },
    [],
  );

  const loadClawHubItems = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null; searchQuery?: string }) => {
      const append = opts?.append === true;
      const cursor = opts?.cursor?.trim();
      const searchQuery = (opts?.searchQuery ?? "").trim();

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        if (searchQuery) {
          const mapped = await fetchClawHubSearchItems(searchQuery);
          setItems(mapped);
          setNextCursor(null);
          return;
        }

        const url = new URL("/api/v1/skills", CLAWHUB_BASE_URL);
        url.searchParams.set("limit", String(CLAWHUB_PAGE_LIMIT));
        url.searchParams.set("nonSuspiciousOnly", "true");
        if (cursor) {
          url.searchParams.set("cursor", cursor);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(`ClawHub 请求失败 (${response.status})`);
        }

        const data = (await response.json()) as {
          items?: ClawHubSkillListItem[];
          nextCursor?: string | null;
        };
        const mapped: ClawHubBrowseItem[] = [];
        for (const item of data.items ?? []) {
          const slug = typeof item.slug === "string" ? item.slug.trim() : "";
          if (!slug) {
            continue;
          }
          const version =
            typeof item.latestVersion?.version === "string" && item.latestVersion.version.trim()
              ? item.latestVersion.version.trim()
              : undefined;
          mapped.push({
            slug,
            displayName:
              typeof item.displayName === "string" && item.displayName.trim()
                ? item.displayName
                : slug,
            summary: item.summary ?? "暂无简介",
            version,
            updatedAt: item.updatedAt,
            downloads: item.stats?.downloads,
            stars: item.stats?.stars,
          });
        }

        if (mapped.length > 0 || append || cursor) {
          setItems((prev) => (append ? [...prev, ...mapped] : mapped));
          setNextCursor(data.nextCursor ?? null);
          return;
        }

        // ClawHub list endpoint may return empty; use search-based discovery fallback.
        const discoverySettled = await Promise.allSettled(
          CLAWHUB_DISCOVERY_QUERIES.map((searchQuery) => fetchClawHubSearchItems(searchQuery)),
        );
        const deduped = new Map<string, ClawHubBrowseItem>();
        for (const result of discoverySettled) {
          if (result.status !== "fulfilled") {
            continue;
          }
          for (const item of result.value) {
            if (!item.slug || deduped.has(item.slug)) {
              continue;
            }
            deduped.set(item.slug, item);
            if (deduped.size >= CLAWHUB_PAGE_LIMIT) {
              break;
            }
          }
          if (deduped.size >= CLAWHUB_PAGE_LIMIT) {
            break;
          }
        }

        setItems(Array.from(deduped.values()));
        setNextCursor(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载 ClawHub Skills 失败");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [fetchClawHubSearchItems],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, CLAWHUB_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadClawHubItems({ searchQuery: debouncedTrimmedQuery });
  }, [open, loadClawHubItems, debouncedTrimmedQuery]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (open) {
      return;
    }
    setDetailItem(null);
    setDetail(null);
    setDetailVersions([]);
    setDetailError(null);
  }, [open]);

  useEffect(() => {
    if (!detailItem?.slug) {
      setDetail(null);
      setDetailVersions([]);
      setDetailError(null);
      return;
    }
    const controller = new AbortController();
    let active = true;

    const loadDetail = async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const [detailRes, versionsRes] = await Promise.all([
          fetch(`https://clawhub.ai/api/v1/skills/${encodeURIComponent(detailItem.slug)}`, {
            signal: controller.signal,
          }),
          fetch(
            `https://clawhub.ai/api/v1/skills/${encodeURIComponent(detailItem.slug)}/versions`,
            {
              signal: controller.signal,
            },
          ),
        ]);

        if (!detailRes.ok) {
          throw new Error(`加载详情失败 (${detailRes.status})`);
        }

        const detailData = (await detailRes.json()) as ClawHubSkillDetailResponse;
        const versionsData = versionsRes.ok
          ? ((await versionsRes.json()) as ClawHubSkillVersionsResponse)
          : { items: [] };
        if (!active) {
          return;
        }
        setDetail(detailData);
        setDetailVersions(
          (versionsData.items ?? []).map((item) => ({
            version: item.version,
            createdAt: item.createdAt,
            changelog: item.changelog,
          })),
        );
      } catch (err) {
        if (!active || controller.signal.aborted) {
          return;
        }
        setDetailError(err instanceof Error ? err.message : "加载详情失败");
      } finally {
        if (active) {
          setDetailLoading(false);
        }
      }
    };

    void loadDetail();

    return () => {
      active = false;
      controller.abort();
    };
  }, [detailItem?.slug]);

  const formatStat = (value?: number): string => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return "0";
    }
    return Intl.NumberFormat("zh-CN", { notation: "compact" }).format(Math.max(0, value));
  };

  const formatTime = (ts?: number): string => {
    if (!ts || !Number.isFinite(ts)) {
      return "未知";
    }
    return new Date(ts).toLocaleDateString("zh-CN");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[94vw] max-w-[58rem] h-[82vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>从 ClawHub 浏览 Skills</DialogTitle>
          <DialogDescription>搜索并安装社区 Skills</DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0 gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索 ClawHub Skills..."
                className="h-8 text-xs pl-8"
              />
            </div>
            <a
              href="https://clawhub.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              打开官网
            </a>
          </div>

          <div className="flex-1 min-h-0 overflow-auto scrollbar-default rounded-md border border-border-light bg-surface-subtle">
            {isLoading && items.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-text-tertiary animate-spin" />
              </div>
            ) : error ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center p-6">
                <AlertCircle className="w-7 h-7 text-error" />
                <p className="text-sm text-text-primary">加载失败</p>
                <p className="text-xs text-text-tertiary">{error}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => void loadClawHubItems({ searchQuery: debouncedTrimmedQuery })}
                >
                  重试
                </Button>
              </div>
            ) : items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center p-6">
                <Globe className="w-8 h-8 text-text-tertiary" />
                <p className="text-sm text-text-primary">未找到技能</p>
                <p className="text-xs text-text-tertiary">尝试更换关键词或清空搜索</p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {items.map((item) => (
                  <div
                    key={item.slug}
                    className="rounded-md border border-border-light bg-white p-3 cursor-pointer hover:border-primary/40 transition-colors"
                    onClick={() => setDetailItem(item)}
                  >
                    {(() => {
                      const cooldownUntil = cooldownUntilBySlug[item.slug] ?? 0;
                      const remainingSeconds =
                        cooldownUntil > nowMs
                          ? Math.max(1, Math.ceil((cooldownUntil - nowMs) / 1000))
                          : 0;
                      const inCooldown = remainingSeconds > 0;
                      return (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-text-primary">
                                {item.displayName}
                              </span>
                              <span className="text-[10px] text-text-tertiary bg-surface-subtle px-1.5 py-0.5 rounded">
                                {item.slug}
                              </span>
                              {item.version && (
                                <span className="text-[10px] text-text-tertiary bg-surface-subtle px-1.5 py-0.5 rounded">
                                  v{item.version}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-text-tertiary mt-1 line-clamp-2">
                              {item.summary}
                            </p>
                            <div className="mt-2 text-[11px] text-text-tertiary flex items-center gap-3">
                              <span>下载 {formatStat(item.downloads)}</span>
                              <span>点赞 {formatStat(item.stars)}</span>
                              <span>更新 {formatTime(item.updatedAt)}</span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className="h-7 text-xs whitespace-nowrap"
                            disabled={inCooldown}
                            onClick={(e) => {
                              e.stopPropagation();
                              onInstall(item);
                            }}
                          >
                            <Download className="w-3 h-3 mr-1" />
                            {inCooldown ? `重试 ${remainingSeconds}s` : "安装"}
                          </Button>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>

          {!trimmedQuery && nextCursor && (
            <div className="flex justify-center">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={isLoadingMore}
                onClick={() => void loadClawHubItems({ append: true, cursor: nextCursor })}
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    加载中...
                  </>
                ) : (
                  "加载更多"
                )}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={detailItem !== null} onOpenChange={(next) => !next && setDetailItem(null)}>
        <DialogContent className="max-w-[56rem] h-[82vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              {detailItem?.displayName ?? "Skill 详情"}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 flex-wrap">
              {detailItem?.slug && (
                <span className="text-[10px] text-text-tertiary bg-surface-subtle px-1.5 py-0.5 rounded">
                  {detailItem.slug}
                </span>
              )}
              {detailItem?.version && (
                <span className="text-[10px] text-text-tertiary bg-surface-subtle px-1.5 py-0.5 rounded">
                  v{detailItem.version}
                </span>
              )}
              {detailItem?.summary ? <span className="text-xs">{detailItem.summary}</span> : null}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-auto scrollbar-default rounded-md border border-border-light bg-surface-subtle p-3">
            {detailLoading ? (
              <div className="h-full min-h-[220px] flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-text-tertiary animate-spin" />
              </div>
            ) : detailError ? (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center gap-2 text-center p-6">
                <AlertCircle className="w-7 h-7 text-error" />
                <p className="text-sm text-text-primary">加载详情失败</p>
                <p className="text-xs text-text-tertiary">{detailError}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border border-border-light bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-text-primary">
                        {detail?.skill?.displayName ?? detailItem?.displayName ?? "未知 Skill"}
                      </div>
                      <p className="text-xs text-text-tertiary mt-1">
                        {detail?.skill?.summary ?? detailItem?.summary ?? "暂无简介"}
                      </p>
                      <div className="mt-2 text-[11px] text-text-tertiary flex items-center gap-3 flex-wrap">
                        <span>
                          ⭐ {formatStat(detail?.skill?.stats?.stars ?? detailItem?.stars)}
                        </span>
                        <span>
                          下载{" "}
                          {formatStat(detail?.skill?.stats?.downloads ?? detailItem?.downloads)}
                        </span>
                        <span>当前安装 {formatStat(detail?.skill?.stats?.installsCurrent)}</span>
                        <span>全部安装 {formatStat(detail?.skill?.stats?.installsAllTime)}</span>
                      </div>
                      <div className="mt-2 text-[11px] text-text-tertiary flex items-center gap-2 flex-wrap">
                        <span>作者 {detail?.owner?.displayName ?? "-"}</span>
                        <span>@{detail?.owner?.handle ?? "-"}</span>
                        <span>
                          更新 {formatTime(detail?.skill?.updatedAt ?? detailItem?.updatedAt)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-text-tertiary">CURRENT VERSION</div>
                      <div className="text-sm font-semibold text-text-primary">
                        v{detail?.latestVersion?.version ?? detailItem?.version ?? "-"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-border-light bg-white p-3">
                  <div className="text-xs font-semibold text-text-secondary mb-2">安全扫描</div>
                  <p className="text-xs text-text-tertiary">
                    ClawHub 公共接口目前未返回 VirusTotal/OpenClaw
                    的扫描详情字段，当前仅能展示基础元数据。
                  </p>
                </div>

                <div className="rounded-md border border-border-light bg-white p-3">
                  <div className="text-xs font-semibold text-text-secondary mb-2">版本</div>
                  {detailVersions.length === 0 ? (
                    <p className="text-xs text-text-tertiary">暂无版本详情</p>
                  ) : (
                    <div className="space-y-2">
                      {detailVersions.slice(0, 8).map((version, idx) => (
                        <div
                          key={`${version.version ?? "unknown"}-${idx}`}
                          className="rounded border border-border-light p-2"
                        >
                          <div className="text-xs font-medium text-text-primary">
                            v{version.version ?? "-"}
                          </div>
                          <div className="text-[11px] text-text-tertiary mt-0.5">
                            {formatTime(version.createdAt)}
                          </div>
                          {version.changelog ? (
                            <p className="text-xs text-text-secondary mt-1 whitespace-pre-wrap break-words">
                              {version.changelog}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            {detailItem?.slug ? (
              <a
                href={`https://clawhub.ai/skills/${encodeURIComponent(detailItem.slug)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1 mr-auto"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                打开详情页
              </a>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setDetailItem(null)}>
              关闭
            </Button>
            {detailItem ? (
              <Button
                size="sm"
                disabled={(cooldownUntilBySlug[detailItem.slug] ?? 0) > nowMs}
                onClick={() => onInstall(detailItem)}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                {(cooldownUntilBySlug[detailItem.slug] ?? 0) > nowMs
                  ? `重试 ${Math.max(
                      1,
                      Math.ceil(((cooldownUntilBySlug[detailItem.slug] ?? 0) - nowMs) / 1000),
                    )}s`
                  : "安装"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                       */
/* ------------------------------------------------------------------ */

export function SkillsTab() {
  const { addToast } = useToastStore();
  const wsClient = useConnectionStore((s) => s.wsClient);

  // State
  const [status, setStatus] = useState<SkillStatusReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Dialogs
  const [uploadOpen, setUploadOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [clawhubOpen, setClawhubOpen] = useState(false);
  const [previewSkill, setPreviewSkill] = useState<SkillStatusEntry | null>(null);
  const [confirmInstall, setConfirmInstall] = useState<{
    title: string;
    source: string;
    description: string;
    action: () => Promise<string | void>;
  } | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [clawhubCooldownUntilBySlug, setClawhubCooldownUntilBySlug] = useState<
    Record<string, number>
  >({});
  const [installHistory, setInstallHistory] = useState<InstallHistoryEntry[]>([]);
  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);
  const [selectedSkillKeysForDelete, setSelectedSkillKeysForDelete] = useState<string[]>([]);
  const [confirmDeleteSkillKeys, setConfirmDeleteSkillKeys] = useState<string[] | null>(null);
  const [isDeletingSkills, setIsDeletingSkills] = useState(false);

  const appendInstallHistory = useCallback((entry: Omit<InstallHistoryEntry, "id" | "at">) => {
    setInstallHistory((prev) =>
      [
        {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          at: Date.now(),
        },
        ...prev,
      ].slice(0, 12),
    );
  }, []);

  // Load skills status
  const loadSkills = useCallback(async () => {
    if (!wsClient) {
      setError("未连接到网关");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await wsClient.sendRequest<SkillStatusReport>("skills.status", {});
      setStatus(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 Skills 失败");
    } finally {
      setIsLoading(false);
    }
  }, [wsClient]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  useEffect(() => {
    const deletable = new Set(
      (status?.skills ?? [])
        .filter((skill) => canBulkDeleteSkill(skill))
        .map((skill) => skill.skillKey),
    );
    setSelectedSkillKeysForDelete((prev) => prev.filter((skillKey) => deletable.has(skillKey)));
  }, [status]);

  // Toggle skill enabled/disabled
  const handleToggle = useCallback(
    async (skillKey: string, enabled: boolean) => {
      if (!wsClient) return;
      try {
        await wsClient.sendRequest("skills.update", { skillKey, enabled });
        addToast({
          title: enabled ? "已启用" : "已禁用",
          description: `Skill "${skillKey}" 已${enabled ? "启用" : "禁用"}`,
        });
        void loadSkills();
      } catch (err) {
        addToast({
          title: "操作失败",
          description: err instanceof Error ? err.message : "更新失败",
          variant: "error",
        });
      }
    },
    [wsClient, addToast, loadSkills],
  );

  // Install a skill binary dependency
  const handleInstall = useCallback(
    (skillName: string, installId: string) => {
      setConfirmInstall({
        title: `${skillName} - ${installId}`,
        source: "openclaw-bundled",
        description: `为 "${skillName}" 安装依赖组件 (${installId})`,
        action: async () => {
          if (!wsClient) return;
          const result = await wsClient.sendRequest<{ ok: boolean; message: string }>(
            "skills.install",
            { name: skillName, installId, timeoutMs: 60000 },
          );
          if (result?.ok) {
            addToast({ title: "安装成功", description: result.message || "依赖已安装" });
            return result.message || "依赖已安装";
          } else {
            throw new Error(result?.message || "安装失败");
          }
        },
      });
    },
    [wsClient, addToast],
  );

  // Set API key for a skill
  const handleSetApiKey = useCallback(
    async (skillKey: string, envKey: string, value: string) => {
      if (!wsClient) return;
      try {
        await wsClient.sendRequest("skills.update", {
          skillKey,
          env: { [envKey]: value },
        });
        addToast({
          title: "API Key 已保存",
          description: `${envKey} 已更新`,
        });
        void loadSkills();
      } catch (err) {
        addToast({
          title: "保存失败",
          description: err instanceof Error ? err.message : "API Key 保存失败",
          variant: "error",
        });
      }
    },
    [wsClient, addToast, loadSkills],
  );

  // GitHub install
  const handleGitHubInstall = useCallback(
    (url: string) => {
      setGithubOpen(false);
      setConfirmInstall({
        title: url.split("/").slice(-2).join("/"),
        source: "github",
        description: `从 GitHub 安装 Skill: ${url}`,
        action: async () => {
          if (!wsClient) return;
          // Use skills.install with a github-specific convention
          await wsClient.sendRequest("skills.install", {
            name: url,
            installId: "github",
            timeoutMs: 120000,
          });
          addToast({
            title: "安装成功",
            description: "Skill 已从 GitHub 安装",
          });
          return "Skill 已从 GitHub 安装";
        },
      });
    },
    [wsClient, addToast],
  );

  // ClawHub install
  const handleClawHubInstall = useCallback(
    (item: { slug: string; displayName: string; summary?: string; version?: string }) => {
      const requestedVersion =
        typeof item.version === "string" && item.version.trim() ? item.version.trim() : undefined;
      setClawhubOpen(false);
      setConfirmInstall({
        title: item.displayName,
        source: "clawhub",
        description: `从 ClawHub 安装 "${item.slug}"${requestedVersion ? ` (v${requestedVersion})` : ""}${item.summary ? `\n\n${item.summary}` : ""}`,
        action: async () => {
          if (!wsClient) return;
          const now = Date.now();
          const cooldownUntil = clawhubCooldownUntilBySlug[item.slug] ?? 0;
          if (cooldownUntil > now) {
            const seconds = Math.max(1, Math.ceil((cooldownUntil - now) / 1000));
            throw new Error(`ClawHub 请求过于频繁，请在 ${seconds}s 后重试`);
          }
          let result: { ok: boolean; message: string } | undefined;
          try {
            const legacyInstallParams = requestedVersion
              ? {
                  name: item.slug,
                  version: requestedVersion,
                  installId: "clawhub",
                  timeoutMs: 120000,
                }
              : {
                  name: item.slug,
                  installId: "clawhub",
                  timeoutMs: 120000,
                };
            const sourceInstallParams = requestedVersion
              ? {
                  source: "clawhub" as const,
                  slug: item.slug,
                  version: requestedVersion,
                  timeoutMs: 120000,
                }
              : {
                  source: "clawhub" as const,
                  slug: item.slug,
                  timeoutMs: 120000,
                };
            try {
              result = await wsClient.sendRequest<{ ok: boolean; message: string }>(
                "skills.install",
                legacyInstallParams,
              );
            } catch (legacyErr) {
              const legacyMessage =
                legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
              if (requestedVersion && isVersionParamError(legacyMessage)) {
                result = await wsClient.sendRequest<{ ok: boolean; message: string }>(
                  "skills.install",
                  {
                    name: item.slug,
                    installId: "clawhub",
                    timeoutMs: 120000,
                  },
                );
                // Legacy schema accepted only when version is omitted.
                // Continue into shared success/error handling below.
              }

              if (!isLegacyInstallShapeError(legacyMessage)) {
                throw legacyErr;
              }

              try {
                result = await wsClient.sendRequest<{ ok: boolean; message: string }>(
                  "skills.install",
                  sourceInstallParams,
                );
              } catch (sourceErr) {
                const sourceMessage =
                  sourceErr instanceof Error ? sourceErr.message : String(sourceErr);
                if (!requestedVersion || !isVersionParamError(sourceMessage)) {
                  if (!isSourceInstallShapeError(sourceMessage)) {
                    throw sourceErr;
                  }
                  throw sourceErr;
                }
                result = await wsClient.sendRequest<{ ok: boolean; message: string }>(
                  "skills.install",
                  {
                    source: "clawhub",
                    slug: item.slug,
                    timeoutMs: 120000,
                  },
                );
              }
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const retryAfterSeconds = parseRetryAfterSeconds(message);
            if (retryAfterSeconds) {
              setClawhubCooldownUntilBySlug((prev) => ({
                ...prev,
                [item.slug]: Date.now() + retryAfterSeconds * 1000,
              }));
            }
            throw err;
          }
          if (result?.ok) {
            const successMessage = result.message || "Skill 已从 ClawHub 安装";
            addToast({
              title: "安装成功",
              description: successMessage,
            });
            setClawhubCooldownUntilBySlug((prev) => {
              if (!(item.slug in prev)) {
                return prev;
              }
              const next = { ...prev };
              delete next[item.slug];
              return next;
            });
            return successMessage;
          } else {
            const message = result?.message || "安装失败";
            const retryAfterSeconds = parseRetryAfterSeconds(message);
            if (retryAfterSeconds) {
              setClawhubCooldownUntilBySlug((prev) => ({
                ...prev,
                [item.slug]: Date.now() + retryAfterSeconds * 1000,
              }));
            }
            throw new Error(message);
          }
        },
      });
    },
    [wsClient, addToast, clawhubCooldownUntilBySlug],
  );

  // Local upload
  const handleLocalUpload = useCallback(
    (skillName: string, skillMdContent: string, files: File[]) => {
      setUploadOpen(false);
      setConfirmInstall({
        title: skillName,
        source: "local-upload",
        description: `上传本地 Skill "${skillName}" (${files.length} 个文件)`,
        action: async () => {
          if (!wsClient) return;
          try {
            await wsClient.sendRequest("skills.upload", {
              name: skillName,
              skillMd: skillMdContent,
              timeoutMs: 60000,
            });
            addToast({
              title: "上传成功",
              description: `Skill "${skillName}" 已上传`,
            });
            return `Skill "${skillName}" 已上传`;
          } catch (err) {
            const msg = err instanceof Error ? err.message : "";
            if (
              msg.includes("not found") ||
              msg.includes("unknown method") ||
              msg.includes("not implemented")
            ) {
              throw new Error(
                `后端暂不支持通过 WebSocket 上传 Skill。请将 Skill 文件夹手动复制到 ${status?.managedSkillsDir ?? "~/.openclaw/skills/"} 目录下,然后刷新 Skills 列表。`,
              );
            }
            throw err;
          }
        },
      });
    },
    [wsClient, addToast, status?.managedSkillsDir],
  );

  // Confirm install action
  const handleConfirmInstall = async () => {
    if (!confirmInstall) return;
    setIsInstalling(true);
    const source = confirmInstall.source;
    const title = confirmInstall.title;
    try {
      const successMessage = (await confirmInstall.action()) || "安装成功";
      appendInstallHistory({
        source,
        title,
        status: "success",
        message: successMessage,
      });
      void loadSkills();
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      appendInstallHistory({
        source,
        title,
        status: "failed",
        message,
      });
      addToast({
        title: "安装失败",
        description: message,
        variant: "error",
      });
    } finally {
      setIsInstalling(false);
      setConfirmInstall(null);
    }
  };

  const formatHistoryTime = (ts: number): string =>
    new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });

  // Filter skills
  const filteredSkills =
    status?.skills.filter((s) => {
      if (!searchQuery) return true;
      const qRaw = searchQuery.toLowerCase();
      const qNorm = normalizeSearchText(searchQuery);
      const nameRaw = s.name.toLowerCase();
      const descRaw = s.description.toLowerCase();
      const keyRaw = s.skillKey.toLowerCase();
      const nameNorm = normalizeSearchText(s.name);
      const descNorm = normalizeSearchText(s.description);
      const keyNorm = normalizeSearchText(s.skillKey);
      return (
        nameRaw.includes(qRaw) ||
        descRaw.includes(qRaw) ||
        keyRaw.includes(qRaw) ||
        nameNorm.includes(qNorm) ||
        descNorm.includes(qNorm) ||
        keyNorm.includes(qNorm)
      );
    }) ?? [];

  // Group skills by source
  const grouped = {
    workspace: filteredSkills.filter((s) => s.source === "openclaw-workspace"),
    bundled: filteredSkills.filter((s) => s.source === "openclaw-bundled"),
    installed: filteredSkills.filter(
      (s) =>
        s.source === "openclaw-installed" ||
        s.source === "openclaw-extra" ||
        s.source === "openclaw-managed",
    ),
    other: filteredSkills.filter(
      (s) =>
        ![
          "openclaw-workspace",
          "openclaw-bundled",
          "openclaw-installed",
          "openclaw-extra",
          "openclaw-managed",
        ].includes(s.source),
    ),
  };

  const deletableFilteredSkillKeys = filteredSkills
    .filter((skill) => canBulkDeleteSkill(skill))
    .map((skill) => skill.skillKey);
  const selectedDeletableSkillKeySet = new Set(selectedSkillKeysForDelete);
  const selectedVisibleDeletableCount = deletableFilteredSkillKeys.filter((skillKey) =>
    selectedDeletableSkillKeySet.has(skillKey),
  ).length;
  const allVisibleDeletableSelected =
    deletableFilteredSkillKeys.length > 0 &&
    selectedVisibleDeletableCount === deletableFilteredSkillKeys.length;

  const handleToggleDeleteSelection = useCallback((skillKey: string, selected: boolean) => {
    setSelectedSkillKeysForDelete((prev) => {
      if (selected) {
        return prev.includes(skillKey) ? prev : [...prev, skillKey];
      }
      return prev.filter((key) => key !== skillKey);
    });
  }, []);

  const handleToggleSelectAllVisibleDeletable = useCallback(() => {
    setSelectedSkillKeysForDelete((prev) => {
      if (allVisibleDeletableSelected) {
        const visibleSet = new Set(deletableFilteredSkillKeys);
        return prev.filter((skillKey) => !visibleSet.has(skillKey));
      }
      const next = new Set(prev);
      for (const skillKey of deletableFilteredSkillKeys) {
        next.add(skillKey);
      }
      return [...next];
    });
  }, [allVisibleDeletableSelected, deletableFilteredSkillKeys]);

  const handleRequestBulkDelete = useCallback(() => {
    const selected = selectedSkillKeysForDelete.filter((skillKey) =>
      deletableFilteredSkillKeys.includes(skillKey),
    );
    if (selected.length === 0) {
      return;
    }
    setConfirmDeleteSkillKeys(selected);
  }, [deletableFilteredSkillKeys, selectedSkillKeysForDelete]);

  const handleConfirmDeleteSkills = useCallback(async () => {
    if (!wsClient || !confirmDeleteSkillKeys || confirmDeleteSkillKeys.length === 0) {
      setConfirmDeleteSkillKeys(null);
      return;
    }
    setIsDeletingSkills(true);
    try {
      const result = await wsClient.sendRequest<{
        ok: boolean;
        removed: number;
        results?: Array<{ skillKey: string; ok: boolean; message: string }>;
      }>("skills.delete", {
        skillKeys: confirmDeleteSkillKeys,
        timeoutMs: 180000,
      });
      const rows = result?.results ?? [];
      const failed = rows.filter((row) => !row.ok);
      const removed = Number.isFinite(result?.removed)
        ? Number(result.removed)
        : rows.length - failed.length;

      if (failed.length === 0) {
        addToast({
          title: "删除完成",
          description: `已删除 ${removed} 个 Skills`,
        });
        appendInstallHistory({
          source: "skills-delete",
          title: `批量删除 (${confirmDeleteSkillKeys.length})`,
          status: "success",
          message: `已删除 ${removed} 个 Skills`,
        });
        setSelectedSkillKeysForDelete([]);
        setBulkDeleteMode(false);
      } else {
        const detail = failed
          .slice(0, 3)
          .map((row) => `${row.skillKey}: ${row.message}`)
          .join("；");
        addToast({
          title: "部分删除失败",
          description:
            detail || `已删除 ${removed} 个，失败 ${failed.length} 个。请重试或查看网关日志。`,
          variant: "error",
        });
        appendInstallHistory({
          source: "skills-delete",
          title: `批量删除 (${confirmDeleteSkillKeys.length})`,
          status: "failed",
          message: detail || `已删除 ${removed} 个，失败 ${failed.length} 个`,
        });
        const failedKeySet = new Set(failed.map((row) => row.skillKey));
        setSelectedSkillKeysForDelete((prev) =>
          prev.filter((skillKey) => failedKeySet.has(skillKey)),
        );
      }
      void loadSkills();
    } catch (err) {
      const message = err instanceof Error ? err.message : "批量删除失败";
      addToast({
        title: "批量删除失败",
        description: message,
        variant: "error",
      });
      appendInstallHistory({
        source: "skills-delete",
        title: `批量删除 (${confirmDeleteSkillKeys.length})`,
        status: "failed",
        message,
      });
    } finally {
      setIsDeletingSkills(false);
      setConfirmDeleteSkillKeys(null);
    }
  }, [addToast, appendInstallHistory, confirmDeleteSkillKeys, loadSkills, wsClient]);

  // Loading state
  if (isLoading && !status) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
        <Loader2 className="w-8 h-8 text-text-tertiary animate-spin mb-3" />
        <p className="text-sm text-text-tertiary">加载 Skills...</p>
      </div>
    );
  }

  // Error state
  if (error && !status) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
        <AlertCircle className="w-10 h-10 text-error mb-3" />
        <p className="text-sm text-text-primary mb-1">加载 Skills 失败</p>
        <p className="text-xs text-text-tertiary mb-4">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void loadSkills()}>
          <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
          重试
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-[24rem]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索 Skills..."
            className="h-8 text-xs pl-8"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => void loadSkills()}
            disabled={isLoading}
          >
            <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            刷新
          </Button>

          {deletableFilteredSkillKeys.length > 0 && (
            <>
              {bulkDeleteMode && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={handleToggleSelectAllVisibleDeletable}
                >
                  {allVisibleDeletableSelected ? "取消全选" : "全选可删"}
                </Button>
              )}
              <Button
                size="sm"
                variant={bulkDeleteMode ? "destructive" : "outline"}
                className="h-8 text-xs"
                onClick={() => {
                  if (bulkDeleteMode) {
                    void handleRequestBulkDelete();
                    return;
                  }
                  setBulkDeleteMode(true);
                }}
                disabled={bulkDeleteMode && selectedVisibleDeletableCount === 0}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                {bulkDeleteMode
                  ? `删除选中 (${selectedVisibleDeletableCount})`
                  : `批量删除 (${deletableFilteredSkillKeys.length})`}
              </Button>
              {bulkDeleteMode && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => {
                    setBulkDeleteMode(false);
                    setSelectedSkillKeysForDelete([]);
                  }}
                >
                  取消
                </Button>
              )}
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 text-xs">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                添加 Skill
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setUploadOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                上传本地 Skill
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setGithubOpen(true)}>
                <Github className="w-4 h-4 mr-2" />从 GitHub 安装
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setClawhubOpen(true)}>
                <Globe className="w-4 h-4 mr-2" />从 ClawHub 浏览
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-text-tertiary">
        <span>共 {status?.skills.length ?? 0} 个 Skills</span>
        <span>已启用 {status?.skills.filter((s) => !s.disabled).length ?? 0}</span>
        <span>可用 {status?.skills.filter((s) => s.eligible).length ?? 0}</span>
        {bulkDeleteMode && <span>已选删除 {selectedVisibleDeletableCount} 个</span>}
      </div>

      {installHistory.length > 0 && (
        <div className="rounded-md border border-border-light bg-surface-subtle p-3">
          <div className="text-xs font-semibold text-text-secondary mb-2">安装历史</div>
          <div className="space-y-1.5">
            {installHistory.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-2 text-xs text-text-secondary min-w-0"
              >
                <span className="text-text-tertiary w-14">{formatHistoryTime(entry.at)}</span>
                <SourceBadge source={entry.source} />
                <span
                  className={
                    entry.status === "success"
                      ? "text-green-700 min-w-[36px]"
                      : "text-red-700 min-w-[36px]"
                  }
                >
                  {entry.status === "success" ? "成功" : "失败"}
                </span>
                <span className="text-text-primary max-w-[18rem] break-all shrink-0">
                  {entry.title}
                </span>
                <span className="text-text-tertiary min-w-0 whitespace-pre-wrap break-all">
                  {entry.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills list by group */}
      {filteredSkills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Zap className="w-10 h-10 text-text-tertiary mb-3" />
          <p className="text-sm text-text-primary mb-1">
            {searchQuery ? "未找到匹配的 Skills" : "暂无已安装的 Skills"}
          </p>
          <p className="text-xs text-text-tertiary">
            {searchQuery ? "尝试修改搜索关键词" : '点击 "添加 Skill" 开始安装'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.workspace.length > 0 && (
            <SkillGroup
              title="工作区 Skills"
              skills={grouped.workspace}
              onToggle={handleToggle}
              onInstall={handleInstall}
              onSetApiKey={handleSetApiKey}
              onPreviewCode={setPreviewSkill}
              bulkDeleteMode={bulkDeleteMode}
              selectedSkillKeys={selectedSkillKeysForDelete}
              onToggleDeleteSelection={handleToggleDeleteSelection}
            />
          )}
          {grouped.bundled.length > 0 && (
            <SkillGroup
              title="内置 Skills"
              skills={grouped.bundled}
              onToggle={handleToggle}
              onInstall={handleInstall}
              onSetApiKey={handleSetApiKey}
              onPreviewCode={setPreviewSkill}
              bulkDeleteMode={bulkDeleteMode}
              selectedSkillKeys={selectedSkillKeysForDelete}
              onToggleDeleteSelection={handleToggleDeleteSelection}
            />
          )}
          {grouped.installed.length > 0 && (
            <SkillGroup
              title="已安装 Skills"
              skills={grouped.installed}
              onToggle={handleToggle}
              onInstall={handleInstall}
              onSetApiKey={handleSetApiKey}
              onPreviewCode={setPreviewSkill}
              bulkDeleteMode={bulkDeleteMode}
              selectedSkillKeys={selectedSkillKeysForDelete}
              onToggleDeleteSelection={handleToggleDeleteSelection}
            />
          )}
          {grouped.other.length > 0 && (
            <SkillGroup
              title="其他 Skills"
              skills={grouped.other}
              onToggle={handleToggle}
              onInstall={handleInstall}
              onSetApiKey={handleSetApiKey}
              onPreviewCode={setPreviewSkill}
              bulkDeleteMode={bulkDeleteMode}
              selectedSkillKeys={selectedSkillKeysForDelete}
              onToggleDeleteSelection={handleToggleDeleteSelection}
            />
          )}
        </div>
      )}

      {/* Dialogs */}
      <LocalUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUpload={handleLocalUpload}
      />

      <GitHubInstallDialog
        open={githubOpen}
        onClose={() => setGithubOpen(false)}
        onInstall={handleGitHubInstall}
      />

      <ClawHubDialog
        open={clawhubOpen}
        onClose={() => setClawhubOpen(false)}
        onInstall={handleClawHubInstall}
        cooldownUntilBySlug={clawhubCooldownUntilBySlug}
      />

      <SkillCodePreviewDialog
        open={previewSkill !== null}
        skill={previewSkill}
        onClose={() => setPreviewSkill(null)}
      />

      <InstallConfirmDialog
        open={confirmInstall !== null}
        title={confirmInstall?.title ?? ""}
        source={confirmInstall?.source ?? ""}
        description={confirmInstall?.description ?? ""}
        isInstalling={isInstalling}
        onConfirm={handleConfirmInstall}
        onCancel={() => setConfirmInstall(null)}
      />

      <BulkDeleteConfirmDialog
        open={confirmDeleteSkillKeys !== null}
        skillKeys={confirmDeleteSkillKeys ?? []}
        isDeleting={isDeletingSkills}
        onConfirm={handleConfirmDeleteSkills}
        onCancel={() => {
          if (isDeletingSkills) {
            return;
          }
          setConfirmDeleteSkillKeys(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skill group                                                          */
/* ------------------------------------------------------------------ */

function SkillGroup({
  title,
  skills,
  onToggle,
  onInstall,
  onSetApiKey,
  onPreviewCode,
  bulkDeleteMode,
  selectedSkillKeys,
  onToggleDeleteSelection,
}: {
  title: string;
  skills: SkillStatusEntry[];
  onToggle: (skillKey: string, enabled: boolean) => void;
  onInstall: (skillName: string, installId: string) => void;
  onSetApiKey: (skillKey: string, envKey: string, value: string) => void;
  onPreviewCode: (skill: SkillStatusEntry) => void;
  bulkDeleteMode: boolean;
  selectedSkillKeys: string[];
  onToggleDeleteSelection: (skillKey: string, selected: boolean) => void;
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
        {title} ({skills.length})
      </h4>
      <div className="grid gap-3">
        {skills.map((skill) => (
          <SkillCard
            key={skill.skillKey}
            skill={skill}
            onToggle={onToggle}
            onInstall={onInstall}
            onSetApiKey={onSetApiKey}
            onPreviewCode={onPreviewCode}
            bulkDeleteMode={bulkDeleteMode}
            selectedForDelete={selectedSkillKeys.includes(skill.skillKey)}
            onToggleDeleteSelection={onToggleDeleteSelection}
          />
        ))}
      </div>
    </div>
  );
}
