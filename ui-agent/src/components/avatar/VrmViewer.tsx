"use client";

import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import type { VRM, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { MotionConfig } from "@/features/persona/types/persona";
import type { AvatarStatePayload } from "@/stores/avatarStateStore";
import { AvatarController, type AvatarState } from "./AvatarController";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyVRM = any;

function VRMModel({
  url,
  motionUrl,
  avatarControllerRef,
  onVrmLoad,
}: {
  url: string | null;
  motionUrl: string | null;
  avatarControllerRef: React.MutableRefObject<AvatarController | null>;
  onVrmLoad?: (vrm: VRM, controller: AvatarController) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { scene, camera } = useThree() as any;
  const vrmRef = useRef<VRM | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mixerRef = useRef<any>(null);
  const currentMotionUrlRef = useRef<string | null>(null);

  // 加载 VMD/VMA 动画
  const loadMotion = async (_vrm: AnyVRM, _motionUrl: string) => {
    if (!_motionUrl || currentMotionUrlRef.current === _motionUrl) {
      return;
    }
    currentMotionUrlRef.current = _motionUrl;
    console.log("[VrmViewer] Loading motion from:", _motionUrl);
    try {
      // 根据文件扩展名选择加载器
      const fileExtension = _motionUrl.split(".").pop()?.toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let animations: any[] = [];

      if (fileExtension === "vmd") {
        // 使用 MMDLoader 加载 VMD 文件
        const threeStdlib = await import("three-stdlib");
        const MMDLoader = threeStdlib.MMDLoader;
        const mmdLoader = new MMDLoader();
        const motion = await new Promise<AnyVRM>((resolve, reject) => {
          mmdLoader.load(_motionUrl, resolve, undefined, reject);
        });
        if (motion) {
          animations = Array.isArray(motion) ? motion : [motion];
        }
        // VMD 格式使用 VRM 的 loadAnimation 方法
        if (animations.length > 0 && typeof _vrm.loadAnimation === "function") {
          _vrm.loadAnimation(animations);
        }
      } else if (fileExtension === "vma" || fileExtension === "vrma") {
        // 使用 GLTFLoader 加载 VMA/VRMA 文件
        const loader = new GLTFLoader();
        const gltf = await new Promise<any>((resolve, reject) => {
          loader.load(_motionUrl, resolve, undefined, reject);
        });
        if (gltf.animations && gltf.animations.length > 0) {
          animations = gltf.animations;
        }
      } else {
        console.warn("[VrmViewer] Unsupported motion file format:", fileExtension);
        return;
      }

      if (animations.length === 0) {
        console.warn("[VrmViewer] No motion data loaded");
        return;
      }

      // 停止并重建 mixer
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current = null;
      }

      // 获取要播放的动画
      // 对于 VMD：使用 _vrm.anim
      // 对于 VMA/VRMA：直接使用加载的 animations
      let animationToPlay = animations;
      if (fileExtension === "vmd" && _vrm.anim && _vrm.anim.length > 0) {
        animationToPlay = _vrm.anim;
      }

      if (animationToPlay && animationToPlay.length > 0) {
        const THREEAny = THREE as any;
        mixerRef.current = new THREEAny.AnimationMixer(_vrm.scene);
        const action = mixerRef.current.clipAction(animationToPlay[0]);
        action.play();
      }
      console.log("[VrmViewer] Motion loaded successfully");
    } catch (error) {
      console.error("[VrmViewer] Failed to load motion:", error);
    }
  };

  useEffect(() => {
    if (!url) {
      console.log("[VrmViewer] No URL provided");
      return;
    }

    console.log("[VrmViewer] Loading VRM from:", url);

    const loader = new GLTFLoader();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loader.register((parser: any) => new VRMLoaderPlugin(parser));

    loader.load(
      url,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (gltf: any) => {
        const vrm = gltf.userData.vrm as VRM;
        if (!vrm) {
          console.error("No VRM found in loaded GLTF");
          return;
        }

        vrm.scene.traverse((obj: any) => {
          obj.frustumCulled = false;
        });

        scene.add(vrm.scene);
        vrmRef.current = vrm;

        // Set up look-at target
        const lookAtTarget = new THREE.Object3D();
        camera.add(lookAtTarget);
        if (vrm.lookAt) {
          vrm.lookAt.target = lookAtTarget;
        }

        // 初始化 AvatarController
        const controller = new AvatarController();
        await controller.initialize(vrm);
        avatarControllerRef.current = controller;

        // 加载动作
        if (motionUrl) {
          loadMotion(vrm, motionUrl);
        }

        if (onVrmLoad) {
          onVrmLoad(vrm, controller);
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (progress: any) => {
        // Loading progress
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error: any) => {
        console.error("[VrmViewer] Error loading VRM:", error);
      },
    );

    return () => {
      if (vrmRef.current) {
        scene.remove(vrmRef.current.scene);
        vrmRef.current = null;
      }
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current = null;
      }
      currentMotionUrlRef.current = null;
      avatarControllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // 监听 motionUrl 变化
  useEffect(() => {
    if (vrmRef.current && motionUrl) {
      loadMotion(vrmRef.current, motionUrl);
    }
  }, [motionUrl]);

  useFrame((_, delta) => {
    if (vrmRef.current) {
      vrmRef.current.update(delta);
    }
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }
    // 更新 AvatarController
    if (avatarControllerRef.current) {
      avatarControllerRef.current.update(delta);
    }
  });

  return null;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 5, 5]} intensity={1} castShadow />
    </>
  );
}

function CameraController() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { camera } = useThree() as any;

  useEffect(() => {
    camera.position.set(0, 1.2, 2);
    camera.lookAt(0, 1, 0);
  }, [camera]);

  return null;
}

export interface VrmViewerProps {
  modelUrl: string | null;
  motionUrl?: string | null;
  motionConfig?: MotionConfig;
  /** Avatar state from tool events */
  avatarState?: AvatarStatePayload | null;
  onVrmLoad?: (vrm: VRM, controller: AvatarController) => void;
}

export interface VrmViewerRef {
  getController: () => AvatarController | null;
}

export const VrmViewer = forwardRef<VrmViewerRef, VrmViewerProps>(
  ({ modelUrl, motionUrl = null, motionConfig, avatarState, onVrmLoad }, ref) => {
    const avatarControllerRef = useRef<AvatarController | null>(null);
    const prevAvatarStateRef = useRef<AvatarStatePayload | null>(null);
    const isMountedRef = useRef(true);

    // 组件卸载时设置标志
    useEffect(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
      };
    }, []);

    // 暴露方法给外部
    useImperativeHandle(ref, () => ({
      getController: () => avatarControllerRef.current,
    }));

    // 加载 motion 配置并预加载所有动作
    useEffect(() => {
      if (avatarControllerRef.current && motionConfig) {
        // 从 modelUrl 提取基础路径（如 /files/main）
        let basePath = "";
        if (modelUrl) {
          const urlParts = modelUrl.split("/");
          // 找到 files 之后的部分作为基础路径
          const filesIndex = urlParts.indexOf("files");
          if (filesIndex !== -1) {
            basePath = "/" + urlParts.slice(0, filesIndex + 2).join("/");
          }
        }
        if (basePath) {
          avatarControllerRef.current.setMotionBasePath(basePath);
        }

        avatarControllerRef.current.loadConfig(motionConfig);
        // 预加载所有动作到内存
        avatarControllerRef.current.preloadAllMotions().then(() => {
          if (!isMountedRef.current) return;
          console.log("[VrmViewer] All motions preloaded, starting idle animation");
          // 预加载完成后播放 idle 动作
          avatarControllerRef.current?.playIdleMotion();
        });
      }
    }, [motionConfig, modelUrl]);

    // 处理 avatar 状态变化（来自工具事件）
    useEffect(() => {
      const controller = avatarControllerRef.current;
      if (!controller) return;

      // 跳过重复的状态
      if (avatarState && avatarState === prevAvatarStateRef.current) {
        return;
      }

      if (avatarState) {
        console.log("[VrmViewer] Applying avatar state:", avatarState);
        prevAvatarStateRef.current = avatarState;

        // 调用 AvatarController 设置状态
        controller.setState(
          avatarState.state,
          avatarState.emoteId || undefined,
          avatarState.expression || undefined,
        );
      }
    }, [avatarState]);

    return (
      <div className="w-full h-full">
        <Canvas
          shadows
          camera={{ fov: 45, near: 0.1, far: 1000 }}
          gl={{ antialias: true, alpha: true }}
        >
          <CameraController />
          <Lights />
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            minDistance={0.5}
            maxDistance={10}
            target={[0, 1, 0]}
          />
          <VRMModel
            url={modelUrl}
            motionUrl={motionUrl}
            avatarControllerRef={avatarControllerRef}
            onVrmLoad={onVrmLoad}
          />
        </Canvas>
      </div>
    );
  },
);

VrmViewer.displayName = "VrmViewer";

export default VrmViewer;
