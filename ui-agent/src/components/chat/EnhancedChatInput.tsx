"use client";

import {
  Send,
  Paperclip,
  Image as ImageIcon,
  Download,
  FileCode2,
  FileJson2,
  FileSpreadsheet,
  Mic,
  AtSign,
  Sparkles,
  Plug,
  Loader2,
  Check,
  Search,
  Github,
  Calendar,
  FolderOpen,
  Slack,
  Zap,
  Presentation,
  FileText,
  X,
  File,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState, useEffect, KeyboardEvent, DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { formatFileSize } from "@/lib/fileUtils";
import type { KnowledgeDetail } from "@/services/knowledgeApi";
import { getKnowledge } from "@/services/knowledgeApi";
import { resolveSessionKnowledgeDocumentRef, uploadSessionDocument } from "@/services/pageindexApi";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSettingsStore } from "@/stores/settingsStore";
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

// Map of built-in connector IDs to their icons
const CONNECTOR_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  github: Github,
  gmail: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  ),
  "google-calendar": Calendar,
  "google-drive": FolderOpen,
  slack: Slack,
  notion: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.886l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.454-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933zM2.828 1.602C1.921 2.441 1.921 3.48 2.641 4.208c.747.747 1.685.7 2.48.606l14.937-.933c.84-.046.981-.514.981-1.073V2.295c0-.606-.233-.933-.933-.886l-15.458.933c-.7.047-.88.327-.88.746z" />
    </svg>
  ),
  browser: (props) => (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
};

function getConnectorIcon(iconName?: string) {
  if (!iconName) return Plug;
  return CONNECTOR_ICONS[iconName] || Plug;
}

interface EnhancedChatInputProps {
  onSend: (message: string, attachments?: File[]) => Promise<{ ok: boolean; error?: string }>;
  draftValue?: string;
  onDraftChange?: (value: string) => void;
  draftAttachments?: File[];
  onDraftAttachmentsChange?: (files: File[]) => void;
  highlight?: boolean;
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean; // 是否紧凑模式(对话页面)
  onWorkspaceClick?: () => void; // 点击查看工作区(已废弃,由外部横条控制)
  hasGeneratedFiles?: boolean; // 是否有生成的文件(已废弃)
  workspaceOpen?: boolean; // 工作区是否打开(已废弃)
  connectors?: Array<{
    id: string;
    name: string;
    icon?: string;
    description?: string;
    status?: "connected" | "disconnected" | "error" | "draft";
  }>;
  activeConnectorIds?: string[];
  onToggleConnector?: (id: string, enabled: boolean) => void;
  resetKey?: number; // 用于重置输入框
  sessionKey?: string | null;
  pendingUploadSessionKey?: string | null;
  autoApproveAlways?: boolean;
  onAutoApproveAlwaysChange?: (value: boolean) => void;
}

interface SkillStatusEntry {
  skillKey: string;
  name: string;
  description: string;
  disabled: boolean;
  eligible: boolean;
}

interface SkillStatusReport {
  skills: SkillStatusEntry[];
}

export function resolveSlashPanelPlacement({
  rawTop,
  caretTop,
  panelHeight,
  hostHeight,
  hostTop,
  hostBottom,
  visibleTop,
  viewportHeight,
  visibleBottom,
  minTop = 8,
  gap = 8,
}: {
  rawTop: number;
  caretTop: number;
  panelHeight: number;
  hostHeight: number;
  hostTop: number;
  hostBottom: number;
  visibleTop?: number;
  viewportHeight: number;
  visibleBottom?: number;
  minTop?: number;
  gap?: number;
}): { top: number; direction: "up" | "down" } {
  const clampedDownTop = Math.max(24, rawTop);
  const topBoundary = Math.max(0, visibleTop ?? 0);
  const bottomBoundary = Math.min(viewportHeight, visibleBottom ?? viewportHeight);
  const spaceBelow = Math.max(0, bottomBoundary - hostBottom + (hostHeight - clampedDownTop));
  if (spaceBelow >= panelHeight) {
    return { top: clampedDownTop, direction: "down" };
  }

  const minTopWithinHost = topBoundary - hostTop + minTop;
  const upTop = Math.max(minTopWithinHost, caretTop - panelHeight - gap);
  return { top: upTop, direction: "up" };
}

function resolveVisibleVerticalBounds(host: HTMLElement): { top: number; bottom: number } {
  let top = 0;
  let boundary = window.innerHeight;
  let current: HTMLElement | null = host.parentElement;

  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = `${style.overflowY} ${style.overflow}`.toLowerCase();
    const clipsY =
      overflowY.includes("hidden") ||
      overflowY.includes("clip") ||
      overflowY.includes("auto") ||
      overflowY.includes("scroll");

    if (clipsY) {
      const rect = current.getBoundingClientRect();
      if (Number.isFinite(rect.top)) {
        top = Math.max(top, rect.top);
      }
      if (Number.isFinite(rect.bottom)) {
        boundary = Math.min(boundary, rect.bottom);
      }
    }

    current = current.parentElement;
  }

  return { top, bottom: boundary };
}

function resolveSlashTriggerToken(
  value: string,
  caretPosition?: number | null,
): { active: boolean; query: string; start: number; end: number } {
  if (!value) {
    return { active: false, query: "", start: -1, end: -1 };
  }
  const safeCaret = Math.max(0, Math.min(caretPosition ?? value.length, value.length));
  let boundary = safeCaret - 1;
  while (boundary >= 0) {
    const char = value[boundary];
    if (char === " " || char === "\n" || char === "\t") {
      break;
    }
    boundary -= 1;
  }
  const tokenStart = boundary + 1;
  const token = value.slice(tokenStart, safeCaret);
  if (!token.startsWith("/") || token.startsWith("//")) {
    return { active: false, query: "", start: -1, end: -1 };
  }
  const query = token.slice(1);
  if (query && !/^[\p{L}\p{N}._-]+$/u.test(query)) {
    return { active: false, query: "", start: -1, end: -1 };
  }
  return { active: true, query, start: tokenStart, end: safeCaret };
}

function resolveAttachmentIcon(file: File) {
  const lower = file.name.toLowerCase();
  if (file.type.startsWith("image/")) return ImageIcon;
  if (file.type.includes("presentation") || lower.endsWith(".pptx") || lower.endsWith(".ppt")) {
    return Presentation;
  }
  if (file.type.includes("spreadsheet") || lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return FileSpreadsheet;
  }
  if (file.type === "application/json" || lower.endsWith(".json")) {
    return FileJson2;
  }
  if (
    file.type.includes("wordprocessingml") ||
    lower.endsWith(".docx") ||
    lower.endsWith(".doc") ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".txt")
  ) {
    return FileText;
  }
  return FileCode2;
}

function supportsTextPreview(file: File) {
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
}

function supportsKnowledgePreview(file: File) {
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith(".docx") ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".csv")
  );
}

function buildPreviewCacheKey(sessionKey: string | null | undefined, file: File): string {
  return `${sessionKey ?? "no-session"}:${file.name}:${file.size}:${file.lastModified}`;
}

function buildAttachmentsSignature(files: File[]): string {
  return files
    .map((file) => `${file.name}:${file.size}:${file.lastModified}:${file.type}`)
    .join("|");
}

const PREVIEW_UPLOAD_SESSION_KEY = "__preview_upload__";
const MAX_UPLOAD_FILE_BYTES = 500_000_000; // 500M
const MAX_UPLOAD_FILE_LABEL = "500MB";

export function EnhancedChatInput({
  onSend,
  draftValue,
  onDraftChange,
  draftAttachments,
  onDraftAttachmentsChange,
  highlight = false,
  disabled = false,
  placeholder = "输入消息...",
  compact = false,
  onWorkspaceClick,
  hasGeneratedFiles = false,
  workspaceOpen = false,
  connectors = [],
  activeConnectorIds = [],
  onToggleConnector,
  resetKey = 0,
  sessionKey = null,
  pendingUploadSessionKey = null,
  autoApproveAlways = false,
  onAutoApproveAlwaysChange,
}: EnhancedChatInputProps) {
  const wsClient = useConnectionStore((s) => s.wsClient);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const { addToast } = useToastStore();
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillStatusEntry[]>([]);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [slashSuggestionsOpen, setSlashSuggestionsOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [skillsQuery, setSkillsQuery] = useState("");
  const [selectedSkillKeys, setSelectedSkillKeys] = useState<string[]>([]);
  const [activeSlashRange, setActiveSlashRange] = useState<{ start: number; end: number } | null>(
    null,
  );
  const [slashPanelPosition, setSlashPanelPosition] = useState<{
    top: number;
    left: number;
    width: number;
    direction: "up" | "down";
  }>({
    top: 32,
    left: 0,
    width: 420,
    direction: "down",
  });
  const [isSkillsLoading, setIsSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [connectorsQuery, setConnectorsQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  // 附件图片预览 URLs
  const [attachmentImageUrls, setAttachmentImageUrls] = useState<Map<number, string>>(new Map());
  const [previewTextContent, setPreviewTextContent] = useState<string | null>(null);
  const [previewPdfPages, setPreviewPdfPages] = useState(0);
  const [previewPdfPage, setPreviewPdfPage] = useState(1);
  const [previewPdfLoading, setPreviewPdfLoading] = useState(false);
  const [previewPdfError, setPreviewPdfError] = useState<string | null>(null);
  const [previewPdfZoom, setPreviewPdfZoom] = useState(1);
  const [previewPdfRenderKey, setPreviewPdfRenderKey] = useState(0);
  const [previewKnowledgeDetail, setPreviewKnowledgeDetail] = useState<KnowledgeDetail | null>(
    null,
  );
  const [previewKnowledgeLoading, setPreviewKnowledgeLoading] = useState(false);
  const [previewKnowledgeError, setPreviewKnowledgeError] = useState<string | null>(null);
  const previewKnowledgeRefs = useRef<Map<string, { documentId: string; kbId?: string }>>(
    new Map(),
  );
  const previewRequestRef = useRef(0);
  const previewPdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const previewPdfDocRef = useRef<any>(null);
  const previewPdfRenderingRef = useRef(false);
  const dragDepthRef = useRef(0);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const prevDraftValueRef = useRef<string>(draftValue ?? "");
  const isTypingRef = useRef(false);
  const skillsAutoOpenRef = useRef(false);

  // 当 draftValue 改变时（会话切换），同步到内部状态
  useEffect(() => {
    // 如果用户正在输入，不同步，避免干扰 IME
    if (isTypingRef.current) {
      return;
    }

    const newDraftValue = draftValue ?? "";

    // 如果值没变，不处理
    if (newDraftValue === prevDraftValueRef.current) {
      return;
    }

    prevDraftValueRef.current = newDraftValue;

    // 只有值真正改变时才更新内部状态
    if (newDraftValue !== input) {
      setInput(newDraftValue);
      setSelectedSkillKeys([]);
    }
  }, [draftValue]);

  // 追踪 draftAttachments 的变化
  const prevDraftAttachmentsRef = useRef<string>(buildAttachmentsSignature(draftAttachments ?? []));

  useEffect(() => {
    const newDraftAttachments = draftAttachments ?? [];
    const newDraftAttachmentsKey = buildAttachmentsSignature(newDraftAttachments);
    if (newDraftAttachmentsKey !== prevDraftAttachmentsRef.current) {
      prevDraftAttachmentsRef.current = newDraftAttachmentsKey;
      // 只有 draftAttachments 真正改变时才更新内部状态
      setAttachments(newDraftAttachments);
    }
  }, [draftAttachments]);

  // 监听 resetKey 变化来重置输入框
  const prevResetKeyRef = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== prevResetKeyRef.current) {
      prevResetKeyRef.current = resetKey;
      // 重置时清空输入框和附件
      setInput("");
      setAttachments([]);
      setSelectedSkillKeys([]);
      // 如果有外部回调也调用一下
      if (onDraftChange) onDraftChange("");
      if (onDraftAttachmentsChange) onDraftAttachmentsChange([]);
    }
  }, [resetKey, onDraftChange, onDraftAttachmentsChange]);

  const inputValue = input;
  const attachmentValue = attachments;
  const availableConnectors = useMemo(() => {
    return [...connectors].sort((a, b) => {
      const aConnected = a.status === "connected";
      const bConnected = b.status === "connected";
      if (aConnected !== bConnected) return aConnected ? -1 : 1;
      return a.name.localeCompare(b.name, "zh-CN");
    });
  }, [connectors]);

  const filteredConnectors = useMemo(() => {
    const query = connectorsQuery.trim().toLowerCase();
    if (!query) return availableConnectors;
    return availableConnectors.filter((connector) => {
      return (
        connector.name.toLowerCase().includes(query) ||
        connector.id.toLowerCase().includes(query) ||
        (connector.description ?? "").toLowerCase().includes(query)
      );
    });
  }, [availableConnectors, connectorsQuery]);

  const filteredSkills = useMemo(() => {
    const query = skillsQuery.trim().toLowerCase();
    const matched = !query
      ? skills
      : skills.filter((skill) => {
          return (
            skill.name.toLowerCase().includes(query) ||
            skill.skillKey.toLowerCase().includes(query) ||
            (skill.description ?? "").toLowerCase().includes(query)
          );
        });
    return [...matched].sort((a, b) => {
      const aAvailable = !a.disabled && a.eligible;
      const bAvailable = !b.disabled && b.eligible;
      if (aAvailable !== bAvailable) return aAvailable ? -1 : 1;
      return a.name.localeCompare(b.name, "zh-CN") || a.skillKey.localeCompare(b.skillKey, "zh-CN");
    });
  }, [skills, skillsQuery]);

  const updateInputValue = (nextValue: string) => {
    // Update internal state and track the value to avoid sync issues
    setInput(nextValue);
    // Also update ref to track the value for sync logic
    prevDraftValueRef.current = nextValue;
  };

  const loadSkills = useCallback(async () => {
    if (!wsClient || isSkillsLoading) return;
    setIsSkillsLoading(true);
    setSkillsError(null);
    try {
      const result = await wsClient.sendRequest<SkillStatusReport>("skills.status", {});
      const allSkills = result.skills.sort((a, b) => a.name.localeCompare(b.name, "zh-CN")) ?? [];
      setSkills(allSkills);
    } catch (error) {
      setSkills([]);
      setSkillsError(error instanceof Error ? error.message : "无法获取技能列表");
    } finally {
      setIsSkillsLoading(false);
    }
  }, [isSkillsLoading, wsClient]);

  const handleSkillsOpenChange = (open: boolean) => {
    skillsAutoOpenRef.current = false;
    if (open) {
      setSlashSuggestionsOpen(false);
      setActiveSlashRange(null);
    }
    setSkillsOpen(open);
    if (open && (skills.length === 0 || skillsError)) {
      void loadSkills();
    }
    if (!open) {
      setSkillsQuery("");
    }
  };

  const handleConnectorsOpenChange = (open: boolean) => {
    setConnectorsOpen(open);
    if (!open) {
      setConnectorsQuery("");
    }
  };

  const updateSlashSuggestionsPosition = (textareaEl?: HTMLTextAreaElement | null) => {
    const textarea = textareaEl ?? textareaRef.current;
    const host = inputAreaRef.current;
    if (!textarea || !host) {
      return;
    }
    const caret = textarea.selectionStart ?? textarea.value.length;

    const mirror = document.createElement("div");
    const computed = window.getComputedStyle(textarea);
    const copiedStyleProps = [
      "boxSizing",
      "width",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "lineHeight",
      "letterSpacing",
      "wordSpacing",
      "textTransform",
      "textIndent",
      "textAlign",
      "whiteSpace",
      "overflowWrap",
      "wordBreak",
    ] as const;
    copiedStyleProps.forEach((prop) => {
      mirror.style[prop] = computed[prop];
    });
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.pointerEvents = "none";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.overflowWrap = "break-word";
    mirror.style.wordBreak = "break-word";
    mirror.style.left = "-9999px";
    mirror.style.top = "0";
    mirror.textContent = textarea.value.slice(0, caret);
    const marker = document.createElement("span");
    marker.textContent = textarea.value.slice(caret) || "\u200b";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const mirrorRect = mirror.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    document.body.removeChild(mirror);

    const panelWidth = Math.min(360, Math.max(240, host.clientWidth - 220));
    const parsedLineHeight = Number.parseFloat(computed.lineHeight || "");
    const parsedFontSize = Number.parseFloat(computed.fontSize || "");
    const lineHeightPx =
      Number.isFinite(parsedLineHeight) && parsedLineHeight > 0
        ? parsedLineHeight
        : Number.isFinite(parsedFontSize) && parsedFontSize > 0
          ? parsedFontSize * 1.4
          : 20;
    const caretTop = textarea.offsetTop + (markerRect.top - mirrorRect.top) - textarea.scrollTop;
    const rawTop = caretTop + lineHeightPx + 4;
    const rawLeft = textarea.offsetLeft + (markerRect.left - mirrorRect.left) - textarea.scrollLeft;
    const clampedLeft = Math.min(
      Math.max(0, rawLeft - 8),
      Math.max(0, host.clientWidth - panelWidth),
    );
    const hostRect = host.getBoundingClientRect();
    const visibleBounds = resolveVisibleVerticalBounds(host);
    const placement = resolveSlashPanelPlacement({
      rawTop,
      caretTop,
      panelHeight: 320,
      hostHeight: host.clientHeight,
      hostTop: hostRect.top,
      hostBottom: hostRect.bottom,
      visibleTop: visibleBounds.top,
      viewportHeight: window.innerHeight,
      visibleBottom: visibleBounds.bottom,
    });

    setSlashPanelPosition({
      top: placement.top,
      left: clampedLeft,
      width: panelWidth,
      direction: placement.direction,
    });
  };

  // 自动调整文本框高度
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    isTypingRef.current = true;
    const nextValue = e.target.value;
    updateInputValue(nextValue);
    if (sendError) setSendError(null);
    adjustTextareaHeight();

    const slashState = resolveSlashTriggerToken(nextValue, e.target.selectionStart);
    if (slashState.active) {
      skillsAutoOpenRef.current = true;
      setActiveSlashRange({ start: slashState.start, end: slashState.end });
      if (skillsOpen) {
        setSkillsOpen(false);
      }
      if (!slashSuggestionsOpen) {
        setSlashSuggestionsOpen(true);
      }
      if (skillsQuery !== slashState.query) {
        setSkillsQuery(slashState.query);
      }
      if ((skills.length === 0 || skillsError) && !isSkillsLoading) {
        void loadSkills();
      }
      updateSlashSuggestionsPosition(e.target);
      return;
    }

    if (skillsAutoOpenRef.current) {
      skillsAutoOpenRef.current = false;
      setActiveSlashRange(null);
      if (slashSuggestionsOpen) {
        setSlashSuggestionsOpen(false);
      }
      if (skillsQuery) {
        setSkillsQuery("");
      }
    } else if (activeSlashRange) {
      setActiveSlashRange(null);
    }
  };

  // 处理输入结束 - 当用户停止输入时重置标记
  const handleBlur = () => {
    isTypingRef.current = false;
  };

  useEffect(() => {
    if (!slashSuggestionsOpen) {
      return;
    }
    const onResize = () => updateSlashSuggestionsPosition(textareaRef.current);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [slashSuggestionsOpen]);

  const handleInsertSkill = (skillKey: string) => {
    const exists = selectedSkillKeys.includes(skillKey);
    const nextSelectedSkillKeys = exists
      ? selectedSkillKeys.filter((item) => item !== skillKey)
      : [...selectedSkillKeys, skillKey];
    setSelectedSkillKeys(nextSelectedSkillKeys);

    if (slashSuggestionsOpen && activeSlashRange) {
      const before = inputValue.slice(0, activeSlashRange.start);
      const after = inputValue.slice(activeSlashRange.end).replace(/^\s+/, "");
      const needsSpace = before.length > 0 && after.length > 0 && !/\s$/.test(before);
      const next = `${before}${needsSpace ? " " : ""}${after}`;
      updateInputValue(next);
      skillsAutoOpenRef.current = false;
      setActiveSlashRange(null);
      setSlashSuggestionsOpen(false);
      setSkillsQuery("");
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const caret = Math.min(next.length, before.length + (needsSpace ? 1 : 0));
        textarea.focus();
        textarea.setSelectionRange(caret, caret);
      });
      return;
    }
  };

  const handleInsertMentionOrCommand = (token: "@ " | "/ ") => {
    if (token === "@ " && inputValue.includes(token.trim())) {
      return;
    }
    const nextValue = inputValue.trim() ? `${inputValue} ${token}` : token;
    updateInputValue(nextValue);
    if (token === "/ ") {
      skillsAutoOpenRef.current = true;
      const slashStart = nextValue.lastIndexOf("/");
      setActiveSlashRange({
        start: slashStart,
        end: Math.min(nextValue.length, slashStart + 1),
      });
      if (skillsOpen) {
        setSkillsOpen(false);
      }
      if (!slashSuggestionsOpen) {
        setSlashSuggestionsOpen(true);
      }
      if (skillsQuery) {
        setSkillsQuery("");
      }
      if ((skills.length === 0 || skillsError) && !isSkillsLoading) {
        void loadSkills();
      }
      requestAnimationFrame(() => {
        updateSlashSuggestionsPosition(textareaRef.current);
      });
    } else if (slashSuggestionsOpen) {
      skillsAutoOpenRef.current = false;
      setActiveSlashRange(null);
      setSlashSuggestionsOpen(false);
      if (skillsQuery) {
        setSkillsQuery("");
      }
    }
    textareaRef.current?.focus();
  };

  const handleRemoveSelectedSkill = (skillKey: string) => {
    setSelectedSkillKeys((prev) => prev.filter((item) => item !== skillKey));
  };

  const renderSkillsPickerContent = () => (
    <>
      <div className="px-2 py-1.5">
        <Input
          value={skillsQuery}
          onChange={(e) => setSkillsQuery(e.target.value)}
          placeholder="筛选技能..."
          className="h-7 text-xs"
        />
      </div>
      <div className="px-2">
        <div className="max-h-64 overflow-auto scrollbar-default space-y-1">
          {isSkillsLoading ? (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-text-tertiary">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              加载技能中...
            </div>
          ) : skillsError ? (
            <div className="px-2 py-2 text-xs text-error">{skillsError}</div>
          ) : filteredSkills.length === 0 ? (
            <div className="px-2 py-2 text-xs text-text-tertiary">没有匹配的技能</div>
          ) : (
            filteredSkills.map((skill) => {
              const checked = selectedSkillKeys.includes(skill.skillKey);
              const unavailable = skill.disabled || !skill.eligible;
              return (
                <button
                  key={skill.skillKey}
                  type="button"
                  disabled={disabled || unavailable}
                  onClick={() => handleInsertSkill(skill.skillKey)}
                  className={`w-full cursor-pointer flex items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors disabled:opacity-50 ${
                    checked ? "bg-primary/12 ring-1 ring-primary/35" : "hover:bg-background"
                  }`}
                  title={`/${skill.skillKey}`}
                >
                  <div className="min-w-0">
                    <div className="text-sm text-text-primary truncate">{skill.name}</div>
                    <div className="text-[11px] text-text-tertiary truncate">/{skill.skillKey}</div>
                    {skill.description && (
                      <div className="text-[11px] text-text-tertiary/90 truncate mt-0.5">
                        {skill.description}
                      </div>
                    )}
                    {unavailable && (
                      <div className="text-[10px] text-text-tertiary mt-0.5">当前不可用</div>
                    )}
                  </div>
                  {checked && <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
                </button>
              );
            })
          )}
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-border-light">
        <button
          type="button"
          onClick={() => {
            skillsAutoOpenRef.current = false;
            setSkillsOpen(false);
            setSlashSuggestionsOpen(false);
            setSkillsQuery("");
            openSettings("skills");
          }}
          className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-xs text-primary hover:bg-primary/10"
        >
          管理 Skills
        </button>
      </div>
    </>
  );

  // 废弃参数保留为兼容字段,避免未来接入断裂
  void highlight;
  void onWorkspaceClick;
  void hasGeneratedFiles;
  void workspaceOpen;

  // 处理发送
  const handleSend = async () => {
    if (!inputValue.trim()) return;
    if (disabled || isSending) return;

    // 先保存当前输入内容和附件
    const selectedSkillsToSend = [...selectedSkillKeys];
    const skillPrefix = selectedSkillsToSend.map((skillKey) => `/${skillKey}`).join(" ");
    const messageToSend = skillPrefix ? `${skillPrefix} ${inputValue}` : inputValue;
    const attachmentsToSend = attachmentValue.length > 0 ? [...attachmentValue] : undefined;

    // 立即清空输入框
    isTypingRef.current = false;
    setInput("");
    prevDraftValueRef.current = "";
    setAttachments([]);
    setSelectedSkillKeys([]);
    setSlashSuggestionsOpen(false);
    setActiveSlashRange(null);
    setSkillsQuery("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // 然后在后台发送消息
    setIsSending(true);
    const result = await onSend(messageToSend, attachmentsToSend);
    setIsSending(false);

    if (!result.ok) {
      // 发送失败，恢复输入内容
      setInput(inputValue);
      prevDraftValueRef.current = inputValue;
      setAttachments(attachmentsToSend ?? []);
      setSelectedSkillKeys(selectedSkillsToSend);
      if (onDraftChange) {
        onDraftChange(inputValue);
      }
      setSendError(result.error ?? "发送失败，请重试");
    } else {
      // 发送成功，通知父组件
      if (onDraftChange) {
        onDraftChange("");
      }
      if (onDraftAttachmentsChange) {
        onDraftAttachmentsChange([]);
      }
      setSendError(null);
    }
  };

  // 处理键盘事件 - Shift + Command + Enter 发送
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 在 IME 组合期间不处理任何键盘事件，避免干扰输入法
    if (e.nativeEvent?.isComposing) {
      return;
    }
    if (e.key === "Backspace" && inputValue.length === 0 && selectedSkillKeys.length > 0) {
      e.preventDefault();
      setSelectedSkillKeys((prev) => prev.slice(0, -1));
      return;
    }
    if (e.key === "Enter" && e.shiftKey && e.metaKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 处理文件选择
  // 生成图片预览 URL
  const generateImageUrl = (file: File): string | null => {
    if (file.type.startsWith("image/")) {
      return URL.createObjectURL(file);
    }
    return null;
  };

  // 清理图片预览 URL
  const cleanupImageUrl = (url: string) => {
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const existingAttachments = attachments;
    const files = Array.from(e.target.files || []);
    const supportedFiles = files.filter((file) => isSupportedFile(file));
    const oversizedFiles = supportedFiles.filter((file) => file.size > MAX_UPLOAD_FILE_BYTES);
    const validFiles = supportedFiles.filter((file) => file.size <= MAX_UPLOAD_FILE_BYTES);

    if (supportedFiles.length < files.length) {
      addToast({ title: "部分文件不支持，已自动过滤" });
    }
    if (oversizedFiles.length > 0) {
      addToast({
        title: `存在超过 ${MAX_UPLOAD_FILE_LABEL} 的文件，无法上传`,
        description: oversizedFiles
          .slice(0, 2)
          .map((file) => file.name)
          .join("、"),
        variant: "error",
      });
    }

    if (validFiles.length === 0) {
      if (e.target) e.target.value = "";
      return;
    }

    // 为图片生成预览 URL
    const newImageUrls = new Map(attachmentImageUrls);
    const currentLength = existingAttachments.length;
    validFiles.forEach((file, index) => {
      const url = generateImageUrl(file);
      if (url) {
        newImageUrls.set(currentLength + index, url);
      }
    });
    setAttachmentImageUrls(newImageUrls);
    const nextAttachments = [...existingAttachments, ...validFiles];
    setAttachments(nextAttachments);

    if (onDraftAttachmentsChange) {
      onDraftAttachmentsChange(nextAttachments);
    }
    if (e.target) e.target.value = "";
  };

  // 移除附件
  const removeAttachment = (index: number) => {
    // 清理被移除文件的图片 URL
    const urlToRemove = attachmentImageUrls.get(index);
    if (urlToRemove) {
      cleanupImageUrl(urlToRemove);
      const newUrls = new Map(attachmentImageUrls);
      newUrls.delete(index);
      // 重新索引剩余的 URL
      const reorderedUrls = new Map<number, string>();
      let newIndex = 0;
      attachmentImageUrls.forEach((url, oldIdx) => {
        if (oldIdx !== index) {
          reorderedUrls.set(newIndex++, url);
        }
      });
      setAttachmentImageUrls(reorderedUrls);
    }

    const nextAttachments = attachments.filter((_, i) => i !== index);
    setAttachments(nextAttachments);
    if (onDraftAttachmentsChange) {
      onDraftAttachmentsChange(nextAttachments);
    }
  };

  // 检查文件类型是否支持
  const isSupportedFile = (file: File): boolean => {
    const imageTypes = ["image/"];
    const docTypes = [
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".csv",
      ".txt",
      ".md",
      ".markdown",
      ".json",
    ];
    const isImage = imageTypes.some((type) => file.type.startsWith(type));
    const isDoc = docTypes.some((ext) => file.name.toLowerCase().endsWith(ext));
    return isImage || isDoc;
  };

  // 处理拖拽进入
  const hasDraggedFiles = (e: DragEvent<HTMLDivElement>) => {
    const types = Array.from(e.dataTransfer?.types ?? []).map((type) => type.toLowerCase());
    if (types.includes("files")) return true;
    return types.some((type) => type.includes("file"));
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  // 处理拖拽离开
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleDragEnd = () => {
    dragDepthRef.current = 0;
    setIsDragging(false);
  };

  // 处理拖拽放下
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);

    if (!hasDraggedFiles(e)) {
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    const existingAttachments = attachments;
    const supportedFiles = files.filter((file) => isSupportedFile(file));
    const oversizedFiles = supportedFiles.filter((file) => file.size > MAX_UPLOAD_FILE_BYTES);
    const validFiles = supportedFiles.filter((file) => file.size <= MAX_UPLOAD_FILE_BYTES);

    if (supportedFiles.length < files.length) {
      addToast({ title: "部分文件不支持，已自动过滤" });
    }
    if (oversizedFiles.length > 0) {
      addToast({
        title: `存在超过 ${MAX_UPLOAD_FILE_LABEL} 的文件，无法上传`,
        description: oversizedFiles
          .slice(0, 2)
          .map((file) => file.name)
          .join("、"),
        variant: "error",
      });
    }

    // 为图片生成预览 URL
    const newImageUrls = new Map(attachmentImageUrls);
    const currentLength = existingAttachments.length;
    validFiles.forEach((file, index) => {
      const url = generateImageUrl(file);
      if (url) {
        newImageUrls.set(currentLength + index, url);
      }
    });
    setAttachmentImageUrls(newImageUrls);

    if (validFiles.length > 0) {
      const nextAttachments = [...existingAttachments, ...validFiles];
      setAttachments(nextAttachments);
      if (onDraftAttachmentsChange) {
        onDraftAttachmentsChange(nextAttachments);
      }
    }
  };

  // 预览文件
  const resetPreviewPdfState = () => {
    setPreviewPdfPages(0);
    setPreviewPdfPage(1);
    setPreviewPdfLoading(false);
    setPreviewPdfError(null);
    setPreviewPdfZoom(1);
    previewPdfDocRef.current = null;
  };

  const resetPreviewKnowledgeState = () => {
    setPreviewKnowledgeDetail(null);
    setPreviewKnowledgeLoading(false);
    setPreviewKnowledgeError(null);
  };

  const resolveKnowledgePreviewRef = async (file: File) => {
    const effectiveSessionKey = sessionKey ?? pendingUploadSessionKey ?? PREVIEW_UPLOAD_SESSION_KEY;

    const cacheKey = buildPreviewCacheKey(effectiveSessionKey, file);
    const cached = previewKnowledgeRefs.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    const uploadResult = await uploadSessionDocument({ sessionKey: effectiveSessionKey, file });

    const resolved = await resolveSessionKnowledgeDocumentRef({
      sessionKey: effectiveSessionKey,
      documentId: uploadResult.documentId,
      filename: file.name,
      knowledgeDocumentId: uploadResult.knowledgeDocumentId,
      kbId: uploadResult.kbId,
    });

    const ref = {
      documentId: resolved.knowledgeDocumentId,
      kbId: resolved.kbId,
    };
    previewKnowledgeRefs.current.set(cacheKey, ref);
    return ref;
  };

  const handlePreviewFile = async (file: File) => {
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;

    if (previewImageUrl) {
      URL.revokeObjectURL(previewImageUrl);
    }
    if (previewBlobUrl && previewBlobUrl !== previewImageUrl) {
      URL.revokeObjectURL(previewBlobUrl);
    }

    const blobUrl = URL.createObjectURL(file);
    setPreviewBlobUrl(blobUrl);
    setPreviewImageUrl(file.type.startsWith("image/") ? blobUrl : null);
    resetPreviewPdfState();
    resetPreviewKnowledgeState();

    const useKnowledgePreview = supportsKnowledgePreview(file);
    if (!useKnowledgePreview && supportsTextPreview(file)) {
      try {
        const text = await file.text();
        if (previewRequestRef.current === requestId) {
          setPreviewTextContent(text);
        }
      } catch {
        if (previewRequestRef.current === requestId) {
          setPreviewTextContent(null);
        }
      }
    } else {
      setPreviewTextContent(null);
    }
    setPreviewFile(file);

    if (!useKnowledgePreview) {
      return;
    }

    setPreviewKnowledgeLoading(true);
    setPreviewKnowledgeError(null);
    try {
      const ref = await resolveKnowledgePreviewRef(file);
      const detail = await getKnowledge(ref.documentId, ref.kbId);
      if (previewRequestRef.current !== requestId) {
        return;
      }
      setPreviewKnowledgeDetail(detail);
    } catch (error) {
      if (previewRequestRef.current !== requestId) {
        return;
      }
      setPreviewKnowledgeError(error instanceof Error ? error.message : "加载文档预览失败");
    } finally {
      if (previewRequestRef.current === requestId) {
        setPreviewKnowledgeLoading(false);
      }
    }
  };

  // 关闭预览
  const closePreview = () => {
    previewRequestRef.current += 1;
    if (previewImageUrl) {
      URL.revokeObjectURL(previewImageUrl);
    }
    if (previewBlobUrl && previewBlobUrl !== previewImageUrl) {
      URL.revokeObjectURL(previewBlobUrl);
    }
    resetPreviewPdfState();
    resetPreviewKnowledgeState();
    setPreviewFile(null);
    setPreviewImageUrl(null);
    setPreviewBlobUrl(null);
    setPreviewTextContent(null);
  };

  const previewFilename = previewFile?.name.toLowerCase() ?? "";
  const previewIsPdf = previewFile?.type === "application/pdf" || previewFilename.endsWith(".pdf");
  const previewIsOffice =
    previewFilename.endsWith(".docx") ||
    previewFilename.endsWith(".doc") ||
    previewFilename.endsWith(".xlsx") ||
    previewFilename.endsWith(".xls") ||
    previewFilename.endsWith(".pptx") ||
    previewFilename.endsWith(".ppt");
  const previewUsesKnowledgePreview = previewFile ? supportsKnowledgePreview(previewFile) : false;

  useEffect(() => {
    let isActive = true;
    if (!previewIsPdf || !previewBlobUrl) {
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
        const loadingTask = pdfjs.getDocument(previewBlobUrl);
        const pdf = await loadingTask.promise;
        if (!isActive) return;
        previewPdfDocRef.current = pdf;
        setPreviewPdfPages(pdf.numPages);
        setPreviewPdfPage(1);
        setPreviewPdfRenderKey((k) => k + 1);
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
  }, [previewIsPdf, previewBlobUrl]);

  useEffect(() => {
    const renderPdfPage = async () => {
      if (!previewIsPdf || !previewPdfDocRef.current || !previewPdfCanvasRef.current) return;
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
  }, [previewIsPdf, previewPdfPage, previewPdfZoom, previewPdfRenderKey]);

  return (
    <div>
      {/* 文件预览弹窗 */}
      {previewFile && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
          onClick={closePreview}
        >
          <div
            className="relative flex max-h-[97vh] w-[min(1320px,97vw)] flex-col overflow-hidden rounded-lg border border-border-light bg-background"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closePreview}
              className="absolute top-2 right-2 z-10 cursor-pointer p-1 rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <X className="w-5 h-5" />
            </button>
            {/* 工具栏（对齐知识库预览风格） */}
            <div className="flex items-center justify-between gap-sm border-b border-border-light px-md py-sm pr-12">
              <div className="flex min-w-0 items-center gap-xs">
                <FileText className="h-4 w-4 text-text-tertiary" />
                <span className="truncate text-sm font-medium text-text-primary">
                  {previewFile.name}
                </span>
                <span className="text-xs text-text-tertiary">
                  {formatFileSize(previewFile.size)}
                </span>
              </div>
              <div className="flex items-center gap-sm">
                {previewBlobUrl && (
                  <a
                    className="inline-flex items-center text-xs text-primary hover:underline"
                    href={previewBlobUrl}
                    download={previewFile.name}
                  >
                    <Download className="mr-xs h-3.5 w-3.5" />
                    下载
                  </a>
                )}
              </div>
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-auto scrollbar-default bg-background-secondary p-md">
              {previewImageUrl ? (
                <div className="rounded-lg border border-border-light bg-background p-md">
                  <img
                    src={previewImageUrl}
                    alt={previewFile.name}
                    className="mx-auto max-h-[78vh] w-auto max-w-full object-contain"
                  />
                </div>
              ) : previewIsPdf && previewBlobUrl ? (
                <div
                  key={previewPdfRenderKey}
                  className="rounded-lg border border-border-light bg-background p-sm"
                >
                  <div className="mb-sm flex items-center justify-between gap-sm">
                    <div className="flex items-center gap-xs">
                      <button
                        type="button"
                        className="cursor-pointer rounded border border-border-light px-sm py-xs text-xs text-text-primary hover:bg-background-secondary disabled:opacity-40"
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
                        className="cursor-pointer rounded border border-border-light px-sm py-xs text-xs text-text-primary hover:bg-background-secondary disabled:opacity-40"
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
                        className="cursor-pointer rounded border border-border-light px-sm py-xs text-xs text-text-primary hover:bg-background-secondary"
                        onClick={() => setPreviewPdfZoom((z) => Math.max(0.5, z - 0.25))}
                      >
                        缩小
                      </button>
                      <span className="min-w-[54px] text-center text-xs text-text-tertiary">
                        {Math.round(previewPdfZoom * 100)}%
                      </span>
                      <button
                        type="button"
                        className="cursor-pointer rounded border border-border-light px-sm py-xs text-xs text-text-primary hover:bg-background-secondary"
                        onClick={() => setPreviewPdfZoom((z) => Math.min(3, z + 0.25))}
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
              ) : previewUsesKnowledgePreview ? (
                <div className="rounded-lg border border-border-light bg-background p-sm">
                  {previewKnowledgeLoading ? (
                    <div className="flex h-[76vh] items-center justify-center text-sm text-text-tertiary">
                      正在上传并转换文档预览...
                    </div>
                  ) : previewKnowledgeError ? (
                    <div className="flex h-[76vh] items-center justify-center text-sm text-error">
                      {previewKnowledgeError}
                    </div>
                  ) : previewKnowledgeDetail ? (
                    <div className="h-[76vh] overflow-hidden rounded border border-border-light">
                      <LazyDocPreview detail={previewKnowledgeDetail} />
                    </div>
                  ) : (
                    <div className="flex h-[76vh] items-center justify-center text-sm text-text-tertiary">
                      预览准备中...
                    </div>
                  )}
                </div>
              ) : previewTextContent ? (
                <div className="rounded-lg border border-border-light bg-background p-md">
                  <pre className="whitespace-pre-wrap text-sm font-mono text-text-primary">
                    {previewTextContent}
                  </pre>
                </div>
              ) : previewIsOffice ? (
                <div className="flex min-h-[360px] flex-col items-center justify-center gap-md rounded-lg border border-border-light bg-background p-lg">
                  <File className="h-12 w-12 text-text-tertiary" />
                  <div className="space-y-xs text-center">
                    <p className="text-base font-semibold text-text-primary">Office 文件</p>
                    <p className="text-sm text-text-tertiary">
                      当前环境不支持在线转换预览，请下载后使用本地软件打开。
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-border-light bg-background p-lg text-sm text-text-tertiary">
                  当前格式暂不支持预览，可下载文件查看。
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* 输入区域 - Manus风格 */}
      <div
        className={
          compact ? "py-md flex flex-col items-center" : "py-md flex flex-col items-center"
        }
      >
        <div className="w-full md:max-w-[800px] lg:max-w-[1000px] px-md md:px-xl lg:px-2xl">
          <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
            className={`relative flex flex-col gap-sm border border-border transition-shadow min-w-0 ${
              compact
                ? "bg-background-secondary rounded-xl px-md py-md"
                : "bg-background-secondary rounded-2xl px-lg py-lg shadow-sm"
            }`}
          >
            {/* 拖拽提示覆盖层（仅限输入框区域） */}
            {isDragging && (
              <div
                className={`absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-primary bg-primary/10 pointer-events-none ${
                  compact ? "rounded-xl" : "rounded-2xl"
                }`}
              >
                <div className="flex flex-col items-center gap-2 text-primary">
                  <FolderOpen className="w-8 h-8" />
                  <span className="text-sm font-medium">松开鼠标上传文件</span>
                  <span className="text-xs text-text-tertiary">
                    支持图片、PDF、Word、Excel 等文档，单文件最大 {MAX_UPLOAD_FILE_LABEL}
                  </span>
                </div>
              </div>
            )}

            {/* 附件预览 - 在输入框内部，文字上方 */}
            {attachmentValue.length > 0 && (
              <div className="grid grid-cols-1 gap-sm pb-sm md:grid-cols-2">
                {attachmentValue.map((file, index) => {
                  const imageUrl = attachmentImageUrls.get(index);
                  const IconComponent = resolveAttachmentIcon(file);
                  const fileTypeLabel =
                    file.type && file.type.trim().length > 0
                      ? file.type
                      : file.name.split(".").pop()?.toUpperCase() || "未知类型";

                  return (
                    <div
                      key={index}
                      className="group rounded-xl border border-border-light bg-white p-sm text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <div className="flex items-start justify-between gap-sm">
                        <button
                          type="button"
                          className="flex cursor-pointer min-w-0 items-start gap-sm text-left"
                          onClick={() => handlePreviewFile(file)}
                          title="点击预览"
                        >
                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-primary/10 p-2 text-primary">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={file.name}
                                className="h-full w-full rounded-sm object-cover"
                              />
                            ) : (
                              <IconComponent className="h-5 w-5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-text-primary">
                              {file.name}
                            </div>
                            <div className="mt-1 truncate text-[11px] text-text-tertiary">
                              {fileTypeLabel}
                            </div>
                            <div className="mt-1 text-[11px] text-text-tertiary">
                              待发送 · {formatFileSize(file.size)}
                            </div>
                          </div>
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 rounded-md text-text-tertiary opacity-0 transition-opacity hover:bg-background-secondary hover:text-text-primary group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAttachment(index);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 文本输入框 */}
            <div ref={inputAreaRef} className="relative flex-1 min-w-[200px]">
              {selectedSkillKeys.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {selectedSkillKeys.map((skillKey) => (
                    <span
                      key={skillKey}
                      className="inline-flex items-center gap-1 rounded-md border border-primary/35 bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary"
                    >
                      /{skillKey}
                      <button
                        type="button"
                        onClick={() => handleRemoveSelectedSkill(skillKey)}
                        className="inline-flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-sm text-primary/80 hover:bg-primary/15 hover:text-primary"
                        title={`移除技能 /${skillKey}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                placeholder={placeholder}
                rows={2}
                className="w-full resize-none border-none outline-none bg-transparent text-sm text-text-primary placeholder:text-text-tertiary disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ maxHeight: "200px", minHeight: "72px" }}
              />
              {slashSuggestionsOpen && (
                <div
                  data-testid="slash-skills-panel"
                  className={`absolute z-30 rounded-xl border border-border-light bg-surface p-2 shadow-xl ${
                    slashPanelPosition.direction === "up" ? "origin-bottom" : "origin-top"
                  }`}
                  style={{
                    top: `${slashPanelPosition.top}px`,
                    left: `${slashPanelPosition.left}px`,
                    width: `${slashPanelPosition.width}px`,
                    maxWidth: "calc(100% - 8px)",
                  }}
                >
                  {renderSkillsPickerContent()}
                </div>
              )}
            </div>

            {/* 工具按钮 - 底部对齐 */}
            <div className="flex items-end justify-between gap-sm">
              <div className="flex items-center gap-xs">
                {/* 快捷功能下拉菜单 */}
                <Popover open={quickActionsOpen} onOpenChange={setQuickActionsOpen}>
                  <PopoverTrigger asChild>
                    <button
                      disabled={disabled}
                      className="relative p-sm rounded-lg cursor-pointer hover:bg-background text-text-tertiary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="快捷功能"
                    >
                      <Zap className="w-4 h-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    side="bottom"
                    sideOffset={8}
                    className="w-40 p-1 rounded-xl border-border-light bg-surface shadow-xl"
                  >
                    <div className="text-xs font-medium text-text-tertiary px-2 py-1.5">
                      生成文档
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        handleInsertSkill("powerpoint-pptx");
                        setQuickActionsOpen(false);
                      }}
                      className="w-full cursor-pointer flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-background transition-colors"
                    >
                      <Presentation className="w-4 h-4" />
                      生成PPT
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        handleInsertSkill("markdown-converter");
                        setQuickActionsOpen(false);
                      }}
                      className="w-full cursor-pointer flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-background transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                      生成Markdown
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        handleInsertSkill("word-generator");
                        setQuickActionsOpen(false);
                      }}
                      className="w-full cursor-pointer flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-background transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                      生成Word
                    </button>
                  </PopoverContent>
                </Popover>

                <Popover open={skillsOpen} onOpenChange={handleSkillsOpenChange}>
                  <PopoverTrigger asChild>
                    <button
                      disabled={disabled}
                      className="relative p-sm rounded-lg cursor-pointer hover:bg-background text-text-tertiary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="选择 Skills"
                    >
                      <Sparkles className="w-4 h-4" />
                      {selectedSkillKeys.length > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[11px] leading-[18px] text-center">
                          {selectedSkillKeys.length}
                        </span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    side="bottom"
                    sideOffset={8}
                    className="w-[340px] p-2 rounded-xl border-border-light bg-surface shadow-xl"
                  >
                    {renderSkillsPickerContent()}
                  </PopoverContent>
                </Popover>

                <Popover open={connectorsOpen} onOpenChange={handleConnectorsOpenChange}>
                  <PopoverTrigger asChild>
                    <button
                      disabled={disabled}
                      className="relative p-sm rounded-lg cursor-pointer hover:bg-background text-text-tertiary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="选择连接器"
                    >
                      {activeConnectorIds.length > 0 ? (
                        <div className="relative w-5 h-5">
                          {activeConnectorIds.slice(0, 3).map((id, index) => {
                            const connector = connectors.find((c) => c.id === id);
                            const IconComponent = getConnectorIcon(connector?.icon);
                            return (
                              <div
                                key={id}
                                className="absolute rounded-full bg-surface border border-border flex items-center justify-center"
                                style={{
                                  width: "18px",
                                  height: "18px",
                                  left: index * 6,
                                  top: 0,
                                  zIndex: 3 - index,
                                }}
                              >
                                <IconComponent className="w-3 h-3 text-text-secondary" />
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <Plug className="w-4 h-4" />
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    side="bottom"
                    sideOffset={8}
                    className="w-[360px] p-2 rounded-xl border-border-light bg-surface shadow-xl"
                  >
                    <div className="px-2 py-1.5">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-text-tertiary" />
                        <Input
                          value={connectorsQuery}
                          onChange={(event) => setConnectorsQuery(event.target.value)}
                          placeholder="搜索连接器..."
                          className="h-8 pl-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="max-h-64 overflow-auto scrollbar-default py-1 space-y-1">
                      {filteredConnectors.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-text-tertiary">
                          {availableConnectors.length === 0 ? "暂无可用连接器" : "无匹配连接器"}
                        </div>
                      ) : (
                        filteredConnectors.map((connector) => {
                          const checked = activeConnectorIds.includes(connector.id);
                          const isConnected = connector.status === "connected";
                          return (
                            <label
                              key={connector.id}
                              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-background cursor-pointer"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {(() => {
                                  const IconComponent = getConnectorIcon(connector.icon);
                                  return (
                                    <IconComponent className="w-4 h-4 text-text-secondary shrink-0" />
                                  );
                                })()}
                                <div className="min-w-0">
                                  <div className="text-sm text-text-primary truncate">
                                    {connector.name}
                                  </div>
                                  <div className="text-[11px] text-text-tertiary truncate">
                                    {connector.description || connector.id}
                                  </div>
                                </div>
                              </div>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!isConnected}
                                onChange={(event) =>
                                  onToggleConnector?.(connector.id, event.target.checked)
                                }
                                className="h-4 w-4 shrink-0"
                              />
                            </label>
                          );
                        })
                      )}
                    </div>
                    <div className="mt-2 pt-2 border-t border-border-light">
                      <button
                        type="button"
                        onClick={() => {
                          setConnectorsOpen(false);
                          setConnectorsQuery("");
                          openSettings("connectors");
                        }}
                        className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-xs text-primary hover:bg-primary/10"
                      >
                        管理 Connectors
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex items-center gap-xs">
                {/* @ + / 合并 */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      disabled={disabled}
                      className="p-sm rounded-lg cursor-pointer hover:bg-background text-text-tertiary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="@ 提及与 / 命令"
                    >
                      <AtSign className="w-4 h-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" side="top" className="w-44 p-1.5">
                    <button
                      type="button"
                      onClick={() => handleInsertMentionOrCommand("@ ")}
                      className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm hover:bg-background"
                    >
                      插入 @ 提及
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertMentionOrCommand("/ ")}
                      className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm hover:bg-background"
                    >
                      插入 / 命令
                    </button>
                  </PopoverContent>
                </Popover>

                {/* 文件上传 */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                  className="p-sm rounded-lg cursor-pointer hover:bg-background text-text-tertiary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={`上传文件 (最大${MAX_UPLOAD_FILE_LABEL})`}
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.markdown,.json"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {/* 图片上传 */}
                <button
                  onClick={() => imageInputRef.current?.click()}
                  disabled={disabled}
                  className="p-sm rounded-lg cursor-pointer hover:bg-background text-text-tertiary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={`上传图片 (最大${MAX_UPLOAD_FILE_LABEL})`}
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {/* 语音输入 (占位) */}
                <button
                  disabled
                  className="p-sm rounded-lg text-text-tertiary opacity-50 cursor-not-allowed"
                  title="语音输入 (即将推出)"
                >
                  <Mic className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-xs px-xs" title="始终允许（免审批）">
                  <span className="text-[11px] text-text-tertiary whitespace-nowrap">始终允许</span>
                  <Switch
                    checked={autoApproveAlways}
                    onCheckedChange={(checked) => onAutoApproveAlwaysChange?.(Boolean(checked))}
                    disabled={disabled || isSending}
                    aria-label="是否始终允许（免审批）"
                    className="h-5 w-9"
                  />
                </div>

                {/* 发送按钮 */}
                <button
                  onClick={handleSend}
                  disabled={disabled || isSending || !inputValue.trim()}
                  className="p-sm rounded-lg cursor-pointer bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="发送 (Shift + Command + Enter)"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
