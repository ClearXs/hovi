"use client";

import type { VRM } from "@pixiv/three-vrm";
import { X, User, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAsr } from "@/features/avatar/hooks/useAsr";
import { convertTextToSpeech, playTtsAudio, stopTtsAudio } from "@/features/avatar/voices";
import { getAgentFile } from "@/features/persona/services/personaApi";
import { useConnectionStore } from "@/stores/connectionStore";
import { Subtitles } from "./Subtitles";
import { VoiceControl } from "./VoiceControl";

// Dynamic import for VrmViewer to avoid SSR issues with @react-three/fiber
const VrmViewer = dynamic(() => import("./VrmViewer").then((mod) => mod.VrmViewer), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
    </div>
  ),
});

export interface Persona {
  id: string;
  name: string;
  vrmUrl?: string;
  refAudio?: string;
  voiceConfig?: {
    provider: string;
    voice: string;
  };
}

interface AvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  persona: Persona | null;
}

export function AvatarModal({ isOpen, onClose, persona }: AvatarModalProps) {
  const wsClient = useConnectionStore((s) => s.wsClient);
  const [currentVrm, setCurrentVrm] = useState<VRM | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingVrm, setIsLoadingVrm] = useState(false);
  const [lipSyncValue, setLipSyncValue] = useState(0);
  const [currentText, setCurrentText] = useState("");
  const [subtitles, setSubtitles] = useState<string[]>([]);
  const [vrmUrl, setVrmUrl] = useState<string | null>(null);

  // Load VRM URL from agent config when persona changes
  useEffect(() => {
    if (!persona?.id || !wsClient) return;

    const loadAgentConfig = async () => {
      try {
        setIsLoadingVrm(true);
        const fileResult = await getAgentFile(wsClient, persona.id, ".identity.json");
        if (fileResult?.ok && fileResult.content) {
          const config = JSON.parse(fileResult.content);
          if (config.vrm) {
            setVrmUrl(config.vrm);
          }
        }
      } catch (error) {
        // Ignore error
      } finally {
        setIsLoadingVrm(false);
      }
    };

    if (isOpen && persona) {
      loadAgentConfig();
    }
  }, [persona, wsClient, isOpen]);

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setCurrentVrm(null);
      setIsRecording(false);
      setIsSpeaking(false);
      setCurrentText("");
      setSubtitles([]);
    }
  }, [isOpen]);

  const handleVrmLoad = (vrm: VRM) => {
    setCurrentVrm(vrm);
  };

  // Handle ASR result - defined before useAsr
  const handleAsrResult = useCallback(
    async (text: string) => {
      if (!text.trim() || !wsClient) return;

      // Show user text
      setCurrentText(text);
      setIsSpeaking(true);

      try {
        // TODO: Send to agent and get response
        // For now, just echo with TTS
        const responseText = `收到：${text}`;
        const audioBuffer = await convertTextToSpeech(wsClient, responseText);
        await playTtsAudio(audioBuffer, () => {
          setIsSpeaking(false);
          setCurrentText("");
        });
      } catch (error) {
        setIsSpeaking(false);
        setCurrentText("");
      }
    },
    [wsClient],
  );

  // ASR hook for voice input
  const {
    isListening,
    transcript,
    error: asrError,
    isSupported: asrSupported,
    start: startAsr,
    stop: stopAsr,
  } = useAsr({
    language: "zh-CN",
    onResult: handleAsrResult,
  });

  const handleRecordingStart = () => {
    // 打断当前说话 - 停止 TTS 播放
    if (isSpeaking) {
      stopTtsAudio();
      setIsSpeaking(false);
      setCurrentText("");
    }

    setIsRecording(true);
    // Start ASR
    startAsr();
  };

  const handleRecordingEnd = async (audioBlob: Blob) => {
    setIsRecording(false);
    stopAsr();
  };

  // Test TTS - 发送文本到 TTS
  const handleTestSpeak = async () => {
    if (!wsClient) return;

    setIsSpeaking(true);
    setCurrentText("你好，我是你的虚拟形象");

    // Start lip sync animation
    let lipSyncInterval: NodeJS.Timeout | null = null;
    lipSyncInterval = setInterval(() => {
      // Simple random lip sync animation
      setLipSyncValue(Math.random() * 0.8 + 0.2);
    }, 100);

    try {
      const audioBuffer = await convertTextToSpeech(wsClient, "你好，我是你的虚拟形象");
      await playTtsAudio(audioBuffer, () => {
        setIsSpeaking(false);
        setCurrentText("");
        setLipSyncValue(0);
        if (lipSyncInterval) clearInterval(lipSyncInterval);
      });
    } catch (error) {
      setIsSpeaking(false);
      setCurrentText("");
      setLipSyncValue(0);
      if (lipSyncInterval) clearInterval(lipSyncInterval);
    }
  };

  const handleSpeakEnd = () => {
    setIsSpeaking(false);
    setCurrentText("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl h-[600px] p-0 overflow-hidden">
        <div className="relative w-full h-full bg-gradient-to-b from-gray-100 to-gray-200">
          {/* VRM Viewer */}
          <div className="absolute inset-0">
            {isLoadingVrm ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-400">加载中...</div>
              </div>
            ) : vrmUrl ? (
              <VrmViewer modelUrl={vrmUrl} onVrmLoad={handleVrmLoad} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <User className="w-16 h-16 mb-4 opacity-50" />
                <p>未配置 VRM 模型</p>
                <p className="text-sm">请在角色设置中配置 VRM 路径</p>
              </div>
            )}
          </div>

          {/* Persona name badge */}
          {persona && (
            <div className="absolute top-4 left-4 px-3 py-1 bg-white/80 rounded-full text-sm font-medium">
              {persona.name}
            </div>
          )}

          {/* 关闭按钮 */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 rounded-full bg-white/80 hover:bg-white"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </Button>

          {/* 底部控制区 */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4">
            {/* 字幕显示 */}
            <Subtitles text={currentText} isSpeaking={isSpeaking} />

            {/* 语音控制 */}
            <VoiceControl
              isRecording={isRecording}
              isSpeaking={isSpeaking}
              onRecordingStart={handleRecordingStart}
              onRecordingEnd={handleRecordingEnd}
              onTestSpeak={handleTestSpeak}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AvatarModal;
