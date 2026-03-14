// ASR Fallback module - wraps cloud ASR as fallback when local fails

import { getLogger } from "../logging.js";
import { AsrProcessor } from "./processor.js";
import type { TranscriptionResult, AsrConfig, AsrProvider } from "./types.js";

const logger = getLogger();

export interface FallbackConfig {
  primaryProvider: "sherpa-onnx" | "deepgram" | "openai" | "groq";
  fallbackProvider?: AsrProvider;
  autoFallback?: boolean;
}

/**
 * ASR Fallback handler
 * Tries local (sherpa-onnx) first, then falls back to cloud if it fails
 */
export class AsrFallback {
  private config: FallbackConfig;
  private primaryAsr: AsrProcessor | null = null;
  private fallbackAsr: AsrProcessor | null = null;
  private isInitialized: boolean = false;

  constructor(config: FallbackConfig) {
    this.config = {
      autoFallback: true,
      fallbackProvider: "deepgram",
      ...config,
    };
  }

  /**
   * Initialize ASR processors
   */
  async initialize(): Promise<void> {
    logger.info("Initializing ASR Fallback handler");

    // Initialize primary ASR (local sherpa-onnx would be used here)
    // For now, we use AsrProcessor which handles cloud providers
    const primaryConfig: Partial<AsrConfig> = {
      provider: this.config.primaryProvider as AsrProvider,
    };
    this.primaryAsr = new AsrProcessor(primaryConfig);
    await this.primaryAsr.initialize();

    // Initialize fallback ASR (cloud)
    if (this.config.autoFallback && this.config.fallbackProvider) {
      const fallbackConfig: Partial<AsrConfig> = {
        provider: this.config.fallbackProvider,
      };
      this.fallbackAsr = new AsrProcessor(fallbackConfig);
      await this.fallbackAsr.initialize();
    }

    this.isInitialized = true;
    logger.info("ASR Fallback handler initialized");
  }

  /**
   * Transcribe audio with fallback
   * @param audioBuffer Audio data to transcribe
   * @returns TranscriptionResult
   */
  async transcribe(audioBuffer: Buffer): Promise<TranscriptionResult> {
    if (!this.isInitialized) {
      throw new Error("ASR Fallback not initialized");
    }

    // Try primary (local sherpa-onnx)
    try {
      logger.debug("Attempting primary ASR (sherpa-onnx)");
      const result = await this.primaryAsr!.transcribe(audioBuffer);

      if (result.text && result.text.trim().length > 0) {
        logger.debug("Primary ASR succeeded");
        return result;
      }

      // Empty result, try fallback
      logger.debug("Primary ASR returned empty result, trying fallback");
    } catch (error) {
      logger.warn("Primary ASR failed:", error);
    }

    // Fallback to cloud ASR
    if (this.config.autoFallback && this.fallbackAsr) {
      try {
        logger.debug("Attempting fallback ASR (cloud)");
        const result = await this.fallbackAsr.transcribe(audioBuffer);

        if (result.text && result.text.trim().length > 0) {
          logger.info("Fallback ASR succeeded");
          return {
            ...result,
            text: result.text, // Could add marker that it's from fallback
          };
        }
      } catch (error) {
        logger.error("Fallback ASR also failed:", error);
      }
    }

    // All failed
    logger.error("All ASR providers failed");
    return {
      text: "",
      language: "zh-CN",
    };
  }

  /**
   * Process audio with VAD and transcription
   */
  async process(audioChunk: Buffer): Promise<{
    transcript?: TranscriptionResult;
    vad?: { speech: boolean };
  }> {
    if (!this.isInitialized) {
      throw new Error("ASR Fallback not initialized");
    }

    // Use primary ASR's process method
    return this.primaryAsr!.process(audioChunk);
  }

  /**
   * Check if fallback is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get current provider status
   */
  getStatus(): {
    primaryReady: boolean;
    fallbackReady: boolean;
    currentProvider: string;
  } {
    return {
      primaryReady: this.primaryAsr?.getConfig() !== undefined,
      fallbackReady: this.fallbackAsr?.getConfig() !== undefined,
      currentProvider: this.config.primaryProvider,
    };
  }

  /**
   * Manually switch provider
   */
  async switchProvider(provider: AsrProvider): Promise<void> {
    this.config.primaryProvider = provider as "sherpa-onnx" | "deepgram" | "openai" | "groq";

    // Re-initialize with new provider
    await this.initialize();
  }

  /**
   * Destroy ASR instances
   */
  destroy(): void {
    this.primaryAsr = null;
    this.fallbackAsr = null;
    this.isInitialized = false;
    logger.info("ASR Fallback handler destroyed");
  }
}

/**
 * Factory function to create AsrFallback instance
 */
export function createAsrFallback(config: FallbackConfig): AsrFallback {
  return new AsrFallback(config);
}
