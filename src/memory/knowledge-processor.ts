import { logWarn } from "../logger.js";

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type MammothModule = typeof import("mammoth");

let pdfJsModulePromise: Promise<PdfJsModule> | null = null;
let mammothModulePromise: Promise<MammothModule> | null = null;

// Lazy-load optional dependencies
async function loadPdfJsModule(): Promise<PdfJsModule> {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs").catch((err) => {
      pdfJsModulePromise = null;
      throw new Error(
        `Optional dependency pdfjs-dist is required for PDF extraction: ${String(err)}`,
      );
    });
  }
  return pdfJsModulePromise;
}

async function loadMammothModule(): Promise<MammothModule> {
  if (!mammothModulePromise) {
    mammothModulePromise = import("mammoth").catch((err) => {
      mammothModulePromise = null;
      throw new Error(
        `Optional dependency mammoth is required for DOCX extraction: ${String(err)}`,
      );
    });
  }
  return mammothModulePromise;
}

export type ProcessorOptions = {
  maxPages?: number;
};

export interface DocumentProcessor {
  extract(buffer: Buffer, options: ProcessorOptions): Promise<string>;
}

/**
 * PDF document processor using pdfjs-dist for text extraction
 */
export class PdfProcessor implements DocumentProcessor {
  async extract(buffer: Buffer, options: ProcessorOptions): Promise<string> {
    const { getDocument } = await loadPdfJsModule();

    const pdf = await getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
    }).promise;

    const maxPages = options.maxPages ? Math.min(pdf.numPages, options.maxPages) : pdf.numPages;
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
}

/**
 * DOCX document processor using mammoth to convert to Markdown
 */
export class DocxProcessor implements DocumentProcessor {
  async extract(buffer: Buffer, _options: ProcessorOptions): Promise<string> {
    const mammoth = await loadMammothModule();

    const result = await mammoth.convertToMarkdown({
      buffer,
    });

    if (result.messages.length > 0) {
      for (const msg of result.messages) {
        logWarn(`knowledge: DOCX processing: ${msg.type} - ${msg.message}`);
      }
    }

    return result.value;
  }
}

/**
 * Plain text processor with encoding detection
 */
export class TextProcessor implements DocumentProcessor {
  async extract(buffer: Buffer, _options: ProcessorOptions): Promise<string> {
    // Try UTF-8 first, fallback to latin1 if invalid
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      return new TextDecoder("latin1").decode(buffer);
    }
  }
}

/**
 * HTML processor - strips tags and extracts text
 */
export class HtmlProcessor implements DocumentProcessor {
  async extract(buffer: Buffer, _options: ProcessorOptions): Promise<string> {
    // Decode buffer to string
    const html = new TextDecoder("utf-8").decode(buffer);

    // Remove script and style tags with their content
    let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, " ");

    // Decode HTML entities
    text = text
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Normalize whitespace
    text = text.replace(/\s+/g, " ").trim();

    return text;
  }
}

/**
 * Registry to get the appropriate processor for a MIME type
 */
export class ProcessorRegistry {
  private processors: Map<string, DocumentProcessor>;

  constructor() {
    this.processors = new Map([
      ["application/pdf", new PdfProcessor()],
      [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        new DocxProcessor(),
      ],
      ["application/msword", new DocxProcessor()],
      ["text/plain", new TextProcessor()],
      ["text/markdown", new TextProcessor()],
      ["text/html", new HtmlProcessor()],
      ["application/json", new TextProcessor()],
    ]);
  }

  getProcessor(mimetype: string): DocumentProcessor | null {
    return this.processors.get(mimetype) ?? null;
  }

  getSupportedMimeTypes(): string[] {
    return Array.from(this.processors.keys());
  }
}
