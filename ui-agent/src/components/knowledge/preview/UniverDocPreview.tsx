"use client";

import { IUniverInstanceService, LocaleType, Univer, UniverInstanceType } from "@univerjs/core";
import { defaultTheme } from "@univerjs/design";
import { UniverDocsPlugin } from "@univerjs/docs";
import { IEditorService, UniverDocsUIPlugin } from "@univerjs/docs-ui";
import docsUiZhCN from "@univerjs/docs-ui/locale/zh-CN";
import { IRenderManagerService, UniverRenderEnginePlugin } from "@univerjs/engine-render";
import { UniverUIPlugin } from "@univerjs/ui";
import uiZhCN from "@univerjs/ui/locale/zh-CN";
import { Loader2, AlertCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { convertToUniver } from "@/services/knowledgeApi";
import { useConnectionStore } from "@/stores/connectionStore";
import "@univerjs/design/lib/index.css";
import "@univerjs/ui/lib/index.css";
import "@univerjs/docs-ui/lib/index.css";

const univerLocales = {
  [LocaleType.ZH_CN]: {
    ...uiZhCN,
    ...docsUiZhCN,
  },
};

interface UniverDocPreviewProps {
  documentId: string;
  kbId?: string;
  onError?: (error: Error) => void;
}

function normalizeDocSnapshot(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") {
    return raw;
  }

  const snapshot = raw as {
    locale?: string;
    title?: string;
    tableSource?: Record<string, unknown>;
    drawings?: Record<string, unknown>;
    drawingsOrder?: string[];
    headers?: Record<string, unknown>;
    footers?: Record<string, unknown>;
    body?: {
      dataStream?: string;
      textRuns?: unknown[];
      customBlocks?: unknown[];
      tables?: unknown[];
      customRanges?: unknown[];
      customDecorations?: unknown[];
    };
  };

  const stream = snapshot.body?.dataStream;
  if (typeof stream !== "string") {
    return raw;
  }

  const normalized = stream.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "\r");
  const paragraphStream = normalized.endsWith("\r") ? normalized : `${normalized}\r`;
  const dataStream = `${paragraphStream}\n`;
  const paragraphs: Array<{ startIndex: number }> = [];

  for (let i = 0; i < dataStream.length; i += 1) {
    if (dataStream[i] === "\r") {
      paragraphs.push({ startIndex: i });
    }
  }

  return {
    ...snapshot,
    locale: snapshot.locale ?? "zhCN",
    title: snapshot.title ?? "",
    tableSource: snapshot.tableSource ?? {},
    drawings: snapshot.drawings ?? {},
    drawingsOrder: snapshot.drawingsOrder ?? [],
    headers: snapshot.headers ?? {},
    footers: snapshot.footers ?? {},
    body: {
      ...snapshot.body,
      dataStream,
      textRuns: snapshot.body?.textRuns ?? [],
      customBlocks: snapshot.body?.customBlocks ?? [],
      tables: snapshot.body?.tables ?? [],
      customRanges: snapshot.body?.customRanges ?? [],
      customDecorations: snapshot.body?.customDecorations ?? [],
      paragraphs,
      sectionBreaks: [{ startIndex: Math.max(0, dataStream.length - 1) }],
    },
  };
}

export function UniverDocPreview({ documentId, kbId, onError }: UniverDocPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentData, setDocumentData] = useState<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wsClient = useConnectionStore((state) => state.wsClient);

  useEffect(() => {
    const loadDocument = async () => {
      if (!wsClient) {
        setError("WebSocket 未连接");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const result = await convertToUniver({
          documentId,
          type: "docx",
          kbId,
        });
        setDocumentData(normalizeDocSnapshot(result.data));
      } catch (err) {
        const loadError = err instanceof Error ? err : new Error("Failed to load document");
        setError(loadError.message);
        onError?.(loadError);
      } finally {
        setLoading(false);
      }
    };

    void loadDocument();
  }, [documentId, kbId, onError, wsClient]);

  useEffect(() => {
    if (!documentData || !containerRef.current) {
      return;
    }

    const container = containerRef.current;

    // 设置容器样式确保滚动工作
    container.style.overflowY = "auto";
    container.style.height = "100%";

    const univer = new Univer({
      theme: defaultTheme,
      locale: LocaleType.ZH_CN,
      locales: univerLocales,
    });

    univer.registerPlugin(UniverRenderEnginePlugin);
    univer.registerPlugin(UniverUIPlugin, { container });
    univer.registerPlugin(UniverDocsPlugin, { hasScroll: false }); // 禁用插件内部滚动，使用容器滚动
    univer.registerPlugin(UniverDocsUIPlugin);

    const docUnit = univer.createUnit(UniverInstanceType.UNIVER_DOC, documentData);

    // 确保文档获得焦点
    setTimeout(() => {
      container.focus();
    }, 100);

    return () => {
      univer.dispose();
    };
  }, [documentData]);

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">正在加载文档...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="text-center space-y-2">
          <p className="text-base font-medium">加载失败</p>
          <p className="text-sm text-muted-foreground max-w-[28rem]">{error}</p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} tabIndex={0} className="h-full w-full" />;
}
