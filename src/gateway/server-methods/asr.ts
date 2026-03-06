// ASR Gateway handlers - integrates with sherpa-onnx and cloud ASR

import { resolveAsrConfig, DEFAULT_ASR_CONFIG } from "../../asr/config.js";
import { SherpaVad, SherpaAsr } from "../../asr/index.js";
import type { SherpaVadConfig, SherpaAsrConfig } from "../../asr/index.js";
import type { AsrConfig, AsrProvider } from "../../asr/types.js";
import { getLogger } from "../../logging.js";
import type { GatewayRequestHandlers } from "./types.js";

const logger = getLogger("gateway:asr");

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
  "asr.config.get": async () => {
    return currentConfig;
  },

  /**
   * Set ASR configuration
   */
  "asr.config.set": async (_, config: Partial<AsrConfig>) => {
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
  "asr.status": async (_1, _agentId?: string) => {
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
  "asr.transcribe": async (
    _,
    params: {
      audioBase64?: string;
      provider?: string;
      language?: string;
      agentId?: string;
    },
  ) => {
    const {
      audioBase64,
      provider = currentConfig.provider,
      language = currentConfig.language || "zh-CN",
      agentId = "default",
    } = params;

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
    // TODO: Implement cloud provider transcription
    return {
      text: "",
      language,
      error: "Cloud providers not implemented yet",
      provider: provider,
    };
  },

  /**
   * VAD detection
   */
  "asr.vad.detect": async (
    _,
    params: {
      audioBase64?: string;
      agentId?: string;
    },
  ) => {
    const { audioBase64, agentId = "default" } = params;

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
  "asr.sherpa.init": async (_, params: { agentId?: string }) => {
    const { agentId = "default" } = params;

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
  "asr.provider.switch": async (_, params: { provider: AsrProvider }) => {
    const { provider } = params;

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
