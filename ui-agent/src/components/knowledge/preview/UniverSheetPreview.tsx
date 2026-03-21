"use client";

import { IUniverInstanceService, LocaleType, Univer, UniverInstanceType } from "@univerjs/core";
import { defaultTheme } from "@univerjs/design";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverDocsUIPlugin } from "@univerjs/docs-ui";
import docsUiZhCN from "@univerjs/docs-ui/locale/zh-CN";
import { UniverFormulaEnginePlugin } from "@univerjs/engine-formula";
import { IRenderManagerService, UniverRenderEnginePlugin } from "@univerjs/engine-render";
import { UniverSheetsPlugin } from "@univerjs/sheets";
import { UniverSheetsUIPlugin } from "@univerjs/sheets-ui";
import sheetsUiZhCN from "@univerjs/sheets-ui/locale/zh-CN";
import sheetsZhCN from "@univerjs/sheets/locale/zh-CN";
import { UniverUIPlugin } from "@univerjs/ui";
import uiZhCN from "@univerjs/ui/locale/zh-CN";
import { Loader2, AlertCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { convertToUniver } from "@/services/knowledgeApi";
import { useConnectionStore } from "@/stores/connectionStore";
import "@univerjs/design/lib/index.css";
import "@univerjs/ui/lib/index.css";
import "@univerjs/sheets-ui/lib/index.css";

const univerLocales = {
  [LocaleType.ZH_CN]: {
    ...uiZhCN,
    ...docsUiZhCN,
    ...sheetsZhCN,
    ...sheetsUiZhCN,
  },
};

interface UniverSheetPreviewProps {
  documentId: string;
  kbId?: string;
  fileType?: "xlsx" | "csv";
  onError?: (error: Error) => void;
}

export function UniverSheetPreview({
  documentId,
  kbId,
  fileType = "xlsx",
  onError,
}: UniverSheetPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workbookData, setWorkbookData] = useState<any>(null);
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
          type: fileType,
          kbId,
        });
        setWorkbookData(result.data);
      } catch (err) {
        const loadError = err instanceof Error ? err : new Error("Failed to load spreadsheet");
        setError(loadError.message);
        onError?.(loadError);
      } finally {
        setLoading(false);
      }
    };

    void loadDocument();
  }, [documentId, kbId, fileType, onError, wsClient]);

  useEffect(() => {
    if (!workbookData || !containerRef.current) {
      return;
    }

    const container = containerRef.current;
    const univer = new Univer({
      theme: defaultTheme,
      locale: LocaleType.ZH_CN,
      locales: univerLocales,
    });

    univer.registerPlugin(UniverRenderEnginePlugin);
    univer.registerPlugin(UniverFormulaEnginePlugin);
    univer.registerPlugin(UniverUIPlugin, { container });
    univer.registerPlugin(UniverDocsPlugin, { hasScroll: false });
    univer.registerPlugin(UniverDocsUIPlugin);
    univer.registerPlugin(UniverSheetsPlugin);
    univer.registerPlugin(UniverSheetsUIPlugin);

    const sheetUnit = univer.createUnit(UniverInstanceType.UNIVER_SHEET, workbookData);
    const injector = (univer as unknown as { __getInjector?: () => unknown }).__getInjector?.() as
      | { get?: (token: unknown) => unknown }
      | undefined;

    const unitId =
      typeof (sheetUnit as { getUnitId?: () => string }).getUnitId === "function"
        ? (sheetUnit as { getUnitId: () => string }).getUnitId()
        : "";

    const instanceService = injector?.get?.(IUniverInstanceService) as
      | IUniverInstanceService
      | undefined;
    const renderManagerService = injector?.get?.(IRenderManagerService) as
      | IRenderManagerService
      | undefined;

    const ensureActiveUnit = () => {
      if (!unitId || !instanceService) return;
      instanceService.setCurrentUnitForType(unitId);
      instanceService.focusUnit(unitId);
      container.focus({ preventScroll: true });
    };
    const handleWheel = (event: WheelEvent) => {
      if (!unitId || !renderManagerService || event.ctrlKey) return;
      const render = renderManagerService.getRenderById(unitId);
      if (!render) return;
      const scene = render.scene;
      const target = event.target as HTMLElement | null;
      const x =
        typeof (event as WheelEvent & { offsetX?: number }).offsetX === "number"
          ? (event as WheelEvent & { offsetX: number }).offsetX
          : target?.getBoundingClientRect
            ? event.clientX - target.getBoundingClientRect().left
            : 0;
      const y =
        typeof (event as WheelEvent & { offsetY?: number }).offsetY === "number"
          ? (event as WheelEvent & { offsetY: number }).offsetY
          : target?.getBoundingClientRect
            ? event.clientY - target.getBoundingClientRect().top
            : 0;
      const activeViewport =
        scene.getActiveViewportByCoord({ x, y } as never) ??
        scene.getViewport("viewMain") ??
        scene.getMainViewport();
      if (!activeViewport) return;
      activeViewport.onMouseWheel(
        event as unknown as never,
        {
          stopPropagation: () => {},
          skipNextObservers: false,
          isStopPropagation: false,
        } as unknown as never,
      );
    };

    ensureActiveUnit();
    const timers = [0, 80, 200].map((delay) => window.setTimeout(ensureActiveUnit, delay));

    container.addEventListener("pointerdown", ensureActiveUnit, { capture: true });
    container.addEventListener("mouseenter", ensureActiveUnit);
    container.addEventListener("focusin", ensureActiveUnit);
    container.addEventListener("wheel", handleWheel, { capture: true, passive: false });

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      container.removeEventListener("pointerdown", ensureActiveUnit, true);
      container.removeEventListener("mouseenter", ensureActiveUnit);
      container.removeEventListener("focusin", ensureActiveUnit);
      container.removeEventListener("wheel", handleWheel, true);
      univer.dispose();
    };
  }, [workbookData]);

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">正在加载表格...</p>
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

  return <div ref={containerRef} tabIndex={0} className="h-full w-full min-h-0 overflow-hidden" />;
}
