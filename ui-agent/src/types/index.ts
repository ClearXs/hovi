export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  chatId: string;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Agent {
  id: string;
  name: string;
  status: "idle" | "running" | "completed" | "error";
  progress: number;
  currentTask?: string;
  todos: TodoItem[];
  executionLog: LogEntry[];
  usedTools: ToolUsage[];
  createdFiles: FileItem[];
}

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
  createdAt: Date;
}

export interface LogEntry {
  id: string;
  level: "info" | "warning" | "error" | "debug";
  message: string;
  timestamp: Date;
  source?: string;
}

export interface ToolUsage {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, any>;
  result?: any;
  timestamp: Date;
  duration?: number;
}

export interface FileItem {
  id: string;
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  content?: string;
  createdAt: Date;
  modifiedAt: Date;
}

export interface ChatState {
  chats: Chat[];
  currentChatId: string | null;
  isLoading: boolean;
}

export interface AgentState {
  agent: Agent | null;
  isRunning: boolean;
  error: string | null;
}

export interface UIState {
  sidebarOpen: boolean;
  activeTab: string;
  theme: "light" | "dark";
}

export type SubagentStatus = "running" | "completed" | "failed" | "timeout";

export type SubagentType = "search" | "write" | "code" | "analysis" | "read" | "agent";

export interface SubagentMessageProps {
  id: string;
  label?: string;
  task: string;
  type?: SubagentType;
  status: SubagentStatus;
  runtime?: "subagent" | "acp";
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  output?: string;
  progress?: number;
  error?: string;
  duration?: number;
}
