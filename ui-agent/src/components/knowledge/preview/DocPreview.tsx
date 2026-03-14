"use client";

// PDF.js 全局类型声明
interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: string) => {
    promise: Promise<{
      numPages: number;
      getPage: (
        pageNumber: number,
      ) => Promise<{
        getViewport: (options: { scale: number }) => { width: number; height: number };
        render: (options: {
          canvas: HTMLCanvasElement;
          canvasContext: CanvasRenderingContext2D;
          viewport: { width: number; height: number };
        }) => { promise: Promise<void> };
      }>;
    }>;
  };
}

declare global {
  interface Window {
    pdfjsLib?: PdfJsLib;
  }
}

import Editor from "@monaco-editor/react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit,
  ExternalLink,
  Eye,
  GripHorizontal,
  RotateCcw,
  Save,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { KnowledgeDetail } from "@/services/knowledgeApi";
import {
  buildHeaders,
  getGatewayBaseUrl,
  updateKnowledgeDocumentContent,
} from "@/services/knowledgeApi";
import { useToastStore } from "@/stores/toastStore";
import { UniverDocPreview } from "./UniverDocPreview";
import { UniverSheetPreview } from "./UniverSheetPreview";

interface DocPreviewProps {
  detail: KnowledgeDetail | null;
  highlightKeywords?: string[];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text: string, keywords: string[]) {
  if (!text || keywords.length === 0) return text;

  const pattern = new RegExp(
    `(${keywords.map((keyword) => escapeRegex(keyword)).join("|")})`,
    "gi",
  );
  const parts = text.split(pattern);

  return parts.map((part, index) => {
    const isKeyword = keywords.some((keyword) => keyword.toLowerCase() === part.toLowerCase());
    if (!isKeyword) {
      return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
    }
    return (
      <mark key={`${part}-${index}`} className="rounded bg-yellow-200 px-[2px] dark:bg-yellow-800">
        {part}
      </mark>
    );
  });
}

export function DocPreview({ detail, highlightKeywords = [] }: DocPreviewProps) {
  const { addToast } = useToastStore();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pdfPages, setPdfPages] = useState(0);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfSearch, setPdfSearch] = useState("");
  const [pdfSearchStatus, setPdfSearchStatus] = useState<string | null>(null);
  const [pptxPreviewUrl, setPptxPreviewUrl] = useState<string | null>(null);
  const [pptxPreviewLoading, setPptxPreviewLoading] = useState(false);
  const [pptxPreviewError, setPptxPreviewError] = useState<string | null>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);
  const pdfRenderingRef = useRef(false);

  // JSON 编辑器状态
  const [editedJsonContent, setEditedJsonContent] = useState<string>("");
  const [isSavingJson, setIsSavingJson] = useState(false);
  const [jsonToolbarPos, setJsonToolbarPos] = useState({ x: 16, y: 16 });
  const [jsonToolbarExpanded, setJsonToolbarExpanded] = useState(false);
  const jsonAreaRef = useRef<HTMLDivElement | null>(null);
  const jsonToolbarRef = useRef<HTMLDivElement | null>(null);
  // 拖动状态：使用 transform 实现流畅拖动
  const jsonDragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  }>({
    dragging: false,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
  });
  const [editedTextContent, setEditedTextContent] = useState<string>("");
  const [isSavingText, setIsSavingText] = useState(false);
  const [textToolbarPos, setTextToolbarPos] = useState({ x: 16, y: 16 });
  const [textToolbarExpanded, setTextToolbarExpanded] = useState(false);
  const textAreaRef = useRef<HTMLDivElement | null>(null);
  const textToolbarRef = useRef<HTMLDivElement | null>(null);
  // 拖动状态：使用 transform 实现流畅拖动
  const textDragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  }>({
    dragging: false,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
  });

  // Markdown 编辑器状态
  const [editedMarkdownContent, setEditedMarkdownContent] = useState<string>("");
  const [isSavingMarkdown, setIsSavingMarkdown] = useState(false);
  const [markdownToolbarPos, setMarkdownToolbarPos] = useState({ x: 16, y: 16 });
  const [markdownToolbarExpanded, setMarkdownToolbarExpanded] = useState(false);
  const [markdownEditMode, setMarkdownEditMode] = useState(false); // false = 阅读模式, true = 编辑模式
  const markdownAreaRef = useRef<HTMLDivElement | null>(null);
  const markdownToolbarRef = useRef<HTMLDivElement | null>(null);
  // 拖动状态：使用 transform 实现流畅拖动
  const markdownDragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  }>({
    dragging: false,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
  });

  // PDF 工具栏状态
  const [pdfToolbarPos, setPdfToolbarPos] = useState({ x: 16, y: 16 });
  const [pdfToolbarExpanded, setPdfToolbarExpanded] = useState(true);
  const pdfToolbarRef = useRef<HTMLDivElement | null>(null);
  const pdfDragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  }>({
    dragging: false,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
  });

  const mime = detail?.mimetype || "";
  const filename = detail?.filename?.toLowerCase() || "";

  const isMarkdown =
    mime === "text/markdown" || filename.endsWith(".md") || filename.endsWith(".mdx");
  const isText = mime.startsWith("text/") || isMarkdown;
  const canZoom = mime.startsWith("image/") || mime === "application/pdf";
  const isMarkdownFile = isText && isMarkdown; // 新增：区分纯文本和 Markdown
  const zoomOptions = useMemo(() => [1, 1.25, 1.5], []);
  const keywords = useMemo(
    () => highlightKeywords.map((item) => item.trim()).filter(Boolean),
    [highlightKeywords],
  );

  const isDocx =
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.endsWith(".docx");
  const isXlsx =
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    filename.endsWith(".xlsx");
  const isCsv = mime === "text/csv" || mime === "application/csv" || filename.endsWith(".csv");
  const isPptx =
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    filename.endsWith(".pptx");

  const handlePdfSearch = async (value?: string) => {
    const queryValue = (value ?? pdfSearch).trim();
    if (!pdfDocRef.current || !queryValue) return;

    setPdfLoading(true);
    setPdfSearchStatus("搜索中...");
    const normalizedQuery = queryValue.toLowerCase();
    let foundPage = 0;

    for (let pageIndex = 1; pageIndex <= pdfDocRef.current.numPages; pageIndex += 1) {
      const page = await pdfDocRef.current.getPage(pageIndex);
      const pageText = await page.getTextContent();
      const text = pageText.items
        .map((item: { str?: string }) => ("str" in item ? item.str : ""))
        .join(" ")
        .toLowerCase();
      if (text.includes(normalizedQuery)) {
        foundPage = pageIndex;
        break;
      }
    }

    if (foundPage) {
      setPdfPage(foundPage);
      setPdfSearchStatus(`命中第 ${foundPage} 页`);
    } else {
      setPdfSearchStatus("未找到匹配内容");
    }
    setPdfLoading(false);
  };

  // JSON 编辑器处理函数
  const handleSaveJson = async () => {
    if (!detail || !detail.kbId) {
      addToast({ title: "缺少知识库信息", variant: "error" });
      return;
    }

    try {
      setIsSavingJson(true);
      const formatted = JSON.stringify(JSON.parse(editedJsonContent), null, 2);

      // 调用保存 API
      await updateKnowledgeDocumentContent({
        kbId: detail.kbId,
        documentId: detail.id,
        content: formatted,
      });

      // 更新原始内容
      setTextContent(formatted);
      setEditedJsonContent(formatted);
      addToast({ title: "保存成功", variant: "success" });
    } catch (err) {
      addToast({ title: err instanceof Error ? err.message : "保存失败", variant: "error" });
    } finally {
      setIsSavingJson(false);
    }
  };

  const handleResetJson = () => {
    if (!textContent) return;
    try {
      setEditedJsonContent(JSON.stringify(JSON.parse(textContent), null, 2));
    } catch {
      setEditedJsonContent(textContent);
    }
  };

  const handleSaveText = async () => {
    if (!detail || !detail.kbId) {
      addToast({ title: "缺少知识库信息", variant: "error" });
      return;
    }
    try {
      setIsSavingText(true);
      await updateKnowledgeDocumentContent({
        kbId: detail.kbId,
        documentId: detail.id,
        content: editedTextContent,
      });
      setTextContent(editedTextContent);
      addToast({ title: "保存成功", variant: "success" });
    } catch (err) {
      addToast({ title: err instanceof Error ? err.message : "保存失败", variant: "error" });
    } finally {
      setIsSavingText(false);
    }
  };

  const handleSaveMarkdown = async () => {
    if (!detail || !detail.kbId) {
      addToast({ title: "缺少知识库信息", variant: "error" });
      return;
    }
    try {
      setIsSavingMarkdown(true);
      await updateKnowledgeDocumentContent({
        kbId: detail.kbId,
        documentId: detail.id,
        content: editedMarkdownContent,
      });
      setTextContent(editedMarkdownContent);
      addToast({ title: "保存成功", variant: "success" });
    } catch (err) {
      addToast({ title: err instanceof Error ? err.message : "保存失败", variant: "error" });
    } finally {
      setIsSavingMarkdown(false);
    }
  };

  const handleResetMarkdown = () => {
    if (!textContent) return;
    setEditedMarkdownContent(textContent);
  };

  useEffect(() => {
    let isActive = true;
    let nextUrl: string | null = null;

    const loadFile = async () => {
      if (!detail) return;
      setIsLoading(true);
      const url = new URL("/api/knowledge/file", getGatewayBaseUrl());
      url.searchParams.set("documentId", detail.id);
      if (detail.kbId) {
        url.searchParams.set("kbId", detail.kbId);
      }
      const response = await fetch(url.toString(), { headers: buildHeaders() });
      if (!response.ok) {
        setIsLoading(false);
        return;
      }
      const blob = await response.blob();
      if (!isActive) return;
      nextUrl = URL.createObjectURL(blob);
      setBlobUrl(nextUrl);
      if (
        detail.mimetype.startsWith("text/") ||
        detail.mimetype === "text/markdown" ||
        detail.mimetype === "application/json"
      ) {
        const text = await blob.text();
        if (!isActive) return;
        setTextContent(text);
      }
      setIsLoading(false);
    };

    setBlobUrl(null);
    setTextContent("");
    setZoom(1);
    setPdfPages(0);
    setPdfError(null);
    setPdfPage(1);
    setPdfSearch("");
    setPdfSearchStatus(null);
    setPptxPreviewUrl(null);
    setPptxPreviewLoading(false);
    setPptxPreviewError(null);
    pdfDocRef.current = null;
    void loadFile();

    return () => {
      isActive = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [detail]);

  // 加载 PDF.js - 完全从 CDN 加载，绕过 webpack
  // 使用计数器强制触发重新渲染
  const [pdfRenderKey, setPdfRenderKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    const loadPdfJs = (): Promise<PdfJsLib> => {
      return new Promise((resolve, reject) => {
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
    };

    const initPdf = async () => {
      if (!blobUrl || mime !== "application/pdf") return;
      setPdfLoading(true);
      setPdfError(null);

      try {
        const pdfjs = await loadPdfJs();
        if (!isActive || !pdfjs) return;

        pdfjs.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";

        const loadingTask = pdfjs.getDocument(blobUrl);
        const pdf = await loadingTask.promise;
        if (!isActive) return;

        pdfDocRef.current = pdf;
        setPdfPages(pdf.numPages);
        setPdfPage(1);
        // 触发重新渲染
        setPdfRenderKey((k) => k + 1);
      } catch (err) {
        console.error("PDF load error:", err);
        setPdfError(err instanceof Error ? err.message : "PDF 加载失败");
      } finally {
        if (isActive) {
          setPdfLoading(false);
        }
      }
    };

    initPdf();

    return () => {
      isActive = false;
    };
  }, [blobUrl, mime]);

  useEffect(() => {
    const renderPage = async () => {
      if (!pdfDocRef.current || !pdfCanvasRef.current || mime !== "application/pdf") return;
      if (pdfRenderingRef.current) return;
      pdfRenderingRef.current = true;
      const page = await pdfDocRef.current.getPage(pdfPage);
      const viewport = page.getViewport({ scale: 1.2 * zoom });
      const canvas = pdfCanvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) {
        pdfRenderingRef.current = false;
        return;
      }
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      pdfRenderingRef.current = false;
    };
    void renderPage();
  }, [pdfPage, zoom, mime, pdfRenderKey]);

  useEffect(() => {
    if (mime !== "application/pdf" || keywords.length === 0 || !pdfDocRef.current) return;
    const firstKeyword = keywords[0];
    setPdfSearch(firstKeyword);
    const timeoutId = window.setTimeout(() => {
      void handlePdfSearch(firstKeyword);
    }, 400);
    return () => window.clearTimeout(timeoutId);
  }, [keywords, mime]);

  useEffect(() => {
    if (!detail || !isPptx) return;
    let active = true;
    let objectUrl: string | null = null;

    const loadPptxPreview = async () => {
      try {
        setPptxPreviewLoading(true);
        setPptxPreviewError(null);
        const url = new URL(`/api/knowledge/convert/pptx-to-pdf/${detail.id}`, getGatewayBaseUrl());
        if (detail.kbId) {
          url.searchParams.set("kbId", detail.kbId);
        }
        const response = await fetch(url.toString(), { headers: buildHeaders() });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`PPTX 转换失败: ${response.status} ${response.statusText} ${errorText}`);
        }
        const pdfBlob = await response.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(pdfBlob);
        setPptxPreviewUrl(objectUrl);
      } catch (error) {
        if (!active) return;
        setPptxPreviewError(error instanceof Error ? error.message : "PPTX 预览加载失败");
      } finally {
        if (active) {
          setPptxPreviewLoading(false);
        }
      }
    };

    void loadPptxPreview();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [detail, isPptx]);

  useEffect(() => {
    if (!(mime === "application/json" || filename.endsWith(".json"))) return;
    if (!textContent) return;
    try {
      const formatted = JSON.stringify(JSON.parse(textContent), null, 2);
      setEditedJsonContent(formatted);
      setTextContent(formatted);
    } catch {
      setEditedJsonContent(textContent);
    }
  }, [textContent, mime, filename]);

  useEffect(() => {
    if (!isText || isMarkdown || mime === "application/json" || filename.endsWith(".json")) return;
    setEditedTextContent(textContent);
  }, [textContent, isText, isMarkdown, mime, filename]);

  // 初始化工具栏位置（只在组件挂载时执行一次）
  useEffect(() => {
    // JSON 工具栏初始位置
    if (mime === "application/json" || filename.endsWith(".json")) {
      setJsonToolbarPos({ x: 8, y: 8 });
    }
    // TXT 工具栏初始位置
    if (isText && !isMarkdown && mime !== "application/json" && !filename.endsWith(".json")) {
      setTextToolbarPos({ x: 8, y: 8 });
    }
    // Markdown 工具栏初始位置
    if (isMarkdown) {
      setMarkdownToolbarPos({ x: 8, y: 8 });
    }
    // PDF 工具栏初始位置
    if (mime === "application/pdf") {
      setPdfToolbarPos({ x: 8, y: 8 });
    }
  }, []);

  // Markdown 内容初始化
  useEffect(() => {
    if (!isMarkdown) return;
    setEditedMarkdownContent(textContent);
  }, [textContent, isMarkdown]);

  // Markdown toolbar 位置调整
  if (!detail) {
    return <div className="text-sm text-text-tertiary">暂无预览</div>;
  }

  const toolbar = (
    <div className="mb-sm flex items-center justify-between">
      <div className="truncate text-xs text-text-tertiary">{detail.filename}</div>
      <div className="flex items-center gap-xs">
        {canZoom && (
          <select
            className="h-7 rounded border border-border-light bg-white px-xs text-xs"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          >
            {zoomOptions.map((value) => (
              <option key={value} value={value}>
                {Math.round(value * 100)}%
              </option>
            ))}
          </select>
        )}
        {blobUrl && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard?.writeText(textContent)}
              disabled={!isText || !textContent}
            >
              <Copy className="mr-xs h-3.5 w-3.5" />
              复制
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(blobUrl, "_blank", "noopener")}
            >
              <ExternalLink className="mr-xs h-3.5 w-3.5" />
              打开
            </Button>
            <a
              className="text-xs text-primary hover:underline"
              href={blobUrl}
              download={detail.filename}
            >
              下载
            </a>
          </>
        )}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div>
        {toolbar}
        <div className="text-sm text-text-tertiary">加载预览中...</div>
      </div>
    );
  }

  if (isDocx) {
    return blobUrl ? (
      <UniverDocPreview documentId={detail.id} />
    ) : (
      <div className="text-sm text-text-tertiary">加载 Word 中...</div>
    );
  }

  if (isXlsx) {
    return blobUrl ? (
      <UniverSheetPreview documentId={detail.id} />
    ) : (
      <div className="text-sm text-text-tertiary">加载 Excel 中...</div>
    );
  }

  if (isCsv) {
    return blobUrl ? (
      <UniverSheetPreview documentId={detail.id} fileType="csv" />
    ) : (
      <div className="text-sm text-text-tertiary">加载 CSV 中...</div>
    );
  }

  if (isPptx) {
    return (
      <div className="flex min-h-[360px] flex-col gap-sm">
        {pptxPreviewLoading ? (
          <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-text-tertiary">
            正在转换并加载 PPT 预览...
          </div>
        ) : pptxPreviewUrl ? (
          <iframe
            title={detail.filename}
            src={pptxPreviewUrl}
            className="h-full min-h-[520px] w-full rounded-lg border border-border-light"
          />
        ) : (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-md rounded-lg border border-border-light p-lg">
            <div className="space-y-xs text-center">
              <p className="text-base font-semibold text-text-primary">PowerPoint 文件</p>
              <p className="text-sm text-text-tertiary">
                {pptxPreviewError || "当前环境不支持在线转换预览，请下载后使用本地软件打开。"}
              </p>
            </div>
            {blobUrl && (
              <a
                href={blobUrl}
                download={detail.filename}
                className="inline-flex items-center gap-xs rounded-md bg-primary px-md py-sm text-sm text-white"
              >
                <Download className="h-4 w-4" />
                下载文件
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  // JSON 预览与编辑
  if (mime === "application/json" || filename.endsWith(".json")) {
    return blobUrl && textContent ? (
      <div ref={jsonAreaRef} className="relative h-full flex flex-col">
        <div
          ref={jsonToolbarRef}
          className="absolute z-10 flex select-none items-center gap-1 rounded-md border border-primary/25 bg-background/95 p-1 text-text-primary shadow-sm backdrop-blur"
          style={{ left: jsonToolbarPos.x, top: jsonToolbarPos.y }}
          onMouseDown={(event) => {
            const target = event.target as HTMLElement;
            if (!target.closest("[data-json-drag]")) return;
            event.preventDefault();
            event.stopPropagation();
            const toolbar = jsonToolbarRef.current;
            if (!toolbar) return;
            jsonDragRef.current = {
              dragging: true,
              startX: event.clientX,
              startY: event.clientY,
              initialX: jsonToolbarPos.x,
              initialY: jsonToolbarPos.y,
            };
            const onMove = (moveEvent: MouseEvent) => {
              if (!jsonDragRef.current.dragging) return;
              const deltaX = moveEvent.clientX - jsonDragRef.current.startX;
              const deltaY = moveEvent.clientY - jsonDragRef.current.startY;
              const newX = jsonDragRef.current.initialX + deltaX;
              const newY = jsonDragRef.current.initialY + deltaY;
              setJsonToolbarPos({ x: newX, y: newY });
            };
            const onUp = () => {
              jsonDragRef.current.dragging = false;
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
          title="拖拽移动工具栏"
        >
          <TooltipProvider delayDuration={200}>
            {/* 拖拽按钮 - 无 Tooltip */}
            <button
              data-json-drag
              type="button"
              className="flex h-7 w-7 cursor-move items-center justify-center rounded-md bg-background/80 text-text-secondary transition-colors hover:bg-primary/15 hover:text-primary"
            >
              <GripHorizontal className="h-3.5 w-3.5" />
            </button>
            {jsonToolbarExpanded ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      data-json-action
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-primary transition-colors hover:bg-primary/15 hover:text-primary"
                      onClick={() => navigator.clipboard?.writeText(editedJsonContent)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">复制</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      data-json-action
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-primary transition-colors hover:bg-primary/15 hover:text-primary"
                      onClick={() => window.open(blobUrl, "_blank", "noopener")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">打开</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      data-json-action
                      href={blobUrl}
                      download={detail.filename}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-primary transition-colors hover:bg-primary/15 hover:text-primary"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">下载</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      data-json-action
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-primary transition-colors hover:bg-primary/15 hover:text-primary disabled:opacity-40"
                      onClick={handleResetJson}
                      disabled={isSavingJson}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">重置</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      data-json-action
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-white transition-colors hover:bg-primary/90 disabled:opacity-40"
                      onClick={handleSaveJson}
                      disabled={isSavingJson}
                    >
                      <Save className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">保存</TooltipContent>
                </Tooltip>
              </>
            ) : null}
            {/* 展开/收起按钮 - 无 Tooltip */}
            <button
              data-json-action
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-text-secondary transition-colors hover:bg-primary/15 hover:text-primary"
              onClick={() => setJsonToolbarExpanded((value) => !value)}
            >
              {jsonToolbarExpanded ? (
                <ChevronLeft className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          </TooltipProvider>
        </div>
        <div className="flex-1 overflow-hidden rounded-lg border border-border-light">
          <Editor
            height="100%"
            language="json"
            value={editedJsonContent}
            onChange={(value) => setEditedJsonContent(value || "")}
            options={{
              readOnly: false,
              minimap: { enabled: false },
              formatOnPaste: true,
              formatOnType: true,
              scrollBeyondLastLine: false,
              fontSize: 14,
              tabSize: 2,
            }}
            theme="vs-dark"
          />
        </div>
      </div>
    ) : (
      <div className="text-sm text-text-tertiary">加载 JSON 中...</div>
    );
  }

  if (mime.startsWith("image/")) {
    return blobUrl ? (
      <div>
        {toolbar}
        <img
          src={blobUrl}
          alt={detail.filename}
          className="max-h-[360px] object-contain"
          style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
        />
      </div>
    ) : (
      <div className="text-sm text-text-tertiary">加载图片中...</div>
    );
  }

  if (mime.startsWith("audio/")) {
    return blobUrl ? (
      <div>
        {toolbar}
        <audio controls className="w-full" src={blobUrl} />
      </div>
    ) : (
      <div className="text-sm text-text-tertiary">加载音频中...</div>
    );
  }

  if (mime.startsWith("video/")) {
    return blobUrl ? (
      <div>
        {toolbar}
        <video controls className="w-full" src={blobUrl} />
      </div>
    ) : (
      <div className="text-sm text-text-tertiary">加载视频中...</div>
    );
  }

  if (mime === "application/pdf") {
    return blobUrl ? (
      <div key={pdfRenderKey} className="relative h-full">
        {/* PDF 画布区域 */}
        <div className="h-full overflow-auto p-sm">
          {pdfLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
              加载 PDF 中...
            </div>
          ) : (
            <canvas
              key={pdfRenderKey}
              ref={pdfCanvasRef}
              className="mx-auto block max-w-full bg-white"
            />
          )}
        </div>

        {/* PDF 悬浮工具栏 - 距底部30px居中 */}
        <div className="absolute bottom-[30px] left-1/2 -translate-x-1/2 flex select-none items-center gap-1 rounded-md border border-primary/25 bg-background/95 p-1 text-text-primary shadow-sm backdrop-blur">
          <TooltipProvider delayDuration={200}>
            {/* 拖拽按钮 */}
            <button
              data-pdf-drag
              type="button"
              className="flex h-7 w-7 cursor-move items-center justify-center rounded-md bg-background/80 text-text-secondary transition-colors hover:bg-primary/15 hover:text-primary"
            >
              <GripHorizontal className="h-3.5 w-3.5" />
            </button>
          </TooltipProvider>
        </div>
        {/* PDF 底部工具栏 */}
        <div className="absolute bottom-[30px] left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-md border border-primary/25 bg-background/95 p-1 text-text-primary shadow-sm backdrop-blur">
          <TooltipProvider delayDuration={200}>
            {/* 缩小按钮 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:bg-gray-100"
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">缩小</TooltipContent>
            </Tooltip>
            {/* 放大按钮 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:bg-gray-100"
                  onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">放大</TooltipContent>
            </Tooltip>
            {/* 分隔线 */}
            <div className="mx-1 h-5 w-px bg-border-light" />
            {/* 上一页 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary hover:bg-gray-100 disabled:opacity-40"
                  disabled={pdfPage <= 1 || pdfLoading}
                  onClick={() => setPdfPage((prev) => Math.max(1, prev - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一页
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">上一页</TooltipContent>
            </Tooltip>
            {/* 页码显示 */}
            <span className="min-w-[60px] text-center text-xs text-text-tertiary">
              {pdfPages ? `${pdfPage} / ${pdfPages}` : "加载中"}
            </span>
            {/* 下一页 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary hover:bg-gray-100 disabled:opacity-40"
                  disabled={pdfPages === 0 || pdfPage >= pdfPages || pdfLoading}
                  onClick={() => setPdfPage((prev) => Math.min(pdfPages, prev + 1))}
                >
                  下一页
                  <ChevronRight className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">下一页</TooltipContent>
            </Tooltip>
            {/* 分隔线 */}
            <div className="mx-1 h-5 w-px bg-border-light" />
            {/* 打开按钮 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:bg-gray-100"
                  onClick={() => window.open(blobUrl, "_blank", "noopener")}
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">打开</TooltipContent>
            </Tooltip>
            {/* 下载按钮 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={blobUrl}
                  download={detail.filename}
                  className="flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:bg-gray-100"
                >
                  <Download className="h-4 w-4" />
                </a>
              </TooltipTrigger>
              <TooltipContent side="top">下载</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    ) : (
      <div className="text-sm text-text-tertiary">加载 PDF 中...</div>
    );
  }

  if (isText) {
    if (!isMarkdown) {
      return (
        <div ref={textAreaRef} className="relative h-full flex flex-col">
          <div
            ref={textToolbarRef}
            className="absolute z-10 flex select-none items-center gap-1 rounded-md border border-primary/25 bg-background/95 p-1 text-text-primary shadow-sm backdrop-blur"
            style={{ left: textToolbarPos.x, top: textToolbarPos.y }}
            onMouseDown={(event) => {
              const target = event.target as HTMLElement;
              if (!target.closest("[data-text-drag]")) return;
              event.preventDefault();
              event.stopPropagation();
              textDragRef.current = {
                dragging: true,
                startX: event.clientX,
                startY: event.clientY,
                initialX: textToolbarPos.x,
                initialY: textToolbarPos.y,
              };
              const onMove = (moveEvent: MouseEvent) => {
                if (!textDragRef.current.dragging) return;
                const deltaX = moveEvent.clientX - textDragRef.current.startX;
                const deltaY = moveEvent.clientY - textDragRef.current.startY;
                const newX = textDragRef.current.initialX + deltaX;
                const newY = textDragRef.current.initialY + deltaY;
                setTextToolbarPos({ x: newX, y: newY });
              };
              const onUp = () => {
                textDragRef.current.dragging = false;
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
          >
            <TooltipProvider delayDuration={200}>
              {/* 拖拽按钮 - 无 Tooltip */}
              <button
                data-text-drag
                type="button"
                className="flex h-7 w-7 cursor-move items-center justify-center rounded-md bg-background/80 text-text-secondary transition-colors hover:bg-primary/15 hover:text-primary"
              >
                <GripHorizontal className="h-3.5 w-3.5" />
              </button>
              {textToolbarExpanded ? (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-primary transition-colors hover:bg-primary/15 hover:text-primary"
                        onClick={() => navigator.clipboard?.writeText(editedTextContent)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">复制</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-primary transition-colors hover:bg-primary/15 hover:text-primary"
                        onClick={() => blobUrl && window.open(blobUrl, "_blank", "noopener")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">打开</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={blobUrl || undefined}
                        download={detail.filename}
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-primary transition-colors hover:bg-primary/15 hover:text-primary"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">下载</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-primary transition-colors hover:bg-primary/15 hover:text-primary disabled:opacity-40"
                        onClick={() => setEditedTextContent(textContent)}
                        disabled={isSavingText}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">重置</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-white transition-colors hover:bg-primary/90 disabled:opacity-40"
                        onClick={handleSaveText}
                        disabled={isSavingText}
                      >
                        <Save className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">保存</TooltipContent>
                  </Tooltip>
                </>
              ) : null}
              {/* 展开/收起按钮 - 无 Tooltip */}
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-text-secondary transition-colors hover:bg-primary/15 hover:text-primary"
                onClick={() => setTextToolbarExpanded((value) => !value)}
              >
                {textToolbarExpanded ? (
                  <ChevronLeft className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            </TooltipProvider>
          </div>
          <div className="flex-1 overflow-hidden rounded-lg border border-border-light">
            <Editor
              height="100%"
              language="plaintext"
              value={editedTextContent}
              onChange={(value) => setEditedTextContent(value || "")}
              options={{
                readOnly: false,
                minimap: { enabled: false },
                wordWrap: "on",
                scrollBeyondLastLine: false,
                fontSize: 14,
                tabSize: 2,
              }}
              theme="vs-dark"
            />
          </div>
        </div>
      );
    }

    return (
      <div ref={markdownAreaRef} className="relative h-full flex flex-col">
        {/* 悬浮工具栏 */}
        <div
          ref={markdownToolbarRef}
          className="absolute z-10 flex select-none items-center gap-1 rounded-md border border-primary/25 bg-background/95 p-1 text-text-primary shadow-sm backdrop-blur"
          style={{ left: markdownToolbarPos.x, top: markdownToolbarPos.y }}
          onMouseDown={(event) => {
            const target = event.target as HTMLElement;
            if (!target.closest("[data-markdown-drag]")) return;
            event.preventDefault();
            event.stopPropagation();
            markdownDragRef.current = {
              dragging: true,
              startX: event.clientX,
              startY: event.clientY,
              initialX: markdownToolbarPos.x,
              initialY: markdownToolbarPos.y,
            };
            const onMove = (moveEvent: MouseEvent) => {
              if (!markdownDragRef.current.dragging) return;
              const deltaX = moveEvent.clientX - markdownDragRef.current.startX;
              const deltaY = moveEvent.clientY - markdownDragRef.current.startY;
              const newX = markdownDragRef.current.initialX + deltaX;
              const newY = markdownDragRef.current.initialY + deltaY;
              setMarkdownToolbarPos({ x: newX, y: newY });
            };
            const onUp = () => {
              markdownDragRef.current.dragging = false;
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        >
          <TooltipProvider delayDuration={200}>
            {/* 拖拽按钮 - 无 Tooltip */}
            <button
              data-markdown-drag
              type="button"
              className="flex h-7 w-7 cursor-move items-center justify-center rounded-md bg-background/80 text-text-secondary transition-colors hover:bg-primary/15 hover:text-primary"
            >
              <GripHorizontal className="h-3.5 w-3.5" />
            </button>
            {/* 阅读/编辑模式切换 */}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-primary transition-colors hover:bg-primary/15 hover:text-primary"
                    onClick={() => setMarkdownEditMode(!markdownEditMode)}
                  >
                    {markdownEditMode ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <Edit className="h-3.5 w-3.5" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {markdownEditMode ? "阅读模式" : "编辑模式"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {markdownToolbarExpanded ? (
              <>
                {/* 复制按钮 - 阅读模式复制原文，编辑模式复制编辑内容 */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-primary transition-colors hover:bg-primary/15 hover:text-primary"
                      onClick={() =>
                        navigator.clipboard?.writeText(
                          markdownEditMode ? editedMarkdownContent : textContent,
                        )
                      }
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">复制</TooltipContent>
                </Tooltip>
                {/* 打开按钮 - 始终显示 */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-primary transition-colors hover:bg-primary/15 hover:text-primary"
                      onClick={() => blobUrl && window.open(blobUrl, "_blank", "noopener")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">打开</TooltipContent>
                </Tooltip>
                {/* 下载按钮 - 始终显示 */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={blobUrl || undefined}
                      download={detail.filename}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-primary transition-colors hover:bg-primary/15 hover:text-primary"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">下载</TooltipContent>
                </Tooltip>
                {/* 重置按钮 - 仅编辑模式显示 */}
                {markdownEditMode && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-primary transition-colors hover:bg-primary/15 hover:text-primary disabled:opacity-40"
                        onClick={handleResetMarkdown}
                        disabled={isSavingMarkdown}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">重置</TooltipContent>
                  </Tooltip>
                )}
                {/* 保存按钮 - 仅编辑模式显示 */}
                {markdownEditMode && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-white transition-colors hover:bg-primary/90 disabled:opacity-40"
                        onClick={handleSaveMarkdown}
                        disabled={isSavingMarkdown}
                      >
                        <Save className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">保存</TooltipContent>
                  </Tooltip>
                )}
              </>
            ) : null}
            {/* 展开/收起按钮 - 无 Tooltip */}
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-text-secondary transition-colors hover:bg-primary/15 hover:text-primary"
              onClick={() => setMarkdownToolbarExpanded((value) => !value)}
            >
              {markdownToolbarExpanded ? (
                <ChevronLeft className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          </TooltipProvider>
        </div>

        {/* Markdown 内容区域 */}
        <div className="flex-1 overflow-hidden rounded-lg border border-border-light">
          {markdownEditMode ? (
            // 编辑模式 - Monaco Editor
            <Editor
              height="100%"
              language="markdown"
              value={editedMarkdownContent}
              onChange={(value) => setEditedMarkdownContent(value || "")}
              options={{
                readOnly: false,
                minimap: { enabled: false },
                wordWrap: "on",
                scrollBeyondLastLine: false,
                fontSize: 14,
                tabSize: 2,
              }}
              theme="vs-dark"
            />
          ) : (
            // 阅读模式 - ReactMarkdown 渲染
            <div className="h-full overflow-auto bg-background p-md scrollbar-narrow">
              <div className="prose prose-sm max-w-none text-text-secondary">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p({ children }) {
                      const content = Array.isArray(children)
                        ? children.join("")
                        : String(children ?? "");
                      return <p>{highlightText(content, keywords)}</p>;
                    },
                    li({ children }) {
                      const content = Array.isArray(children)
                        ? children.join("")
                        : String(children ?? "");
                      return <li>{highlightText(content, keywords)}</li>;
                    },
                    code({ className, children }) {
                      const match = /language-(\w+)/.exec(className || "");
                      if (match) {
                        return (
                          <SyntaxHighlighter language={match[1]} PreTag="div">
                            {String(children).replace(/\n$/, "")}
                          </SyntaxHighlighter>
                        );
                      }
                      return (
                        <code className="rounded bg-background-secondary px-1">{children}</code>
                      );
                    },
                  }}
                >
                  {textContent || "加载文本中..."}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {toolbar}
      <div className="text-sm text-text-tertiary">当前格式暂不支持预览，可下载文件查看。</div>
    </div>
  );
}
