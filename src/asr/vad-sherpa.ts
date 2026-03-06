// sherpa-onnx VAD module - uses onnxruntime-node to load VAD model

import fs from "node:fs";
import path from "node:path";
import { InferenceSession, Tensor } from "onnxruntime-node";
import { getLogger } from "../logging.js";

const logger = getLogger("asr:vad-sherpa");

export interface SherpaVadConfig {
  runtimeDir: string;
  modelPath?: string;
  threshold?: number; // 0.0-1.0, 默认 0.5
  minSpeechDuration?: number; // 最小语音时长 (ms), 默认 300
  minSilenceDuration?: number; // 最小静音时长 (ms), 默认 700
}

export interface VadResult {
  speech: boolean;
  start?: number;
  end?: number;
  confidence: number;
}

/**
 * sherpa-onnx VAD using onnxruntime-node
 * Uses silero_vad.onnx model for voice activity detection
 */
export class SherpaVad {
  private config: SherpaVadConfig;
  private session: InferenceSession | null = null;
  private isInitialized: boolean = false;

  // State for continuous VAD
  private speechStartTime: number | null = null;
  private silenceStartTime: number | null = null;

  constructor(config: SherpaVadConfig) {
    this.config = {
      threshold: 0.5,
      minSpeechDuration: 300,
      minSilenceDuration: 700,
      ...config,
    };
  }

  /**
   * Get default model path based on agent workspace
   */
  static getDefaultModelPath(agentId: string): string {
    return path.join(
      process.env.HOME || "~",
      ".openclaw",
      "agents",
      agentId,
      "models",
      "sherpa-vad",
      "silero_vad.onnx",
    );
  }

  /**
   * Initialize VAD - load ONNX model using onnxruntime-node
   */
  async initialize(): Promise<void> {
    const modelPath = this.config.modelPath || "";

    if (!modelPath) {
      throw new Error("VAD model path not configured");
    }

    logger.info(`Initializing sherpa-onnx VAD, model: ${modelPath}`);

    // Check if model exists
    if (!fs.existsSync(modelPath)) {
      throw new Error(`VAD model not found: ${modelPath}. Please download silero_vad.onnx`);
    }

    try {
      // Load ONNX model using onnxruntime-node
      this.session = await InferenceSession.create(modelPath);
      this.isInitialized = true;
      logger.info("Sherpa-onnx VAD initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize VAD:", error);
      throw error;
    }
  }

  /**
   * Process audio data and detect speech
   * @param audioData 16-bit PCM audio data
   * @returns VadResult with speech detection result
   */
  async process(audioData: Buffer): Promise<VadResult> {
    if (!this.session || !this.isInitialized) {
      throw new Error("VAD not initialized");
    }

    // Convert 16-bit PCM to float32
    const float32Data = this.convertToFloat32(audioData);

    // Create input tensor
    // Note: silero_vad expects specific input shape
    // For streaming, we use chunk-based processing
    const inputTensor = new Tensor("float32", float32Data, [1, float32Data.length]);

    try {
      // Run inference
      const outputs = await this.session.run({ input: inputTensor });

      // Parse output - silero_vad outputs speech probability
      // Output shape: [1, 1] or [1]
      const outputData = outputs.output0?.data || outputs[Object.keys(outputs)[0]]?.data;

      if (!outputData || !(outputData instanceof Float32Array)) {
        logger.warn("Invalid VAD output format");
        return { speech: false, confidence: 0 };
      }

      // Get the average speech probability
      let sum = 0;
      for (let i = 0; i < outputData.length; i++) {
        sum += outputData[i];
      }
      const speechProb = sum / outputData.length;
      const isSpeech = speechProb >= (this.config.threshold || 0.5);

      return {
        speech: isSpeech,
        confidence: speechProb,
        start: isSpeech ? Date.now() : undefined,
        end: !isSpeech ? Date.now() : undefined,
      };
    } catch (error) {
      logger.error("VAD processing error:", error);
      return { speech: false, confidence: 0 };
    }
  }

  /**
   * Process streaming audio with state tracking
   * @param audioChunk Audio chunk (16-bit PCM)
   * @param sampleRate Sample rate (default 16000)
   */
  processStream(audioChunk: Buffer, _sampleRate: number = 16000): VadResult {
    const result = this.processSync(audioChunk);
    const now = Date.now();

    if (result.speech) {
      // Speech detected
      if (this.speechStartTime === null) {
        this.speechStartTime = now;
      }
      this.silenceStartTime = null;
    } else {
      // Silence detected
      if (this.silenceStartTime === null) {
        this.silenceStartTime = now;
      }
    }

    // Add timing information
    return {
      ...result,
      start: this.speechStartTime || undefined,
      end: this.silenceStartTime || undefined,
    };
  }

  /**
   * Synchronous VAD processing (for real-time use)
   */
  private processSync(audioData: Buffer): VadResult {
    if (!this.session || !this.isInitialized) {
      return { speech: false, confidence: 0 };
    }

    // float32Data reserved for future processing
    this.convertToFloat32(audioData);

    // Synchronous inference is not directly available in onnxruntime-node
    // This is a placeholder - actual implementation would need async
    return { speech: false, confidence: 0 };
  }

  /**
   * Convert 16-bit PCM to float32
   */
  private convertToFloat32(buffer: Buffer): Float32Array {
    const int16Array = new Int16Array(
      buffer.buffer,
      buffer.byteOffset,
      Math.floor(buffer.length / 2),
    );
    const float32Array = new Float32Array(int16Array.length);

    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    return float32Array;
  }

  /**
   * Check if VAD is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.session !== null;
  }

  /**
   * Reset VAD state
   */
  reset(): void {
    this.speechStartTime = null;
    this.silenceStartTime = null;
  }

  /**
   * Destroy VAD instance
   */
  destroy(): void {
    this.session = null;
    this.isInitialized = false;
    this.reset();
    logger.info("Sherpa-onnx VAD destroyed");
  }

  /**
   * Get VAD configuration
   */
  getConfig(): SherpaVadConfig {
    return { ...this.config };
  }

  /**
   * Update VAD configuration
   */
  setConfig(config: Partial<SherpaVadConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Factory function to create SherpaVad instance
 */
export function createSherpaVad(config: SherpaVadConfig): SherpaVad {
  return new SherpaVad(config);
}
