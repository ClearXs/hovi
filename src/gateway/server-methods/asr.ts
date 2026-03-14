// ASR Gateway handlers - integrates with sherpa-onnx and cloud ASR

import { resolveAsrConfig, DEFAULT_ASR_CONFIG } from "../../asr/config.js";
import { SherpaVad, SherpaAsr } from "../../asr/index.js";
import type { SherpaVadConfig, SherpaAsrConfig } from "../../asr/index.js";
import type { AsrConfig, AsrProvider } from "../../asr/types.js";
import { getLogger } from "../../logging.js";
import type { GatewayRequestHandlers } from "./types.js";

const logger = getLogger();

// Singleton instances
let vadInstance: SherpaVad | null = null;
let asrInstance: SherpaAsr | null = null;

// Current configuration
let currentConfig: AsrConfig = DEFAULT_ASR_CONFIG;

/**
 * Get or create VAD instance
 */
function getVadInstance(agentId: string): SherpaVad {
  if (!vadInstance) {
    const vadConfig: SherpaVadConfig = {
      runtimeDir: "",
      modelPath: SherpaVad.getDefaultModelPath(agentId),
      threshold: currentConfig.vadSilenceThreshold || 0.5,
      minSpeechDuration: currentConfig.vadMinSpeechDuration || 300,
      minSilenceDuration: 700,
    };
    vadInstance = new SherpaVad(vadConfig);
  }
  return vadInstance;
}

/**
 * Get or create ASR instance
 */
function getAsrInstance(agentId: string): SherpaAsr {
  if (!asrInstance) {
    const asrConfig: SherpaAsrConfig = {
      modelDir: SherpaAsr.getDefaultModelDir(agentId),
      modelType: "whisper",
      modelSize: currentConfig.modelSize || "tiny",
      language: currentConfig.language || "zh-CN",
    };
    asrInstance = new SherpaAsr(asrConfig);
  }
  return asrInstance;
}

/**
 * Reset all instances (for testing or config changes)
 */
function resetInstances(): void {
  vadInstance?.destroy();
  asrInstance?.destroy();
  vadInstance = null;
  asrInstance = null;
}

/**
 * Transcribe audio using sherpa-onnx
 */
async function transcribeWithSherpa(
  audioBase64: string,
  agentId: string,
): Promise<{ text: string; language: string; provider: string }> {
  const buffer = Buffer.from(audioBase64, "base64");

  // Initialize if needed
  if (!asrInstance?.isReady()) {
    const asr = getAsrInstance(agentId);
    try {
      await asr.initialize();
    } catch (error) {
      logger.warn("Failed to initialize sherpa-onnx ASR:", error);
      // Return empty result - will trigger fallback
      return { text: "", language: "zh-CN", provider: "sherpa-onnx" };
    }
  }

  try {
    const result = await asrInstance!.transcribe(buffer);
    return {
      text: result.text,
      language: result.language || "zh-CN",
      provider: "sherpa-onnx",
    };
  } catch (error) {
    logger.error("sherpa-onnx transcription error:", error);
    throw error;
  }
}

/**
 * VAD detection using sherpa-onnx
 */
async function detectWithSherpa(
  audioBase64: string,
  agentId: string,
): Promise<{ speech: boolean; confidence: number }> {
  const buffer = Buffer.from(audioBase64, "base64");

  // Initialize if needed
  if (!vadInstance?.isReady()) {
    const vad = getVadInstance(agentId);
    try {
      await vad.initialize();
    } catch (error) {
      logger.warn("Failed to initialize sherpa-onnx VAD:", error);
      return { speech: false, confidence: 0 };
    }
  }

  try {
    const result = await vadInstance!.process(buffer);
    return {
      speech: result.speech,
      confidence: result.confidence,
    };
  } catch (error) {
    logger.error("sherpa-onnx VAD error:", error);
    return { speech: false, confidence: 0 };
  }
}

export const asrHandlers: GatewayRequestHandlers = {
  /**
   * Get ASR configuration
   */
  // @ts-expect-error - Type mismatch due to direct return pattern
  "asr.config.get": async () => {
    return currentConfig;
  },

  /**
   * Set ASR configuration
   */
  // @ts-expect-error - Type mismatch due to direct return pattern
  "asr.config.set": async ({ params }) => {
    const config = params as Partial<AsrConfig>;
    logger.info("[asr] Setting config:", config);

    // Reset instances if provider changed
    if (config.provider && config.provider !== currentConfig.provider) {
      resetInstances();
    }

    currentConfig = resolveAsrConfig({ ...currentConfig, ...config });
    return { ok: true, config: currentConfig };
  },

  /**
   * Get ASR status
   */
  // @ts-expect-error - Type mismatch due to direct return pattern
  "asr.status": async ({ params }) => {
    const _agentId = params as { agentId?: string };
    const provider = currentConfig.provider;

    // Check sherpa-onnx status
    let sherpaReady = false;
    let vadReady = false;

    if (provider === "sherpa-onnx") {
      sherpaReady = asrInstance?.isReady() || false;
      vadReady = vadInstance?.isReady() || false;
    }

    let statusMessage = "";
    let modelLoaded = false;

    switch (provider) {
      case "sherpa-onnx":
        statusMessage = sherpaReady ? "sherpa-onnx ASR ready" : "sherpa-onnx ASR not initialized";
        modelLoaded = sherpaReady;
        break;
      case "deepgram":
        statusMessage = "Using Deepgram cloud ASR";
        modelLoaded = true;
        break;
      case "openai":
        statusMessage = "Using OpenAI cloud ASR";
        modelLoaded = true;
        break;
      case "groq":
        statusMessage = "Using Groq cloud ASR";
        modelLoaded = true;
        break;
      default:
        statusMessage = "Unknown provider";
    }

    return {
      status: sherpaReady || provider !== "sherpa-onnx" ? "ready" : "not_ready",
      provider,
      modelLoaded,
      vadReady,
      message: statusMessage,
    };
  },

  /**
   * ASR transcription
   */
  // @ts-expect-error - Type mismatch due to direct return pattern
  "asr.transcribe": async ({ params, _respond }) => {
    const {
      audioBase64,
      provider = currentConfig.provider,
      language = currentConfig.language || "zh-CN",
      agentId = "default",
    } = params as {
      audioBase64?: string;
      provider?: string;
      language?: string;
      agentId?: string;
    };

    if (!audioBase64) {
      return {
        text: "",
        language,
        error: "No audio data provided",
      };
    }

    logger.info("[asr] transcribe request:", {
      hasAudio: true,
      provider,
      language,
      agentId,
    });

    // Use sherpa-onnx provider
    if (provider === "sherpa-onnx") {
      try {
        const result = await transcribeWithSherpa(audioBase64, agentId);
        logger.info("[asr] sherpa-onnx result:", { textLength: result.text.length });
        return result;
      } catch (error) {
        // Check if fallback is enabled
        if (currentConfig.cloudFallback) {
          logger.warn("[asr] sherpa-onnx failed, trying cloud fallback");
          // Fall through to cloud fallback
        } else {
          const errorMessage = error instanceof Error ? error.message : "Transcription failed";
          logger.error("[asr] transcription error:", errorMessage);
          return {
            text: "",
            language,
            error: errorMessage,
            provider: "sherpa-onnx",
          };
        }
      }
    }

    // Cloud providers (fallback)
    try {
      const cloudProvider = currentConfig.cloudProvider || "deepgram";
      const apiKey =
        currentConfig.cloudApiKey ||
        process.env.DEEPGRAM_API_KEY ||
        process.env.OPENAI_API_KEY ||
        process.env.GROQ_API_KEY ||
        "";

      if (!apiKey) {
        return {
          text: "",
          language,
          error: "No API key configured for cloud ASR",
          provider: cloudProvider,
        };
      }

      logger.info("[asr] Using cloud provider:", cloudProvider);

      const audioBuffer = Buffer.from(audioBase64, "base64");
      let resultText = "";

      if (cloudProvider === "deepgram") {
        // Use Deepgram API
        const url = new URL("https://api.deepgram.com/v1/listen");
        url.searchParams.set("model", "nova-2");
        if (language) {
          url.searchParams.set("language", language);
        }

        const response = await fetch(url.toString(), {
          method: "POST",
          headers: {
            Authorization: `Token ${apiKey}`,
            "Content-Type": "audio/webm",
          },
          body: audioBuffer,
        });

        if (!response.ok) {
          throw new Error(`Deepgram API error: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as {
          results?: {
            channels?: Array<{
              alternatives?: Array<{
                transcript?: string;
              }>;
            }>;
          };
        };
        resultText = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
      } else if (cloudProvider === "openai" || cloudProvider === "groq") {
        // Use OpenAI-compatible API (OpenAI or Groq)
        const baseUrl =
          cloudProvider === "openai"
            ? "https://api.openai.com/v1"
            : "https://api.groq.com/openai/v1";

        const formData = new FormData();
        formData.append("file", new Blob([audioBuffer]), "audio.webm");
        formData.append(
          "model",
          cloudProvider === "openai" ? "whisper-1" : "whisper-large-v3-turbo",
        );
        if (language) {
          formData.append("language", language);
        }

        const response = await fetch(`${baseUrl}/audio/transcriptions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`${cloudProvider} API error: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as { text?: string };
        resultText = data.text || "";
      } else {
        // This branch should never be reached with current providers
        const unknownProvider = cloudProvider as string;
        return {
          text: "",
          language,
          error: `Unknown cloud provider: ${unknownProvider}`,
          provider: unknownProvider,
        };
      }

      logger.info("[asr] Cloud provider result:", { textLength: resultText.length });
      return {
        text: resultText,
        language,
        provider: cloudProvider,
      };
    } catch (cloudError) {
      const errorMessage =
        cloudError instanceof Error ? cloudError.message : "Cloud transcription failed";
      logger.error("[asr] Cloud transcription error:", errorMessage);
      return {
        text: "",
        language,
        error: errorMessage,
        provider: provider,
      };
    }
  },

  /**
   * VAD detection
   */
  // @ts-expect-error - Type mismatch due to direct return pattern
  "asr.vad.detect": async ({ params }) => {
    const { audioBase64, agentId = "default" } = params as {
      audioBase64?: string;
      agentId?: string;
    };

    if (!audioBase64) {
      return {
        speech: false,
        confidence: 0,
        error: "No audio data provided",
      };
    }

    // Use sherpa-onnx VAD
    try {
      const result = await detectWithSherpa(audioBase64, agentId);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "VAD detection failed";
      logger.error("[asr] VAD error:", errorMessage);
      return {
        speech: false,
        confidence: 0,
        error: errorMessage,
      };
    }
  },

  /**
   * Initialize sherpa-onnx models
   */
  // @ts-expect-error - Type mismatch due to direct return pattern
  "asr.sherpa.init": async ({ params }) => {
    const { agentId = "default" } = params as { agentId?: string };

    logger.info("[asr] Initializing sherpa-onnx for agent:", agentId);

    try {
      // Initialize VAD
      const vad = getVadInstance(agentId);
      await vad.initialize();

      // Initialize ASR
      const asr = getAsrInstance(agentId);
      await asr.initialize();

      return {
        ok: true,
        vadReady: vad.isReady(),
        asrReady: asr.isReady(),
        message: "sherpa-onnx initialized successfully",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Initialization failed";
      logger.error("[asr] sherpa-onnx init error:", errorMessage);
      return {
        ok: false,
        vadReady: false,
        asrReady: false,
        error: errorMessage,
      };
    }
  },

  /**
   * Get sherpa-onnx model info
   */
  // @ts-expect-error - Type mismatch due to direct return pattern
  "asr.sherpa.info": async () => {
    if (!asrInstance) {
      return {
        available: false,
        message: "ASR not initialized",
      };
    }

    const modelInfo = asrInstance.getModelInfo();

    return {
      available: true,
      ...modelInfo,
    };
  },

  /**
   * Switch ASR provider
   */
  // @ts-expect-error - Type mismatch due to direct return pattern
  "asr.provider.switch": async ({ params }) => {
    const { provider } = params as { provider: AsrProvider };

    if (!provider) {
      return { ok: false, error: "Provider not specified" };
    }

    logger.info("[asr] Switching provider to:", provider);

    // Reset instances
    resetInstances();

    // Update config
    currentConfig = resolveAsrConfig({ ...currentConfig, provider });

    return {
      ok: true,
      provider: currentConfig.provider,
    };
  },
};
