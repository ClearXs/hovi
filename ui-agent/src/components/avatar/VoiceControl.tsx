"use client";

import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface VoiceControlProps {
  isRecording: boolean;
  isSpeaking: boolean;
  onRecordingStart: () => void;
  onRecordingEnd: (audioBlob: Blob) => void;
  onTestSpeak?: () => void;
}

export function VoiceControl({
  isRecording,
  isSpeaking,
  onRecordingStart,
  onRecordingEnd,
  onTestSpeak,
}: VoiceControlProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // 请求麦克风权限
  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setHasPermission(true);
    } catch (error) {
      setHasPermission(false);
    }
  }, []);

  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  const handleMouseDown = () => {
    if (!hasPermission) {
      requestPermission();
      return;
    }
    onRecordingStart();
    startRecording();
  };

  const handleMouseUp = () => {
    if (isRecording) {
      stopRecording();
      onRecordingEnd(new Blob(audioChunksRef.current, { type: "audio/webm" }));
    }
  };

  const handleMouseLeave = () => {
    if (isRecording) {
      handleMouseUp();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100); // 每 100ms 收集一次数据
    } catch (error) {
      // Ignore error
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
  };

  return (
    <div className="flex items-center gap-4">
      {/* Test speak button */}
      {onTestSpeak && (
        <Button
          size="lg"
          variant="outline"
          className="rounded-full w-12 h-12"
          onClick={onTestSpeak}
          disabled={isSpeaking || isRecording}
          title="测试语音"
        >
          {isSpeaking ? (
            <Volume2 className="w-5 h-5 animate-pulse" />
          ) : (
            <Volume2 className="w-5 h-5" />
          )}
        </Button>
      )}

      {/* Microphone button */}
      <Button
        size="lg"
        className={`w-16 h-16 rounded-full transition-all ${
          isRecording
            ? "bg-red-500 hover:bg-red-600 animate-pulse"
            : hasPermission === false
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-primary hover:bg-primary/90"
        }`}
        onClick={() => {}}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        disabled={hasPermission === false || isSpeaking}
      >
        {isRecording ? (
          <MicOff className="w-6 h-6 text-white" />
        ) : hasPermission === false ? (
          <MicOff className="w-6 h-6 text-white/50" />
        ) : (
          <Mic className="w-6 h-6 text-white" />
        )}
      </Button>
    </div>
  );
}

export default VoiceControl;
