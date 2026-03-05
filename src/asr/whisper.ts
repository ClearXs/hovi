// Whisper module - placeholder for local Whisper integration
// Currently uses cloud ASR via media-understanding

import { log } from "../logging.js";
import type { TranscriptionResult, AsrModelSize } from "./types.js";

const logger = log("asr:whisper");

/**
 * Local Whisper implementation placeholder
 *
 * This module is reserved for future local Whisper integration.
 * Currently, ASR uses cloud providers via media-understanding.
 *
 * To implement local Whisper:
 * 1. Use whisper.cpp with Node.js bindings
 * 2. Use whisper-wasm (WebAssembly)
 * 3. Use faster-whisper in a Python subprocess
 */
export class LocalWhisper {
  private modelSize: AsrModelSize;
  private isInitialized: boolean = false;
  private modelPath?: string;

  constructor(modelSize: AsrModelSize = "tiny", modelPath?: string) {
    this.modelSize = modelSize;
    this.modelPath = modelPath;
    logger.info(`LocalWhisper initialized with size: ${modelSize}`);
  }

  /**
   * Initialize the Whisper model
   * Currently not implemented - using cloud ASR instead
   */
  async initialize(): Promise<void> {
    logger.info(`Initializing local Whisper model: ${this.modelSize}`);
    // TODO: Implement local model loading
    // Options:
    // 1. whisper-wasm: WebAssembly-based whisper
    // 2. whisper.cpp with node bindings
    // 3. Python faster-whisper subprocess
    this.isInitialized = false;
  }

  /**
   * Transcribe audio buffer
   * Currently not implemented - using cloud ASR instead
   */
  async transcribe(_audioBuffer: Buffer): Promise<TranscriptionResult> {
    logger.warn("Local Whisper transcribe not implemented, use cloud ASR");
    return {
      text: "",
      language: "zh",
    };
  }

  /**
   * Check if model is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get model information
   */
  getModelInfo(): { size: string; name: string; local: boolean } {
    return {
      size: this.modelSize,
      name: `whisper-${this.modelSize}`,
      local: false, // Currently using cloud
    };
  }

  /**
   * Download model files
   * Reserved for future implementation
   */
  async downloadModel(): Promise<void> {
    logger.info(`Downloading Whisper model: ${this.modelSize}`);
    // TODO: Implement model download
  }

  /**
   * Check if model exists locally
   */
  async hasModel(): Promise<boolean> {
    // TODO: Check if model files exist
    return false;
  }
}

/**
 * Get singleton instance of LocalWhisper
 */
let whisperInstance: LocalWhisper | null = null;

export function getWhisper(modelSize: AsrModelSize = "tiny"): LocalWhisper {
  if (!whisperInstance) {
    whisperInstance = new LocalWhisper(modelSize);
  }
  return whisperInstance;
}

export function resetWhisper(): void {
  whisperInstance = null;
}
