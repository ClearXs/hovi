"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect, useRef } from "react";
import Draggable from "react-draggable";
import { useVoiceInput } from "@/features/avatar/hooks/useVoiceInput";
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
  onClose?: () => void;
}

function VirtualAssistant({
  onOpenSettings,
  onOpenChat,
  onStartVoiceChat,
  onOpenTasks,
  onClose,
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
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeStartRef = useRef<{ x: number; y: number; size: number; direction?: string } | null>(
    null,
  );
  const currentSizeRef = useRef(size);

  const isConnected = status === "connected";

  // 语音输入
  const { status: voiceStatus, toggle: toggleVoice } = useVoiceInput();

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
        width={size}
        height={size}
      />
    );
  };

  // 拖拽移动位置 - Draggable 自动处理，我们只需要限制范围

  // 边缘拖拽处理
  const handleResizeStart = useCallback(
    (direction: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // 使用 ref 来追踪 resize 状态，避免闭包问题
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        size: currentSizeRef.current,
        direction,
      };
      setIsResizing(true);
      setResizeDirection(direction);
    },
    [],
  );

  const handleResizeMove = useCallback((e: MouseEvent) => {
    // 使用 ref 检查，而不是 state，避免闭包问题
    if (!resizeStartRef.current || !containerRef.current) return;

    const deltaX = e.clientX - resizeStartRef.current.x;
    const deltaY = e.clientY - resizeStartRef.current.y;

    let newSize = resizeStartRef.current.size;
    const minSize = 128;
    const maxSize = Math.min(window.innerWidth, window.innerHeight) - 40;

    // 从 currentSizeRef 获取当前 resize 方向
    const direction = resizeStartRef.current.direction;
    if (!direction) return;

    switch (direction) {
      case "se":
        newSize = resizeStartRef.current.size + deltaX + deltaY;
        break;
      case "sw":
        newSize = resizeStartRef.current.size - deltaX + deltaY;
        break;
      case "ne":
        newSize = resizeStartRef.current.size + deltaX - deltaY;
        break;
      case "nw":
        newSize = resizeStartRef.current.size - deltaX - deltaY;
        break;
      case "e":
        newSize = resizeStartRef.current.size + deltaX;
        break;
      case "w":
        newSize = resizeStartRef.current.size - deltaX;
        break;
      case "s":
        newSize = resizeStartRef.current.size + deltaY;
        break;
      case "n":
        newSize = resizeStartRef.current.size - deltaY;
        break;
    }

    newSize = Math.max(minSize, Math.min(maxSize, newSize));
    currentSizeRef.current = newSize;

    // 直接操作 DOM，完全绕过 React 渲染
    containerRef.current.style.width = `${newSize}px`;
    containerRef.current.style.height = `${newSize}px`;
  }, []);

  const handleResizeEnd = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 应用最终尺寸到 React 状态
    setSize(currentSizeRef.current);
    setIsResizing(false);
    setResizeDirection(null);
    resizeStartRef.current = null;
  }, []);

  // 添加全局鼠标事件监听
  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", handleResizeMove);
      window.addEventListener("mouseup", handleResizeEnd);
      return () => {
        window.removeEventListener("mousemove", handleResizeMove);
        window.removeEventListener("mouseup", handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // 获取光标样式
  const getCursorStyle = (direction: string | null) => {
    if (!direction) return "pointer";
    const cursors: Record<string, string> = {
      n: "ns-resize",
      s: "ns-resize",
      e: "ew-resize",
      w: "ew-resize",
      ne: "nesw-resize",
      nw: "nwse-resize",
      se: "nwse-resize",
      sw: "nesw-resize",
    };
    return cursors[direction] || "pointer";
  };

  return (
    <>
      <Draggable nodeRef={containerRef} disabled={isResizing}>
        <div
          ref={containerRef}
          className={`fixed select-none group overflow-visible ${isResizing ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
          style={{
            zIndex: 99999,
            width: size,
            height: size,
            cursor: isResizing ? getCursorStyle(resizeDirection) : "grab",
            right: 20,
            bottom: 20,
            transition: isResizing ? "none" : "width 0.15s ease-out, height 0.15s ease-out",
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
        >
          {renderContent()}

          {/* 顶部拖拽条 - 矩形 */}
          <div
            className={`absolute top-0 left-0 right-0 h-1 cursor-ns-resize
              ${isResizing || resizeDirection === "n" ? "bg-primary/60" : "group-hover:bg-primary/30"}`}
            onMouseDown={handleResizeStart("n")}
          />
          {/* 底部拖拽条 - 矩形 */}
          <div
            className={`absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize
              ${isResizing || resizeDirection === "s" ? "bg-primary/60" : "group-hover:bg-primary/30"}`}
            onMouseDown={handleResizeStart("s")}
          />
          {/* 左侧拖拽条 - 矩形 */}
          <div
            className={`absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize
              ${isResizing || resizeDirection === "w" ? "bg-primary/60" : "group-hover:bg-primary/30"}`}
            onMouseDown={handleResizeStart("w")}
          />
          {/* 右侧拖拽条 - 矩形 */}
          <div
            className={`absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize
              ${isResizing || resizeDirection === "e" ? "bg-primary/60" : "group-hover:bg-primary/30"}`}
            onMouseDown={handleResizeStart("e")}
          />
        </div>
      </Draggable>

      {/* Custom Context Menu */}
      {contextMenuOpen && (
        <div
          className="fixed bg-surface rounded-lg shadow-lg py-1 z-[100000] border border-border"
          style={{
            left: contextMenuPosition.x,
            top: contextMenuPosition.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="block w-full px-3 py-2 text-left text-primary hover:bg-surface-hover text-sm whitespace-nowrap"
            onClick={() => {
              onOpenChat?.();
              closeContextMenu();
            }}
          >
            打开对话
          </button>
          <button
            className="block w-full px-3 py-2 text-left text-primary hover:bg-surface-hover text-sm whitespace-nowrap"
            onClick={() => {
              toggleVoice();
              closeContextMenu();
            }}
          >
            {voiceStatus === "idle" || voiceStatus === "listening"
              ? "开始语音对话"
              : "语音对话中..."}
          </button>

          {/* 动作选择子菜单 */}
          {motions && motions.emotes.length > 0 && (
            <div className="relative group">
              <button className="block w-full px-3 py-2 text-left text-primary hover:bg-surface-hover text-sm flex justify-between items-center whitespace-nowrap">
                切换动作 ▸
              </button>
              <div
                className="absolute left-full top-0 bg-surface rounded-lg shadow-lg border border-border py-1 -ml-px min-w-max hidden group-hover:block"
                style={{ zIndex: 100001 }}
              >
                <button
                  className={`block w-full px-3 py-2 text-left text-primary hover:bg-surface-hover text-sm whitespace-nowrap ${currentMotion === "idle" ? "bg-surface-hover" : ""}`}
                  onClick={() => handleMotionSelect({ id: "idle" })}
                >
                  待机动作
                </button>
                {motions.emotes.map((emote) => (
                  <button
                    key={emote.id}
                    className={`block w-full px-3 py-2 text-left text-primary hover:bg-surface-hover text-sm whitespace-nowrap ${currentMotion === emote.id ? "bg-surface-hover" : ""}`}
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
              <button className="block w-full px-3 py-2 text-left text-primary hover:bg-surface-hover text-sm flex justify-between items-center whitespace-nowrap">
                切换场景 ▸
              </button>
              <div
                className="absolute left-full top-0 bg-surface rounded-lg shadow-lg border border-border py-1 -ml-px min-w-max hidden group-hover:block"
                style={{ zIndex: 100001 }}
              >
                <button
                  className={`block w-full px-3 py-2 text-left text-primary hover:bg-surface-hover text-sm whitespace-nowrap ${!currentScene ? "bg-surface-hover" : ""}`}
                  onClick={() => handleSceneSelect({ id: "", name: "无场景" } as Scene)}
                >
                  无场景
                </button>
                {scenes.map((scene) => (
                  <button
                    key={scene.id}
                    className={`block w-full px-3 py-2 text-left text-primary hover:bg-surface-hover text-sm whitespace-nowrap ${currentScene?.id === scene.id ? "bg-surface-hover" : ""}`}
                    onClick={() => handleSceneSelect(scene)}
                  >
                    {scene.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-border my-1" />
          <button
            className="block w-full px-3 py-2 text-left text-primary hover:bg-surface-hover text-sm whitespace-nowrap"
            onClick={() => {
              onOpenTasks?.();
              closeContextMenu();
            }}
          >
            任务管理
          </button>
          <div className="border-t border-border my-1" />
          <button
            className="block w-full px-3 py-2 text-left text-primary hover:bg-surface-hover text-sm whitespace-nowrap"
            onClick={() => {
              onOpenSettings?.();
              closeContextMenu();
            }}
          >
            设置
          </button>
          <div className="border-t border-border my-1" />
          <button
            className="block w-full px-3 py-2 text-left text-red-500 hover:bg-surface-hover text-sm whitespace-nowrap"
            onClick={() => {
              onClose?.();
              closeContextMenu();
            }}
          >
            退出
          </button>
        </div>
      )}
    </>
  );
}

export default VirtualAssistant;
