import type { ReactNode } from "react";
import {
  FaFilePdf,
  FaFileWord,
  FaFileExcel,
  FaFilePowerpoint,
  FaFileAlt,
  FaFileCode,
  FaFileCsv,
  FaFileAudio,
  FaFileVideo,
  FaFileImage,
  FaFileArchive,
  FaDatabase,
  FaTerminal,
  FaMarkdown,
  FaFolder,
} from "react-icons/fa";

export type FileBaseType =
  | "pdf"
  | "docx"
  | "xlsx"
  | "md"
  | "pptx"
  | "png"
  | "jpg"
  | "zip"
  | "json"
  | "yaml"
  | "xml"
  | "csv"
  | "sql"
  | "log"
  | "txt";

export type FilePathKind = "file" | "directory" | "unknown";

export type DisplayFileType =
  | "directory"
  | "pdf"
  | "docx"
  | "xlsx"
  | "pptx"
  | "markdown"
  | "image"
  | "archive"
  | "code"
  | "audio"
  | "video"
  | "json"
  | "yaml"
  | "xml"
  | "csv"
  | "sql"
  | "log"
  | "shell"
  | "text";

export type ResolveDisplayTypeInput = {
  name: string;
  resolvedPath?: string;
  type?: FileBaseType;
  kind?: FilePathKind;
};

const extensionEntries: Array<[string, DisplayFileType]> = [
  ["pdf", "pdf"],
  ["doc", "docx"],
  ["docx", "docx"],
  ["xls", "xlsx"],
  ["xlsx", "xlsx"],
  ["ppt", "pptx"],
  ["pptx", "pptx"],
  ["md", "markdown"],
  ["markdown", "markdown"],
  ["json", "json"],
  ["jsonl", "json"],
  ["json5", "json"],
  ["ndjson", "json"],
  ["yaml", "yaml"],
  ["yml", "yaml"],
  ["toml", "yaml"],
  ["ini", "yaml"],
  ["env", "yaml"],
  ["xml", "xml"],
  ["xsd", "xml"],
  ["xsl", "xml"],
  ["csv", "csv"],
  ["tsv", "csv"],
  ["sql", "sql"],
  ["psql", "sql"],
  ["sqlite", "sql"],
  ["db", "sql"],
  ["log", "log"],
  ["out", "log"],
  ["err", "log"],
  ["trace", "log"],
  ["png", "image"],
  ["jpg", "image"],
  ["jpeg", "image"],
  ["gif", "image"],
  ["webp", "image"],
  ["bmp", "image"],
  ["svg", "image"],
  ["zip", "archive"],
  ["rar", "archive"],
  ["7z", "archive"],
  ["tar", "archive"],
  ["gz", "archive"],
  ["bz2", "archive"],
  ["xz", "archive"],
  ["ts", "code"],
  ["tsx", "code"],
  ["js", "code"],
  ["jsx", "code"],
  ["mjs", "code"],
  ["cjs", "code"],
  ["py", "code"],
  ["go", "code"],
  ["rs", "code"],
  ["java", "code"],
  ["kt", "code"],
  ["swift", "code"],
  ["c", "code"],
  ["cpp", "code"],
  ["h", "code"],
  ["hpp", "code"],
  ["rb", "code"],
  ["php", "code"],
  ["sh", "shell"],
  ["bash", "shell"],
  ["zsh", "shell"],
  ["fish", "shell"],
  ["ps1", "shell"],
  ["cmd", "shell"],
  ["bat", "shell"],
  ["mp3", "audio"],
  ["wav", "audio"],
  ["flac", "audio"],
  ["aac", "audio"],
  ["mp4", "video"],
  ["mov", "video"],
  ["avi", "video"],
  ["mkv", "video"],
];

const declaredTypeEntries: Array<[FileBaseType, DisplayFileType]> = [
  ["pdf", "pdf"],
  ["docx", "docx"],
  ["xlsx", "xlsx"],
  ["md", "markdown"],
  ["pptx", "pptx"],
  ["png", "image"],
  ["jpg", "image"],
  ["zip", "archive"],
  ["json", "json"],
  ["yaml", "yaml"],
  ["xml", "xml"],
  ["csv", "csv"],
  ["sql", "sql"],
  ["log", "log"],
  ["txt", "text"],
];

export const FILE_EXTENSION_TYPE_REGISTRY: ReadonlyMap<string, DisplayFileType> = new Map(
  extensionEntries,
);
export const FILE_DECLARED_TYPE_REGISTRY: ReadonlyMap<FileBaseType, DisplayFileType> = new Map(
  declaredTypeEntries,
);

function inferTypeByName(pathOrName: string): string | null {
  const ext = /\.([A-Za-z0-9]{1,12})$/.exec(pathOrName)?.[1]?.toLowerCase();
  return ext ?? null;
}

export function resolveDisplayType(input: ResolveDisplayTypeInput): DisplayFileType {
  if (input.kind === "directory") {
    return "directory";
  }

  const fromResolved = input.resolvedPath ? inferTypeByName(input.resolvedPath) : null;
  const fromName = inferTypeByName(input.name);
  const ext = fromResolved ?? fromName;
  if (ext) {
    return FILE_EXTENSION_TYPE_REGISTRY.get(ext) ?? "text";
  }

  if (input.type) {
    return FILE_DECLARED_TYPE_REGISTRY.get(input.type) ?? "text";
  }

  return input.kind === "unknown" ? "directory" : "text";
}

export function renderDisplayTypeIcon(type: DisplayFileType): ReactNode {
  const iconClassName = "h-6 w-6";
  switch (type) {
    case "directory":
      return <FaFolder className={`${iconClassName} text-text-tertiary`} />;
    case "pdf":
      return <FaFilePdf className={`${iconClassName} text-error`} />;
    case "docx":
      return <FaFileWord className={`${iconClassName} text-[#2B579A]`} />;
    case "xlsx":
      return <FaFileExcel className={`${iconClassName} text-[#217346]`} />;
    case "pptx":
      return <FaFilePowerpoint className={`${iconClassName} text-[#D24726]`} />;
    case "markdown":
      return <FaMarkdown className={`${iconClassName} text-[#4b5563]`} />;
    case "json":
      return <FaFileCode className={`${iconClassName} text-[#2563eb]`} />;
    case "yaml":
      return <FaFileCode className={`${iconClassName} text-[#059669]`} />;
    case "xml":
      return <FaFileCode className={`${iconClassName} text-[#ea580c]`} />;
    case "csv":
      return <FaFileCsv className={`${iconClassName} text-[#16a34a]`} />;
    case "sql":
      return <FaDatabase className={`${iconClassName} text-[#0ea5e9]`} />;
    case "log":
      return <FaFileAlt className={`${iconClassName} text-[#d97706]`} />;
    case "shell":
      return <FaTerminal className={`${iconClassName} text-[#14b8a6]`} />;
    case "code":
      return <FaFileCode className={`${iconClassName} text-[#2f6df6]`} />;
    case "audio":
      return <FaFileAudio className={`${iconClassName} text-[#8b5cf6]`} />;
    case "video":
      return <FaFileVideo className={`${iconClassName} text-[#ef4444]`} />;
    case "image":
      return <FaFileImage className={`${iconClassName} text-primary`} />;
    case "archive":
      return <FaFileArchive className={`${iconClassName} text-warning`} />;
    case "text":
    default:
      return <FaFileAlt className={`${iconClassName} text-text-secondary`} />;
  }
}
