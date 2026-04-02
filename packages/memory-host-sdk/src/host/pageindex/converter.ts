/**
 * 文档转换模块
 *
 * 使用 Pandoc 将各种格式转换为 PageIndex 兼容的格式
 */

import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createSubsystemLogger } from "../../../../../src/logging/subsystem.js";

const execAsync = promisify(exec);
const log = createSubsystemLogger("pageindex-converter");

// 支持的转换
const SUPPORTED_CONVERSIONS: Record<string, "pdf" | "markdown"> = {
  ".pdf": "pdf",
  ".docx": "pdf",
  ".doc": "pdf",
  ".txt": "markdown",
  ".md": "markdown",
  ".markdown": "markdown",
  ".html": "markdown",
  ".htm": "markdown",
};

// 检查 pandoc 是否可用
let pandocAvailable: boolean | null = null;

/**
 * 检查 Pandoc 是否可用
 */
export async function isPandocAvailable(): Promise<boolean> {
  if (pandocAvailable !== null) {
    return pandocAvailable;
  }

  try {
    await execAsync("pandoc --version");
    pandocAvailable = true;
    return true;
  } catch {
    log.warn("Pandoc is not available");
    pandocAvailable = false;
    return false;
  }
}

/**
 * 转换文档为 PageIndex 兼容格式
 *
 * @param inputPath 源文件路径
 * @param outputDir 输出目录
 * @returns 转换后的文件路径
 */
export async function convertForPageIndex(
  inputPath: string,
  outputDir: string,
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  const ext = path.extname(inputPath).toLowerCase();
  const targetFormat = SUPPORTED_CONVERSIONS[ext];

  if (!targetFormat) {
    return { success: false, error: `不支持的格式: ${ext}` };
  }

  // PDF 直接使用
  if (targetFormat === "pdf") {
    // 检查文件是否存在
    try {
      await fs.access(inputPath);
      return { success: true, outputPath: inputPath };
    } catch {
      return { success: false, error: `文件不存在: ${inputPath}` };
    }
  }

  // 需要转换的格式（只能是 markdown，因为 pdf 已经在上面返回了）
  const baseName = path.basename(inputPath, ext);
  const outputPath = path.join(outputDir, baseName + ".md");

  // 确保输出目录存在
  await fs.mkdir(outputDir, { recursive: true });

  // 执行转换（转换为 Markdown）
  try {
    await execAsync(`pandoc "${inputPath}" -o "${outputPath}" -t markdown --wrap=none`);

    return { success: true, outputPath };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error(`Conversion failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * 转换多个文件
 */
export async function convertBatch(
  files: { inputPath: string; outputDir: string }[],
): Promise<{ success: boolean; outputPath?: string; error?: string }[]> {
  const results: { success: boolean; outputPath?: string; error?: string }[] = [];

  for (const file of files) {
    const result = await convertForPageIndex(file.inputPath, file.outputDir);
    results.push(result);
  }

  return results;
}

/**
 * 获取文件的目标格式
 */
export function getTargetFormat(filePath: string): "pdf" | "markdown" | null {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_CONVERSIONS[ext] || null;
}

/**
 * 检查文件是否需要转换
 */
export function needsConversion(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext !== ".pdf" && SUPPORTED_CONVERSIONS[ext] !== undefined;
}
