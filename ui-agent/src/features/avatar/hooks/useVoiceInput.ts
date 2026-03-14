"use client";

import { useState, useCallback, useEffect } from "react";
import { useConnectionStore } from "@/stores/connectionStore";
import { useSessionStore } from "@/stores/sessionStore";
import { convertTextToSpeech, playTtsAudio, stopTtsAudio } from "../voices";
import { useAsr } from "./useAsr";

export type VoiceStatus = "idle" | "listening" | "processing" | "speaking";

export interface UseVoiceInputOptions {
  onStatusChange?: (status: VoiceStatus) => void;
}

export interface UseVoiceInputReturn {
  status: VoiceStatus;
  transcript: string;
  responseText: string;
  error: string | null;
  isSupported: boolean;
  toggle: () => void;
  interrupt: () => void;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const { onStatusChange } = options;
  const wsClient = useConnectionStore((s) => s.wsClient);
  const { createSession, selectSession, activeSessionKey } = useSessionStore();

  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [responseText, setResponseText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // ASR callback
  const handleAsrResult = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      setTranscript(text);
      setStatus("processing");
      onStatusChange?.("processing");

      try {
        // 获取或创建会话
        let sessionKey: string | null = activeSessionKey;
        if (!sessionKey) {
          sessionKey = await createSession("语音对话");
          if (sessionKey) {
            selectSession(sessionKey);
          }
        }

        if (!sessionKey || !wsClient) {
          setError("会话创建失败");
          setStatus("idle");
          onStatusChange?.("idle");
          return;
        }

        // 发送消息到 chat API
        const response = await wsClient.sendRequest<{ ok: boolean; error?: string }>("chat.send", {
          sessionKey,
          message: text,
        });

        if (!response.ok) {
          setError(response.error || "Hovi 回复失败");
          setStatus("idle");
          onStatusChange?.("idle");
          return;
        }

        // TODO: 获取 Hovi 回复文本（需要根据实际返回格式调整）
        const hoviReply = "Hovi 回复内容"; // 需要从响应中提取
        setResponseText(hoviReply);
        setStatus("speaking");
        onStatusChange?.("speaking");

        // TTS 播放
        const audioBuffer = await convertTextToSpeech(wsClient, hoviReply);
        await playTtsAudio(audioBuffer, () => {
          setStatus("idle");
          onStatusChange?.("idle");
          setTranscript("");
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "处理失败");
        setStatus("idle");
        onStatusChange?.("idle");
      }
    },
    [wsClient, activeSessionKey, createSession, selectSession, onStatusChange],
  );

  // 初始化 ASR - 默认使用 Gateway 模式以支持云端 ASR
  const asr = useAsr({
    language: "zh-CN",
    useGateway: true, // 启用 Gateway ASR 模式
    onResult: handleAsrResult,
    onEnd: () => {
      if (status === "listening") {
        setStatus("idle");
        onStatusChange?.("idle");
      }
    },
    onError: (err) => {
      setError(err);
      setStatus("idle");
      onStatusChange?.("idle");
    },
  });

  // 切换语音输入
  const toggle = useCallback(() => {
    console.log(
      "[useVoiceInput] toggle called, current status:",
      status,
      "asr.isSupported:",
      asr.isSupported,
    );
    if (status === "idle") {
      if (!asr.isSupported) {
        setError("浏览器不支持语音识别");
        console.log("[useVoiceInput] ASR not supported");
        return;
      }
      setError(null);
      setTranscript("");
      asr.start();
      setStatus("listening");
      onStatusChange?.("listening");
    } else if (status === "listening") {
      asr.stop();
      setStatus("idle");
      onStatusChange?.("idle");
    }
    // processing 和 speaking 状态忽略
  }, [status, onStatusChange, asr]);

  // 打断当前播放
  const interrupt = useCallback(() => {
    if (status === "speaking") {
      stopTtsAudio();
      setStatus("idle");
      onStatusChange?.("idle");
      setResponseText("");
    }
  }, [status, onStatusChange]);

  // 快捷键处理 - 使用 Ctrl+X (和 Violet 一样)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts during IME composition
      if (e.isComposing) {
        return;
      }
      // 使用 Ctrl+X 快捷键，与 Violet 一致
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") {
        e.preventDefault();
        console.log("[useVoiceInput] Ctrl+X pressed, status:", status);
        if (status === "speaking") {
          interrupt();
        } else if (status !== "processing") {
          toggle();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [status, toggle, interrupt]);

  return {
    status,
    transcript,
    responseText,
    error,
    isSupported: asr.isSupported,
    toggle,
    interrupt,
  };
}
