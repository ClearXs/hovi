"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect, useRef } from "react";
import Draggable from "react-draggable";
import { getAgentFile } from "@/features/persona/services/personaApi";
import { fetchScenes } from "@/features/scene/api/sceneApi";
import { useConnectionStore } from "@/stores/connectionStore";

// Dynamic import for VrmViewer
const VrmViewer = dynamic(
  () => import("@/components/avatar/VrmViewer").then((mod) => mod.VrmViewer || mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center text-gray-400">加载中...</div>
    ),
  },
);

interface MotionEmote {
  id: string;
  file: string;
  keywords?: string[];
  description?: string;
}

interface MotionConfig {
  idle: { file: string } | null;
  emotes: MotionEmote[];
}

interface Scene {
  id: string;
  name: string;
  description?: string;
  r_path?: string;
  main_file?: string;
  thumb?: string;
}

interface VirtualAssistantProps {
  onOpenSettings?: () => void;
  onOpenChat?: () => void;
  onStartVoiceChat?: () => void;
  onOpenTasks?: () => void;
}

function VirtualAssistant({
  onOpenSettings,
  onOpenChat,
  onStartVoiceChat,
  onOpenTasks,
}: VirtualAssistantProps) {
  const wsClient = useConnectionStore((s) => s.wsClient);
  const status = useConnectionStore((s) => s.status);

  const [vrmUrl, setVrmUrl] = useState<string | null>(null);
  const [sceneUrl, setSceneUrl] = useState<string | null>(null);
  const [motionUrl, setMotionUrl] = useState<string | null>(null);
  const [vrmError, setVrmError] = useState(false);
  const [size, setSize] = useState(256);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [motions, setMotions] = useState<MotionConfig | null>(null);
  const [currentMotion, setCurrentMotion] = useState<string>("idle");
  const containerRef = useRef<HTMLDivElement>(null);

  const isConnected = status === "connected";

  // 加载 VRM、场景和动作配置
  const loadConfig = useCallback(async () => {
    if (!wsClient || !isConnected || vrmError) return;
    try {
      const fileResult = await getAgentFile(wsClient, "main", "persona.json");
      if (fileResult?.content) {
        const config = JSON.parse(fileResult.content);

        // VRM 模型
        if (config.vrm) {
          setVrmUrl(`/files/main/${config.vrm}`);
        }

        // 动作配置
        if (config.motions) {
          setMotions(config.motions);
          // 加载 idle 动作
          if (config.motions.idle?.file) {
            setMotionUrl(`/files/main/${config.motions.idle.file}`);
          }
        }

        // 场景列表
        const scenesData = await fetchScenes(wsClient, "main");
        setScenes(scenesData || []);

        // 当前激活的场景
        const activeScene = scenesData?.find((s: Scene) => s.id === config.currentScene);
        if (activeScene && activeScene.main_file) {
          setSceneUrl(`/files/main/${activeScene.main_file}`);
          setCurrentScene(activeScene);
        }
      }
    } catch {
      setVrmError(true);
    }
  }, [wsClient, isConnected, vrmError]);

  useEffect(() => {
    if (isConnected && !vrmError) {
      loadConfig();
    }
  }, [isConnected, vrmError, loadConfig]);

  const handleClick = useCallback(() => {
    onOpenChat?.();
  }, [onOpenChat]);

  const handleDoubleClick = useCallback(() => {
    window.dispatchEvent(new CustomEvent("virtual-assistant:dblclick"));
  }, [handleClick, onOpenChat]);

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuOpen(true);
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenuOpen(false);
  }, []);

  const handleResize = (newSize: number) => {
    setSize(newSize);
    closeContextMenu();
  };

  // 切换场景
  const handleSceneSelect = (scene: Scene) => {
    setCurrentScene(scene);
    if (scene.main_file) {
      setSceneUrl(`/files/main/${scene.main_file}`);
    } else {
      setSceneUrl(null);
    }
    closeContextMenu();
  };

  // 切换动作
  const handleMotionSelect = (motion: { file?: string; id?: string }) => {
    if (motion.file) {
      setMotionUrl(`/files/main/${motion.file}`);
      setCurrentMotion(motion.id || motion.file);
    } else if (motion.id === "idle") {
      // 切换回 idle
      if (motions?.idle?.file) {
        setMotionUrl(`/files/main/${motions.idle.file}`);
      } else {
        setMotionUrl(null);
      }
      setCurrentMotion("idle");
    }
    closeContextMenu();
  };

  // 附着上下文单监听
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener("contextmenu", handleContextMenu);
      return () => container.removeEventListener("contextmenu", handleContextMenu);
    }
  }, [handleContextMenu]);

  // 点击其他地方关闭菜单
  useEffect(() => {
    if (!contextMenuOpen) return;
    const handleClickOutside = () => closeContextMenu();
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [contextMenuOpen, closeContextMenu]);

  const renderContent = () => {
    if (!isConnected) {
      return (
        <div className="w-full h-full flex items-center justify-center text-gray-400">
          等待连接...
        </div>
      );
    }
    if (vrmError) {
      return (
        <div className="w-full h-full flex items-center justify-center text-gray-400">加载失败</div>
      );
    }
    if (!vrmUrl) {
      return (
        <div className="w-full h-full flex items-center justify-center text-gray-400">
          等待配置...
        </div>
      );
    }
    return (
      <VrmViewer
        modelUrl={vrmUrl}
        sceneUrl={sceneUrl}
        motionUrl={motionUrl}
        enableControls={false}
      />
    );
  };

  return (
    <>
      <Draggable nodeRef={containerRef}>
        <div
          ref={containerRef}
          className="fixed"
          style={{
            zIndex: 99999,
            width: size,
            height: size,
            cursor: "pointer",
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
        >
          {renderContent()}
        </div>
      </Draggable>

      {/* Custom Context Menu */}
      {contextMenuOpen && (
        <div
          className="fixed bg-gray-800 rounded-lg shadow-lg py-1 z-[100000]"
          style={{
            left: contextMenuPosition.x,
            top: contextMenuPosition.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="block w-full px-3 py-2 text-left text-white hover:bg-gray-700 text-sm whitespace-nowrap"
            onClick={() => {
              onOpenChat?.();
              closeContextMenu();
            }}
          >
            打开对话
          </button>
          <button
            className="block w-full px-3 py-2 text-left text-white hover:bg-gray-700 text-sm whitespace-nowrap"
            onClick={() => {
              onStartVoiceChat?.();
              closeContextMenu();
            }}
          >
            语音对话
          </button>

          {/* 动作选择子菜单 */}
          {motions && motions.emotes.length > 0 && (
            <div className="relative group">
              <button className="block w-full px-3 py-2 text-left text-white hover:bg-gray-700 text-sm flex justify-between items-center whitespace-nowrap">
                切换动作 ▸
              </button>
              <div
                className="absolute left-full top-0 bg-gray-800 rounded-lg shadow-lg py-1 -ml-px min-w-max hidden group-hover:block"
                style={{ zIndex: 100001 }}
              >
                <button
                  className={`block w-full px-3 py-2 text-left text-white hover:bg-gray-700 text-sm whitespace-nowrap ${currentMotion === "idle" ? "bg-gray-700" : ""}`}
                  onClick={() => handleMotionSelect({ id: "idle" })}
                >
                  待机动作
                </button>
                {motions.emotes.map((emote) => (
                  <button
                    key={emote.id}
                    className={`block w-full px-3 py-2 text-left text-white hover:bg-gray-700 text-sm whitespace-nowrap ${currentMotion === emote.id ? "bg-gray-700" : ""}`}
                    onClick={() => handleMotionSelect(emote)}
                  >
                    {emote.description || emote.id}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 场景选择子菜单 */}
          {scenes.length > 0 && (
            <div className="relative group">
              <button className="block w-full px-3 py-2 text-left text-white hover:bg-gray-700 text-sm flex justify-between items-center whitespace-nowrap">
                切换场景 ▸
              </button>
              <div
                className="absolute left-full top-0 bg-gray-800 rounded-lg shadow-lg py-1 -ml-px min-w-max hidden group-hover:block"
                style={{ zIndex: 100001 }}
              >
                <button
                  className={`block w-full px-3 py-2 text-left text-white hover:bg-gray-700 text-sm whitespace-nowrap ${!currentScene ? "bg-gray-700" : ""}`}
                  onClick={() => handleSceneSelect({ id: "", name: "无场景" } as Scene)}
                >
                  无场景
                </button>
                {scenes.map((scene) => (
                  <button
                    key={scene.id}
                    className={`block w-full px-3 py-2 text-left text-white hover:bg-gray-700 text-sm whitespace-nowrap ${currentScene?.id === scene.id ? "bg-gray-700" : ""}`}
                    onClick={() => handleSceneSelect(scene)}
                  >
                    {scene.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-gray-600 my-1" />
          <button
            className="block w-full px-3 py-2 text-left text-white hover:bg-gray-700 text-sm whitespace-nowrap"
            onClick={() => handleResize(192)}
          >
            小尺寸 (192px)
          </button>
          <button
            className="block w-full px-3 py-2 text-left text-white hover:bg-gray-700 text-sm whitespace-nowrap"
            onClick={() => handleResize(256)}
          >
            中尺寸 (256px)
          </button>
          <button
            className="block w-full px-3 py-2 text-left text-white hover:bg-gray-700 text-sm whitespace-nowrap"
            onClick={() => handleResize(320)}
          >
            大尺寸 (320px)
          </button>
          <button
            className="block w-full px-3 py-2 text-left text-white hover:bg-gray-700 text-sm whitespace-nowrap"
            onClick={() => handleResize(384)}
          >
            超大尺寸 (384px)
          </button>
          <div className="border-t border-gray-600 my-1" />
          <button
            className="block w-full px-3 py-2 text-left text-white hover:bg-gray-700 text-sm whitespace-nowrap"
            onClick={() => {
              onOpenTasks?.();
              closeContextMenu();
            }}
          >
            任务管理
          </button>
          <div className="border-t border-gray-600 my-1" />
          <button
            className="block w-full px-3 py-2 text-left text-white hover:bg-gray-700 text-sm whitespace-nowrap"
            onClick={() => {
              onOpenSettings?.();
              closeContextMenu();
            }}
          >
            设置
          </button>
          <div className="border-t border-gray-600 my-1" />
          <button
            className="block w-full px-3 py-2 text-left text-red-500 hover:bg-gray-700 text-sm whitespace-nowrap"
            onClick={() => closeContextMenu()}
          >
            退出
          </button>
        </div>
      )}
    </>
  );
}

export default VirtualAssistant;
