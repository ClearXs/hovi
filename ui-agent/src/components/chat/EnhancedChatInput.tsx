"use client";

import {
  Send,
  Paperclip,
  Image as ImageIcon,
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
  Image as ImagePreviewIcon,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState, useEffect, KeyboardEvent, DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatFileSize } from "@/lib/fileUtils";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToastStore } from "@/stores/toastStore";

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [skillsQuery, setSkillsQuery] = useState("");
  const [isSkillsLoading, setIsSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [connectorsQuery, setConnectorsQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  // 附件图片预览 URLs
  const [attachmentImageUrls, setAttachmentImageUrls] = useState<Map<number, string>>(new Map());
  const [previewTextContent, setPreviewTextContent] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const prevDraftValueRef = useRef<string>(draftValue ?? "");
  const isTypingRef = useRef(false);

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
    }
  }, [draftValue]);

  // 追踪 draftAttachments 的变化
  const prevDraftAttachmentsRef = useRef<string>(JSON.stringify(draftAttachments ?? []));

  useEffect(() => {
    const newDraftAttachments = draftAttachments ?? [];
    const newDraftAttachmentsKey = JSON.stringify(newDraftAttachments);
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
      // 如果有外部回调也调用一下
      if (onDraftChange) onDraftChange("");
      if (onDraftAttachmentsChange) onDraftAttachmentsChange([]);
    }
  }, [resetKey, onDraftChange, onDraftAttachmentsChange]);

  const inputValue = input;
  const attachmentValue = attachments;
  const skillKeySet = useMemo(() => new Set(skills.map((skill) => skill.skillKey)), [skills]);
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

  const selectedSkillKeys = useMemo(() => {
    const tokens = inputValue.match(/\/[A-Za-z0-9._-]+/g) ?? [];
    const keys = tokens
      .map((token) => token.slice(1))
      .filter(
        (skillKey, index, list) => list.indexOf(skillKey) === index && skillKeySet.has(skillKey),
      );
    return keys;
  }, [inputValue, skillKeySet]);

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
    updateInputValue(e.target.value);
    if (sendError) setSendError(null);
    adjustTextareaHeight();
  };

  // 处理输入结束 - 当用户停止输入时重置标记
  const handleBlur = () => {
    isTypingRef.current = false;
  };

  const handleInsertSkill = (skillKey: string) => {
    const token = `/${skillKey}`;
    const exists = selectedSkillKeys.includes(skillKey);
    if (exists) {
      const pattern = new RegExp(`(^|\\s)${escapeRegExp(token)}(?=\\s|$)`, "g");
      const next = inputValue.replace(pattern, " ").replace(/\s+/g, " ").trimStart();
      updateInputValue(next);
      return;
    }
    const next = inputValue.trim() ? `${token} ${inputValue}` : `${token} `;
    updateInputValue(next);
  };

  const handleInsertMentionOrCommand = (token: "@ " | "/ ") => {
    if (inputValue.includes(token.trim())) {
      return;
    }
    updateInputValue(inputValue.trim() ? `${inputValue} ${token}` : token);
    textareaRef.current?.focus();
  };

  // 废弃参数保留为兼容字段,避免未来接入断裂
  void onWorkspaceClick;
  void hasGeneratedFiles;
  void workspaceOpen;

  // 处理发送
  const handleSend = async () => {
    if (!inputValue.trim() && attachmentValue.length === 0) return;
    if (disabled || isSending) return;

    // 先保存当前输入内容和附件
    const messageToSend = inputValue;
    const attachmentsToSend = attachmentValue.length > 0 ? [...attachmentValue] : undefined;

    // 立即清空输入框
    isTypingRef.current = false;
    setInput("");
    prevDraftValueRef.current = "";
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // 然后在后台发送消息
    setIsSending(true);
    const result = await onSend(messageToSend, attachmentsToSend);
    setIsSending(false);

    if (!result.ok) {
      // 发送失败，恢复输入内容
      setInput(messageToSend);
      prevDraftValueRef.current = messageToSend;
      setAttachments(attachmentsToSend ?? []);
      if (onDraftChange) {
        onDraftChange(messageToSend);
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
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => isSupportedFile(file));

    if (validFiles.length < files.length) {
      addToast({ title: "部分文件不支持，已自动过滤" });
    }

    // 为图片生成预览 URL
    const newImageUrls = new Map(attachmentImageUrls);
    const currentLength = attachmentValue.length;
    validFiles.forEach((file, index) => {
      const url = generateImageUrl(file);
      if (url) {
        newImageUrls.set(currentLength + index, url);
      }
    });
    setAttachmentImageUrls(newImageUrls);

    if (onDraftAttachmentsChange) {
      onDraftAttachmentsChange([...(draftAttachments ?? attachments), ...validFiles]);
    } else {
      setAttachments((prev) => [...prev, ...validFiles]);
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

    if (onDraftAttachmentsChange) {
      onDraftAttachmentsChange((draftAttachments ?? attachments).filter((_, i) => i !== index));
    } else {
      setAttachments((prev) => prev.filter((_, i) => i !== index));
    }
  };

  // 检查文件类型是否支持
  const isSupportedFile = (file: File): boolean => {
    const imageTypes = ["image/"];
    const docTypes = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".md", ".markdown"];
    const isImage = imageTypes.some((type) => file.type.startsWith(type));
    const isDoc = docTypes.some((ext) => file.name.toLowerCase().endsWith(ext));
    return isImage || isDoc;
  };

  // 处理拖拽进入
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  // 处理拖拽离开
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // 只有当离开整个容器时才重置状态
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  // 处理拖拽放下
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter((file) => isSupportedFile(file));

    if (validFiles.length < files.length) {
      addToast({ title: "部分文件不支持，已自动过滤" });
    }

    // 为图片生成预览 URL
    const newImageUrls = new Map(attachmentImageUrls);
    const currentLength = attachmentValue.length;
    validFiles.forEach((file, index) => {
      const url = generateImageUrl(file);
      if (url) {
        newImageUrls.set(currentLength + index, url);
      }
    });
    setAttachmentImageUrls(newImageUrls);

    if (validFiles.length > 0) {
      if (onDraftAttachmentsChange) {
        onDraftAttachmentsChange([...(draftAttachments ?? attachments), ...validFiles]);
      } else {
        setAttachments((prev) => [...prev, ...validFiles]);
      }
    }
  };

  // 预览文件
  const handlePreviewFile = async (file: File) => {
    if (file.type.startsWith("image/")) {
      // 创建图片预览 URL
      const url = URL.createObjectURL(file);
      setPreviewImageUrl(url);
      setPreviewTextContent(null);
    } else {
      // 读取文本文件内容
      try {
        const text = await file.text();
        setPreviewTextContent(text);
        setPreviewImageUrl(null);
      } catch {
        setPreviewTextContent(null);
      }
    }
    setPreviewFile(file);
  };

  // 关闭预览
  const closePreview = () => {
    if (previewImageUrl) {
      URL.revokeObjectURL(previewImageUrl);
    }
    setPreviewFile(null);
    setPreviewImageUrl(null);
    setPreviewTextContent(null);
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className={`relative ${isDragging ? "bg-primary/5" : ""}`}
    >
      {/* 拖拽提示覆盖层 */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-primary">
            <FolderOpen className="w-8 h-8" />
            <span className="text-sm font-medium">松开鼠标上传文件</span>
            <span className="text-xs text-text-tertiary">支持图片、PDF、Word、Excel 等文档</span>
          </div>
        </div>
      )}

      {/* 文件预览弹窗 */}
      {previewFile && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
          onClick={closePreview}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] bg-background rounded-lg overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closePreview}
              className="absolute top-2 right-2 z-10 p-1 rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <X className="w-5 h-5" />
            </button>
            {/* 头部 */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border-light">
              <FileText className="w-5 h-5 text-text-tertiary" />
              <span className="text-sm font-medium">{previewFile.name}</span>
              <span className="text-xs text-text-tertiary">
                ({formatFileSize(previewFile.size)})
              </span>
            </div>
            {/* 内容 */}
            <div className="flex-1 overflow-auto p-4 scrollbar-thin scrollbar-thumb-border-light scrollbar-track-transparent">
              {previewImageUrl ? (
                <img
                  src={previewImageUrl}
                  alt={previewFile.name}
                  className="max-w-full max-h-full object-contain mx-auto"
                />
              ) : previewTextContent ? (
                <pre className="text-sm text-text-primary whitespace-pre-wrap font-mono">
                  {previewTextContent}
                </pre>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-text-tertiary gap-2">
                  <File className="w-16 h-16" />
                  <div className="text-center">
                    {previewFile.name.endsWith(".docx") ||
                    previewFile.name.endsWith(".doc") ||
                    previewFile.name.endsWith(".xlsx") ||
                    previewFile.name.endsWith(".xls") ||
                    previewFile.name.endsWith(".pptx") ||
                    previewFile.name.endsWith(".ppt") ||
                    previewFile.name.endsWith(".pdf") ? (
                      <>
                        <div>Office/PDF 文件需发送消息后预览</div>
                        <div className="text-xs mt-1">发送消息将自动上传文件到知识库</div>
                      </>
                    ) : (
                      <div>暂不支持此文件格式预览</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {sendError && (
        <div className="px-2xl pb-sm">
          <div className="flex items-center justify-between gap-sm rounded-md border border-error/40 bg-error/10 px-md py-sm text-xs text-error">
            <span>{sendError}</span>
            <button
              type="button"
              onClick={handleSend}
              className="rounded border border-error/40 px-sm py-xs text-error hover:bg-error/10"
            >
              重试发送
            </button>
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
            className={`flex flex-col gap-sm border border-border transition-shadow min-w-0 ${
              compact
                ? "bg-background-secondary rounded-xl px-md py-md"
                : "bg-background-secondary rounded-2xl px-lg py-lg shadow-sm"
            } ${highlight ? "ring-2 ring-primary/40 shadow-[0_0_0_6px_rgba(99,102,241,0.15)] animate-attention" : ""}`}
          >
            {/* 附件预览 - 在输入框内部，文字上方 */}
            {attachmentValue.length > 0 && (
              <div className="flex flex-wrap gap-sm pb-sm">
                {attachmentValue.map((file, index) => {
                  const imageUrl = attachmentImageUrls.get(index);
                  const isImage = file.type.startsWith("image/");

                  return (
                    <div key={index} className="group relative">
                      {isImage && imageUrl ? (
                        // 图片直接显示大图预览
                        <div className="relative">
                          <div className="relative max-w-[80px] rounded-md overflow-hidden border border-border">
                            <img
                              src={imageUrl}
                              alt={file.name}
                              className="max-w-[80px] max-h-[60px] object-contain"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute top-1 right-1 h-6 w-6 bg-background/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeAttachment(index);
                              }}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        // 文档显示文件图标和名称
                        <div
                          className="flex items-center gap-xs px-sm py-xs bg-background rounded-md text-xs text-text-secondary hover:bg-background-secondary transition-colors cursor-pointer border border-border"
                          onClick={() => handlePreviewFile(file)}
                          title="点击预览"
                        >
                          <FileText className="w-4 h-4 text-text-tertiary" />
                          <span className="max-w-[120px] truncate">{file.name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeAttachment(index);
                            }}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 文本输入框 */}
            <div className="flex-1 min-w-[200px]">
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
            </div>

            {/* 工具按钮 - 底部对齐 */}
            <div className="flex items-end justify-between gap-sm">
              <div className="flex items-center gap-xs">
                {/* 快捷功能下拉菜单 */}
                <Popover open={quickActionsOpen} onOpenChange={setQuickActionsOpen}>
                  <PopoverTrigger asChild>
                    <button
                      disabled={disabled}
                      className="relative p-sm rounded-lg hover:bg-background text-text-tertiary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                      className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-background transition-colors"
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
                      className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-background transition-colors"
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
                      className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-background transition-colors"
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
                      className="relative p-sm rounded-lg hover:bg-background text-text-tertiary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    <div className="px-2 py-1.5">
                      <Input
                        value={skillsQuery}
                        onChange={(e) => setSkillsQuery(e.target.value)}
                        placeholder="筛选技能..."
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="max-h-64 overflow-auto space-y-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
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
                              className="w-full flex items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-background transition-colors disabled:opacity-50"
                              title={`/${skill.skillKey}`}
                            >
                              <div className="min-w-0">
                                <div className="text-sm text-text-primary truncate">
                                  {skill.name}
                                </div>
                                <div className="text-[11px] text-text-tertiary truncate">
                                  /{skill.skillKey}
                                </div>
                                {skill.description && (
                                  <div className="text-[11px] text-text-tertiary/90 truncate mt-0.5">
                                    {skill.description}
                                  </div>
                                )}
                                {unavailable && (
                                  <div className="text-[10px] text-text-tertiary mt-0.5">
                                    当前不可用
                                  </div>
                                )}
                              </div>
                              {checked && (
                                <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                    <div className="mt-2 pt-2 border-t border-border-light">
                      <button
                        type="button"
                        onClick={() => {
                          setSkillsOpen(false);
                          openSettings("skills");
                        }}
                        className="w-full rounded-md px-2 py-1.5 text-left text-xs text-primary hover:bg-primary/10"
                      >
                        管理 Skills
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>

                <Popover open={connectorsOpen} onOpenChange={handleConnectorsOpenChange}>
                  <PopoverTrigger asChild>
                    <button
                      disabled={disabled}
                      className="relative p-sm rounded-lg hover:bg-background text-text-tertiary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    <div className="max-h-64 overflow-auto py-1 space-y-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
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
                        className="w-full rounded-md px-2 py-1.5 text-left text-xs text-primary hover:bg-primary/10"
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
                      className="p-sm rounded-lg hover:bg-background text-text-tertiary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="@ 提及与 / 命令"
                    >
                      <AtSign className="w-4 h-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" side="top" className="w-44 p-1.5">
                    <button
                      type="button"
                      onClick={() => handleInsertMentionOrCommand("@ ")}
                      className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-background"
                    >
                      插入 @ 提及
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertMentionOrCommand("/ ")}
                      className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-background"
                    >
                      插入 / 命令
                    </button>
                  </PopoverContent>
                </Popover>

                {/* 文件上传 */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                  className="p-sm rounded-lg hover:bg-background text-text-tertiary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="上传文件 (最大10MB)"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.markdown"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {/* 图片上传 */}
                <button
                  onClick={() => imageInputRef.current?.click()}
                  disabled={disabled}
                  className="p-sm rounded-lg hover:bg-background text-text-tertiary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="上传图片"
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

                {/* 发送按钮 */}
                <button
                  onClick={handleSend}
                  disabled={
                    disabled || isSending || (!inputValue.trim() && attachmentValue.length === 0)
                  }
                  className="p-sm rounded-lg bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
