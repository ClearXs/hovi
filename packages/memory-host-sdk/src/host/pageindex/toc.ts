/**
 * TOC (目录) 处理模块
 *
 * 检测和解析 PDF 文档的目录结构
 */

import { callLLM, extractJson } from "./llm.js";
import type { TOCItem, TOCDetectionResult, TOCTransformResult } from "./types.js";

/**
 * 检测文本中是否包含目录
 */
export async function detectTOC(text: string): Promise<TOCDetectionResult> {
  // 目录关键词
  const tocKeywords = ["table of contents", "contents", "目录", "目 录"];

  const lowerText = text.toLowerCase();

  for (const keyword of tocKeywords) {
    if (lowerText.includes(keyword)) {
      return {
        hasTOC: true,
        content: text,
      };
    }
  }

  return {
    hasTOC: false,
  };
}

/**
 * 用 LLM 转换 TOC 为结构化 JSON
 */
export async function transformTOC(
  tocText: string,
  options: { hasPageNumbers?: boolean } = {},
): Promise<TOCTransformResult> {
  const { hasPageNumbers = false } = options;

  let prompt: string;

  if (hasPageNumbers) {
    prompt = `请将以下目录转换为 JSON 数组格式。
每个元素需要包含：title（标题）、page（页码）、level（层级，从1开始）。

目录格式：标题......页码

例如：
[
  {"title": "第一章 概述", "page": 1, "level": 1},
  {"title": "1.1 背景", "page": 2, "level": 2}
]

只返回 JSON 数组，不要其他内容。`;
  } else {
    prompt = `请将以下目录转换为 JSON 数组格式。
每个元素需要包含：title（标题）、level（层级，从1开始）。

根据缩进判断层级：没有缩进的是 level=1，缩进的是 level=2，以此类推。

目录：
${tocText}

只返回 JSON 数组，不要其他内容。`;
  }

  try {
    const response = await callLLM(prompt, tocText);
    const items = extractJson<TOCItem[]>(response);

    // 确保返回的是数组
    if (!Array.isArray(items)) {
      return { items: [] };
    }

    return { items };
  } catch (error) {
    console.error("Failed to transform TOC:", error);
    return { items: [] };
  }
}

/**
 * 当没有目录时，用 LLM 从文档文本生成目录
 */
export async function generateTOCFromText(
  text: string,
  maxItems: number = 20,
): Promise<TOCTransformResult> {
  const prompt = `请从以下文档内容中提取主要章节标题，生成一个目录结构。
每个元素需要包含：title（章节标题）、level（层级，从1开始）。

要求：
1. 只提取主要章节（最多 ${maxItems} 个）
2. 根据标题的层级关系设置 level
3. 只返回章标题，不要详细内容

文档内容：
${text.slice(0, 10000)} // 限制输入长度

只返回 JSON 数组，不要其他内容。`;

  try {
    const response = await callLLM(prompt, "请提取目录");
    const items = extractJson<TOCItem[]>(response);

    if (!Array.isArray(items)) {
      return { items: [] };
    }

    return { items };
  } catch (error) {
    console.error("Failed to generate TOC:", error);
    return { items: [] };
  }
}

/**
 * 解析页码
 *
 * 将字符串页码转换为数字
 */
export function parsePageNumber(pageStr: string): number | undefined {
  // 移除非数字字符，只保留数字
  const cleaned = pageStr.replace(/[^\d]/g, "");
  const num = parseInt(cleaned, 10);

  if (isNaN(num) || num <= 0) {
    return undefined;
  }

  return num;
}

/**
 * 验证 TOC 项的页码是否有效
 */
export function validateTOCItems(items: TOCItem[], pageCount: number): TOCItem[] {
  return items.map((item) => ({
    ...item,
    // 确保页码在有效范围内
    page: item.page ? Math.max(1, Math.min(item.page, pageCount)) : undefined,
    physicalIndex: item.physicalIndex
      ? Math.max(1, Math.min(item.physicalIndex, pageCount))
      : undefined,
  }));
}
