// ASR config tests

import { describe, expect, it } from "vitest";
import {
  resolveAsrConfig,
  resolveTtsConfig,
  validateAsrConfig,
  validateTtsConfig,
  DEFAULT_ASR_CONFIG,
  DEFAULT_TTS_CONFIG,
} from "./config.js";

describe("AsrConfig", () => {
  it("should return default config", () => {
    const config = resolveAsrConfig({});
    expect(config.provider).toBe("deepgram");
    expect(config.modelSize).toBe("tiny");
    expect(config.language).toBe("zh-CN");
    expect(config.vadEnabled).toBe(true);
    expect(config.cloudFallback).toBe(false);
  });

  it("should merge user config", () => {
    const config = resolveAsrConfig({ provider: "openai", language: "en-US" });
    expect(config.provider).toBe("openai");
    expect(config.language).toBe("en-US");
    expect(config.modelSize).toBe("tiny"); // default
  });

  it("should override with user config", () => {
    const config = resolveAsrConfig({
      provider: "groq",
      modelSize: "base",
      vadEnabled: false,
    });
    expect(config.provider).toBe("groq");
    expect(config.modelSize).toBe("base");
    expect(config.vadEnabled).toBe(false);
  });

  it("should validate valid config", () => {
    const valid = {
      provider: "deepgram" as const,
      modelSize: "tiny" as const,
      language: "zh-CN",
    };
    expect(validateAsrConfig(valid)).toBe(true);
  });

  it("should reject invalid provider", () => {
    const invalid = { provider: "invalid" };
    expect(validateAsrConfig(invalid)).toBe(false);
  });

  it("should reject invalid model size", () => {
    const invalid = { provider: "deepgram", modelSize: "huge" };
    expect(validateAsrConfig(invalid)).toBe(false);
  });

  it("should reject non-object config", () => {
    expect(validateAsrConfig(null)).toBe(false);
    expect(validateAsrConfig(undefined)).toBe(false);
    expect(validateAsrConfig("string")).toBe(false);
  });
});

describe("TtsConfig", () => {
  it("should return default config", () => {
    const config = resolveTtsConfig({});
    expect(config.provider).toBe("elevenlabs");
    expect(config.modelId).toBe("eleven_multilingual_v2");
    expect(config.voiceSettings?.stability).toBe(0.5);
    expect(config.voiceSettings?.similarityBoost).toBe(0.75);
  });

  it("should merge user config", () => {
    const config = resolveTtsConfig({ provider: "openai", apiKey: "test-key" });
    expect(config.provider).toBe("openai");
    expect(config.apiKey).toBe("test-key");
  });

  it("should validate valid config", () => {
    const valid = {
      provider: "elevenlabs" as const,
      voiceId: "test-voice",
    };
    expect(validateTtsConfig(valid)).toBe(true);
  });

  it("should reject invalid provider", () => {
    const invalid = { provider: "invalid" };
    expect(validateTtsConfig(invalid)).toBe(false);
  });
});

describe("DEFAULT configs", () => {
  it("should have valid ASR defaults", () => {
    expect(DEFAULT_ASR_CONFIG.provider).toBe("deepgram");
    expect(DEFAULT_ASR_CONFIG.modelSize).toBe("tiny");
    expect(DEFAULT_ASR_CONFIG.vadEnabled).toBe(true);
  });

  it("should have valid TTS defaults", () => {
    expect(DEFAULT_TTS_CONFIG.provider).toBe("elevenlabs");
    expect(DEFAULT_TTS_CONFIG.modelId).toBe("eleven_multilingual_v2");
  });
});
