// ASR processor - integrates with cloud ASR providers via media-understanding

import { log } from "../logging.js";
import { resolveAsrConfig } from "./config.js";
import type { AsrConfig, TranscriptionResult, VadResult } from "./types.js";

const logger = log("asr:processor");

export class AsrProcessor {
  private config: AsrConfig;
  private audioBuffer: Buffer[] = [];

  constructor(config: Partial<AsrConfig> = {}) {
    this.config = resolveAsrConfig(config);
  }

  async initialize(): Promise<void> {
    logger.info("Initializing ASR processor with config:", {
      provider: this.config.provider,
      modelSize: this.config.modelSize,
      vadEnabled: this.config.vadEnabled,
    });
  }

  /**
   * Process audio chunk and optionally perform VAD
   */
  async process(audioChunk: Buffer): Promise<{
    transcript?: TranscriptionResult;
    vad?: VadResult;
  }> {
    this.audioBuffer.push(audioChunk);

    const result: {
      transcript?: TranscriptionResult;
      vad?: VadResult;
    } = {};

    // Simple VAD using energy detection
    if (this.config.vadEnabled) {
      const combinedAudio = Buffer.concat(this.audioBuffer);
      result.vad = this.detectSpeech(combinedAudio);
    }

    // When speech ends (silence detected), transcribe
    if (result.vad?.speech === false && this.audioBuffer.length > 0) {
      const combinedAudio = Buffer.concat(this.audioBuffer);
      result.transcript = await this.transcribe(combinedAudio);
      this.audioBuffer = [];
    }

    return result;
  }

  /**
   * Full audio transcription - delegates to cloud ASR
   */
  async transcribe(audioBuffer: Buffer): Promise<TranscriptionResult> {
    logger.debug(
      `Transcribing audio, buffer size: ${audioBuffer.length}, provider: ${this.config.provider}`,
    );

    // TODO: Integrate with media-understanding module
    // For now, return empty result
    // This will be implemented to call:
    // - transcribeDeepgramAudio from media-understanding/providers/deepgram
    // - transcribeOpenAIAudio from media-understanding/providers/openai
    // - transcribeGroqAudio from media-understanding/providers/groq

    return {
      text: "",
      language: this.config.language,
    };
  }

  /**
   * Simple energy-based VAD
   */
  detectSpeech(audioData: Buffer): VadResult {
    try {
      // Convert to float32
      const int16Array = new Int16Array(
        audioData.buffer,
        audioData.byteOffset,
        audioData.length / 2,
      );
      const float32Array = new Float32Array(int16Array.length);

      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      // Calculate RMS
      let sum = 0;
      for (let i = 0; i < float32Array.length; i++) {
        sum += float32Array[i] * float32Array[i];
      }
      const rms = Math.sqrt(sum / float32Array.length);
      const threshold = this.config.vadSilenceThreshold ?? 0.5;
      const speech = rms > threshold;

      logger.debug(`VAD: rms=${rms.toFixed(4)}, threshold=${threshold}, speech=${speech}`);

      return { speech };
    } catch (error) {
      logger.error("VAD detection error:", error);
      return { speech: true }; // Default to speech on error
    }
  }

  setConfig(config: Partial<AsrConfig>): void {
    this.config = resolveAsrConfig({ ...this.config, ...config });
    logger.info("ASR config updated:", this.config);
  }

  getConfig(): AsrConfig {
    return this.config;
  }

  addAudioChunk(chunk: Buffer): void {
    this.audioBuffer.push(chunk);
  }

  clearAudioBuffer(): void {
    this.audioBuffer = [];
  }

  getAudioBuffer(): Buffer[] {
    return this.audioBuffer;
  }
}
