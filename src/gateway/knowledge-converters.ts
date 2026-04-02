/**
 * Office file to Univer format converters
 */

/**
 * Univer IWorkbookData interface (simplified)
 */
interface IWorkbookData {
  id: string;
  name: string;
  sheetOrder: string[];
  sheets: Record<string, IWorksheetData>;
}

interface IWorksheetData {
  id: string;
  name: string;
  cellData: Record<number, Record<number, ICellData>>;
  rowCount: number;
  columnCount: number;
}

interface ICellData {
  v?: string | number | boolean;
  s?: unknown; // style
  t?: number; // cell value type
}

/**
 * Univer IDocumentData interface (simplified)
 */
interface IDocumentData {
  id: string;
  body: {
    dataStream: string;
    textRuns?: unknown[];
    paragraphs?: unknown[];
    customBlocks?: unknown[];
    tables?: unknown[];
    customRanges?: unknown[];
    customDecorations?: unknown[];
    sectionBreaks?: unknown[];
  };
  documentStyle: unknown;
  locale?: string;
  title?: string;
  tableSource?: unknown;
  drawings?: unknown;
  drawingsOrder?: unknown[];
  headers?: unknown;
  footers?: unknown;
}

async function importXlsx() {
  const xlsxModule = await import("xlsx");
  return (xlsxModule as unknown as { default?: typeof import("xlsx") }).default ?? xlsxModule;
}

function workbookToUniver(
  XLSX: typeof import("xlsx"),
  workbook: import("xlsx").WorkBook,
): IWorkbookData {
  const sheets: Record<string, IWorksheetData> = {};
  const sheetOrder: string[] = [];

  workbook.SheetNames.forEach((sheetName, index) => {
    const worksheet = workbook.Sheets[sheetName];
    const sheetIdStr = `sheet-${index + 1}`;
    sheetOrder.push(sheetIdStr);

    const cellData: Record<number, Record<number, ICellData>> = {};
    let rowCount = 0;
    let columnCount = 0;
    const ref = worksheet?.["!ref"];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      rowCount = range.e.r + 1;
      columnCount = range.e.c + 1;

      for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
        for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
          const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
          const cell = worksheet[address];
          if (!cell) {
            continue;
          }

          let value: string | number | boolean | undefined;
          if (cell.t === "n") {
            value = Number(cell.v);
          } else if (cell.t === "b") {
            value = Boolean(cell.v);
          } else if (cell.t === "d") {
            value = new Date(cell.v as Date).toISOString();
          } else {
            value = String(cell.w ?? cell.v ?? "");
          }

          if (!cellData[rowIndex]) {
            cellData[rowIndex] = {};
          }
          cellData[rowIndex][colIndex] = { v: value };
        }
      }
    }

    sheets[sheetIdStr] = {
      id: sheetIdStr,
      name: sheetName,
      cellData,
      rowCount,
      columnCount,
    };
  });

  return {
    id: "workbook-1",
    name: "Workbook",
    sheetOrder,
    sheets,
  };
}

/**
 * Convert XLSX file to Univer IWorkbookData format
 */
export async function xlsxToUniver(filePath: string): Promise<IWorkbookData> {
  const XLSX = await importXlsx();
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  return workbookToUniver(XLSX, workbook);
}

/**
 * Convert CSV file to Univer IWorkbookData format
 */
export async function csvToUniver(filePath: string): Promise<IWorkbookData> {
  const XLSX = await importXlsx();
  const workbook = XLSX.readFile(filePath, { raw: true, codepage: 65001 });
  return workbookToUniver(XLSX, workbook);
}

/**
 * Convert DOCX file to Univer IDocumentData format
 */
export async function docxToUniver(filePath: string): Promise<IDocumentData> {
  const mammoth = (await import("mammoth")).default as typeof import("mammoth") & {
    extractRawText: (options: {
      buffer: Buffer;
    }) => Promise<{ value: string; messages: unknown[] }>;
  };
  const { promises: fsPromises } = await import("node:fs");

  const buffer = await fsPromises.readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });

  // Univer docs dataStream uses "\r" for paragraph breaks and a trailing "\n" section break.
  const normalized = result.value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "\r");
  const paragraphStream = normalized.endsWith("\r") ? normalized : `${normalized}\r`;
  const dataStream = `${paragraphStream}\n`;
  const paragraphs: Array<{ startIndex: number }> = [];
  for (let i = 0; i < dataStream.length; i += 1) {
    if (dataStream[i] === "\r") {
      paragraphs.push({ startIndex: i });
    }
  }

  return {
    id: "doc-1",
    locale: "zhCN",
    title: "",
    tableSource: {},
    drawings: {},
    drawingsOrder: [],
    headers: {},
    footers: {},
    body: {
      dataStream,
      textRuns: [],
      customBlocks: [],
      tables: [],
      customRanges: [],
      customDecorations: [],
      paragraphs,
      sectionBreaks: [{ startIndex: Math.max(0, dataStream.length - 1) }],
    },
    documentStyle: {},
  };
}

/**
 * Convert Univer IWorkbookData to XLSX file
 */
export async function univerToXlsx(data: IWorkbookData, filePath: string): Promise<void> {
  const XLSX = await importXlsx();
  const workbook = XLSX.utils.book_new();

  // Create worksheets in order
  for (const sheetId of data.sheetOrder) {
    const sheetData = data.sheets[sheetId];
    if (!sheetData) {
      continue;
    }

    const rowCount = Math.max(1, sheetData.rowCount || 0);
    const columnCount = Math.max(1, sheetData.columnCount || 0);
    const rows: Array<Array<string | number | boolean | null>> = Array.from(
      { length: rowCount },
      () => Array.from({ length: columnCount }, () => null),
    );

    for (const [rowIndexStr, rowData] of Object.entries(sheetData.cellData)) {
      const rowIndex = Number(rowIndexStr);
      for (const [colIndexStr, cellData] of Object.entries(rowData)) {
        const colIndex = Number(colIndexStr);
        if (rowIndex < rowCount && colIndex < columnCount && cellData.v !== undefined) {
          rows[rowIndex][colIndex] = cellData.v;
        }
      }
    }

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetData.name || "Sheet");
  }

  XLSX.writeFile(workbook, filePath);
}

/**
 * Convert Univer IWorkbookData to CSV file
 */
export async function univerToCsv(data: IWorkbookData, filePath: string): Promise<void> {
  const XLSX = await importXlsx();
  const firstSheetId = data.sheetOrder[0];
  const sheetData = firstSheetId ? data.sheets[firstSheetId] : undefined;
  if (!sheetData) {
    await (await import("node:fs/promises")).writeFile(filePath, "", "utf8");
    return;
  }

  const rowCount = Math.max(1, sheetData.rowCount || 0);
  const columnCount = Math.max(1, sheetData.columnCount || 0);
  const rows: Array<Array<string | number | boolean | null>> = Array.from(
    { length: rowCount },
    () => Array.from({ length: columnCount }, () => null),
  );

  for (const [rowIndexStr, rowData] of Object.entries(sheetData.cellData)) {
    const rowIndex = Number(rowIndexStr);
    for (const [colIndexStr, cellData] of Object.entries(rowData)) {
      const colIndex = Number(colIndexStr);
      if (rowIndex < rowCount && colIndex < columnCount && cellData.v !== undefined) {
        rows[rowIndex][colIndex] = cellData.v;
      }
    }
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  await (await import("node:fs/promises")).writeFile(filePath, csv, "utf8");
}

/**
 * Convert Univer IDocumentData to DOCX file
 */
export async function univerToDocx(data: IDocumentData, filePath: string): Promise<void> {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const { promises: fsPromises } = await import("node:fs");

  // Extract text from dataStream
  const text = data.body.dataStream.replace(/\r\n/g, "\n");
  const paragraphs = text.split("\n").map(
    (line) =>
      new Paragraph({
        children: [new TextRun(line)],
      }),
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  await fsPromises.writeFile(filePath, buffer);
}

/**
 * Convert PPTX to PDF using LibreOffice
 */
export async function pptxToPdf(pptxPath: string, pdfPath: string): Promise<void> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const path = await import("node:path");

  // Check if LibreOffice is available
  let libreOfficePath = "";
  try {
    const { stdout } = await execFileAsync("which", ["libreoffice"]);
    libreOfficePath = stdout.trim();
  } catch {
    try {
      const { stdout } = await execFileAsync("which", ["soffice"]);
      libreOfficePath = stdout.trim();
    } catch {
      throw new Error("LibreOffice not found. Please install LibreOffice to convert PPTX to PDF.");
    }
  }

  const outputDir = path.dirname(pdfPath);

  // Convert using LibreOffice
  await execFileAsync(libreOfficePath, [
    "--headless",
    "--convert-to",
    "pdf",
    "--outdir",
    outputDir,
    pptxPath,
  ]);

  // LibreOffice creates the PDF with the same base name as the input file
  const expectedPdfPath = path.join(outputDir, path.basename(pptxPath, ".pptx") + ".pdf");

  // If the output path is different from expected, rename it
  if (expectedPdfPath !== pdfPath) {
    const { promises: fsPromises } = await import("node:fs");
    await fsPromises.rename(expectedPdfPath, pdfPath);
  }
}
