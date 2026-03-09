// ASR Hook - supports both Web Speech API and Gateway ASR

import { useState, useCallback, useRef, useEffect } from "react";
import { useConnectionStore } from "@/stores/connectionStore";
import { WebSpeechRecognizer } from "../voices/asr";

export interface UseAsrOptions {
  language?: string;
  onResult?: (text: string) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
  useGateway?: boolean; // Use Gateway ASR instead of Web Speech API
}

export interface UseAsrReturn {
  isListening: boolean;
  transcript: string;
  error: string | null;
  isSupported: boolean;
  start: () => void;
  stop: () => void;
}

export function useAsr(options: UseAsrOptions = {}): UseAsrReturn {
  const { language = "zh-CN", onResult, onEnd, onError, useGateway = false } = options;
  const wsClient = useConnectionStore((s) => s.wsClient);

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  const recognizerRef = useRef<WebSpeechRecognizer | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Initialize Web Speech API recognizer
  useEffect(() => {
    recognizerRef.current = new WebSpeechRecognizer();
    setIsSupported(recognizerRef.current.isSupported());
    return () => {
      recognizerRef.current?.stop();
    };
  }, []);

  // Start recognition using Web Speech API
  const startWebSpeech = useCallback(() => {
    if (!recognizerRef.current) {
      setError("Speech recognition not initialized");
      return;
    }

    if (!recognizerRef.current.isSupported()) {
      setError("Browser does not support speech recognition");
      return;
    }

    setError(null);
    setTranscript("");

    recognizerRef.current.setLanguage(language);
    recognizerRef.current.start(
      (text) => {
        setTranscript(text);
        onResult?.(text);
      },
      () => {
        setIsListening(false);
        onEnd?.();
      },
      (err) => {
        setError(err);
        setIsListening(false);
        onError?.(err);
      },
    );

    setIsListening(true);
  }, [language, onResult, onEnd, onError]);

  // Start recognition using Gateway ASR (MediaRecorder + RPC)
  const startGateway = useCallback(async () => {
    console.log(
      "[useAsr] startGateway called, wsClient:",
      !!wsClient,
      "wsClient.isConnected:",
      wsClient?.isConnected?.(),
    );

    if (!wsClient) {
      console.error("[useAsr] WebSocket client not connected!");
      setError("WebSocket client not connected");
      return;
    }

    if (!wsClient.isConnected()) {
      console.error("[useAsr] WebSocket not connected!");
      setError("WebSocket not connected");
      return;
    }

    setError(null);
    setTranscript("");
    audioChunksRef.current = [];

    try {
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log("[useAsr] Recording stopped, audio chunks:", audioChunksRef.current.length);

        // Convert audio chunks to blob
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        console.log("[useAsr] Audio blob size:", audioBlob.size);

        // Convert to base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];
          console.log("[useAsr] Sending to ASR, base64 length:", base64.length);

          try {
            // Send to Gateway ASR
            const result = await wsClient.sendRequest<{ text: string; error?: string }>(
              "asr.transcribe",
              {
                audioBase64: base64,
                language,
              },
            );

            console.log("[useAsr] ASR result:", result);

            if (result.text) {
              setTranscript(result.text);
              onResult?.(result.text);
            } else if (result.error) {
              console.error("[useAsr] ASR error:", result.error);
              setError(result.error);
              onError?.(result.error);
            }
          } catch (err) {
            console.error("[useAsr] ASR request failed:", err);
            const errorMsg = err instanceof Error ? err.message : "ASR transcription failed";
            setError(errorMsg);
            onError?.(errorMsg);
          }

          // Stop all tracks
          stream.getTracks().forEach((track) => track.stop());
          setIsListening(false);
          onEnd?.();
        };
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms
      setIsListening(true);
      console.log("[useAsr] Recording started, useGateway:", useGateway);
    } catch (err) {
      console.error("[useAsr] Failed to start recording:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to start recording";
      setError(errorMsg);
      onError?.(errorMsg);
    }
  }, [wsClient, language, onResult, onEnd, onError]);

  // Main start function
  const start = useCallback(() => {
    console.log("[useAsr] start called, useGateway:", useGateway, "wsClient:", !!wsClient);
    if (useGateway && wsClient) {
      console.log("[useAsr] Using Gateway mode");
      startGateway();
    } else {
      console.log("[useAsr] Using Web Speech API");
      startWebSpeech();
    }
  }, [useGateway, wsClient, startGateway, startWebSpeech]);

  // Stop function
  const stop = useCallback(() => {
    if (useGateway && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    } else {
      recognizerRef.current?.stop();
    }
    setIsListening(false);
  }, [useGateway]);

  return {
    isListening,
    transcript,
    error,
    isSupported,
    start,
    stop,
  };
}
