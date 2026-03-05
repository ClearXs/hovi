// ASR types for voice recognition

export type AsrProvider = "local" | "deepgram" | "openai" | "groq";

export type AsrModelSize = "tiny" | "base" | "small" | "medium" | "large";

export interface AsrConfig {
  provider: AsrProvider;
  modelSize?: AsrModelSize;
  language?: string;
  vadEnabled?: boolean;
  vadMinSpeechDuration?: number;
  vadSilenceThreshold?: number;
  realTimeSubtitle?: boolean;
  cloudFallback?: boolean;
  cloudApiKey?: string;
  cloudProvider?: Exclude<AsrProvider, "local">;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  segments?: Segment[];
}

export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface VadResult {
  speech: boolean;
  start?: number;
  end?: number;
}

// WebSocket 消息类型
export type AsrClientMessage =
  | { type: "start"; config: AsrConfig }
  | { type: "audio"; data: ArrayBuffer }
  | { type: "stop" }
  | { type: "interrupt" };

export type AsrServerMessage =
  | { type: "ready" }
  | { type: "transcript"; text: string; final: boolean; timestamp: number }
  | { type: "vad"; speech: boolean }
  | { type: "error"; message: string }
  | { type: "fallback"; provider: string };

// TTS 配置
export interface TtsConfig {
  provider: "elevenlabs" | "openai" | "edge";
  apiKey?: string;
  voiceId?: string;
  voiceName?: string;
  modelId?: string;
  voiceSettings?: {
    stability: number;
    similarityBoost: number;
    style: number;
    speed: number;
  };
}
