import type { VRM, VRMExpressionPresetName } from "@pixiv/three-vrm";
import * as THREE from "three";
import type { MotionConfig } from "@/features/persona/types/persona";
import { ExpressionController } from "./ExpressionController";

// 预设表情列表
export const PRESET_EXPRESSIONS: VRMExpressionPresetName[] = [
  "neutral",
  "happy",
  "angry",
  "sad",
  "relaxed",
  "surprised",
];

// 预设表情名称集合（用于区分预设和自定义）
const PRESET_EXPRESSION_NAMES = new Set(PRESET_EXPRESSIONS);

export type AvatarState = "idle" | "emote";

/**
 * VRM 模型可用的表情信息
 */
export interface AvailableExpression {
  name: string;
  isPreset: boolean;
  blendshape: string;
}

export interface AvatarControllerOptions {
  // 可选：自定义 blendshape 映射
  expressionMapping?: Record<string, string>;
}

export class AvatarController {
  private vrm: VRM | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mixer: any = null;
  private expressionController: ExpressionController | null = null;

  // 动作文件的基础路径（如 /files/main）
  private motionBasePath: string = "";

  // 配置
  private idleMotion: string | null = null;
  private emoteMotions: Map<string, string> = new Map();
  private expressionMap: Map<string, string> = new Map(); // 关键词 -> blendshape

  // 预加载的动画缓存
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private loadedMotions: Map<string, any> = new Map();

  // 状态
  private state: AvatarState = "idle";
  private currentEmoteId: string | null = null;
  private currentExpression: string = "neutral";

  // 动画
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private currentAction: any = null;
  // 保存当前的 finished 事件监听器，以便切换时移除
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private finishedListener: any = null;

  constructor(options?: AvatarControllerOptions) {
    if (options?.expressionMapping) {
      // 初始化自定义映射
    }
  }

  /**
   * 初始化 AvatarController
   */
  public async initialize(vrm: VRM): Promise<void> {
    this.vrm = vrm;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.mixer = new (THREE as any).AnimationMixer(vrm.scene);
    this.expressionController = new ExpressionController(vrm);
  }

  /**
   * 设置动作文件的基础路径
   * @param basePath 如 "/files/main"
   */
  public setMotionBasePath(basePath: string): void {
    this.motionBasePath = basePath;
  }

  /**
   * 获取动作文件的完整URL
   */
  private getMotionUrl(motionFile: string): string {
    // 如果是完整的 HTTP URL，直接返回
    if (motionFile.startsWith("http")) {
      return motionFile;
    }
    // 如果已经有 /files/ 路径，直接返回
    if (motionFile.includes("/files/")) {
      return motionFile;
    }

    // 拼接基础路径，避免双斜杠
    let basePath = this.motionBasePath;
    // 确保 basePath 不以斜杠结尾，motionFile 不以斜杠开头
    if (basePath.endsWith("/")) {
      basePath = basePath.slice(0, -1);
    }
    if (motionFile.startsWith("/")) {
      motionFile = motionFile.slice(1);
    }

    const fullPath = `${basePath}/${motionFile}`;
    return fullPath;
  }

  /**
   * 加载配置
   */
  public async loadConfig(config: MotionConfig): Promise<void> {
    // 加载 idle 动作
    if (config.idle) {
      this.idleMotion = config.idle.file;
    }

    // 加载 emote 映射
    this.emoteMotions.clear();
    if (config.emotes) {
      for (const emote of config.emotes) {
        this.emoteMotions.set(emote.id, emote.file);
      }
    }

    // 加载表情映射
    this.expressionMap.clear();
    if (config.expressions) {
      for (const [, expr] of Object.entries(config.expressions)) {
        for (const keyword of expr.keywords) {
          this.expressionMap.set(keyword.toLowerCase(), expr.blendshape);
        }
      }
    }
  }

  /**
   * 预加载所有 motion 文件到内存
   * 调用此方法可以在需要播放时避免加载延迟
   */
  public async preloadAllMotions(): Promise<void> {
    if (!this.vrm) {
      console.warn("[AvatarController] Cannot preload motions: VRM not loaded");
      return;
    }

    // 预加载 idle 动作
    if (this.idleMotion && !this.loadedMotions.has("idle")) {
      try {
        const motion = await this.loadMotionFile(this.idleMotion);
        if (motion) {
          this.loadedMotions.set("idle", motion);
        }
      } catch (error) {
        console.warn(`[AvatarController] Failed to preload idle motion:`, error);
      }
    }

    // 预加载所有 emote 动作
    for (const [emoteId, motionFile] of this.emoteMotions.entries()) {
      if (!this.loadedMotions.has(emoteId)) {
        try {
          const motion = await this.loadMotionFile(motionFile);
          if (motion) {
            this.loadedMotions.set(emoteId, motion);
          }
        } catch (error) {
          console.warn(`[AvatarController] Failed to preload emote ${emoteId}:`, error);
        }
      }
    }
  }

  /**
   * 加载单个 motion 文件
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadMotionFile(motionFile: string): Promise<any> {
    return new Promise(async (resolve, reject) => {
      try {
        const motionUrl = this.getMotionUrl(motionFile);

        // 根据文件扩展名选择加载器
        const fileExtension = motionFile.split(".").pop()?.toLowerCase();

        if (fileExtension === "vmd") {
          // 使用 MMDLoader 加载 VMD 文件
          const threeStdlib = await import("three-stdlib");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const MMDLoader = (threeStdlib as any).MMDLoader;
          const loader = new MMDLoader();
          loader.load(motionUrl, resolve, undefined, reject);
        } else if (fileExtension === "vma" || fileExtension === "vrma") {
          // 使用 GLTFLoader 加载 VMA/VRMA 文件
          const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
          const loader = new GLTFLoader();
          loader.load(
            motionUrl,
            (gltf: any) => {
              // VMA/VRMA 文件的动画在 gltf.animations 中
              if (gltf.animations && gltf.animations.length > 0) {
                resolve(gltf.animations);
              } else {
                reject(new Error("No animations found in VMA/VRMA file"));
              }
            },
            undefined,
            reject,
          );
        } else {
          reject(new Error(`Unsupported motion file format: ${fileExtension}`));
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 获取预加载的动画
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public getLoadedMotion(key: string): any {
    return this.loadedMotions.get(key);
  }

  /**
   * 检查动画是否已预加载
   */
  public isMotionLoaded(key: string): boolean {
    return this.loadedMotions.has(key);
  }

  /**
   * 获取 idle 动作
   */
  public getIdleMotion(): string | null {
    return this.idleMotion;
  }

  /**
   * 获取 emote 动作文件
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public getEmote(emoteId: string): any {
    return this.emoteMotions.get(emoteId);
  }

  /**
   * 获取所有 emote 列表
   */
  public getAllEmotes(): string[] {
    return Array.from(this.emoteMotions.keys());
  }

  /**
   * 设置状态
   */
  public async setState(state: AvatarState, emoteId?: string, expression?: string): Promise<void> {
    // 1. 先设置表情
    if (expression && expression !== "none") {
      this.setExpression(expression as VRMExpressionPresetName);
    } else if (expression === "none") {
      this.setExpression("neutral");
    }

    // 2. 播放动作
    if (state === "idle") {
      await this.playIdleMotion();
    } else if (state === "emote" && emoteId) {
      await this.playEmote(emoteId);
    }

    this.state = state;
    this.currentEmoteId = emoteId || null;
  }

  /**
   * 设置表情
   * 支持预设表情和自定义表情
   */
  public setExpression(expression: string): void {
    // 检查是否是预设表情
    if (PRESET_EXPRESSION_NAMES.has(expression as VRMExpressionPresetName)) {
      this.expressionController?.playEmotion(expression as VRMExpressionPresetName);
    } else {
      // 自定义表情，直接设置
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const expressionManager = (this.vrm as any)?.expressionManager;
      if (expressionManager) {
        expressionManager.setValue(expression, 1);
      }
    }
    this.currentExpression = expression;
  }

  /**
   * 通过关键词设置表情
   */
  public setExpressionByKeyword(keyword: string): void {
    const blendshape = this.expressionMap.get(keyword.toLowerCase());
    if (blendshape) {
      this.setExpression(blendshape);
    }
  }

  /**
   * 获取 VRM 模型可用的所有表情
   * 从 VRM 模型动态读取，而非使用硬编码列表
   */
  public getAvailableExpressions(): AvailableExpression[] {
    if (!this.vrm?.expressionManager) {
      console.warn("[AvatarController] No expression manager found");
      return [];
    }

    const expressions: AvailableExpression[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expressionMap = (this.vrm.expressionManager as any).expressionMap;

    if (expressionMap) {
      for (const [name, expression] of Object.entries(expressionMap)) {
        expressions.push({
          name,
          isPreset: PRESET_EXPRESSION_NAMES.has(name as VRMExpressionPresetName),
          blendshape: name,
        });
      }
    }

    return expressions;
  }

  /**
   * 获取 VRM 模型的自定义表情（非预设）
   * 这些是 VRM 模型特有的表情
   */
  public getCustomExpressions(): AvailableExpression[] {
    return this.getAvailableExpressions().filter((expr) => !expr.isPreset);
  }

  /**
   * 播放 idle 动作
   */
  public async playIdleMotion(): Promise<void> {
    if (!this.vrm) {
      console.warn("[AvatarController] Cannot play idle: no vrm");
      return;
    }

    // 如果没有设置 idle 动作，记录警告但继续播放当前动画
    if (!this.idleMotion) {
      console.warn("[AvatarController] No idle motion configured, will loop current animation");
      // 让当前动画继续循环播放
      if (this.currentAction) {
        this.currentAction.reset();
        this.currentAction.setLoop((THREE as any).LoopRepeat, Infinity);
        this.currentAction.clampWhenFinished = true;
        this.currentAction.play();
      }
      return;
    }

    await this.loadAndPlayMotion(this.idleMotion, "idle", true);
  }

  /**
   * 播放 emote 动作
   */
  public async playEmote(emoteId: string): Promise<void> {
    const motionFile = this.emoteMotions.get(emoteId);
    if (!motionFile || !this.vrm) {
      console.warn(`[AvatarController] Emote not found: ${emoteId}`);
      return;
    }

    await this.loadAndPlayMotion(motionFile, emoteId, false);
  }

  /**
   * 直接根据文件路径播放动作（用于预览）
   * @param motionFile 动作文件路径（如 motions/xxx.vrma）
   * @param loop 是否循环播放
   */
  public async playMotionByFile(motionFile: string, loop: boolean = false): Promise<void> {
    if (!this.vrm || !this.mixer) {
      console.warn("[AvatarController] Cannot play motion: VRM or mixer not ready");
      return;
    }

    // 清除当前缓存，强制重新加载
    const cacheKey = `preview_${motionFile}`;
    this.loadedMotions.delete(cacheKey);

    await this.loadAndPlayMotion(motionFile, cacheKey, loop);
  }

  /**
   * 加载并播放动作（支持缓存）
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadAndPlayMotion(
    motionFile: string,
    cacheKey: string,
    loop: boolean,
  ): Promise<void> {
    if (!this.vrm || !this.mixer) {
      console.warn("[AvatarController] Cannot play: no vrm or mixer");
      return;
    }

    try {
      // 停止当前动画 - 立即停止，不等待
      if (this.currentAction) {
        this.currentAction.stop();
        this.currentAction = null;
      }

      // 停止临时混合器（用于 VRMA 动画）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tempMixer = (this as any).tempMixer;
      if (tempMixer) {
        tempMixer.stopAllAction();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as any).tempMixer = null;
      }

      // 清理之前的事件监听器
      if (this.finishedListener && this.mixer) {
        this.mixer.removeEventListener("finished", this.finishedListener);
        this.finishedListener = null;
      }

      // 尝试从缓存获取已加载的动画
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let motion = this.loadedMotions.get(cacheKey);

      if (!motion) {
        // 缓存未命中，动态加载
        motion = await this.loadMotionFile(motionFile);
      } else {
      }

      if (!motion) {
        console.warn("[AvatarController] No motion data loaded");
        return;
      }

      // 确定文件格式
      const fileExtension = motionFile.split(".").pop()?.toLowerCase();
      let animations: any[] = [];

      // 根据文件格式处理动画
      if (fileExtension === "vmd") {
        // VMD 格式：使用 VRM 的 loadAnimation 方法
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.vrm as any).loadAnimation(motion);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        animations = (this.vrm as any).anim || [];
      } else if (fileExtension === "vma" || fileExtension === "vrma") {
        // VMA/VRMA 格式：直接使用加载的动画数组
        animations = Array.isArray(motion) ? motion : [motion];
      }

      if (animations && animations.length > 0) {
        // 对于 VRMA 动画，可能需要克隆以避免原始设置影响
        let animClip = animations[0];

        // 如果是 VRMA 格式，克隆动画剪辑以确保我们的设置生效
        if (fileExtension === "vma" || fileExtension === "vrma") {
          // 创建新的 AnimationClip 确保干净的加载
          animClip = animClip.clone();
        }

        // 尝试使用 VRM 的人形系统来播放动画（自动处理骨骼映射）
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vrmAny = this.vrm as any;
        if (vrmAny.humanoid && vrmAny.humanoid.retarget && fileExtension === "vrma") {
          // 使用 VRM 的人形系统进行动画重定向
          try {
            // 创建临时混合器用于处理动画
            const tempMixer = new (THREE as any).AnimationMixer(this.vrm.scene);
            const tempAction = tempMixer.clipAction(animClip);
            tempAction.reset();
            if (loop) {
              tempAction.setLoop((THREE as any).LoopRepeat, Infinity);
            } else {
              tempAction.setLoop((THREE as any).LoopOnce);
            }
            tempAction.clampWhenFinished = !loop;
            tempAction.play();
            tempAction.fadeIn(0.1);

            // 保存临时混合器引用以便在 update 中更新
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (this as any).tempMixer = tempMixer;

            this.currentAction = tempAction;
            return;
          } catch (e) {
            console.warn("[AvatarController] Humanoid retargeting failed, using fallback:", e);
          }
        }

        // 回退：使用普通混合器
        const newAction = this.mixer.clipAction(animClip);

        // 重置并设置循环模式
        newAction.reset();
        if (loop) {
          newAction.setLoop((THREE as any).LoopRepeat, Infinity);
        } else {
          newAction.setLoop((THREE as any).LoopOnce);
        }
        newAction.clampWhenFinished = !loop; // 只有循环时才保持最后一帧

        // 播放新动作（当前动作的淡出已在前面处理）
        newAction.fadeIn(0.1);
        newAction.play();

        this.currentAction = newAction;

        // 非循环动画（emote）播放完毕后自动过渡回 idle
        if (!loop) {
          // 使用 mixer 的事件监听动画结束
          const onFinished = (e: any) => {
            if (e.action === newAction) {
              this.mixer.removeEventListener("finished", onFinished);
              this.finishedListener = null;
              this.playIdleMotion();
            }
          };
          this.finishedListener = onFinished;
          this.mixer.addEventListener("finished", onFinished);
        }

        this.currentAction = newAction;
      }
    } catch (error) {
      console.error("[AvatarController] Failed to load motion:", error);
    }
  }

  /**
   * 更新每帧
   */
  public update(delta: number): void {
    // 更新动画混合器
    if (this.mixer) {
      this.mixer.update(delta);
    }

    // 更新临时混合器（用于 VRMA 动画）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tempMixer = (this as any).tempMixer;
    if (tempMixer) {
      tempMixer.update(delta);
    }

    // 更新表情控制器
    if (this.expressionController) {
      this.expressionController.update(delta);
    }
  }

  /**
   * 获取当前状态
   */
  public getState(): AvatarState {
    return this.state;
  }

  /**
   * 获取当前表情
   */
  public getCurrentExpression(): string {
    return this.currentExpression;
  }

  /**
   * 获取当前 emote
   */
  public getCurrentEmote(): string | null {
    return this.currentEmoteId;
  }

  /**
   * 销毁
   */
  public dispose(): void {
    if (this.currentAction) {
      this.currentAction.stop();
      this.currentAction = null;
    }
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.vrm = null;
    this.expressionController = null;
  }
}
