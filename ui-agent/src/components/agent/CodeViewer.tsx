"use client";

import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface CodeViewerProps {
  filename: string;
  code: string;
  language?: string;
}

const CodeViewer = ({ filename, code, language = "python" }: CodeViewerProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 bg-red-500 rounded-full" />
            <div className="w-3 h-3 bg-yellow-500 rounded-full" />
            <div className="w-3 h-3 bg-green-500 rounded-full" />
          </div>
          <span className="text-sm text-gray-300 font-mono">{filename}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" />
              已复制
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              复制
            </>
          )}
        </button>
      </div>
      <div className="overflow-auto max-h-96 scrollbar-thin">
        <pre className="p-4 text-sm font-mono text-green-400 whitespace-pre-wrap break-all">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};

export default CodeViewer;
