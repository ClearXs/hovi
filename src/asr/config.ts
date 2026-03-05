// ASR configuration management

import type { AsrConfig, TtsConfig } from "./types.js";

const DEFAULT_ASR_CONFIG: AsrConfig = {
  provider: "deepgram",
  modelSize: "tiny",
  language: "zh-CN",
  vadEnabled: true,
  vadMinSpeechDuration: 500,
  vadSilenceThreshold: 0.5,
  realTimeSubtitle: true,
  cloudFallback: false,
  cloudApiKey: "",
  cloudProvider: "deepgram",
};

const DEFAULT_TTS_CONFIG: TtsConfig = {
  provider: "elevenlabs",
  apiKey: "",
  voiceId: "",
  voiceName: "",
  modelId: "eleven_multilingual_v2",
  voiceSettings: {
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.0,
    speed: 1.0,
  },
};

export function resolveAsrConfig(userConfig: Partial<AsrConfig>): AsrConfig {
  return {
    ...DEFAULT_ASR_CONFIG,
    ...userConfig,
  };
}

export function resolveTtsConfig(userConfig: Partial<TtsConfig>): TtsConfig {
  return {
    ...DEFAULT_TTS_CONFIG,
    ...userConfig,
  };
}

export function validateAsrConfig(config: unknown): config is AsrConfig {
  if (!config || typeof config !== "object") {
    return false;
  }

  const validProviders = ["local", "deepgram", "openai", "groq"];
  const validSizes = ["tiny", "base", "small", "medium", "large"];

  const cfg = config as Record<string, unknown>;

  if (cfg.provider && !validProviders.includes(cfg.provider as string)) {
    return false;
  }

  if (cfg.modelSize && !validSizes.includes(cfg.modelSize as string)) {
    return false;
  }

  return true;
}

export function validateTtsConfig(config: unknown): config is TtsConfig {
  if (!config || typeof config !== "object") {
    return false;
  }

  const validProviders = ["elevenlabs", "openai", "edge"];
  const cfg = config as Record<string, unknown>;

  if (cfg.provider && !validProviders.includes(cfg.provider as string)) {
    return false;
  }

  return true;
}

export { DEFAULT_ASR_CONFIG, DEFAULT_TTS_CONFIG };
