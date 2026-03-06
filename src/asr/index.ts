// ASR module exports

export * from "./types.js";
export * from "./config.js";
export { AsrProcessor } from "./processor.js";
export * from "./elevenlabs.js";

// sherpa-onnx VAD and ASR
export { SherpaVad, createSherpaVad } from "./vad-sherpa.js";
export type { SherpaVadConfig, VadResult as SherpaVadResult } from "./vad-sherpa.js";

export { SherpaAsr, SherpaAsrCli, createSherpaAsr } from "./asr-sherpa.js";
export type { SherpaAsrConfig, AsrResult as SherpaAsrResult } from "./asr-sherpa.js";

export { AsrFallback, createAsrFallback } from "./asr-fallback.js";
export type { FallbackConfig } from "./asr-fallback.js";
