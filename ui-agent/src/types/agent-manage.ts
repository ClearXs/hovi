// Agent Manage types for UI Agent

export interface AgentManageInfo {
  id: string;
  name?: string;
  description?: string;
  agent_type?: string;
  system?: string;
  topic?: string;
  tags?: string[];
  activated?: boolean;
  workspace?: string;
  model?: string;
  avatar?: string;
}

export interface AgentManageCreate {
  id: string;
  name: string;
  description?: string;
  agent_type?: string;
  system?: string;
  topic?: string;
  tags?: string[];
  workspace?: string;
  model?: string;
  avatar?: string;
}

export interface AgentManageUpdate {
  name?: string;
  description?: string;
  agent_type?: string;
  system?: string;
  topic?: string;
  tags?: string[];
  workspace?: string;
  model?: string;
  avatar?: string;
  activated?: boolean;
}

export interface AgentConfigFile {
  name: string;
  content: string;
}

export interface AgentFilesList {
  files: string[];
}

export type AgentConfigFileName =
  | "AGENTS.md"
  | "SOUL.md"
  | "TOOLS.md"
  | "IDENTITY.md"
  | "USER.md"
  | "HEARTBEAT.md"
  | "BOOTSTRAP.md"
  | "MEMORY.md"
  | "memory.md";

export const AGENT_CONFIG_FILES: AgentConfigFileName[] = [
  "SOUL.md",
  "IDENTITY.md",
  "TOOLS.md",
  "USER.md",
  "HEARTBEAT.md",
  "BOOTSTRAP.md",
  "MEMORY.md",
  "AGENTS.md",
];

export const AGENT_CONFIG_FILE_LABELS: Record<AgentConfigFileName, string> = {
  "SOUL.md": "灵魂/性格",
  "IDENTITY.md": "身份信息",
  "TOOLS.md": "工具列表",
  "USER.md": "用户提示词",
  "HEARTBEAT.md": "心跳配置",
  "BOOTSTRAP.md": "启动配置",
  "MEMORY.md": "记忆配置",
  "AGENTS.md": "Agent列表",
  "memory.md": "记忆配置(备用)",
};
