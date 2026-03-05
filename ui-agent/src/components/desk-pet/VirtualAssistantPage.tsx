"use client";

import {
  Eye,
  EyeOff,
  Minimize2,
  Maximize2,
  Subtitles,
  Settings,
  Mic,
  MicOff,
  GripVertical,
  User,
  X,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import dynamic from "next/dynamic";
import React, { useState, useCallback, useEffect, useRef } from "react";
import { SettingsPanel } from "@/components/desk-pet/SettingsPanel";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useVoiceInput } from "@/features/avatar/hooks/useVoiceInput";
import { getAgentFile } from "@/features/persona/services/personaApi";
import type { MotionConfig } from "@/features/persona/types/persona";
import { useAvatarStateStore, type AvatarStatePayload } from "@/stores/avatarStateStore";
import { useConnectionStore } from "@/stores/connectionStore";

// MotionItem 类型（从 SettingsPanel 复制）
interface MotionItem {
  id: string;
  file: string;
  thumbnail?: string;
  type: "idle" | "emote";
  keywords?: string[];
  description?: string;
}

// Dynamic import for VrmViewer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const VrmViewer = dynamic(
  () => import("@/components/avatar/VrmViewer").then((mod) => mod.VrmViewer),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center text-gray-400">加载中...</div>
    ),
  },
) as any;

interface VirtualAssistantPageProps {
  onClose?: () => void;
}

export function VirtualAssistantPage({ onClose }: VirtualAssistantPageProps) {
  const wsClient = useConnectionStore((s) => s.wsClient);
  const status = useConnectionStore((s) => s.status);
  const AGENT_ID = "main";

  // Avatar 状态（来自工具事件）
  const avatarState = useAvatarStateStore((s) => s.currentState);

  // 状态
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [vrmUrl, setVrmUrl] = useState<string | null>(null);
  const [motionUrl, setMotionUrl] = useState<string | null>(null);
  const [motionConfig, setMotionConfig] = useState<MotionConfig | null>(null);
  const [vrmLoading, setVrmLoading] = useState(false);
  const [vrmError, setVrmError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // VrmViewer ref
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vrmViewerRef = useRef<any>(null);

  // 语音输入
  const {
    status: voiceStatus,
    transcript,
    responseText,
    error: voiceError,
    toggle: handleToggleVoice,
  } = useVoiceInput({
    onStatusChange: (s) => console.log("[Voice] Status changed to:", s),
  });

  // 按钮拖动状态
  const [btnPosition, setBtnPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingBtn, setIsDraggingBtn] = useState(false);
  const btnDragInfo = useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0 });

  const isConnected = status === "connected";

  // 预览动作
  const handlePreviewMotion = useCallback(
    (motion: MotionItem) => {
      console.log("[Preview] handlePreviewMotion called:", motion);
      const controller = vrmViewerRef.current?.getController();
      console.log("[Preview] controller:", controller);

      if (controller) {
        // 确保设置 motionBasePath
        if (vrmUrl) {
          const urlParts = vrmUrl.split("/");
          const filesIndex = urlParts.indexOf("files");
          if (filesIndex !== -1) {
            // 不需要加前导斜杠，因为 vrmUrl 已经是 /files/... 格式
            const basePath = urlParts.slice(0, filesIndex + 2).join("/");
            controller.setMotionBasePath(basePath);
            console.log("[Preview] Set motionBasePath:", basePath);
          }
        }

        console.log("[Preview] Playing motion:", motion);
        if (motion.type === "idle") {
          // 对于 idle，播放 idle 动作
          controller.playIdleMotion();
        } else {
          // 对于 emote，直接根据 file 路径播放
          controller.playMotionByFile(motion.file, false);
        }
      } else {
        console.warn("[Preview] AvatarController not available");
      }
    },
    [vrmUrl],
  );

  // 加载 VRM 配置
  const loadConfig = useCallback(async () => {
    if (!wsClient || !isConnected) return;
    try {
      setVrmError(false);
      setVrmLoading(true);
      setVrmUrl(null);
      console.log("[VRM] Loading config for agent:", AGENT_ID);
      const fileResult = await getAgentFile(wsClient, AGENT_ID, "persona.json");
      console.log("[VRM] Config file result:", fileResult);

      // 检查文件是否存在且有内容
      const content = fileResult?.content;
      if (content) {
        const trimmed = content.trim();
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          try {
            const config = JSON.parse(trimmed);
            console.log("[VRM] Parsed config:", config, "vrm value:", config.vrm);
            if (config.vrm) {
              const url = `/files/${AGENT_ID}/${config.vrm}`;
              console.log("[VRM] Setting URL:", url);
              setVrmUrl(url);

              // 加载动作 - 支持新旧格式
              let motionUrlValue: string | null = null;
              if (config.currentMotion) {
                // 新格式: { idle: "motions/xxx.vmd" }
                if (typeof config.currentMotion === "object" && config.currentMotion.idle) {
                  motionUrlValue = config.currentMotion.idle;
                } else if (typeof config.currentMotion === "string") {
                  // 旧格式: "motions/xxx.vmd"
                  motionUrlValue = config.currentMotion;
                }
              } else if (config.idleMotion) {
                // 更早的旧格式
                motionUrlValue = config.idleMotion;
              } else if (config.motions?.idle?.file) {
                // 从 motions.idle 读取
                motionUrlValue = config.motions.idle.file;
              }

              if (motionUrlValue) {
                const mUrl = `/files/${AGENT_ID}/${motionUrlValue}`;
                console.log("[VRM] Setting motion URL:", mUrl);
                setMotionUrl(mUrl);
              } else {
                setMotionUrl(null);
              }

              // 加载 Motion 配置（用于 AvatarController）
              if (config.motions) {
                console.log("[VRM] Setting motionConfig:", config.motions);
                setMotionConfig(config.motions);
              }

              setVrmLoading(false);
            } else {
              console.log("[VRM] No vrm in config");
              setVrmLoading(false);
            }
          } catch (e) {
            console.error("[VRM] JSON parse error:", e);
            setVrmLoading(false);
          }
        } else {
          console.log("[VRM] persona.json is not valid JSON, skipping VRM load");
          setVrmLoading(false);
        }
      } else {
        console.log("[VRM] persona.json not found or empty, skipping VRM load");
        setVrmLoading(false);
      }
    } catch (error) {
      console.error("[VRM] Failed to load config:", error);
      setVrmError(true);
      setVrmLoading(false);
    }
  }, [wsClient, isConnected]);

  useEffect(() => {
    if (isConnected && !vrmError) {
      loadConfig();
    }
  }, [isConnected, vrmError, loadConfig]);

  // 右键菜单操作
  const handleToggleSubtitles = useCallback(() => {
    setShowSubtitles((s) => !s);
  }, []);

  // 按钮拖动处理
  const hasDragged = useRef(false);

  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const btn = e.currentTarget.getBoundingClientRect();
      hasDragged.current = false;

      btnDragInfo.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosX: btnPosition?.x || 0,
        startPosY: btnPosition?.y || 0,
      };

      setIsDraggingBtn(true);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - btnDragInfo.current.startX;
        const deltaY = moveEvent.clientY - btnDragInfo.current.startY;

        // 记录是否发生了拖动
        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
          hasDragged.current = true;
        }

        // 限制范围在窗口内，允许超出但有限制
        const maxX = window.innerWidth - btn.width / 2;
        const maxY = window.innerHeight - btn.height / 2;
        const newX = Math.max(-maxX, Math.min(maxX, btnDragInfo.current.startPosX + deltaX));
        const newY = Math.max(-maxY, Math.min(maxY, btnDragInfo.current.startPosY + deltaY));
        setBtnPosition({ x: newX, y: newY });
      };

      const handlePointerUp = () => {
        setIsDraggingBtn(false);
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [btnPosition],
  );

  // 检查是否是 React 19 - 暂时禁用检查，直接显示 VRM
  // const isReact19 = typeof window !== 'undefined' && parseInt(React?.version?.split('.')[0] || '0', 10) >= 19;

  return (
    <div className="w-full h-full relative">
      {/* VRM 显示区域 */}
      <div className="w-full h-full absolute inset-0">
        {vrmLoading ? (
          <div className="flex items-center justify-center w-full h-full">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">加载中...</span>
            </div>
          </div>
        ) : isConnected && !vrmError ? (
          <VrmViewer
            ref={vrmViewerRef}
            modelUrl={vrmUrl}
            motionUrl={motionUrl}
            motionConfig={motionConfig}
            avatarState={avatarState}
          />
        ) : null}
      </div>

      {/* 右上角关闭按钮 */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full flex items-center justify-center bg-white/80 backdrop-blur-sm shadow-md cursor-pointer"
          title="返回"
        >
          <X className="w-5 h-5 text-gray-900" />
        </button>
      )}

      {/* 左侧顶部设置按钮 - 可拖动 */}
      <div
        className="absolute z-20"
        style={{
          top: btnPosition ? `calc(16px + ${btnPosition.y}px)` : "16px",
          left: btnPosition ? `calc(16px + ${btnPosition.x}px)` : "16px",
          transition: isDraggingBtn ? "none" : "all 0.2s ease",
        }}
      >
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          onPointerDown={handleDragStart}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/80 backdrop-blur-sm shadow-md transition-colors cursor-pointer"
          title={isExpanded ? "角色设定" : "角色设定"}
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-900" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-900" />
          )}
          <span className="text-sm font-medium text-gray-900">{"角色设定"}</span>
        </button>
      </div>

      {/* 设置面板 - 展开时显示在按钮下方 */}
      {isExpanded && (
        <div
          className="absolute z-20"
          style={{
            top: btnPosition ? `calc(60px + ${btnPosition.y}px)` : "60px",
            left: btnPosition ? `calc(16px + ${btnPosition.x}px)` : "16px",
          }}
        >
          <div className="bg-white rounded-lg shadow-lg w-[360px] h-[70vh] isolation-auto">
            <SettingsPanel
              open={true}
              onClose={() => setIsExpanded(false)}
              onSave={loadConfig}
              onPreviewMotion={handlePreviewMotion}
            />
          </div>
        </div>
      )}

      {/* 底部控制栏 + 状态信息 */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
        {/* 状态信息 */}
        {!isConnected && <span className="text-gray-600 text-sm">等待连接...</span>}
        {isConnected && vrmError && <span className="text-gray-600 text-sm">加载失败</span>}
        {/* 控制按钮 */}
        <div className="flex items-center gap-4 px-6 py-3 rounded-full">
          {/* 语音按钮 */}
          <button
            onClick={handleToggleVoice}
            className={`p-2 rounded-full transition-colors cursor-pointer ${
              voiceStatus === "listening" ? "bg-red-500" : ""
            } ${voiceStatus === "speaking" ? "bg-blue-500" : ""}`}
            title={
              voiceStatus === "idle"
                ? "开始语音 (Ctrl+X)"
                : voiceStatus === "listening"
                  ? "停止语音"
                  : voiceStatus === "processing"
                    ? "处理中..."
                    : "播放中..."
            }
            disabled={voiceStatus === "processing"}
          >
            {voiceStatus === "speaking" ? (
              <Mic className="w-5 h-5 text-white" />
            ) : voiceStatus === "listening" ? (
              <Mic className="w-5 h-5 text-white animate-pulse" />
            ) : (
              <MicOff className="w-5 h-5 text-gray-900 opacity-60" />
            )}
          </button>

          {/* 字幕按钮 */}
          <button
            onClick={handleToggleSubtitles}
            className="p-2 rounded-full transition-colors cursor-pointer"
            title={showSubtitles ? "隐藏字幕" : "显示字幕"}
          >
            <Subtitles
              className={`w-5 h-5 ${showSubtitles ? "text-gray-900" : "text-gray-900 opacity-60"}`}
            />
          </button>
        </div>
      </div>

      {/* 字幕覆盖层 */}
      {showSubtitles && isConnected && !vrmError && (
        <div className="absolute bottom-24 left-0 right-0 p-4 bg-gradient-to-t from-white/50 to-transparent z-10">
          <p className="text-gray-900 text-center text-lg">
            {voiceStatus === "listening"
              ? transcript || "正在聆听..."
              : voiceStatus === "processing"
                ? "Hovi 思考中..."
                : voiceStatus === "speaking"
                  ? responseText
                  : "点击麦克风或按 Ctrl+X 开始对话"}
          </p>
          {voiceError && <p className="text-red-500 text-center text-sm mt-1">{voiceError}</p>}
        </div>
      )}
    </div>
  );
}

export default VirtualAssistantPage;
