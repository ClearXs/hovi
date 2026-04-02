/**
 * PDF 解析模块
 *
 * 用于从 PDF 文档中提取文本和目录结构
 */

import fs from "node:fs/promises";
import type { PDFParseResult, TOCItem } from "./types.js";

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfJsModulePromise: Promise<PdfJsModule> | null = null;

// Lazy-load pdfjs-dist
async function loadPdfJsModule(): Promise<PdfJsModule> {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs").catch((err) => {
      pdfJsModulePromise = null;
      throw new Error(`pdfjs-dist is required for PDF parsing: ${String(err)}`);
    });
  }
  return pdfJsModulePromise;
}

// PDF Document type - using any for compatibility with pdfjs-dist
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PDFDocumentProxy = any;

/**
 * 从 PDF 文件路径加载文档
 */
export async function loadPDF(filePath: string): Promise<Uint8Array> {
  const buffer = await fs.readFile(filePath);
  return new Uint8Array(buffer);
}

/**
 * 解析 PDF 文档
 *
 * @param filePath PDF 文件路径
 * @returns 包含文本、目录和页数的解析结果
 */
export async function parsePDF(filePath: string): Promise<PDFParseResult> {
  const { getDocument } = await loadPdfJsModule();
  const data = await loadPDF(filePath);

  const pdf = await getDocument({
    data,
    disableWorker: true,
  }).promise;

  const pageCount = pdf.numPages;
  const textParts: string[] = [];
  const tocItems: TOCItem[] = [];

  // 提取每一页的文本
  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? String(item.str) : ""))
      .filter(Boolean)
      .join(" ");

    if (pageText) {
      textParts.push(pageText);
    }
  }

  // 尝试提取目录 (TOC)
  const toc = await extractTOC(pdf, pageCount);
  if (toc.length > 0) {
    tocItems.push(...toc);
  }

  return {
    text: textParts.join("\n\n"),
    toc: tocItems.length > 0 ? tocItems : undefined,
    pageCount,
  };
}

/**
 * 提取 PDF 目录 (TOC)
 *
 * PDF.js 的 getOutline() 方法可以获取文档大纲/目录
 */
async function extractTOC(pdf: PDFDocumentProxy, pageCount: number): Promise<TOCItem[]> {
  try {
    const outline = await pdf.getOutline();

    if (!outline || outline.length === 0) {
      return [];
    }

    const items: TOCItem[] = [];

    // 递归提取目录项
    await extractOutlineItems(pdf, outline, items, pageCount);

    return items;
  } catch {
    // 如果提取失败，返回空数组
    return [];
  }
}

/**
 * 递归提取目录项
 */
async function extractOutlineItems(
  pdf: PDFDocumentProxy,
  outline: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>,
  items: TOCItem[],
  pageCount: number,
  level: number = 1,
): Promise<void> {
  for (const item of outline) {
    // 获取目标页码
    let pageNum: number | undefined;

    if (item.dest) {
      try {
        let dest = item.dest;
        // 如果 dest 是字符串，可能是命名目标
        if (typeof dest === "string") {
          const namedDest = await pdf.getDestination(dest);
          dest = namedDest;
        }

        // dest 可能是数组 [pageRef, ...]
        if (Array.isArray(dest) && dest[0]) {
          const pageRef = dest[0];
          const pageIndex = await pdf.getPageIndex(pageRef);
          pageNum = pageIndex + 1; // PDF.js 使用 0 开始的索引
        }
      } catch {
        // 忽略无法解析的目标
      }
    }

    // 限制页码在有效范围内
    if (pageNum !== undefined) {
      pageNum = Math.max(1, Math.min(pageNum, pageCount));
    }

    items.push({
      title: item.title.trim(),
      level,
      page: pageNum,
      physicalIndex: pageNum,
    });

    // 递归处理子项
    if (item.items && item.items.length > 0) {
      await extractOutlineItems(pdf, item.items, items, pageCount, level + 1);
    }
  }
}

/**
 * 从 PDF 文本中检测目录页
 *
 * 这是一个备用方法，用于当 getOutline() 失败时
 */
export async function detectTOCPages(
  pdf: PDFDocumentProxy,
  pageCount: number,
  checkPages: number = 10,
): Promise<number[]> {
  const tocKeywords = ["table of contents", "table of contents", "contents", "目录", "目 录"];

  const tocPages: number[] = [];

  for (let pageNum = 1; pageNum <= Math.min(checkPages, pageCount); pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => ("str" in item ? String(item.str) : ""))
      .join(" ")
      .toLowerCase();

    // 检查是否包含目录关键词
    for (const keyword of tocKeywords) {
      if (pageText.includes(keyword.toLowerCase())) {
        tocPages.push(pageNum);
        break;
      }
    }
  }

  return tocPages;
}

/**
 * 获取 PDF 元信息
 */
export async function getPDFInfo(filePath: string): Promise<{
  pageCount: number;
  title?: string;
  author?: string;
}> {
  const { getDocument } = await loadPdfJsModule();
  const data = await loadPDF(filePath);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdf: any = await getDocument({
    data,
    disableWorker: true,
  }).promise;

  const metadata = await pdf.getMetadata().catch(() => null);

  return {
    pageCount: pdf.numPages,
    title: metadata?.info?.Title as string | undefined,
    author: metadata?.info?.Author as string | undefined,
  };
}
