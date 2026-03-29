"use client";

import { Download, ExternalLink } from "lucide-react";
import {
  FaFilePdf,
  FaFileWord,
  FaFileExcel,
  FaFilePowerpoint,
  FaFileAlt,
  FaFileImage,
  FaFileArchive,
  FaFolder,
} from "react-icons/fa";
import { FileItemProps } from "@/components/files/FileList";

const getFileIcon = (type?: string) => {
  const iconClassName = "w-6 h-6";

  switch (type) {
    case "pdf":
      return <FaFilePdf className={`${iconClassName} text-error`} />;
    case "docx":
    case "doc":
      return <FaFileWord className={`${iconClassName} text-[#2B579A]`} />;
    case "xlsx":
    case "xls":
      return <FaFileExcel className={`${iconClassName} text-[#217346]`} />;
    case "pptx":
    case "ppt":
      return <FaFilePowerpoint className={`${iconClassName} text-[#D24726]`} />;
    case "md":
      return <FaFileAlt className={`${iconClassName} text-text-secondary`} />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
      return <FaFileImage className={`${iconClassName} text-primary`} />;
    case "zip":
    case "rar":
    case "7z":
      return <FaFileArchive className={`${iconClassName} text-warning`} />;
    default:
      return <FaFolder className={`${iconClassName} text-text-tertiary`} />;
  }
};

const handleDownload = (file: FileItemProps) => {
  const link = document.createElement("a");
  link.href = file.path;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

interface FileListCompactProps {
  files: FileItemProps[];
}

export function FileListCompact({ files }: FileListCompactProps) {
  if (files.length === 0) {
    return <div className="p-lg text-center text-text-tertiary text-sm">暂无生成文件</div>;
  }

  return (
    <div className="p-md flex gap-sm overflow-x-auto scrollbar-default">
      {files.map((file, index) => (
        <div
          key={index}
          className="flex-shrink-0 flex items-center gap-sm p-sm rounded border border-border hover:border-primary hover:bg-background-secondary transition-all group min-w-[200px] max-w-[280px]"
        >
          {/* 文件图标和信息 */}
          <div className="flex items-center gap-sm flex-1 min-w-0">
            <div className="flex-shrink-0">{getFileIcon(file.type)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{file.name}</p>
              {file.size && <p className="text-xs text-text-tertiary">{file.size}</p>}
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-xs flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => window.open(file.path, "_blank")}
              className="p-xs rounded hover:bg-primary/10 text-text-secondary hover:text-primary transition-colors"
              title="查看文件"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDownload(file)}
              className="p-xs rounded hover:bg-primary/10 text-text-secondary hover:text-primary transition-colors"
              title="下载文件"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
