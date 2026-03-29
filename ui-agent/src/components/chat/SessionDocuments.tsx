"use client";

import { FileText, Loader2, X } from "lucide-react";
import { useEffect } from "react";
import { useSessionDocumentStore } from "@/stores/sessionDocumentStore";

interface SessionDocumentsProps {
  sessionKey: string;
}

export function SessionDocuments({ sessionKey }: SessionDocumentsProps) {
  const { documents, isLoadingDocuments, uploadingFiles, uploadError, loadDocuments } =
    useSessionDocumentStore();

  // 加载文档列表
  useEffect(() => {
    if (sessionKey) {
      loadDocuments(sessionKey);
    }
  }, [sessionKey, loadDocuments]);

  // 如果没有文档且没有在加载，显示提示
  if (documents.length === 0 && !isLoadingDocuments) {
    return (
      <div className="text-xs text-text-tertiary py-2">
        暂无上传的附件。拖拽文件到对话输入框即可上传。
      </div>
    );
  }

  return (
    <div className="border-b border-border-light bg-background p-2">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="w-4 h-4 text-text-secondary" />
        <span className="text-sm font-medium">本次会话附件</span>
        {isLoadingDocuments && <Loader2 className="w-3 h-3 animate-spin" />}
      </div>

      <div className="flex flex-wrap gap-2">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center gap-1 px-2 py-1 rounded bg-primary/5 border border-border-light text-sm"
          >
            <FileText className="w-3 h-3" />
            <span className="truncate max-w-[150px]">{doc.filename}</span>
            {doc.pageIndexReady ? (
              <span className="text-xs text-green-500">✓</span>
            ) : (
              <span className="text-xs text-yellow-500">...</span>
            )}
          </div>
        ))}

        {/* 上传中的文件 */}
        {Array.from(uploadingFiles.entries()).map(([filename, progress]) => (
          <div
            key={filename}
            className="flex items-center gap-1 px-2 py-1 rounded bg-primary/5 border border-border-light text-sm"
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="truncate max-w-[150px]">{filename}</span>
          </div>
        ))}
      </div>

      {/* 上传错误 */}
      {uploadError && <div className="mt-2 text-xs text-red-500">{uploadError}</div>}
    </div>
  );
}
