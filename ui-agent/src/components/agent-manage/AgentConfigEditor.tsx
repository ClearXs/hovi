"use client";

import Editor from "@monaco-editor/react";
import { Loader2, Save, FileText, FileCode, BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getAgentFile, setAgentFile } from "@/features/agent-manage/api/agentManageApi";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/stores/connectionStore";
import {
  AGENT_CONFIG_FILES,
  AGENT_CONFIG_FILE_LABELS,
  type AgentConfigFileName,
} from "@/types/agent-manage";

interface AgentConfigEditorProps {
  agentId: string;
  agentName?: string;
  onClose: () => void;
}

// Get file icon based on filename
function getFileIcon(filename: string) {
  if (filename.includes("SOUL") || filename.includes("IDENTITY") || filename.includes("USER")) {
    return <BookOpen className="w-4 h-4" />;
  }
  if (filename.includes("TOOLS")) {
    return <FileCode className="w-4 h-4" />;
  }
  return <FileText className="w-4 h-4" />;
}

// Get language based on filename
function getFileLanguage(filename: string): string {
  if (filename.endsWith(".md")) {
    return "markdown";
  }
  return "json";
}

export function AgentConfigEditor({ agentId, agentName, onClose }: AgentConfigEditorProps) {
  const wsClient = useConnectionStore((s) => s.wsClient);
  const [activeFile, setActiveFile] = useState<AgentConfigFileName>("SOUL.md");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load file content
  useEffect(() => {
    const loadContent = async () => {
      if (!wsClient) return;
      try {
        setLoading(true);
        const file = await getAgentFile(wsClient, agentId, activeFile);
        setContent(file.content || "");
        setHasChanges(false);
      } catch (error) {
        console.error("Failed to load agent file:", error);
        setContent("");
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, [wsClient, agentId, activeFile]);

  const handleContentChange = (value: string | undefined) => {
    setContent(value || "");
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!wsClient) return;
    try {
      setSaving(true);
      await setAgentFile(wsClient, agentId, activeFile, content);
      setHasChanges(false);
    } catch (error) {
      console.error("Failed to save agent file:", error);
      alert("保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-[65vh]">
      {/* 主体布局：左侧文件列表 + 右侧编辑器 */}
      <div className="flex flex-1 min-h-0">
        {/* 左侧文件列表 */}
        <div className="w-48 flex-shrink-0 border-r border-border-light pr-4 mr-4">
          <ScrollArea className="h-full">
            <div className="space-y-1">
              {AGENT_CONFIG_FILES.map((file) => (
                <button
                  key={file}
                  onClick={() => setActiveFile(file)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left",
                    activeFile === file
                      ? "bg-primary/10 text-primary"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                  )}
                >
                  {getFileIcon(file)}
                  <span className="truncate">{AGENT_CONFIG_FILE_LABELS[file]}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* 右侧编辑器 + 底部保存按钮 */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 border border-border-light rounded-md overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <Editor
                height="100%"
                language={getFileLanguage(activeFile)}
                theme="vs-dark"
                value={content}
                onChange={handleContentChange}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: "on",
                }}
              />
            )}
          </div>

          {/* 底部保存按钮 */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose} size="sm">
              关闭
            </Button>
            <Button onClick={handleSave} disabled={saving || !hasChanges} size="sm">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  保存
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
