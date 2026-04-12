"use client";

import {
  User,
  ChevronDown,
  ChevronUp,
  Copy,
  Pencil,
  Check,
  X,
  Paperclip,
  Download,
} from "lucide-react";
import dynamic from "next/dynamic";
import { memo, useMemo, useState, useRef, useEffect } from "react";
import { FormattedContent } from "@/components/agent/FormattedContent";
import { CitationBlock, Citation } from "@/components/chat/CitationBlock";
import type { AssistantRichPart, SessionAttachmentMeta } from "@/components/chat/MessageList";
import { resolveDisplayType, type DisplayFileType } from "@/components/files/file-type-registry";
import { FileList, FileItemProps } from "@/components/files/FileList";
import { useStreamingReplay } from "@/contexts/StreamingReplayContext";
import { useResponsive } from "@/hooks/useResponsive";
import { ApprovalDecision, parseApprovalCommandFromText } from "@/lib/approval-command";
import {
  getSharedApprovalState,
  isUnknownOrExpiredApprovalError,
  setSharedApprovalStale,
  setSharedApprovalSubmitted,
  setSharedApprovalSubmitting,
} from "@/lib/approval-state";
import { openPathInSystem } from "@/services/desktop-file-actions";
import type { KnowledgeDetail } from "@/services/knowledgeApi";
import { getKnowledge } from "@/services/knowledgeApi";
import { resolveSessionKnowledgeDocumentRef, uploadSessionDocument } from "@/services/pageindexApi";
import {
  createBlobFromBase64,
  decodeBase64ToText,
  readAgentWorkspaceFile,
} from "@/services/workspaceFileApi";
import { useConnectionStore } from "@/stores/connectionStore";
import { useToastStore } from "@/stores/toastStore";

const LazyDocPreview = dynamic(
  () => import("@/components/knowledge/preview/DocPreview").then((mod) => mod.DocPreview),
  {
    ssr: false,
  },
);

interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: string) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getViewport: (options: { scale: number }) => { width: number; height: number };
        render: (options: {
          canvas: HTMLCanvasElement;
          canvasContext: CanvasRenderingContext2D;
          viewport: { width: number; height: number };
        }) => { promise: Promise<void> };
      }>;
      getOutline: () => Promise<Array<{
        title?: string;
        dest?: string | unknown[] | null;
        items?: Array<{
          title?: string;
          dest?: string | unknown[] | null;
          items?: unknown[];
        }>;
      }> | null>;
      getDestination: (destinationId: string) => Promise<unknown[] | null>;
      getPageIndex: (ref: { num: number; gen: number }) => Promise<number>;
    }>;
  };
}

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
  }
}

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  richParts?: AssistantRichPart[];
  messageId?: string;
  timestamp?: Date;
  sessionKey?: string | null;
  attachments?: File[];
  sessionAttachments?: SessionAttachmentMeta[];
  files?: FileItemProps[];
  usage?: {
    input?: number;
    output?: number;
    total?: number;
  };
  toolCalls?: Array<{
    id?: string;
    name?: string;
    arguments?: unknown;
    status?: "running" | "done";
    durationMs?: number;
  }>;
  toolResults?: Array<{
    toolCallId?: string;
    toolName?: string;
    content?: string;
    isError?: boolean;
    durationMs?: number;
  }>;
  citations?: Citation[];
  status?: "sending" | "failed" | "waiting" | "cancelled";
  onRetry?: () => void;
  onEditRetry?: () => void;
  onCopyRetry?: () => void;
  onDelete?: () => void;
  onCancel?: () => void;
  onEdit?: () => void;
  onEditConfirm?: (newContent: string) => void;
  onEditCancel?: () => void;
  onCopy?: (content: string) => void;
  isEditing?: boolean;
  messageIndex?: number; // Index of this message in the list
  autoApproveAlways?: boolean;
}

interface SkillStatusReport {
  skills?: Array<{
    skillKey: string;
    disabled?: boolean;
    eligible?: boolean;
  }>;
}

type SkillStatusWsClient = {
  sendRequest: <T>(method: string, params: unknown) => Promise<T>;
};

const APPROVAL_DECISION_LABELS: Record<ApprovalDecision, string> = {
  "allow-once": "本次同意",
  "allow-always": "始终同意",
  deny: "拒绝",
};

const APPROVAL_LINE_RE =
  /^\s*\/?approve(?:@[^\s]+)?\s+[A-Za-z0-9][A-Za-z0-9._:-]*\s+(?:allow-once|allow-always|always|deny)(?:\|allow-always\|deny)?\s*$/i;
const DEVICE_PAIR_LINE_RE =
  /^\s*(?:openclaw|moltbot)\s+devices\s+approve\s+[A-Za-z0-9][A-Za-z0-9-]*\s*$/i;
const INLINE_APPROVAL_COMMAND_RE =
  /\/?approve(?:@[^\s]+)?\s+[A-Za-z0-9][A-Za-z0-9._:-]*\s+(?:allow-once\|allow-always\|deny|allow-once|allow-always|always|deny)\b/gi;
const APPROVAL_DESCRIPTION_PREFIXES = [
  /^(?:需要你批准一下这个操作|需要您批准一下这个操作|请审批|需要审批|请批准|请确认|操作需要确认|请先审批|审批请求|待审批操作)\s*[:：]?\s*/i,
  /^(?:approval required(?:\.?\s*reply with)?|please approve|approval request|requires approval|approve this operation)\s*[:：]?\s*/i,
];
const FALLBACK_APPROVAL_OPERATION = "助手请求执行一项需要确认的操作";

function stripControlLines(content: string): string {
  return content
    .split("\n")
    .filter((line) => !APPROVAL_LINE_RE.test(line) && !DEVICE_PAIR_LINE_RE.test(line))
    .join("\n")
    .trim();
}

function normalizeApprovalDescriptionLine(line: string): string {
  let normalized = line.replace(INLINE_APPROVAL_COMMAND_RE, " ").replace(/\s+/g, " ").trim();
  for (const prefix of APPROVAL_DESCRIPTION_PREFIXES) {
    normalized = normalized.replace(prefix, "").trim();
  }
  if (/^[.:：-]+$/.test(normalized)) {
    return "";
  }
  return normalized;
}

function deriveApprovalOperationSummary(content: string): string {
  const cleanedLines = content
    .split("\n")
    .map((line) => normalizeApprovalDescriptionLine(line))
    .filter(Boolean);
  if (cleanedLines.length === 0) {
    return FALLBACK_APPROVAL_OPERATION;
  }
  return cleanedLines.join(" ");
}

function getApprovalScopeSummary(decisions: ApprovalDecision[]): string {
  const supportsAllowOnce = decisions.includes("allow-once");
  const supportsAllowAlways = decisions.includes("allow-always");
  if (supportsAllowOnce && supportsAllowAlways) {
    return "可选“仅本次”或“始终允许”";
  }
  if (supportsAllowAlways) {
    return "始终允许";
  }
  if (supportsAllowOnce) {
    return "仅本次";
  }
  return "请按下方按钮确认";
}

const SKILL_KEY_CACHE_TTL_MS = 60_000;
let cachedSkillKeys: Set<string> | null = null;
let cachedSkillKeysAt = 0;
let inflightSkillKeysRequest: Promise<Set<string>> | null = null;

function isBlobUrl(value: string | null): boolean {
  return value?.startsWith("blob:") ?? false;
}

function isTextLikeDisplayType(displayType: DisplayFileType): boolean {
  return (
    displayType === "markdown" ||
    displayType === "json" ||
    displayType === "yaml" ||
    displayType === "xml" ||
    displayType === "csv" ||
    displayType === "sql" ||
    displayType === "log" ||
    displayType === "shell" ||
    displayType === "code" ||
    displayType === "text"
  );
}

function resolveFileCardPreviewMode(file: FileItemProps): "image" | "pdf" | "text" | null {
  const displayType = resolveDisplayType({
    name: file.name,
    resolvedPath: file.resolvedPath,
    type: file.type,
    kind: file.kind,
  });

  if (displayType === "image") return "image";
  if (displayType === "pdf") return "pdf";
  if (isTextLikeDisplayType(displayType)) return "text";
  return null;
}

async function loadAvailableSkillKeys(wsClient?: SkillStatusWsClient | null): Promise<Set<string>> {
  if (!wsClient) {
    return new Set<string>();
  }
  const now = Date.now();
  if (cachedSkillKeys && now - cachedSkillKeysAt < SKILL_KEY_CACHE_TTL_MS) {
    return cachedSkillKeys;
  }
  if (inflightSkillKeysRequest) {
    return inflightSkillKeysRequest;
  }
  inflightSkillKeysRequest = wsClient
    .sendRequest<SkillStatusReport>("skills.status", {})
    .then((report) => {
      const keys = new Set(
        (report.skills ?? [])
          .filter((skill) => !skill.disabled && skill.eligible !== false)
          .map((skill) => skill.skillKey),
      );
      cachedSkillKeys = keys;
      cachedSkillKeysAt = Date.now();
      return keys;
    })
    .catch(() => new Set<string>())
    .finally(() => {
      inflightSkillKeysRequest = null;
    });
  return inflightSkillKeysRequest;
}

function isSkillToken(value: string, availableSkillKeys: Set<string> | null) {
  if (!/^\/[\p{L}\p{N}._-]+$/u.test(value)) {
    return false;
  }
  if (!availableSkillKeys) {
    return false;
  }
  return availableSkillKeys.has(value.slice(1));
}

function renderUserMessageWithSkillHighlight(
  content: string,
  availableSkillKeys: Set<string> | null,
) {
  const segments = content.split(/(\/[\p{L}\p{N}._-]+)/gu);
  return segments.map((segment, index) => {
    if (!segment) {
      return null;
    }
    if (isSkillToken(segment, availableSkillKeys)) {
      return (
        <span
          key={`skill-${index}-${segment}`}
          data-testid="skill-token"
          className="inline-flex items-center rounded-md border border-white/35 bg-white/20 px-1.5 py-[1px] font-medium text-white"
        >
          {segment}
        </span>
      );
    }
    return <span key={`text-${index}-${segment}`}>{segment}</span>;
  });
}

export function MessageBubble({
  role,
  content,
  richParts = [],
  messageId,
  timestamp,
  sessionKey = null,
  attachments = [],
  sessionAttachments = [],
  files,
  usage,
  toolCalls = [],
  toolResults = [],
  citations,
  status,
  onRetry,
  onEditRetry,
  onCopyRetry,
  onDelete,
  onCancel,
  onEdit,
  onEditConfirm,
  onEditCancel,
  onCopy,
  isEditing = false,
  messageIndex = 0,
  autoApproveAlways = false,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const isWaiting = status === "waiting";
  const isCancelled = status === "cancelled";
  const { isStreaming, getDisplayedText, currentMessageIndex } = useStreamingReplay();
  const { isMobile } = useResponsive();
  const { addToast } = useToastStore();
  const wsClient = useConnectionStore((s) => s.wsClient as SkillStatusWsClient | undefined);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [availableSkillKeys, setAvailableSkillKeys] = useState<Set<string> | null>(
    () => cachedSkillKeys,
  );
  const [previewAttachment, setPreviewAttachment] = useState<File | null>(null);
  const [previewAttachmentLabel, setPreviewAttachmentLabel] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewKnowledgeDetail, setPreviewKnowledgeDetail] = useState<KnowledgeDetail | null>(
    null,
  );
  const [previewKnowledgeLoading, setPreviewKnowledgeLoading] = useState(false);
  const [previewPdfPages, setPreviewPdfPages] = useState(0);
  const [previewPdfPage, setPreviewPdfPage] = useState(1);
  const [previewPdfLoading, setPreviewPdfLoading] = useState(false);
  const [previewPdfError, setPreviewPdfError] = useState<string | null>(null);
  const [previewPdfZoom, setPreviewPdfZoom] = useState(1);
  const [previewPdfRenderKey, setPreviewPdfRenderKey] = useState(0);
  const previewKnowledgeRefs = useRef<Map<string, { documentId: string; kbId?: string }>>(
    new Map(),
  );
  const previewPdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewPdfDocRef = useRef<{
    getPage: (pageNumber: number) => Promise<{
      getViewport: (options: { scale: number }) => { width: number; height: number };
      render: (options: {
        canvas: HTMLCanvasElement;
        canvasContext: CanvasRenderingContext2D;
        viewport: { width: number; height: number };
      }) => { promise: Promise<void> };
    }>;
  } | null>(null);
  const previewPdfRenderingRef = useRef(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const [approvalSubmittingDecision, setApprovalSubmittingDecision] =
    useState<ApprovalDecision | null>(null);
  const [approvalSubmittedDecision, setApprovalSubmittedDecision] =
    useState<ApprovalDecision | null>(null);
  const [approvalSubmitError, setApprovalSubmitError] = useState<string | null>(null);

  // 当进入编辑模式时，加载原内容
  useEffect(() => {
    if (isEditing) {
      setEditContent(content);
    }
  }, [isEditing, content]);

  useEffect(() => {
    if (!isUser || !content.includes("/")) {
      setAvailableSkillKeys(null);
      return;
    }
    let active = true;
    void loadAvailableSkillKeys(wsClient)
      .then((keys) => {
        if (active) {
          setAvailableSkillKeys(keys);
        }
      })
      .catch(() => {
        if (active) {
          setAvailableSkillKeys(new Set<string>());
        }
      });
    return () => {
      active = false;
    };
  }, [content, isUser, wsClient]);

  // Get displayed content (full for non-streaming or user messages, streamed for assistant during replay)
  const displayedContent =
    isUser || !isStreaming ? content : getDisplayedText(messageIndex, "summary", content);
  const parsedApprovalCommand = useMemo(() => {
    if (isUser) return null;
    return parseApprovalCommandFromText(displayedContent);
  }, [displayedContent, isUser]);
  const approvalId = parsedApprovalCommand?.id ?? null;
  const isHistoricalApprovalRecord = Boolean(
    !isUser && parsedApprovalCommand && messageId?.startsWith("history-"),
  );
  const visibleAssistantContent = useMemo(
    () => (isUser ? displayedContent : stripControlLines(displayedContent)),
    [displayedContent, isUser],
  );
  const approvalOperationSummary = useMemo(
    () =>
      parsedApprovalCommand && !isUser
        ? deriveApprovalOperationSummary(visibleAssistantContent)
        : FALLBACK_APPROVAL_OPERATION,
    [isUser, parsedApprovalCommand, visibleAssistantContent],
  );

  // Hide assistant messages that haven't been reached yet during streaming
  if (!isUser && isStreaming && messageIndex > currentMessageIndex) {
    return null;
  }

  // Hide files until message content is fully displayed
  const isFullyDisplayed = !isStreaming || displayedContent.length === content.length;
  const shouldShowFiles = isFullyDisplayed;
  const shouldShowMeta = isFullyDisplayed;
  const hasToolInfo = toolCalls.length > 0 || toolResults.length > 0;
  const approvalCommands = parsedApprovalCommand?.decisions ?? [];
  const approvalScopeSummary = useMemo(
    () => getApprovalScopeSummary(approvalCommands),
    [approvalCommands],
  );
  const canAutoApproveAlways = approvalCommands.includes("allow-always");
  const approvalIsTerminal =
    approvalSubmittedDecision != null ||
    approvalSubmitError === "该审批已处理或已过期。" ||
    isHistoricalApprovalRecord;
  const approvalIsBusy = approvalSubmittingDecision != null;
  const autoApprovalDecision: ApprovalDecision | null = autoApproveAlways
    ? canAutoApproveAlways
      ? "allow-always"
      : approvalCommands.includes("allow-once")
        ? "allow-once"
        : null
    : null;
  const formatDuration = (durationMs?: number) => {
    if (durationMs == null) return null;
    if (durationMs < 1000) return `${durationMs}ms`;
    return `${(durationMs / 1000).toFixed(1)}s`;
  };

  const usageLabel = useMemo(() => {
    if (!usage) return null;
    const input = usage.input ?? undefined;
    const output = usage.output ?? undefined;
    const total = usage.total ?? undefined;
    if (input != null || output != null) {
      const parts = [];
      if (input != null) parts.push(`输入 ${input}`);
      if (output != null) parts.push(`输出 ${output}`);
      if (total != null) parts.push(`总计 ${total}`);
      return parts.join(" · ");
    }
    if (total != null) return `总计 ${total}`;
    return null;
  }, [usage]);

  const hasUserAttachments = isUser && (attachments.length > 0 || sessionAttachments.length > 0);
  const assistantRichParts = !isUser ? richParts : [];
  const previewAttachmentIsPdf = previewAttachment ? isPdf(previewAttachment) : false;
  const previewDisplayType = useMemo(() => {
    const label = previewAttachment?.name ?? previewAttachmentLabel;
    if (!label) return null;
    return resolveDisplayType({ name: label, kind: "file" });
  }, [previewAttachment, previewAttachmentLabel]);

  const resetPreviewPdfState = () => {
    setPreviewPdfPages(0);
    setPreviewPdfPage(1);
    setPreviewPdfLoading(false);
    setPreviewPdfError(null);
    setPreviewPdfZoom(1);
    previewPdfDocRef.current = null;
  };

  const releasePreviewUrl = () => {
    if (previewUrl && isBlobUrl(previewUrl)) {
      URL.revokeObjectURL(previewUrl);
    }
  };

  const isTextPreviewable = (file: File) => {
    const lower = file.name.toLowerCase();
    return (
      file.type.startsWith("text/") ||
      file.type === "application/json" ||
      lower.endsWith(".txt") ||
      lower.endsWith(".md") ||
      lower.endsWith(".markdown") ||
      lower.endsWith(".csv") ||
      lower.endsWith(".json")
    );
  };

  function isPdf(file: File) {
    const lower = file.name.toLowerCase();
    return file.type === "application/pdf" || lower.endsWith(".pdf");
  }

  const supportsKnowledgePreview = (file: File) => {
    const lower = file.name.toLowerCase();
    return (
      lower.endsWith(".docx") ||
      lower.endsWith(".xlsx") ||
      lower.endsWith(".xls") ||
      lower.endsWith(".csv")
    );
  };

  const buildPreviewCacheKey = (session: string | null | undefined, file: File) => {
    return `${session ?? "no-session"}:${file.name}:${file.size}:${file.lastModified}`;
  };

  const resolveKnowledgePreviewRef = async (file: File) => {
    const cacheKey = buildPreviewCacheKey(sessionKey, file);
    const cached = previewKnowledgeRefs.current.get(cacheKey);
    if (cached) {
      return cached;
    }
    if (!sessionKey) {
      throw new Error("当前会话不可用，无法加载文档预览");
    }

    const uploadResult = await uploadSessionDocument({ sessionKey, file });
    const resolved = await resolveSessionKnowledgeDocumentRef({
      sessionKey,
      documentId: uploadResult.documentId,
      filename: file.name,
      knowledgeDocumentId: uploadResult.knowledgeDocumentId,
      kbId: uploadResult.kbId,
    });

    const ref = { documentId: resolved.knowledgeDocumentId, kbId: resolved.kbId };
    previewKnowledgeRefs.current.set(cacheKey, ref);
    return ref;
  };

  const resolveKnowledgePreviewRefForSessionAttachment = async (
    attachment: SessionAttachmentMeta,
  ) => {
    const cacheKey = `session:${attachment.documentId}:${attachment.knowledgeDocumentId ?? ""}`;
    const cached = previewKnowledgeRefs.current.get(cacheKey);
    if (cached) {
      return cached;
    }
    if (attachment.knowledgeDocumentId) {
      const ref = { documentId: attachment.knowledgeDocumentId, kbId: attachment.kbId };
      previewKnowledgeRefs.current.set(cacheKey, ref);
      return ref;
    }
    if (!sessionKey) {
      throw new Error("当前会话不可用，无法加载文档预览");
    }
    const resolved = await resolveSessionKnowledgeDocumentRef({
      sessionKey,
      documentId: attachment.documentId,
      filename: attachment.name,
      knowledgeDocumentId: attachment.knowledgeDocumentId,
      kbId: attachment.kbId,
    });
    const ref = { documentId: resolved.knowledgeDocumentId, kbId: resolved.kbId };
    previewKnowledgeRefs.current.set(cacheKey, ref);
    return ref;
  };

  const handlePreviewAttachment = async (file: File) => {
    releasePreviewUrl();
    setPreviewAttachment(file);
    setPreviewAttachmentLabel(file.name);
    setPreviewText(null);
    setPreviewError(null);
    setPreviewUrl(null);
    setPreviewKnowledgeDetail(null);
    setPreviewKnowledgeLoading(false);
    resetPreviewPdfState();

    if (file.type.startsWith("image/") || isPdf(file)) {
      setPreviewUrl(URL.createObjectURL(file));
      return;
    }

    if (isTextPreviewable(file)) {
      try {
        const text = await file.text();
        setPreviewText(text);
      } catch {
        setPreviewError("读取文本内容失败");
      }
      return;
    }

    if (supportsKnowledgePreview(file)) {
      setPreviewKnowledgeLoading(true);
      try {
        const ref = await resolveKnowledgePreviewRef(file);
        const detail = await getKnowledge(ref.documentId, ref.kbId);
        setPreviewKnowledgeDetail(detail);
      } catch (error) {
        setPreviewError(error instanceof Error ? error.message : "加载文档预览失败");
      } finally {
        setPreviewKnowledgeLoading(false);
      }
      return;
    }

    setPreviewError("当前格式暂不支持在线预览，可下载后查看。");
  };

  const handlePreviewSessionAttachment = async (attachment: SessionAttachmentMeta) => {
    releasePreviewUrl();
    setPreviewAttachment(null);
    setPreviewAttachmentLabel(attachment.name);
    setPreviewText(null);
    setPreviewError(null);
    setPreviewUrl(null);
    setPreviewKnowledgeDetail(null);
    setPreviewKnowledgeLoading(true);
    resetPreviewPdfState();
    try {
      const ref = await resolveKnowledgePreviewRefForSessionAttachment(attachment);
      const detail = await getKnowledge(ref.documentId, ref.kbId);
      setPreviewKnowledgeDetail(detail);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "加载文档预览失败");
    } finally {
      setPreviewKnowledgeLoading(false);
    }
  };

  const closeAttachmentPreview = () => {
    releasePreviewUrl();
    setPreviewAttachment(null);
    setPreviewAttachmentLabel(null);
    setPreviewUrl(null);
    setPreviewText(null);
    setPreviewError(null);
    setPreviewKnowledgeDetail(null);
    setPreviewKnowledgeLoading(false);
    resetPreviewPdfState();
  };

  const handleDownloadAttachment = (file: File) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    return () => {
      if (previewUrl && isBlobUrl(previewUrl)) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    let isActive = true;
    if (!previewAttachmentIsPdf || !previewUrl) {
      return;
    }
    const loadPdfJs = (): Promise<PdfJsLib> =>
      new Promise((resolve, reject) => {
        if (window.pdfjsLib) {
          resolve(window.pdfjsLib);
          return;
        }
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js";
        script.onload = () => {
          if (window.pdfjsLib) {
            resolve(window.pdfjsLib);
          } else {
            reject(new Error("PDF.js 未正确加载"));
          }
        };
        script.onerror = () => reject(new Error("PDF.js 加载失败"));
        document.head.appendChild(script);
      });

    const initPdf = async () => {
      setPreviewPdfLoading(true);
      setPreviewPdfError(null);
      try {
        const pdfjs = await loadPdfJs();
        if (!isActive) return;
        pdfjs.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
        const loadingTask = pdfjs.getDocument(previewUrl);
        const pdf = await loadingTask.promise;
        if (!isActive) return;
        previewPdfDocRef.current = pdf;
        setPreviewPdfPages(pdf.numPages);
        setPreviewPdfPage(1);
        setPreviewPdfRenderKey((key) => key + 1);
      } catch (error) {
        setPreviewPdfError(error instanceof Error ? error.message : "PDF 加载失败");
      } finally {
        if (isActive) {
          setPreviewPdfLoading(false);
        }
      }
    };

    void initPdf();

    return () => {
      isActive = false;
    };
  }, [previewAttachmentIsPdf, previewUrl]);

  useEffect(() => {
    const renderPdfPage = async () => {
      if (!previewAttachmentIsPdf || !previewPdfDocRef.current || !previewPdfCanvasRef.current)
        return;
      if (previewPdfRenderingRef.current) return;
      previewPdfRenderingRef.current = true;
      try {
        const page = await previewPdfDocRef.current.getPage(previewPdfPage);
        const viewport = page.getViewport({ scale: 1.2 * previewPdfZoom });
        const canvas = previewPdfCanvasRef.current;
        const context = canvas.getContext("2d");
        if (!canvas || !context) return;
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvas, canvasContext: context, viewport }).promise;
      } finally {
        previewPdfRenderingRef.current = false;
      }
    };

    void renderPdfPage();
  }, [previewAttachmentIsPdf, previewPdfPage, previewPdfZoom, previewPdfRenderKey]);

  const handlePreviewFileCard = async (file: FileItemProps) => {
    if (file.kind === "directory") {
      addToast({
        title: "目录不支持预览",
        description: file.resolvedPath ?? file.path,
        variant: "warning",
      });
      return;
    }
    if (file.source === "detected-path" && !file.previewable) {
      addToast({
        title: "当前路径暂不支持预览",
        description: file.resolvedPath ?? file.path,
        variant: "warning",
      });
      return;
    }
    const previewMode = resolveFileCardPreviewMode(file);
    if (!previewMode) {
      addToast({
        title: "当前文件暂不支持预览",
        description: file.resolvedPath ?? file.path,
        variant: "warning",
      });
      return;
    }

    releasePreviewUrl();
    setPreviewAttachment(null);
    setPreviewAttachmentLabel(file.name);
    setPreviewText(null);
    setPreviewError(null);
    setPreviewUrl(null);
    setPreviewKnowledgeDetail(null);
    setPreviewKnowledgeLoading(false);
    resetPreviewPdfState();

    try {
      if (file.source === "detected-path") {
        const agentId = file.agentId ?? "main";
        const name = file.workspaceRelativePath;
        if (!name) {
          throw new Error("当前路径不在工作区内，无法通过 gateway 预览");
        }
        const previewFile = await readAgentWorkspaceFile({ agentId, name });
        if (previewFile.missing) {
          throw new Error("文件不存在或已被移动");
        }
        const content = previewFile.content;
        const mimetype = previewFile.mimetype ?? "application/octet-stream";
        if (!content) {
          throw new Error("文件内容为空，无法预览");
        }

        if (previewMode === "image" || previewMode === "pdf") {
          const blob = createBlobFromBase64(content, mimetype);
          setPreviewUrl(URL.createObjectURL(blob));
          return;
        }

        setPreviewText(decodeBase64ToText(content));
        return;
      }

      const previewTarget = file.previewUrl ?? file.path;
      if (!previewTarget) {
        throw new Error("路径不可预览");
      }
      if (previewMode === "image" || previewMode === "pdf") {
        setPreviewUrl(previewTarget);
        return;
      }

      const response = await fetch(previewTarget, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("读取预览内容失败");
      }
      const text = await response.text();
      setPreviewText(text);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "读取预览内容失败");
    }
  };

  const handleSystemOpenFileCard = async (file: FileItemProps) => {
    const path = file.resolvedPath ?? file.rawPath ?? file.path;
    const result = await openPathInSystem(path);
    if (!result.ok) {
      addToast({
        title: "系统打开失败",
        description: result.message,
        variant: "error",
      });
    }
  };

  const hasPreviewModal =
    previewAttachment != null ||
    previewAttachmentLabel != null ||
    previewUrl != null ||
    previewText != null ||
    previewError != null ||
    previewKnowledgeLoading ||
    previewKnowledgeDetail != null;
  const localAttachmentNames = useMemo(
    () => new Set(attachments.map((file) => file.name)),
    [attachments],
  );
  const visibleSessionAttachments = useMemo(
    () => sessionAttachments.filter((attachment) => !localAttachmentNames.has(attachment.name)),
    [localAttachmentNames, sessionAttachments],
  );

  const submitApprovalDecision = async (decision: ApprovalDecision) => {
    if (!parsedApprovalCommand) return;
    const sharedState = getSharedApprovalState(parsedApprovalCommand.id);
    if (sharedState.status === "submitting") {
      setApprovalSubmittingDecision(sharedState.decision);
      setApprovalSubmitError(null);
      return;
    }
    if (sharedState.status === "submitted") {
      setApprovalSubmittedDecision(sharedState.decision);
      setApprovalSubmittingDecision(null);
      setApprovalSubmitError(null);
      return;
    }
    if (sharedState.status === "stale") {
      setApprovalSubmittingDecision(null);
      setApprovalSubmittedDecision(null);
      setApprovalSubmitError(sharedState.message);
      return;
    }
    if (!wsClient) {
      const message = "当前未连接到网关，无法提交审批。";
      setApprovalSubmitError(message);
      addToast({
        title: "审批提交失败",
        description: message,
        variant: "error",
      });
      return;
    }

    setApprovalSubmittingDecision(decision);
    setApprovalSubmitError(null);
    setSharedApprovalSubmitting(parsedApprovalCommand.id, decision);
    try {
      const methodOrder = parsedApprovalCommand.id.startsWith("plugin:")
        ? ["plugin.approval.resolve", "exec.approval.resolve"]
        : ["exec.approval.resolve", "plugin.approval.resolve"];
      let lastError: unknown = null;
      for (const method of methodOrder) {
        try {
          await wsClient.sendRequest(method, {
            id: parsedApprovalCommand.id,
            decision,
          });
          setSharedApprovalSubmitted(parsedApprovalCommand.id, decision);
          setApprovalSubmittedDecision(decision);
          setApprovalSubmitError(null);
          addToast({
            title: "审批已提交",
            description: `${parsedApprovalCommand.id} -> ${decision}`,
            variant: "success",
          });
          return;
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : String(error);
          if (isUnknownOrExpiredApprovalError(message)) {
            break;
          }
        }
      }
      throw lastError;
    } catch (error) {
      const message = error instanceof Error ? error.message : "审批请求失败";
      if (isUnknownOrExpiredApprovalError(message)) {
        const friendlyMessage = "该审批已处理或已过期。";
        setSharedApprovalStale(parsedApprovalCommand.id, friendlyMessage);
        setApprovalSubmittedDecision(null);
        setApprovalSubmitError(friendlyMessage);
      } else {
        setApprovalSubmitError(message);
      }
      addToast({
        title: "审批提交失败",
        description: isUnknownOrExpiredApprovalError(message) ? "该审批已处理或已过期。" : message,
        variant: "error",
      });
    } finally {
      setApprovalSubmittingDecision(null);
    }
  };

  useEffect(() => {
    if (!approvalId) return;
    if (isHistoricalApprovalRecord) {
      setApprovalSubmittingDecision(null);
      setApprovalSubmittedDecision(null);
      setApprovalSubmitError(null);
      return;
    }
    const sharedState = getSharedApprovalState(approvalId);
    if (sharedState.status === "submitting") {
      setApprovalSubmittingDecision(sharedState.decision);
      setApprovalSubmittedDecision(null);
      setApprovalSubmitError(null);
      return;
    }
    if (sharedState.status === "submitted") {
      setApprovalSubmittingDecision(null);
      setApprovalSubmittedDecision(sharedState.decision);
      setApprovalSubmitError(null);
      return;
    }
    if (sharedState.status === "stale") {
      setApprovalSubmittingDecision(null);
      setApprovalSubmittedDecision(null);
      setApprovalSubmitError(sharedState.message);
    }
  }, [approvalId, isHistoricalApprovalRecord]);

  useEffect(() => {
    if (isHistoricalApprovalRecord) return;
    if (!autoApprovalDecision || !parsedApprovalCommand) return;
    if (approvalSubmittingDecision || approvalSubmittedDecision || approvalSubmitError) return;
    void submitApprovalDecision(autoApprovalDecision);
  }, [
    isHistoricalApprovalRecord,
    autoApprovalDecision,
    parsedApprovalCommand,
    approvalSubmittingDecision,
    approvalSubmittedDecision,
    approvalSubmitError,
  ]);

  return (
    <>
      {hasPreviewModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
          onClick={closeAttachmentPreview}
        >
          <div
            className="relative flex max-h-[97vh] w-[min(1320px,97vw)] flex-col overflow-hidden rounded-lg border border-border-light bg-background"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeAttachmentPreview}
              className="absolute top-2 right-2 z-10 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center justify-between gap-sm border-b border-border-light px-md py-sm pr-12">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">
                  {previewAttachment?.name ?? previewAttachmentLabel ?? "附件预览"}
                </p>
              </div>
              {previewAttachment && (
                <button
                  type="button"
                  className="inline-flex items-center text-xs text-primary hover:underline"
                  onClick={() => handleDownloadAttachment(previewAttachment)}
                >
                  <Download className="mr-xs h-3.5 w-3.5" />
                  下载
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto scrollbar-default bg-background-secondary p-md">
              {previewUrl &&
              (previewAttachment?.type.startsWith("image/") || previewDisplayType === "image") ? (
                <div className="rounded-lg border border-border-light bg-background p-md">
                  <img
                    src={previewUrl}
                    alt={previewAttachment?.name ?? previewAttachmentLabel ?? "附件"}
                    className="mx-auto max-h-[78vh] w-auto max-w-full object-contain"
                  />
                </div>
              ) : previewUrl && (previewAttachmentIsPdf || previewDisplayType === "pdf") ? (
                <div
                  key={previewPdfRenderKey}
                  className="rounded-lg border border-border-light bg-background p-sm"
                >
                  <div className="mb-sm flex items-center justify-between gap-sm">
                    <div className="flex items-center gap-xs">
                      <button
                        type="button"
                        className="rounded border border-border-light px-sm py-xs text-xs text-text-primary hover:bg-background-secondary disabled:opacity-40"
                        disabled={previewPdfPage <= 1 || previewPdfLoading}
                        onClick={() => setPreviewPdfPage((prev) => Math.max(1, prev - 1))}
                      >
                        上一页
                      </button>
                      <span className="min-w-[68px] text-center text-xs text-text-tertiary">
                        {previewPdfPages ? `${previewPdfPage} / ${previewPdfPages}` : "加载中"}
                      </span>
                      <button
                        type="button"
                        className="rounded border border-border-light px-sm py-xs text-xs text-text-primary hover:bg-background-secondary disabled:opacity-40"
                        disabled={
                          previewPdfPages === 0 ||
                          previewPdfPage >= previewPdfPages ||
                          previewPdfLoading
                        }
                        onClick={() =>
                          setPreviewPdfPage((prev) => Math.min(previewPdfPages, prev + 1))
                        }
                      >
                        下一页
                      </button>
                    </div>
                    <div className="flex items-center gap-xs">
                      <button
                        type="button"
                        className="rounded border border-border-light px-sm py-xs text-xs text-text-primary hover:bg-background-secondary"
                        onClick={() => setPreviewPdfZoom((zoom) => Math.max(0.5, zoom - 0.25))}
                      >
                        缩小
                      </button>
                      <span className="min-w-[54px] text-center text-xs text-text-tertiary">
                        {Math.round(previewPdfZoom * 100)}%
                      </span>
                      <button
                        type="button"
                        className="rounded border border-border-light px-sm py-xs text-xs text-text-primary hover:bg-background-secondary"
                        onClick={() => setPreviewPdfZoom((zoom) => Math.min(3, zoom + 0.25))}
                      >
                        放大
                      </button>
                    </div>
                  </div>
                  <div className="h-[76vh] overflow-auto scrollbar-default rounded border border-border-light bg-background-secondary p-sm">
                    {previewPdfLoading ? (
                      <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
                        加载 PDF 中...
                      </div>
                    ) : previewPdfError ? (
                      <div className="flex h-full items-center justify-center text-sm text-error">
                        {previewPdfError}
                      </div>
                    ) : (
                      <canvas
                        key={previewPdfRenderKey}
                        ref={previewPdfCanvasRef}
                        className="mx-auto block bg-white"
                      />
                    )}
                  </div>
                </div>
              ) : previewKnowledgeLoading ? (
                <div className="flex h-[60vh] items-center justify-center rounded-lg border border-border-light bg-background p-md text-sm text-text-tertiary">
                  正在准备文档预览...
                </div>
              ) : previewKnowledgeDetail ? (
                <div className="h-[80vh] overflow-hidden rounded-lg border border-border-light bg-background">
                  <LazyDocPreview detail={previewKnowledgeDetail} />
                </div>
              ) : previewText != null ? (
                <div className="rounded-lg border border-border-light bg-background p-md">
                  <pre className="whitespace-pre-wrap text-sm font-mono text-text-primary">
                    {previewText}
                  </pre>
                </div>
              ) : (
                <div className="flex h-[60vh] items-center justify-center rounded-lg border border-border-light bg-background p-md text-sm text-text-tertiary">
                  {previewError ?? "预览准备中..."}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className={`flex w-full mb-lg ${isUser ? "justify-end" : "justify-start"}`}>
        <div
          style={{ minWidth: isMobile ? "120px" : "200px" }}
          className={`flex gap-sm max-w-[90%] md:max-w-[680px] lg:max-w-[800px] transition-shadow ${
            isUser ? "flex-row-reverse" : "flex-row"
          }`}
        >
          {/* 头像 */}
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center overflow-hidden ${
              isUser ? "bg-primary" : "bg-background-secondary"
            }`}
          >
            {isUser ? (
              <User className="w-4 h-4 text-white" />
            ) : (
              <img src="/img/logo.png" alt="Hovi" className="w-full h-full object-contain" />
            )}
          </div>

          {/* 消息内容 */}
          <div className={`flex flex-col gap-xs ${isMobile ? "min-w-[100px]" : "min-w-[150px]"}`}>
            {(isUser || isWaiting || isCancelled || isEditing || visibleAssistantContent) && (
              <div
                className={`px-lg py-md rounded-lg ${
                  isUser
                    ? "bg-primary text-white rounded-tr-sm"
                    : "bg-surface text-text-primary rounded-tl-sm"
                }`}
              >
                {isWaiting ? (
                  <div className="flex items-center justify-between gap-sm text-sm text-text-tertiary">
                    <span className="animate-pulse">正在输入...</span>
                    {onCancel && (
                      <button
                        type="button"
                        onClick={onCancel}
                        className="px-2 py-1 text-xs rounded border border-border-light text-text-secondary hover:bg-background-secondary transition-colors"
                      >
                        停止生成
                      </button>
                    )}
                  </div>
                ) : isCancelled ? (
                  <div className="flex flex-col gap-xs">
                    <div className="text-xs text-text-tertiary">已取消</div>
                    {content && (
                      <FormattedContent
                        content={content}
                        className="text-sm max-w-full opacity-70"
                        enableMarkdown={true}
                      />
                    )}
                  </div>
                ) : isEditing && isUser ? (
                  <textarea
                    ref={editInputRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full min-w-[300px] bg-transparent text-sm text-white resize-none outline-none scrollbar-default"
                    rows={Math.max(2, editContent.split("\n").length)}
                    autoFocus
                  />
                ) : isUser ? (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed break-all min-w-[100px]">
                    {renderUserMessageWithSkillHighlight(displayedContent, availableSkillKeys)}
                  </p>
                ) : (
                  <FormattedContent
                    content={visibleAssistantContent}
                    className="text-sm max-w-full"
                    enableMarkdown={true}
                  />
                )}
              </div>
            )}

            {!isUser && assistantRichParts.length > 0 && (
              <div className="flex flex-col gap-sm">
                {assistantRichParts.map((part, index) => {
                  if (part.type === "image") {
                    return (
                      <button
                        key={`${part.type}:${part.url}:${index}`}
                        type="button"
                        className="overflow-hidden rounded-lg border border-border-light bg-background p-xs text-left"
                        onClick={() => {
                          setPreviewAttachment(null);
                          setPreviewAttachmentLabel(part.fileName ?? "图片");
                          setPreviewText(null);
                          setPreviewError(null);
                          setPreviewKnowledgeDetail(null);
                          setPreviewKnowledgeLoading(false);
                          resetPreviewPdfState();
                          setPreviewUrl(part.url);
                        }}
                      >
                        <img
                          src={part.url}
                          alt={part.fileName ?? "assistant image"}
                          className="max-h-[320px] w-auto max-w-full rounded object-contain"
                        />
                      </button>
                    );
                  }
                  if (part.type === "audio") {
                    return (
                      <div
                        key={`${part.type}:${part.url}:${index}`}
                        className="rounded-lg border border-border-light bg-background px-sm py-sm"
                      >
                        <div className="mb-xs text-xs text-text-tertiary">
                          {part.fileName ?? "音频回复"}
                        </div>
                        <audio
                          data-testid="assistant-audio"
                          controls
                          src={part.url}
                          className="w-full"
                        />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={`${part.type}:${part.url}:${index}`}
                      className="rounded-lg border border-border-light bg-background px-sm py-sm"
                    >
                      <a
                        href={part.url}
                        download={part.fileName}
                        className="inline-flex items-center gap-xs text-sm text-primary hover:underline"
                      >
                        <Paperclip className="h-3.5 w-3.5 shrink-0" />
                        <span>{part.fileName ?? "下载文件"}</span>
                      </a>
                      {part.mimeType && (
                        <div className="mt-xs text-[11px] text-text-tertiary">{part.mimeType}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!isUser && parsedApprovalCommand && approvalCommands.length > 0 && (
              <div className="rounded-md border border-warning/30 bg-warning/5 p-sm">
                <div className="flex items-center gap-xs">
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-[2px] text-[10px] font-medium text-primary">
                    确认
                  </span>
                  <div className="text-xs font-medium text-text-primary">
                    {isHistoricalApprovalRecord ? "历史确认记录" : "待您确认"}
                  </div>
                </div>
                <div className="mt-xs text-[11px] text-text-tertiary">
                  <span className="font-medium text-text-primary">请求操作：</span>
                  {approvalOperationSummary}
                </div>
                <div className="mt-xs text-[11px] text-text-tertiary">
                  <span className="font-medium text-text-primary">授权范围：</span>
                  {approvalScopeSummary}
                </div>
                <div className="mt-xs text-[11px] text-text-tertiary break-all">
                  <span className="font-medium text-text-primary">确认编号：</span>
                  <span className="font-mono">{parsedApprovalCommand.id}</span>
                </div>
                {!isHistoricalApprovalRecord &&
                  !(
                    approvalIsTerminal ||
                    approvalIsBusy ||
                    (autoApprovalDecision && !approvalSubmitError)
                  ) && (
                    <div className="mt-sm flex flex-wrap gap-xs">
                      {approvalCommands.map((decision) => {
                        const isSubmitting = approvalSubmittingDecision === decision;
                        const disabled = approvalIsBusy || approvalIsTerminal;
                        return (
                          <button
                            key={decision}
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              void submitApprovalDecision(decision);
                            }}
                            className={`rounded-full border px-sm py-xs text-xs transition-colors ${
                              decision === "deny"
                                ? "border-error/40 text-error hover:bg-error/10 disabled:opacity-50"
                                : "border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
                            }`}
                          >
                            {isSubmitting ? "提交中..." : APPROVAL_DECISION_LABELS[decision]}
                          </button>
                        );
                      })}
                    </div>
                  )}
                {!isHistoricalApprovalRecord && autoApprovalDecision === "allow-always" && (
                  <div className="mt-xs text-[11px] text-text-tertiary">
                    已开启自动同意，当前已自动选择“始终允许”。
                  </div>
                )}
                {!isHistoricalApprovalRecord && autoApprovalDecision === "allow-once" && (
                  <div className="mt-xs text-[11px] text-text-tertiary">
                    已开启自动同意，当前请求仅支持“仅本次”，系统已自动提交。
                  </div>
                )}
                {approvalSubmittedDecision && (
                  <div className="mt-xs text-[11px] text-success">
                    已处理：{APPROVAL_DECISION_LABELS[approvalSubmittedDecision]}
                  </div>
                )}
                {approvalSubmitError && (
                  <div className="mt-xs text-[11px] text-error break-all">
                    {approvalSubmitError}
                  </div>
                )}
              </div>
            )}

            {/* 用户附件 - 挂载在消息气泡下方 */}
            {hasUserAttachments && shouldShowMeta && (
              <div className="mt-xs flex flex-wrap gap-xs">
                {attachments.map((file, index) => (
                  <button
                    key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                    type="button"
                    onClick={() => {
                      void handlePreviewAttachment(file);
                    }}
                    className="inline-flex max-w-full items-center gap-xs rounded-md border border-border-light bg-background-secondary px-sm py-xs text-xs text-text-secondary hover:border-primary/40 hover:text-text-primary"
                    title={file.name}
                  >
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="truncate max-w-[260px]">{file.name}</span>
                  </button>
                ))}
                {visibleSessionAttachments.map((attachment) => (
                  <button
                    key={`${attachment.documentId}:${attachment.knowledgeDocumentId ?? ""}`}
                    type="button"
                    onClick={() => {
                      void handlePreviewSessionAttachment(attachment);
                    }}
                    className="inline-flex max-w-full items-center gap-xs rounded-md border border-border-light bg-background-secondary px-sm py-xs text-xs text-text-secondary hover:border-primary/40 hover:text-text-primary"
                    title={attachment.name}
                  >
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <span className="truncate max-w-[260px]">{attachment.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* 文件列表 - 只在内容完全显示后才显示 */}
            {files && files.length > 0 && shouldShowFiles && (
              <FileList
                files={files}
                title={
                  files.every((item) => item.source === "detected-path") ? "相关路径" : "生成的文档"
                }
                onPreviewFile={handlePreviewFileCard}
                onSystemOpenFile={handleSystemOpenFileCard}
              />
            )}

            {/* 知识库引用来源 - 只在助手消息中显示 */}
            {!isUser && citations && citations.length > 0 && (
              <CitationBlock
                citations={citations}
                onCitationClick={(citation) => {
                  // TODO: 实现点击跳转到文档详情
                }}
              />
            )}

            {shouldShowMeta && !isUser && hasToolInfo && (
              <div className="flex flex-col gap-xs text-xs text-text-tertiary">
                {hasToolInfo && (
                  <button
                    type="button"
                    onClick={() => setToolsOpen((prev) => !prev)}
                    className="inline-flex w-fit items-center gap-xs text-text-secondary hover:text-text-primary"
                  >
                    <span>工具调用 ({toolCalls.length + toolResults.length})</span>
                    {toolsOpen ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                )}
                {hasToolInfo && toolsOpen && (
                  <div className="rounded-md border border-border-light bg-background-secondary p-sm text-[11px] text-text-secondary">
                    {toolCalls.map((call, index) => (
                      <div key={`call-${call.id ?? index}`} className="mb-xs">
                        <div className="font-medium text-text-primary">
                          {call.name ?? "tool"} {call.id ? `(${call.id})` : ""}
                          {call.status && (
                            <span className="ml-xs text-[10px] text-text-tertiary">
                              {call.status === "running" ? "进行中" : "完成"}
                            </span>
                          )}
                          {call.durationMs != null && (
                            <span className="ml-xs text-[10px] text-text-tertiary">
                              {formatDuration(call.durationMs)}
                            </span>
                          )}
                        </div>
                        {call.arguments != null && (
                          <pre className="whitespace-pre-wrap break-words text-[10px] text-text-tertiary">
                            {JSON.stringify(call.arguments, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                    {toolResults.map((result, index) => (
                      <div key={`result-${result.toolCallId ?? index}`} className="mb-xs">
                        <div
                          className={`font-medium ${result.isError ? "text-red-500" : "text-text-primary"}`}
                        >
                          结果 {result.toolName ?? "tool"}{" "}
                          {result.toolCallId ? `(${result.toolCallId})` : ""}
                          {result.durationMs != null && (
                            <span className="ml-xs text-[10px] text-text-tertiary">
                              {formatDuration(result.durationMs)}
                            </span>
                          )}
                        </div>
                        {result.content && <ToolResultContent content={result.content} />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 功能按钮 */}
            <div
              className={`flex items-center gap-xs text-xs ${isUser ? "justify-end" : "justify-end"}`}
            >
              {/* 助手消息：复制按钮 */}
              {!isUser && !isWaiting && content && onCopy && (
                <button
                  type="button"
                  onClick={() => onCopy?.(content)}
                  className="p-xs text-text-tertiary hover:text-text-primary rounded hover:bg-background-secondary cursor-pointer"
                  title="复制"
                >
                  <Copy className="h-3 w-3" />
                </button>
              )}
              {/* 用户消息：复制按钮 */}
              {isUser && !status && !isEditing && onCopy && (
                <button
                  type="button"
                  onClick={() => onCopy?.(content)}
                  className="p-xs text-text-tertiary hover:text-text-primary rounded hover:bg-background-secondary cursor-pointer"
                  title="复制"
                >
                  <Copy className="h-3 w-3" />
                </button>
              )}
              {/* 用户消息：编辑按钮 */}
              {isUser && !status && !isEditing && onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="p-xs text-text-tertiary hover:text-text-primary rounded hover:bg-background-secondary cursor-pointer"
                  title="编辑"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
              {/* 用户消息：编辑中显示取消和确认按钮 */}
              {isUser && isEditing && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditContent(content);
                      onEditCancel?.();
                    }}
                    className="p-xs text-text-tertiary hover:text-text-primary rounded hover:bg-background-secondary cursor-pointer"
                    title="取消"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditConfirm?.(editContent)}
                    className="p-xs text-text-tertiary hover:text-text-primary rounded hover:bg-background-secondary cursor-pointer"
                    title="确认发送"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>

            {/* 时间戳 */}
            {timestamp && (
              <span className={`text-xs text-text-tertiary ${isUser ? "text-right" : "text-left"}`}>
                {timestamp.toLocaleString("zh-CN", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}
            {isUser && status === "failed" && (
              <div className="flex items-center gap-sm text-xs text-text-tertiary">
                <span className="text-error">发送失败</span>
                {status === "failed" && onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="rounded border border-error/40 px-sm py-[2px] text-[10px] text-error hover:bg-error/10"
                  >
                    重试
                  </button>
                )}
                {status === "failed" && onEditRetry && (
                  <button
                    type="button"
                    onClick={onEditRetry}
                    className="rounded border border-border-light px-sm py-[2px] text-[10px] text-text-secondary hover:bg-background-secondary"
                  >
                    编辑后重试
                  </button>
                )}
                {status === "failed" && onCopyRetry && (
                  <button
                    type="button"
                    onClick={onCopyRetry}
                    className="rounded border border-border-light px-sm py-[2px] text-[10px] text-text-secondary hover:bg-background-secondary"
                  >
                    复制并回填
                  </button>
                )}
                {status === "failed" && onDelete && (
                  <button
                    type="button"
                    onClick={onDelete}
                    className="rounded border border-border-light px-sm py-[2px] text-[10px] text-text-secondary hover:bg-background-secondary"
                  >
                    删除
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function ToolResultContent({ content }: { content: string }) {
  const limit = 600;
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > limit;
  const display = expanded || !isLong ? content : `${content.slice(0, limit)}...`;

  return (
    <div className="text-[10px] text-text-tertiary">
      <div className="whitespace-pre-wrap break-words">{display}</div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-xs text-[10px] text-text-secondary hover:text-text-primary"
        >
          {expanded ? "收起" : "展开更多"}
        </button>
      )}
    </div>
  );
}

// 使用 memo 优化，避免不必要的重渲染
export const MemoizedMessageBubble = memo(MessageBubble);
