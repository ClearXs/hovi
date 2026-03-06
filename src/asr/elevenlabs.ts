// ElevenLabs voice cloning API

import { getLogger } from "../logging.js";

const logger = getLogger("asr:elevenlabs");

export interface VoiceCloneResult {
  voiceId: string;
  name: string;
  description?: string;
}

export interface VoiceSettings {
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
}

/**
 * Create a voice clone from audio file
 */
export async function createVoiceClone(
  apiKey: string,
  audioBuffer: Buffer,
  name: string,
  description?: string,
): Promise<VoiceCloneResult> {
  logger.info("Creating voice clone:", name);

  const formData = new FormData();
  formData.append("name", name);
  if (description) {
    formData.append("description", description);
  }
  formData.append("files", new Blob([audioBuffer]), "audio.wav");

  const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voice cloning failed (${response.status}): ${error}`);
  }

  const result = await response.json();
  logger.info("Voice clone created:", result.voice_id);

  return {
    voiceId: result.voice_id,
    name: result.name,
    description: result.description,
  };
}

/**
 * Delete a cloned voice
 */
export async function deleteVoice(apiKey: string, voiceId: string): Promise<void> {
  logger.info("Deleting voice:", voiceId);

  const response = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
    method: "DELETE",
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Delete voice failed (${response.status}): ${error}`);
  }

  logger.info("Voice deleted:", voiceId);
}

/**
 * List all voices (including cloned ones)
 */
export async function listVoices(apiKey: string): Promise<VoiceCloneResult[]> {
  logger.info("Listing voices");

  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`List voices failed (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.voices.map((v: Record<string, string>) => ({
    voiceId: v.voice_id,
    name: v.name,
    description: v.description,
  }));
}

/**
 * Get voice details
 */
export async function getVoice(apiKey: string, voiceId: string): Promise<VoiceCloneResult> {
  const response = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Get voice failed (${response.status}): ${error}`);
  }

  const v = await response.json();
  return {
    voiceId: v.voice_id,
    name: v.name,
    description: v.description,
  };
}

/**
 * Text to speech using ElevenLabs
 */
export async function textToSpeech(
  apiKey: string,
  voiceId: string,
  text: string,
  modelId: string = "eleven_multilingual_v2",
  voiceSettings?: Partial<VoiceSettings>,
): Promise<Buffer> {
  logger.debug("TTS request:", { voiceId, textLength: text.length, modelId });

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: voiceSettings ?? {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        speed: 1.0,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TTS failed (${response.status}): ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
