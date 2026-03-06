// sherpa-onnx ASR module - uses onnxruntime-node to load ASR model

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { InferenceSession, Tensor } from "onnxruntime-node";
import { getLogger } from "../logging.js";
import type { TranscriptionResult, AsrModelSize } from "./types.js";

const logger = getLogger("asr:sherpa");

export interface SherpaAsrConfig {
  runtimeDir?: string;
  modelDir?: string;
  modelType?: "whisper" | "paraformer";
  modelSize?: AsrModelSize;
  language?: string;
  sampleRate?: number;
}

export interface AsrResult {
  text: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  language?: string;
}

/**
 * sherpa-onnx ASR using onnxruntime-node or CLI
 * Uses whisper/paraformer models for speech recognition
 */
export class SherpaAsr {
  private config: SherpaAsrConfig;
  private session: InferenceSession | null = null;
  private isInitialized: boolean = false;

  constructor(config: SherpaAsrConfig) {
    this.config = {
      modelType: "whisper",
      modelSize: "tiny",
      language: "zh-CN",
      sampleRate: 16000,
      ...config,
    };
  }

  /**
   * Get default model directory based on agent workspace
   */
  static getDefaultModelDir(agentId: string): string {
    return path.join(
      process.env.HOME || "~",
      ".openclaw",
      "agents",
      agentId,
      "models",
      "sherpa-asr",
    );
  }

  /**
   * Get model path based on model type and size
   */
  private getModelPath(): string {
    const modelDir = this.config.modelDir || "";
    const modelType = this.config.modelType || "whisper";
    const modelSize = this.config.modelSize || "tiny";

    // Model naming convention varies by type
    // whisper models: tiny, base, small, medium, large
    // paraformer models: tiny, small, large
    return path.join(modelDir, modelType, modelSize);
  }

  /**
   * Initialize ASR - load ONNX model
   */
  async initialize(): Promise<void> {
    const modelPath = this.getModelPath();
    const modelDir = this.config.modelDir || "";

    if (!modelDir) {
      throw new Error("ASR model directory not configured");
    }

    logger.info(`Initializing sherpa-onnx ASR, model: ${modelPath}`);

    // Check if model directory exists
    if (!fs.existsSync(modelDir)) {
      throw new Error(
        `ASR model directory not found: ${modelDir}. Please download whisper/paraformer model.`,
      );
    }

    // Try to find model files
    const modelFiles = this.findModelFiles(modelDir);

    if (modelFiles.length === 0) {
      throw new Error(`No ONNX model files found in: ${modelDir}`);
    }

    try {
      // For whisper, there might be multiple files (encoder, decoder)
      // For simplicity, we try to load the first ONNX file found
      // A more complete implementation would handle both encoder and decoder
      this.session = await InferenceSession.create(modelFiles[0]);
      this.isInitialized = true;
      logger.info("Sherpa-onnx ASR initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize ASR:", error);
      throw error;
    }
  }

  /**
   * Find ONNX model files in directory
   */
  private findModelFiles(dir: string): string[] {
    const files: string[] = [];

    if (!fs.existsSync(dir)) {
      return files;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isFile() && entry.name.endsWith(".onnx")) {
        files.push(fullPath);
      } else if (entry.isDirectory()) {
        // Recursively search subdirectories
        files.push(...this.findModelFiles(fullPath));
      }
    }

    return files;
  }

  /**
   * Transcribe audio data
   * @param audioData 16-bit PCM audio data
   * @returns TranscriptionResult
   */
  async transcribe(audioData: Buffer): Promise<TranscriptionResult> {
    if (!this.isInitialized) {
      throw new Error("ASR not initialized");
    }

    // Convert to float32
    const float32Data = this.convertToFloat32(audioData);

    // Create input tensor
    const inputTensor = new Tensor("float32", float32Data, [1, float32Data.length]);

    try {
      // Run inference
      const outputs = await this.session!.run({ input: inputTensor });

      // Parse output - this depends on model structure
      // For whisper, output needs decoding
      const text = this.parseOutput(outputs);

      return {
        text,
        language: this.config.language,
      };
    } catch (error) {
      logger.error("ASR transcription error:", error);
      throw error;
    }
  }

  /**
   * Stream transcribe - for real-time subtitle
   */
  async transcribeStream(audioChunk: Buffer): Promise<TranscriptionResult> {
    // For streaming, we would accumulate audio and process
    // This is a placeholder for real-time processing
    return this.transcribe(audioChunk);
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
   * Parse model output to text
   * Note: This is a simplified version. Actual implementation
   * depends on the specific model structure (whisper vs paraformer)
   */
  private parseOutput(outputs: Record<string, Tensor>): string {
    // For now, return empty string
    // A complete implementation would decode the model output
    // using the tokens file

    logger.debug("ASR output:", outputs);

    // Example: If output is token IDs, decode using tokens.txt
    // This requires the tokens file to be loaded during initialization

    return "";
  }

  /**
   * Check if ASR is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.session !== null;
  }

  /**
   * Get model information
   */
  getModelInfo(): { type: string; size: string; language: string } {
    return {
      type: this.config.modelType || "whisper",
      size: this.config.modelSize || "tiny",
      language: this.config.language || "zh-CN",
    };
  }

  /**
   * Destroy ASR instance
   */
  destroy(): void {
    this.session = null;
    this.isInitialized = false;
    logger.info("Sherpa-onnx ASR destroyed");
  }
}

/**
 * Alternative: Use sherpa-onnx CLI for ASR
 * This is more reliable as sherpa-onnx has proper CLI tools
 */
export class SherpaAsrCli {
  private config: SherpaAsrConfig;
  private runtimeDir: string;

  constructor(config: SherpaAsrConfig) {
    this.config = config;
    this.runtimeDir = config.runtimeDir || "";
  }

  /**
   * Transcribe using sherpa-onnx CLI
   */
  async transcribe(audioData: Buffer, _outputPath: string): Promise<TranscriptionResult> {
    // Write audio to temp file
    const tempInput = `/tmp/sherpa-asr-input-${Date.now()}.wav`;
    fs.writeFileSync(tempInput, audioData);

    return new Promise((resolve, reject) => {
      const args = [
        "--help", // For now, just show help
      ];

      const proc = spawn(path.join(this.runtimeDir, "bin", "sherpa-onnx-online"), args, {
        env: {
          ...process.env,
          SHERPA_ONNX_RUNTIME_DIR: this.runtimeDir,
        },
      });

      let output = "";
      let errorOutput = "";

      proc.stdout.on("data", (data) => {
        output += data.toString();
      });

      proc.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      proc.on("close", (code) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempInput);
        } catch {}

        if (code !== 0) {
          logger.error("Sherpa CLI error:", errorOutput);
          reject(new Error(`Sherpa CLI exited with code ${code}`));
        } else {
          resolve({
            text: output,
            language: this.config.language,
          });
        }
      });
    });
  }
}

/**
 * Factory function to create SherpaAsr instance
 */
export function createSherpaAsr(config: SherpaAsrConfig): SherpaAsr {
  return new SherpaAsr(config);
}
