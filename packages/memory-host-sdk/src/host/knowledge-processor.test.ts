import fs from "node:fs/promises";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import {
  PdfProcessor,
  DocxProcessor,
  TextProcessor,
  HtmlProcessor,
  ProcessorRegistry,
} from "./knowledge-processor.js";

describe("TextProcessor", () => {
  const processor = new TextProcessor();

  it("should extract UTF-8 text", async () => {
    const buffer = Buffer.from("Hello, 世界!", "utf-8");
    const text = await processor.extract(buffer, {});
    expect(text).toBe("Hello, 世界!");
  });

  it("should handle latin1 encoding", async () => {
    const buffer = Buffer.from("Café", "latin1");
    const text = await processor.extract(buffer, {});
    expect(text).toBeTruthy();
  });

  it("should read fixture file", async () => {
    const fixturePath = path.join(import.meta.dirname, "__fixtures__", "sample.txt");
    const buffer = await fs.readFile(fixturePath);
    const text = await processor.extract(buffer, {});
    expect(text).toContain("sample text document");
    expect(text).toContain("multiple lines");
  });
});

describe("HtmlProcessor", () => {
  const processor = new HtmlProcessor();

  it("should strip HTML tags", async () => {
    const html = "<p>Hello <strong>world</strong>!</p>";
    const buffer = Buffer.from(html, "utf-8");
    const text = await processor.extract(buffer, {});
    expect(text).toBe("Hello world !");
  });

  it("should remove script and style tags", async () => {
    const html = `
      <html>
        <head><style>body { color: red; }</style></head>
        <body>
          <script>alert('test');</script>
          <p>Content</p>
        </body>
      </html>
    `;
    const buffer = Buffer.from(html, "utf-8");
    const text = await processor.extract(buffer, {});
    expect(text).toContain("Content");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color");
  });

  it("should decode HTML entities", async () => {
    const html = "&lt;div&gt; Hello &amp; goodbye &nbsp; &quot;test&quot;";
    const buffer = Buffer.from(html, "utf-8");
    const text = await processor.extract(buffer, {});
    expect(text).toContain("<div>");
    expect(text).toContain("&");
    expect(text).toContain('"test"');
  });

  it("should normalize whitespace", async () => {
    const html = "<p>Hello    \n\n   world</p>";
    const buffer = Buffer.from(html, "utf-8");
    const text = await processor.extract(buffer, {});
    expect(text).toBe("Hello world");
  });

  it("should read fixture file", async () => {
    const fixturePath = path.join(import.meta.dirname, "__fixtures__", "sample.html");
    const buffer = await fs.readFile(fixturePath);
    const text = await processor.extract(buffer, {});
    expect(text).toContain("Knowledge Base Test");
    expect(text).toContain("paragraph");
    expect(text).not.toContain("console.log");
    expect(text).not.toContain("font-family");
  });
});

describe("PdfProcessor", () => {
  const processor = new PdfProcessor();

  it("should require pdfjs-dist dependency", async () => {
    const buffer = Buffer.from("fake pdf content");
    await expect(processor.extract(buffer, {})).rejects.toThrow();
  });
});

describe("DocxProcessor", () => {
  const processor = new DocxProcessor();

  it("should require mammoth dependency", async () => {
    const buffer = Buffer.from("fake docx content");
    await expect(processor.extract(buffer, {})).rejects.toThrow();
  });
});

describe("ProcessorRegistry", () => {
  let registry: ProcessorRegistry;

  beforeAll(() => {
    registry = new ProcessorRegistry();
  });

  it("should return processor for supported MIME types", () => {
    expect(registry.getProcessor("application/pdf")).toBeInstanceOf(PdfProcessor);
    expect(
      registry.getProcessor(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBeInstanceOf(DocxProcessor);
    expect(registry.getProcessor("application/msword")).toBeInstanceOf(DocxProcessor);
    expect(registry.getProcessor("text/plain")).toBeInstanceOf(TextProcessor);
    expect(registry.getProcessor("text/markdown")).toBeInstanceOf(TextProcessor);
    expect(registry.getProcessor("text/html")).toBeInstanceOf(HtmlProcessor);
  });

  it("should return null for unsupported MIME types", () => {
    expect(registry.getProcessor("image/png")).toBeNull();
    expect(registry.getProcessor("video/mp4")).toBeNull();
  });

  it("should list all supported MIME types", () => {
    const mimeTypes = registry.getSupportedMimeTypes();
    expect(mimeTypes).toContain("application/pdf");
    expect(mimeTypes).toContain("text/plain");
    expect(mimeTypes).toContain("text/html");
    expect(mimeTypes.length).toBeGreaterThan(0);
  });
});
