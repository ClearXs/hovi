// ASR Gateway handlers - integrates with cloud ASR via media-understanding

import { resolveAsrConfig, DEFAULT_ASR_CONFIG } from "../../asr/config.js";
import type { AsrConfig } from "../../asr/types.js";
import type { GatewayRequestHandlers } from "./types.js";

/**
 * Transcribe audio using cloud ASR providers
 * Note: Full implementation requires proper API key resolution from config
 */
async function transcribeWithProvider(
  audioBase64: string,
  provider: string,
  language?: string,
): Promise<{ text: string; language: string }> {
  // Decode base64 to buffer
  const buffer = Buffer.from(audioBase64, "base64");

  console.log(`[asr] Transcribing with provider: ${provider}, buffer size: ${buffer.length}`);

  // TODO: Implement full integration with media-understanding
  // This requires proper API key resolution from config

  // Placeholder - return empty result for now
  return {
    text: "",
    language: language || "zh-CN",
  };
}

export const asrHandlers: GatewayRequestHandlers = {
  "asr.config.get": async () => {
    // TODO: 从 persona.json 读取 ASR 配置
    return DEFAULT_ASR_CONFIG;
  },

  "asr.config.set": async (_, config: Partial<AsrConfig>) => {
    console.log("[asr] Setting config:", config);
    // TODO: 保存到 persona.json
    const resolved = resolveAsrConfig(config);
    return { ok: true, config: resolved };
  },

  "asr.status": async () => {
    return {
      status: "ready",
      provider: "deepgram",
      modelLoaded: false,
      message: "Using cloud ASR (media-understanding)",
    };
  },

  // ASR transcription endpoint
  "asr.transcribe": async (
    _,
    params: { audioBase64?: string; provider?: string; language?: string },
  ) => {
    const { audioBase64, provider = "deepgram", language = "zh-CN" } = params;

    if (!audioBase64) {
      return {
        text: "",
        language,
        error: "No audio data provided",
      };
    }

    console.log("[asr] transcribe request:", {
      hasAudio: true,
      provider,
      language,
    });

    try {
      const result = await transcribeWithProvider(audioBase64, provider, language);
      console.log("[asr] transcription result:", { textLength: result.text.length });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Transcription failed";
      console.error("[asr] transcription error:", errorMessage);
      return {
        text: "",
        language,
        error: errorMessage,
      };
    }
  },
};
