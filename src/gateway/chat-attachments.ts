import { estimateBase64DecodedBytes } from "../media/base64.js";
import { sniffMimeFromBase64 } from "../media/sniff-mime-from-base64.js";

export type ChatAttachment = {
  type?: string;
  mimeType?: string;
  fileName?: string;
  content?: unknown;
};

export type ChatImageContent = {
  type: "image";
  data: string;
  mimeType: string;
};

export type ParsedMessageWithImages = {
  message: string;
  images: ChatImageContent[];
  attachmentTextContext?: string;
};

type AttachmentLog = {
  warn: (message: string) => void;
};

type NormalizedAttachment = {
  label: string;
  mime: string;
  base64: string;
};

type AttachmentTextSnippet = {
  label: string;
  mime?: string;
  text: string;
};

export const CHAT_ATTACHMENT_MAX_BYTES = 500_000_000; // 500M

const MAX_ATTACHMENT_TEXT_FILES = 4;
const MAX_ATTACHMENT_TEXT_TOTAL_CHARS = 16_000;
const MAX_ATTACHMENT_TEXT_PER_FILE_CHARS = 6_000;

function normalizeMime(mime?: string): string | undefined {
  if (!mime) {
    return undefined;
  }
  const cleaned = mime.split(";")[0]?.trim().toLowerCase();
  return cleaned || undefined;
}

function isImageMime(mime?: string): boolean {
  return typeof mime === "string" && mime.startsWith("image/");
}

function isPdfMime(mime?: string): boolean {
  return mime === "application/pdf";
}

function isDocxMime(mime?: string): boolean {
  return (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword"
  );
}

function isSpreadsheetMime(mime?: string): boolean {
  return (
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel.sheet.macroenabled.12" ||
    mime === "text/csv" ||
    mime === "application/csv"
  );
}

function isTextLikeMime(mime?: string): boolean {
  return (
    (typeof mime === "string" && mime.startsWith("text/")) ||
    mime === "application/json" ||
    mime === "application/ld+json"
  );
}

function extFromLabel(label: string): string {
  const index = label.lastIndexOf(".");
  if (index < 0) {
    return "";
  }
  return label.slice(index).toLowerCase();
}

function decodeTextBuffer(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("latin1").decode(buffer);
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
  }).promise;
  const maxPages = Math.min(pdf.numPages, 20);
  const textParts: string[] = [];
  for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
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
  return textParts.join("\n\n");
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.convertToMarkdown({ buffer });
  return result.value;
}

async function extractSpreadsheetText(buffer: Buffer): Promise<string> {
  const xlsx = await import("xlsx");
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheetNames = workbook.SheetNames.slice(0, 3);
  const sections: string[] = [];
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) {
      continue;
    }
    const csv = xlsx.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
    if (!csv) {
      continue;
    }
    sections.push(`[Sheet: ${name}]\n${csv}`);
  }
  return sections.join("\n\n");
}

function truncateAttachmentText(text: string): string {
  if (text.length <= MAX_ATTACHMENT_TEXT_PER_FILE_CHARS) {
    return text;
  }
  return `${text.slice(0, MAX_ATTACHMENT_TEXT_PER_FILE_CHARS)}\n...(truncated)...`;
}

async function extractAttachmentText(params: {
  base64: string;
  label: string;
  mime?: string;
}): Promise<string | null> {
  const buffer = Buffer.from(params.base64, "base64");
  const ext = extFromLabel(params.label);
  const mime = normalizeMime(params.mime);

  if (
    isTextLikeMime(mime) ||
    ext === ".txt" ||
    ext === ".md" ||
    ext === ".markdown" ||
    ext === ".json" ||
    ext === ".csv"
  ) {
    return truncateAttachmentText(decodeTextBuffer(buffer).trim());
  }
  if (isPdfMime(mime) || ext === ".pdf") {
    return truncateAttachmentText((await extractPdfText(buffer)).trim());
  }
  if (isDocxMime(mime) || ext === ".docx" || ext === ".doc") {
    return truncateAttachmentText((await extractDocxText(buffer)).trim());
  }
  if (isSpreadsheetMime(mime) || ext === ".xlsx" || ext === ".xls") {
    return truncateAttachmentText((await extractSpreadsheetText(buffer)).trim());
  }
  return null;
}

function buildAttachmentContext(snippets: AttachmentTextSnippet[]): string | undefined {
  if (snippets.length === 0) {
    return undefined;
  }
  const blocks: string[] = [];
  let total = 0;
  for (const snippet of snippets.slice(0, MAX_ATTACHMENT_TEXT_FILES)) {
    if (!snippet.text.trim()) {
      continue;
    }
    if (total >= MAX_ATTACHMENT_TEXT_TOTAL_CHARS) {
      break;
    }
    const allowed =
      total + snippet.text.length > MAX_ATTACHMENT_TEXT_TOTAL_CHARS
        ? MAX_ATTACHMENT_TEXT_TOTAL_CHARS - total
        : snippet.text.length;
    const visibleText =
      allowed < snippet.text.length ? `${snippet.text.slice(0, allowed)}…` : snippet.text;
    total += visibleText.length;
    blocks.push(
      `[Attachment ${blocks.length + 1}] ${snippet.label}${snippet.mime ? ` (${snippet.mime})` : ""}\n${visibleText}`,
    );
  }
  if (blocks.length === 0) {
    return undefined;
  }
  return `Attachment text context:\n${blocks.join("\n\n")}`;
}

function appendAttachmentContext(message: string, snippets: AttachmentTextSnippet[]): string {
  const attachmentContext = buildAttachmentContext(snippets);
  if (!attachmentContext) {
    return message;
  }
  const separator = message.trim().length > 0 ? "\n\n" : "";
  return `${message}${separator}${attachmentContext}`;
}

function isValidBase64(value: string): boolean {
  // Minimal validation; avoid full decode allocations for large payloads.
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function normalizeAttachment(
  att: ChatAttachment,
  idx: number,
  opts: { stripDataUrlPrefix: boolean; requireImageMime: boolean },
): NormalizedAttachment {
  const mime = att.mimeType ?? "";
  const content = att.content;
  const label = att.fileName || att.type || `attachment-${idx + 1}`;

  if (typeof content !== "string") {
    throw new Error(`attachment ${label}: content must be base64 string`);
  }
  if (opts.requireImageMime && !mime.startsWith("image/")) {
    throw new Error(`attachment ${label}: only image/* supported`);
  }

  let base64 = content.trim();
  if (opts.stripDataUrlPrefix) {
    // Strip data URL prefix if present (e.g., "data:image/jpeg;base64,...").
    const dataUrlMatch = /^data:[^;]+;base64,(.*)$/.exec(base64);
    if (dataUrlMatch) {
      base64 = dataUrlMatch[1];
    }
  }
  return { label, mime, base64 };
}

function validateAttachmentBase64OrThrow(
  normalized: NormalizedAttachment,
  opts: { maxBytes: number },
): number {
  if (!isValidBase64(normalized.base64)) {
    throw new Error(`attachment ${normalized.label}: invalid base64 content`);
  }
  const sizeBytes = estimateBase64DecodedBytes(normalized.base64);
  if (sizeBytes <= 0 || sizeBytes > opts.maxBytes) {
    throw new Error(
      `attachment ${normalized.label}: exceeds size limit (${sizeBytes} > ${opts.maxBytes} bytes)`,
    );
  }
  return sizeBytes;
}

/**
 * Parse attachments for chat.send:
 * - image attachments are converted to structured image blocks.
 * - supported document attachments are converted to text context appended to the message.
 */
export async function parseMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[] | undefined,
  opts?: { maxBytes?: number; log?: AttachmentLog },
): Promise<ParsedMessageWithImages> {
  const maxBytes = opts?.maxBytes ?? CHAT_ATTACHMENT_MAX_BYTES;
  const log = opts?.log;
  if (!attachments || attachments.length === 0) {
    return { message, images: [] };
  }

  const images: ChatImageContent[] = [];
  const textSnippets: AttachmentTextSnippet[] = [];

  for (const [idx, att] of attachments.entries()) {
    if (!att) {
      continue;
    }
    const normalized = normalizeAttachment(att, idx, {
      stripDataUrlPrefix: true,
      requireImageMime: false,
    });
    validateAttachmentBase64OrThrow(normalized, { maxBytes });
    const { base64: b64, label, mime } = normalized;

    const providedMime = normalizeMime(mime);
    const sniffedMime = normalizeMime(await sniffMimeFromBase64(b64));
    const resolvedMime = sniffedMime ?? providedMime ?? normalizeMime(mime);
    const treatAsImage = isImageMime(sniffedMime) || (!sniffedMime && isImageMime(providedMime));
    if (treatAsImage) {
      if (sniffedMime && providedMime && sniffedMime !== providedMime) {
        log?.warn(
          `attachment ${label}: mime mismatch (${providedMime} -> ${sniffedMime}), using sniffed`,
        );
      }
      images.push({
        type: "image",
        data: b64,
        mimeType: resolvedMime ?? mime,
      });
      continue;
    }

    try {
      const extractedText = await extractAttachmentText({
        base64: b64,
        label,
        mime: resolvedMime ?? mime,
      });
      if (!extractedText) {
        log?.warn(
          `attachment ${label}: non-image attachment has no supported text extractor, ignoring`,
        );
        continue;
      }
      textSnippets.push({
        label,
        mime: resolvedMime ?? undefined,
        text: extractedText,
      });
    } catch (err) {
      log?.warn(`attachment ${label}: failed to extract readable text, ignoring (${String(err)})`);
    }
  }

  return {
    message: appendAttachmentContext(message, textSnippets),
    images,
    attachmentTextContext: buildAttachmentContext(textSnippets),
  };
}

/**
 * @deprecated Use parseMessageWithAttachments instead.
 * This function converts images to markdown data URLs which Claude API cannot process as images.
 */
export function buildMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[] | undefined,
  opts?: { maxBytes?: number },
): string {
  const maxBytes = opts?.maxBytes ?? 2_000_000; // 2 MB
  if (!attachments || attachments.length === 0) {
    return message;
  }

  const blocks: string[] = [];

  for (const [idx, att] of attachments.entries()) {
    if (!att) {
      continue;
    }
    const normalized = normalizeAttachment(att, idx, {
      stripDataUrlPrefix: false,
      requireImageMime: true,
    });
    validateAttachmentBase64OrThrow(normalized, { maxBytes });
    const { base64, label, mime } = normalized;

    const safeLabel = label.replace(/\s+/g, "_");
    const dataUrl = `![${safeLabel}](data:${mime};base64,${base64})`;
    blocks.push(dataUrl);
  }

  if (blocks.length === 0) {
    return message;
  }
  const separator = message.trim().length > 0 ? "\n\n" : "";
  return `${message}${separator}${blocks.join("\n\n")}`;
}
