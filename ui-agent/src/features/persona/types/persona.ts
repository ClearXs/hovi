// Persona types - maps to moltbot Agent

export interface Persona {
  id: string;
  name: string;
  activated?: boolean;
  r_path?: string;
  thumb?: string;
  character_setting?: string;
  config?: PersonaConfig;
}

// Motion 动作项（单个动作）
export interface MotionItem {
  file: string; // motion 文件路径
  thumbnail?: string; // 预览图路径
  description?: string; // 描述
}

// Emote 情感动作
export interface MotionEmote {
  id: string; // 唯一标识，如 "greeting_wave"
  file: string; // motion 文件路径
  thumbnail?: string; // 预览图路径
  keywords: string[]; // 触发关键词（英文）
  description?: string; // 描述
}

// Expression 表情映射
export interface MotionExpression {
  blendshape: string; // VRM blendshape 名称
  keywords: string[]; // 触发关键词（英文）
}

// Motion 配置
export interface MotionConfig {
  idle: MotionItem | null; // 待机动作
  emotes: MotionEmote[]; // 情感动作列表
  expressions: Record<string, MotionExpression>; // 表情映射表
}

export interface PersonaConfig {
  character_setting?: string;
  ref_audio?: string;
  motion?: {
    idle_loop?: string;
  };
  // 新增：Motion 配置
  motions?: MotionConfig;
  vrm?: string;
  prompt_lang?: string;
}

// For creating/updating persona
export interface PersonaFormData {
  name: string;
  activated?: boolean;
  character_setting?: string;
  config?: {
    vrm?: string;
    ref_audio?: string;
    motion?: {
      idle_loop?: string;
    };
    motions?: MotionConfig;
    prompt_lang?: string;
  };
}

// Gateway API response types
export interface AgentIdentity {
  name?: string;
  theme?: string;
  emoji?: string;
  avatar?: string;
  avatarUrl?: string;
}

export interface AgentInfo {
  id: string;
  name?: string;
  description?: string;
  agent_type?: string;
  system?: string;
  topic?: string;
  tags?: string[];
  activated?: boolean;
  identity?: AgentIdentity;
  memorySearch?: Record<string, unknown>;
}
