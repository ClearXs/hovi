"use client";

import { Upload, Plus, Trash2, X, Edit, Play, Pause } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
// UI components
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getAgentFile,
  setAgentFile,
  uploadAgentFile,
} from "@/features/persona/services/personaApi";
import { fetchScenes, createScene, updateScene, deleteScene } from "@/features/scene/api/sceneApi";
import type { Scene as ApiScene } from "@/features/scene/types/scene";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/stores/connectionStore";

interface SettingsPanelProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  onSave?: () => void;
  /** 预览动作回调 */
  onPreviewMotion?: (motion: MotionItem) => void;
}

// 预定义的情感动作选项（根据设计文档）
const PREDEFINED_EMOTES = [
  // ===== 通用基础动作 =====
  // 问候类
  {
    id: "greeting_wave",
    label: "挥手打招呼",
    keywords:
      "hello, hi, hey, good morning, good afternoon, welcome, 你好, 您好, 嗨, 哈喽, 早上好, 下午好, 晚上好",
    description: "挥手打招呼 - 用于欢迎用户",
  },
  {
    id: "greeting_bye",
    label: "挥手再见",
    keywords: "bye, goodbye, see you, later, farewell, 再见, 拜拜, 一会儿见, 回头见, 下次见",
    description: "挥手再见 - 用于告别",
  },
  {
    id: "greeting_bow",
    label: "鞠躬",
    keywords: "thank you, thanks, appreciate, 谢谢, 感谢, 不好意思, 多谢, 感激",
    description: "鞠躬 - 用于表达感谢或歉意",
  },
  {
    id: "greeting_handshake",
    label: "握手",
    keywords: "nice to meet you, pleased to meet you, 很高兴认识你, 幸会, 认识你很高兴",
    description: "握手 - 用于初次见面",
  },

  // 肢体动作类
  {
    id: "gesture_nod",
    label: "点头",
    keywords:
      "ok, okay, sure, yes, agree, understand, got it, 好, 可以, 没问题, 明白, 同意, 知道, 懂了, 收到, 行",
    description: "点头 - 表示同意、肯定或理解",
  },
  {
    id: "gesture_shake",
    label: "摇头",
    keywords: "no, nope, disagree, not, wrong, deny, 不, 不要, 不行, 不同意, 错, 没门, 不对",
    description: "摇头 - 表示否定或不同意",
  },
  {
    id: "gesture_point",
    label: "指向",
    keywords: "look, see, here, this, that, 看, 这里, 那里, 这个, 那个, 左边, 右边, 前面, 后面",
    description: "指向 - 用于指示某物或方向",
  },
  {
    id: "gesture_shrug",
    label: "耸肩",
    keywords: "maybe, i don't know, not sure, 不知道, 也许, 不确定, 可能是, 应该吧, 或许",
    description: "耸肩 - 表示无奈、不知道或不确定",
  },
  {
    id: "gesture_come",
    label: "招手示意",
    keywords: "come here, come on, 过来, 来吧, 过来吧, 进来",
    description: "招手 - 用于示意过来",
  },
  {
    id: "gesture_stop",
    label: "停止/暂停",
    keywords: "stop, wait, hold on, pause, 停, 等一下, 等等, 暂停, 稍等",
    description: "停止 - 用于示意暂停或等待",
  },
  {
    id: "gesture_ok",
    label: "OK手势",
    keywords: "ok, good, fine, 好的, 可以, 没问题, 没问题, 妥了",
    description: "OK手势 - 表示确认或完成",
  },
  {
    id: "gesture_thumbsup",
    label: "竖大拇指",
    keywords: "good job, well done, great job, 好样的, 干得好, 点赞, 真棒, 厉害",
    description: "竖大拇指 - 表示赞赏或认可",
  },

  // ===== 情感反应类 =====
  {
    id: "reaction_surprise",
    label: "惊讶",
    keywords:
      "wow, surprising, amazing, incredible, unbelievable, 哇, 厉害, 居然, 没想到, 震惊, 真的吗, 不会吧, 不会吧, 哇塞",
    description: "惊讶 - 表示意外、震惊或惊叹",
  },
  {
    id: "reaction_happy",
    label: "开心/高兴",
    keywords:
      "happy, great, wonderful, awesome, fantastic, excellent, 开心, 高兴, 太棒了, 太好了, 完美, 太好了, 真好, 开心",
    description: "开心 - 表示高兴、兴奋或愉悦",
  },
  {
    id: "reaction_sad",
    label: "悲伤/难过",
    keywords:
      "sad, sorry, unfortunate, unfortunately, regret, 遗憾, 可惜, 难过, 悲伤, 对不起, 真遗憾, 太可惜了",
    description: "悲伤 - 表示难过、遗憾或沮丧",
  },
  {
    id: "reaction_angry",
    label: "生气/愤怒",
    keywords: "angry, mad, furious, annoyed, irritated, 生气, 愤怒, 讨厌, 可恨, 气死了, 太过分了",
    description: "生气 - 表示愤怒、不满或恼火",
  },
  {
    id: "reaction_embarrassed",
    label: "尴尬",
    keywords: "awkward, embarrassing, embarrassing, 尴尬, 不好意思, 丢人了, 好尴尬, 这",
    description: "尴尬 - 表示尴尬或不好意思",
  },
  {
    id: "reaction_relief",
    label: "松一口气",
    keywords: "whew, that's close, thank god, 呼, 好险, 还好, 还好还好, 虚惊一场",
    description: "松一口气 - 表示放心或庆幸",
  },
  {
    id: "reaction_tired",
    label: "疲惫",
    keywords: "tired, exhausted, sleepy, tired, 累了, 好累, 困了, 疲惫, 疲倦",
    description: "疲惫 - 表示疲劳或困倦",
  },

  // ===== 思考类 =====
  {
    id: "thinking",
    label: "思考",
    keywords:
      "think, hmm, consider, ponder, wonder, maybe, perhaps, 想一想, 考虑, 或许, 也许, 让我想想, 让我考虑一下",
    description: "思考 - 表示正在思考或权衡",
  },
  {
    id: "realization",
    label: "恍然大悟",
    keywords:
      "oh i see, i understand now, got it, 原来如此, 明白了, 知道了, 懂了, 原来是这样, 啊原来",
    description: "恍然大悟 - 表示突然理解或想起",
  },
  {
    id: "confused",
    label: "困惑",
    keywords: "confused, puzzled, 困惑, 疑惑, 迷茫, 不懂, 什么意思, 怎么回事",
    description: "困惑 - 表示疑惑或不解",
  },

  // ===== 社交互动类 =====
  {
    id: "celebrate",
    label: "庆祝",
    keywords: "congratulations, yay, victory, 恭喜, 祝贺, 胜利, 太好了, 成功了, 祝贺你",
    description: "庆祝 - 用于庆祝成功或喜事",
  },
  {
    id: "apologize",
    label: "道歉",
    keywords: "sorry, apologize, forgive, 对不起, 请原谅, 抱歉, 对不住了, 不好意思",
    description: "道歉 - 用于表达歉意",
  },
  {
    id: "welcome",
    label: "欢迎",
    keywords: "welcome, you're welcome, 欢迎, 不客气, 欢迎光临, 请进",
    description: "欢迎 - 用于迎接或回应感谢",
  },
  {
    id: "farewell",
    label: "道别",
    keywords: "take care, have a nice day, 保重, 一路顺风, 路上小心, 拜拜",
    description: "道别 - 用于关心式告别",
  },
  {
    id: "encourage",
    label: "鼓励",
    keywords: "you can do it, good luck, fighting, 加油, 努力, 你可以的, 没问题, 相信自己",
    description: "鼓励 - 用于给人加油打气",
  },
  {
    id: "comfort",
    label: "安慰",
    keywords: "it's okay, don't worry, cheer up, 别担心, 没关系, 没关系, 会好的, 一切都会好的",
    description: "安慰 - 用于安慰他人",
  },

  // ===== 日常动作类 =====
  {
    id: "idle_look_around",
    label: "环顾四周",
    keywords: "looking around, look around, 东张西望, 四处看看, 看看周围",
    description: "环顾 - 表示好奇或观察",
  },
  {
    id: "idle_bored",
    label: "无聊",
    keywords: "bored, boring, 无聊, 没意思, 闲得慌, 好无聊",
    description: "无聊 - 表示闲置或无所事事",
  },
  {
    id: "action_sigh",
    label: "叹气",
    keywords: "sigh, oh dear, 叹气, 唉, 哎, 无奈",
    description: "叹气 - 表示无奈或叹息",
  },
  {
    id: "action_dance",
    label: "跳舞",
    keywords: "dance, dancing, 跳舞, 舞动, 跳起来",
    description: "跳舞 - 用于欢乐场合",
  },
  {
    id: "action_clap",
    label: "鼓掌",
    keywords: "clap, applause, applaud, 鼓掌, 拍手, 掌声",
    description: "鼓掌 - 用于表示欢迎或赞赏",
  },
];

// 动作配置
interface MotionItem {
  id: string;
  file: string;
  thumbnail?: string;
  type: "idle" | "emote";
  keywords?: string[];
  description?: string;
}

// 角色配置
interface PersonaConfig {
  vrm: string;
  motions: MotionItem[];
  currentMotion: {
    idle: string | null;
  };
}

// 场景配置
interface LocalScene extends ApiScene {
  activated?: boolean;
}

// ASR 配置
interface AsrConfig {
  provider: "sherpa-onnx" | "deepgram" | "openai" | "groq";
  modelSize?: "tiny" | "base" | "small" | "medium" | "large";
  language?: string;
  vadEnabled?: boolean;
  realTimeSubtitle?: boolean;
  cloudFallback?: boolean;
  cloudApiKey?: string;
  cloudProvider?: "deepgram" | "openai" | "groq";
}

// TTS 配置
interface TtsConfig {
  provider: "elevenlabs" | "openai" | "edge";
  apiKey?: string;
  voiceId?: string;
  voiceName?: string;
  modelId?: string;
  voiceSettings?: {
    stability: number;
    similarityBoost: number;
    style: number;
    speed: number;
  };
  // Edge TTS 专用
  edgeVoice?: string;
  edgeLanguage?: string;
  edgeRate?: string;
  edgeVolume?: string;
}

export function SettingsPanel({
  open,
  onOpenChange,
  onClose,
  onSave,
  onPreviewMotion,
}: SettingsPanelProps) {
  const wsClient = useConnectionStore((s) => s.wsClient);

  const [loading, setLoading] = useState(true);
  const agentId = "main";
  const [personaConfig, setPersonaConfig] = useState<PersonaConfig>({
    vrm: "",
    motions: [],
    currentMotion: { idle: null },
  });
  // 当前激活/选中的 motion（用于预览高亮）
  const [activeMotionFile, setActiveMotionFile] = useState<string | null>(null);
  // 动作编辑 Dialog 状态
  const [isMotionDialogOpen, setIsMotionDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedMotionFile, setSelectedMotionFile] = useState<File | null>(null);
  const [motionFileName, setMotionFileName] = useState("");
  const [uploadingMotion, setUploadingMotion] = useState(false);
  // Dialog 表单状态
  const [motionForm, setMotionForm] = useState<{
    type: "idle" | "emote";
    file: string;
    thumbnail: string;
    id: string;
    description: string;
    keywords: string;
  }>({
    type: "emote",
    file: "",
    thumbnail: "",
    id: "",
    description: "",
    keywords: "",
  });
  // 场景相关状态
  const [scenes, setScenes] = useState<LocalScene[]>([]);
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  // 场景编辑 Dialog 状态
  const [isSceneDialogOpen, setIsSceneDialogOpen] = useState(false);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [sceneForm, setSceneForm] = useState<{
    name: string;
    description: string;
    r_path: string;
    thumb: string;
  }>({
    name: "",
    description: "",
    r_path: "",
    thumb: "",
  });
  const [sceneThumbFile, setSceneThumbFile] = useState<File | null>(null);
  const [sceneThumbPreview, setSceneThumbPreview] = useState<string>("");
  const [sceneFile, setSceneFile] = useState<File | null>(null);
  const [soulContent, setSoulContent] = useState("");
  const [asrConfig, setAsrConfig] = useState<AsrConfig>({
    provider: "deepgram",
    language: "zh-CN",
    vadEnabled: true,
    realTimeSubtitle: true,
    cloudFallback: false,
    cloudApiKey: "",
    cloudProvider: "deepgram",
  });
  const [ttsConfig, setTtsConfig] = useState<TtsConfig>({
    provider: "elevenlabs",
    apiKey: "",
    voiceId: "",
    voiceName: "",
    modelId: "eleven_multilingual_v2",
    voiceSettings: {
      stability: 0.5,
      similarityBoost: 0.75,
      style: 0.0,
      speed: 1.0,
    },
  });
  const [saving, setSaving] = useState(false);
  const [uploadingVrm, setUploadingVrm] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // 面板拖动状态
  const [panelPosition, setPanelPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const panelDragInfo = useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0 });

  const loadData = useCallback(async () => {
    if (!wsClient) return;
    setLoading(true);

    try {
      const fileResult = await getAgentFile(wsClient, agentId, "persona.json");
      const fileContent = fileResult?.content;
      if (fileContent) {
        const content = fileContent.trim();
        // 检查是否是有效的 JSON 配置
        if (content.startsWith("{") && content.endsWith("}")) {
          try {
            const config = JSON.parse(content);
            // 支持新格式 motions: { idle, emotes[] } 或旧格式 motions: string[]
            let motions: MotionItem[] = [];
            if (config.motions) {
              if (typeof config.motions === "object") {
                // 新格式: { idle: {...}, emotes: [...] }
                if (config.motions.idle) {
                  motions.push({
                    ...config.motions.idle,
                    type: "idle",
                  });
                }
                if (Array.isArray(config.motions.emotes)) {
                  config.motions.emotes.forEach((emote: MotionItem) => {
                    motions.push({ ...emote, type: "emote" });
                  });
                }
              } else if (Array.isArray(config.motions)) {
                // 旧格式: string[]
                motions = config.motions.map((m: string | { file: string }) => ({
                  id:
                    typeof m === "string"
                      ? m
                          .split("/")
                          .pop()
                          ?.replace(/\.[^.]+$/, "") || "motion"
                      : m.file
                          ?.split("/")
                          .pop()
                          ?.replace(/\.[^.]+$/, "") || "motion",
                  file: typeof m === "string" ? m : m.file,
                  type: "emote" as const,
                }));
              }
            }
            // 当前选中的 idle 动作
            const currentIdle = config.currentMotion?.idle || null;
            setPersonaConfig((prev) => ({
              ...prev,
              vrm: config.vrm || "",
              motions: motions,
              currentMotion: { idle: currentIdle },
            }));

            // 读取 ASR 配置
            if (config.asr) {
              setAsrConfig((prev) => ({ ...prev, ...config.asr }));
            }

            // 读取 TTS 配置
            if (config.tts) {
              setTtsConfig((prev) => ({ ...prev, ...config.tts }));
            }
          } catch (e) {
            console.error("Failed to parse persona.json as JSON:", e);
          }
        }
      }

      const soulResult = await getAgentFile(wsClient, agentId, "SOUL.md");
      const content = soulResult?.content ?? soulResult?.file?.content ?? "";
      setSoulContent(content);

      const scenesData = await fetchScenes(wsClient, agentId);
      // 修复字段映射：后端返回 active，前端使用 activated
      const mappedScenes = scenesData.map((s: any) => ({
        ...s,
        activated: s.active,
      }));
      setScenes(mappedScenes);
      const activatedScene = mappedScenes.find((s: LocalScene) => s.activated);
      if (activatedScene) {
        setCurrentSceneId(activatedScene.id);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }, [wsClient]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  const handleSave = async () => {
    if (!wsClient) return;
    setSaving(true);

    try {
      await setAgentFile(
        wsClient,
        agentId,
        "persona.json",
        JSON.stringify({
          vrm: personaConfig.vrm,
          motions: {
            idle: personaConfig.motions.find((m) => m.type === "idle") || null,
            emotes: personaConfig.motions.filter((m) => m.type === "emote"),
          },
          currentMotion: personaConfig.currentMotion,
          asr: asrConfig,
          tts: ttsConfig,
        }),
      );

      await setAgentFile(wsClient, agentId, "SOUL.md", soulContent);

      onSave?.();
      onClose?.();
    } catch (error) {
      console.error("Failed to save config:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleVrmUpload = async (file: File) => {
    console.log("VRM upload started:", file.name, "wsClient:", !!wsClient);
    if (!wsClient) {
      console.error("Missing wsClient");
      return;
    }
    setUploadingVrm(true);

    try {
      // 使用 FileReader 避免大文件栈溢出
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // 移除 data:application/octet-stream;base64, 前缀
          const base64Data = result.split(",")[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 文件存储路径：{agentId}/models/{filename}，例如 main/models/avatar.vrm
      const fileName = `${agentId}/models/${file.name}`;
      // persona.json 中只保存相对路径（不带 agentId 前缀），例如 models/avatar.vrm
      const configVrmPath = `models/${file.name}`;
      console.log("Uploading VRM to:", fileName);
      const result = await uploadAgentFile(
        wsClient,
        agentId,
        fileName,
        base64,
        "model/gltf-binary",
      );
      console.log("VRM upload result:", result);

      setPersonaConfig((prev) => ({ ...prev, vrm: configVrmPath }));
      console.log("Updated personaConfig.vrm to:", configVrmPath);

      // 自动保存配置
      await setAgentFile(
        wsClient,
        agentId,
        "persona.json",
        JSON.stringify({
          vrm: configVrmPath,
          motions: {
            idle: personaConfig.motions.find((m) => m.type === "idle") || null,
            emotes: personaConfig.motions.filter((m) => m.type === "emote"),
          },
          currentMotion: personaConfig.currentMotion,
          asr: asrConfig,
          tts: ttsConfig,
        }),
      );
      console.log("Auto-saved persona.json with VRM path");

      // 触发刷新回调，让页面重新加载 VRM
      onSave?.();
    } catch (error) {
      console.error("Failed to upload VRM:", error);
    } finally {
      setUploadingVrm(false);
    }
  };

  const handleMotionUpload = async (form: typeof motionForm, file: File) => {
    if (!wsClient) return;

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(",")[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 文件存储路径：{agentId}/motions/{filename}，例如 main/motions/idle.vrma
      const fileName = `${agentId}/motions/${file.name}`;
      await uploadAgentFile(wsClient, agentId, fileName, base64, "model/vmd");

      // 构建动作项
      const motionItem: MotionItem = {
        id: form.id || file.name.replace(/\.[^.]+$/, ""),
        // 存储相对路径（不包含 agentId 前缀）
        file: `motions/${file.name}`,
        type: form.type,
        keywords: form.keywords ? form.keywords.split(",").map((k) => k.trim()) : [],
        description: form.description,
      };

      // 相对路径（不包含 agentId 前缀）
      const relativeMotionFile = `motions/${file.name}`;

      setPersonaConfig((prev) => ({
        ...prev,
        motions: [...prev.motions, motionItem],
        // 如果是 idle 类型，自动设置为当前 idle 动作
        currentMotion:
          form.type === "idle"
            ? { ...prev.currentMotion, idle: relativeMotionFile }
            : prev.currentMotion,
      }));
    } catch (error) {
      console.error("Failed to upload motion:", error);
    }
  };

  // Dialog 中确认添加/编辑动作
  const handleMotionDialogConfirm = async () => {
    // 编辑模式：直接更新 motion 信息
    if (isEditMode) {
      const keywordsArray = motionForm.keywords
        .split(",")
        .map((k) => k.trim())
        .filter((k) => k);

      setPersonaConfig((p) => ({
        ...p,
        motions: p.motions.map((m) =>
          m.file === motionForm.file
            ? {
                ...m,
                id: motionForm.id,
                type: motionForm.type,
                description: motionForm.description,
                keywords: keywordsArray,
              }
            : m,
        ),
      }));

      setIsMotionDialogOpen(false);
      setIsEditMode(false);
      setMotionForm({
        type: "emote",
        file: "",
        thumbnail: "",
        id: "",
        description: "",
        keywords: "",
      });
      return;
    }

    // 添加模式：上传新动作
    if (!selectedMotionFile) return;
    setUploadingMotion(true);
    try {
      await handleMotionUpload(motionForm, selectedMotionFile);
      setIsMotionDialogOpen(false);
      setSelectedMotionFile(null);
      setMotionFileName("");
      setMotionForm({
        type: "emote",
        file: "",
        thumbnail: "",
        id: "",
        description: "",
        keywords: "",
      });
    } finally {
      setUploadingMotion(false);
    }
  };

  // Dialog 中选择文件
  const handleMotionFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedMotionFile(file);
      setMotionFileName(file.name);
      // 只设置文件路径，ID 由用户在下拉框中选择
      setMotionForm((prev) => ({ ...prev, file: `motions/${file.name}` }));
    }
  };

  // 打开添加场景 Dialog
  const handleAddScene = () => {
    setEditingSceneId(null);
    setSceneForm({
      name: "",
      description: "",
      r_path: "",
      thumb: "",
    });
    setSceneThumbFile(null);
    setSceneThumbPreview("");
    setSceneFile(null);
    setIsSceneDialogOpen(true);
  };

  // 打开编辑场景 Dialog
  const handleEditScene = (scene: LocalScene) => {
    setEditingSceneId(scene.id);
    setSceneForm({
      name: scene.name,
      description: scene.description || "",
      r_path: scene.r_path || "",
      thumb: scene.thumb || "",
    });
    setSceneThumbFile(null);
    setSceneThumbPreview("");
    setIsSceneDialogOpen(true);
  };

  // 处理场景缩略图选择
  const handleSceneThumbSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSceneThumbFile(file);
      // 从文件名提取场景名称
      const sceneName = file.name.replace(/\.[^.]+$/, "");
      if (!sceneForm.name) {
        setSceneForm((prev) => ({ ...prev, name: sceneName }));
      }
      // 生成预览 URL
      const previewUrl = URL.createObjectURL(file);
      setSceneThumbPreview(previewUrl);
    }
  };

  // 确认添加/编辑场景
  const handleSceneDialogConfirm = async () => {
    if (!wsClient) return;
    if (!sceneForm.name.trim()) {
      console.error("Scene name is required");
      return;
    }

    try {
      const sceneName = sceneForm.name.trim();
      let thumbPath = sceneForm.thumb;
      let mainFile = "";

      // 上传场景文件 (GLTF/GLB)
      if (sceneFile) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(sceneFile);
        });

        const fileName = `${agentId}/scenes/${sceneName}/${sceneFile.name}`;
        await uploadAgentFile(wsClient, agentId, fileName, base64, "model/gltf-binary");
        mainFile = `scenes/${sceneName}/${sceneFile.name}`;
      }

      // 上传缩略图
      if (sceneThumbFile) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(sceneThumbFile);
        });

        const fileName = `${agentId}/scenes/${sceneName}/${sceneThumbFile.name}`;
        await uploadAgentFile(wsClient, agentId, fileName, base64, "image/png");
        thumbPath = `scenes/${sceneName}/${sceneThumbFile.name}`;
      }

      if (editingSceneId) {
        // 编辑模式：更新场景
        await updateScene(wsClient, {
          agentId,
          sceneId: editingSceneId,
          name: sceneName,
          description: sceneForm.description,
          r_path: `scenes/${sceneName}/`,
          thumb: thumbPath || undefined,
          main_file: mainFile || undefined,
        });
        setScenes(
          scenes.map((s) =>
            s.id === editingSceneId
              ? {
                  ...s,
                  name: sceneName,
                  description: sceneForm.description,
                  r_path: `scenes/${sceneName}/`,
                  thumb: thumbPath,
                  main_file: mainFile || s.main_file,
                }
              : s,
          ),
        );
      } else {
        // 添加模式：创建场景
        const result = await createScene(wsClient, {
          agentId,
          name: sceneName,
          description: sceneForm.description,
          r_path: `scenes/${sceneName}/`,
          main_file: mainFile || "scene.json",
          thumb: thumbPath || undefined,
        });
        if (result.ok && result.scene) {
          setScenes([...scenes, { ...result.scene, activated: false }]);
        }
      }

      setIsSceneDialogOpen(false);
    } catch (error) {
      console.error("Failed to save scene:", error);
    }
  };

  const handleDeleteScene = async (sceneId: string) => {
    if (!wsClient) return;
    try {
      await deleteScene(wsClient, agentId, sceneId);
      setScenes(scenes.filter((s) => s.id !== sceneId));
    } catch (error) {
      console.error("Failed to delete scene:", error);
    }
  };

  const handleActivateScene = async (sceneId: string) => {
    if (!wsClient) return;
    try {
      const updatedScenes = scenes.map((s) => ({
        ...s,
        activated: s.id === sceneId,
      }));
      setScenes(updatedScenes);
      setCurrentSceneId(sceneId);

      await updateScene(wsClient, {
        agentId: agentId,
        sceneId,
      });
    } catch (error) {
      console.error("Failed to activate scene:", error);
    }
  };

  // 面板拖动处理
  const handlePanelDragStart = useCallback(
    (e: React.PointerEvent | React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const panel = panelRef.current;

      panelDragInfo.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosX: panelPosition?.x || 0,
        startPosY: panelPosition?.y || 0,
      };

      setIsDraggingPanel(true);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - panelDragInfo.current.startX;
        const deltaY = moveEvent.clientY - panelDragInfo.current.startY;

        // 限制范围在窗口内，允许超出但有限制
        if (panel) {
          const panelWidth = panel.offsetWidth;
          const panelHeight = panel.offsetHeight;
          const maxX = window.innerWidth - panelWidth / 2;
          const maxY = window.innerHeight - panelHeight / 2;
          const newX = Math.max(-maxX, Math.min(maxX, panelDragInfo.current.startPosX + deltaX));
          const newY = Math.max(-maxY, Math.min(maxY, panelDragInfo.current.startPosY + deltaY));
          setPanelPosition({ x: newX, y: newY });
        } else {
          setPanelPosition({
            x: panelDragInfo.current.startPosX + deltaX,
            y: panelDragInfo.current.startPosY + deltaY,
          });
        }
      };

      const handlePointerUp = () => {
        setIsDraggingPanel(false);
        document.removeEventListener("pointermove", handleMouseMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };

      document.addEventListener("pointermove", handleMouseMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [panelPosition],
  );

  if (!open) return null;

  return (
    <div className="w-full bg-background rounded-lg shadow-lg overflow-hidden flex flex-col h-full">
      {/* Content - 使用原生滚动 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pointer-events-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900" />
          </div>
        ) : (
          <>
            {/* VRM 模型 */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">VRM 模型</label>
              {personaConfig.vrm ? (
                // 已上传 - 显示文件信息
                <div className="flex items-center gap-2 p-2 border border-dashed rounded-md bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {personaConfig.vrm.split("/").pop()}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {personaConfig.vrm}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => setPersonaConfig((p) => ({ ...p, vrm: "" }))}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                // 未上传 - 显示上传按钮
                <div className="flex gap-1">
                  <div className="flex-1 text-xs text-muted-foreground py-2">
                    点击右侧按钮上传 VRM 模型
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    disabled={uploadingVrm}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log("Upload button clicked");
                      document.getElementById("vrm-upload-input")?.click();
                    }}
                  >
                    {uploadingVrm ? (
                      <div className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Upload className="w-3 h-3" />
                    )}
                  </Button>
                  <input
                    id="vrm-upload-input"
                    type="file"
                    accept=".vrm"
                    className="hidden"
                    onChange={(e) => {
                      console.log("File selected:", e.target.files);
                      const file = e.target.files?.[0];
                      if (file) handleVrmUpload(file);
                    }}
                  />
                </div>
              )}
            </div>

            {/* 动作列表 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">动作</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setIsMotionDialogOpen(true)}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  添加
                </Button>
              </div>

              <div className="space-y-1">
                {personaConfig.motions.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    暂无动作，点击添加
                  </p>
                ) : (
                  personaConfig.motions.map((motion) => {
                    // 判断是否被选中（高亮）
                    const isActive = activeMotionFile === motion.file;

                    return (
                      <div
                        key={motion.file}
                        className={`flex items-center justify-between p-1.5 border border-dashed rounded-md text-xs cursor-pointer ${
                          isActive ? "border-primary bg-primary/10" : "hover:bg-muted/50"
                        }`}
                        onClick={() => {
                          // 设置当前激活的 motion（用于高亮）
                          setActiveMotionFile(motion.file);
                          // 点击时切换当前 motion
                          if (motion.type === "idle") {
                            setPersonaConfig((p) => ({
                              ...p,
                              currentMotion: { ...p.currentMotion, idle: motion.file },
                            }));
                          }
                          // 触发预览/切换回调
                          onPreviewMotion?.(motion);
                        }}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {/* idle 类型显示单选框 */}
                          {motion.type === "idle" && (
                            <input
                              type="radio"
                              name="idle-motion"
                              checked={personaConfig.currentMotion.idle === motion.file}
                              onChange={() =>
                                setPersonaConfig((p) => ({
                                  ...p,
                                  currentMotion: { ...p.currentMotion, idle: motion.file },
                                }))
                              }
                              className="flex-shrink-0 accent-primary"
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          {/* 类型标签 */}
                          <span
                            className={`text-[10px] px-1 rounded ${
                              motion.type === "idle"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {motion.type}
                          </span>
                          {/* 动作 ID */}
                          <span className="truncate font-medium">{motion.id}</span>
                          {/* 关键词 */}
                          {motion.keywords && motion.keywords.length > 0 && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              {motion.keywords.slice(0, 3).join(", ")}
                            </span>
                          )}
                          {/* 当前标识 */}
                          {motion.type === "idle" &&
                            personaConfig.currentMotion.idle === motion.file && (
                              <span className="text-xs text-primary flex-shrink-0">(默认)</span>
                            )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {/* 编辑按钮 */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            title="编辑动作"
                            onClick={(e) => {
                              e.stopPropagation();
                              // 填充表单数据
                              setMotionForm({
                                type: motion.type,
                                file: motion.file,
                                thumbnail: motion.thumbnail || "",
                                id: motion.id,
                                description: motion.description || "",
                                keywords: motion.keywords?.join(", ") || "",
                              });
                              setSelectedMotionFile(null);
                              setMotionFileName(motion.file.split("/").pop() || "");
                              setIsEditMode(true);
                              setIsMotionDialogOpen(true);
                            }}
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          {/* 删除按钮 */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPersonaConfig((p) => ({
                                ...p,
                                motions: p.motions.filter((m) => m.file !== motion.file),
                                currentMotion:
                                  p.currentMotion.idle === motion.file
                                    ? { ...p.currentMotion, idle: null }
                                    : p.currentMotion,
                              }));
                              // 清除激活状态
                              if (activeMotionFile === motion.file) {
                                setActiveMotionFile(null);
                              }
                            }}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 场景配置 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">场景</label>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs"
                  onClick={handleAddScene}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  添加
                </Button>
              </div>

              <div className="space-y-1">
                {scenes.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">暂无场景</p>
                ) : (
                  scenes.map((scene) => (
                    <div
                      key={scene.id}
                      className={cn(
                        "flex items-center justify-between p-2 border border-dashed rounded-md cursor-pointer text-sm",
                        scene.id === currentSceneId
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50",
                      )}
                      onClick={() => handleActivateScene(scene.id)}
                    >
                      <span className="truncate flex-1">{scene.name}</span>
                      <div className="flex items-center gap-2 ml-2">
                        {scene.activated ? (
                          <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                            激活
                          </span>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditScene(scene);
                              }}
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteScene(scene.id);
                              }}
                            >
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 添加/编辑场景 Dialog */}
            <Dialog open={isSceneDialogOpen} onOpenChange={setIsSceneDialogOpen}>
              <DialogContent className="max-w-[400px]">
                <DialogHeader>
                  <DialogTitle>{editingSceneId ? "编辑场景" : "添加场景"}</DialogTitle>
                  <DialogDescription>
                    {editingSceneId ? "修改场景信息" : "上传场景文件创建场景"}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {/* 场景文件上传 (GLTF/GLB) */}
                  {!editingSceneId && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">场景文件</label>
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                        <input
                          type="file"
                          accept=".gltf,.glb"
                          className="hidden"
                          id="scene-file-upload"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              // 从文件名提取场景名称
                              const sceneName = file.name.replace(/\.[^.]+$/, "");
                              setSceneForm((prev) => ({ ...prev, name: sceneName }));
                            }
                          }}
                        />
                        <label htmlFor="scene-file-upload" className="cursor-pointer">
                          <div className="flex flex-col items-center gap-1">
                            <Upload className="w-5 h-5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              点击上传场景文件 (.gltf, .glb)
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* 缩略图上传 */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      缩略图 (可选)
                    </label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        id="scene-thumb-upload"
                        onChange={handleSceneThumbSelect}
                      />
                      <label htmlFor="scene-thumb-upload" className="cursor-pointer">
                        {sceneThumbPreview ? (
                          <div className="flex flex-col items-center gap-2">
                            <img
                              src={sceneThumbPreview}
                              alt="预览"
                              className="w-16 h-16 object-cover rounded"
                            />
                            <span className="text-xs text-muted-foreground">点击更换缩略图</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <Upload className="w-5 h-5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">点击上传缩略图</span>
                          </div>
                        )}
                      </label>
                    </div>
                  </div>

                  {/* 场景描述 */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">描述 (可选)</label>
                    <Textarea
                      value={sceneForm.description}
                      onChange={(e) =>
                        setSceneForm((prev) => ({ ...prev, description: e.target.value }))
                      }
                      placeholder="输入场景描述"
                      className="min-h-[60px] resize-none"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsSceneDialogOpen(false)}>
                    取消
                  </Button>
                  <Button onClick={handleSceneDialogConfirm} disabled={!sceneForm.name.trim()}>
                    {editingSceneId ? "保存" : "添加"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Soul 配置 */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Soul 配置</label>
              <Textarea
                value={soulContent}
                onChange={(e) => setSoulContent(e.target.value)}
                placeholder="定义角色的性格、背景故事等..."
                className="min-h-[80px] text-xs resize-none"
              />
            </div>

            {/* 语音识别设置 (ASR) */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                语音识别设置 (ASR)
              </label>

              {/* ASR 提供商 */}
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">ASR 提供商</label>
                <Select
                  value={asrConfig.provider}
                  onValueChange={(value: AsrConfig["provider"]) =>
                    setAsrConfig((prev) => ({ ...prev, provider: value }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="选择 ASR 提供商" />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    sideOffset={4}
                    className="z-[100] bg-white shadow-lg"
                  >
                    <SelectItem value="sherpa-onnx" className="text-xs">
                      本地 (sherpa-onnx)
                    </SelectItem>
                    <SelectItem value="deepgram" className="text-xs">
                      Deepgram
                    </SelectItem>
                    <SelectItem value="openai" className="text-xs">
                      OpenAI Whisper
                    </SelectItem>
                    <SelectItem value="groq" className="text-xs">
                      Groq
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* sherpa-onnx 本地设置 (当选择 sherpa-onnx 时显示) */}
              {asrConfig.provider === "sherpa-onnx" && (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground">
                    使用本地 sherpa-onnx 模型 (需下载模型文件)
                  </p>
                </div>
              )}

              {/* 云端设置 (当选择云端或开启回退时显示) */}
              {(asrConfig.provider !== "sherpa-onnx" || asrConfig.cloudFallback) && (
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">API Key</label>
                  <Input
                    type="password"
                    value={asrConfig.cloudApiKey || ""}
                    onChange={(e) =>
                      setAsrConfig((prev) => ({ ...prev, cloudApiKey: e.target.value }))
                    }
                    placeholder="输入 API Key"
                    className="h-8 text-xs"
                  />
                  <label className="text-[10px] text-muted-foreground">云端提供商</label>
                  <Select
                    value={asrConfig.cloudProvider || "deepgram"}
                    onValueChange={(value) =>
                      setAsrConfig((prev) => ({
                        ...prev,
                        cloudProvider: value as AsrConfig["cloudProvider"],
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="选择云端提供商" />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      sideOffset={4}
                      className="z-[100] bg-white shadow-lg"
                    >
                      <SelectItem value="deepgram" className="text-xs">
                        Deepgram
                      </SelectItem>
                      <SelectItem value="openai" className="text-xs">
                        OpenAI
                      </SelectItem>
                      <SelectItem value="groq" className="text-xs">
                        Groq
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* 高级设置 */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="vadEnabled"
                    checked={asrConfig.vadEnabled ?? true}
                    onChange={(e) =>
                      setAsrConfig((prev) => ({ ...prev, vadEnabled: e.target.checked }))
                    }
                    className="w-3 h-3 accent-primary"
                  />
                  <label htmlFor="vadEnabled" className="text-[10px] text-muted-foreground">
                    启用语音活动检测 (VAD)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="realTimeSubtitle"
                    checked={asrConfig.realTimeSubtitle ?? true}
                    onChange={(e) =>
                      setAsrConfig((prev) => ({ ...prev, realTimeSubtitle: e.target.checked }))
                    }
                    className="w-3 h-3 accent-primary"
                  />
                  <label htmlFor="realTimeSubtitle" className="text-[10px] text-muted-foreground">
                    启用实时字幕
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="cloudFallback"
                    checked={asrConfig.cloudFallback ?? false}
                    onChange={(e) =>
                      setAsrConfig((prev) => ({ ...prev, cloudFallback: e.target.checked }))
                    }
                    className="w-3 h-3 accent-primary"
                  />
                  <label htmlFor="cloudFallback" className="text-[10px] text-muted-foreground">
                    本地失败时启用云端回退
                  </label>
                </div>
              </div>

              {/* 语言选择 */}
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">语言</label>
                <Select
                  value={asrConfig.language || "zh-CN"}
                  onValueChange={(value) => setAsrConfig((prev) => ({ ...prev, language: value }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="选择语言" />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    sideOffset={4}
                    className="z-[100] bg-white shadow-lg"
                  >
                    <SelectItem value="zh-CN" className="text-xs">
                      中文
                    </SelectItem>
                    <SelectItem value="en-US" className="text-xs">
                      English
                    </SelectItem>
                    <SelectItem value="ja-JP" className="text-xs">
                      日本語
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 语音合成设置 (TTS) */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                语音合成设置 (TTS)
              </label>

              {/* TTS 提供商 */}
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">TTS 提供商</label>
                <Select
                  value={ttsConfig.provider}
                  onValueChange={(value: TtsConfig["provider"]) =>
                    setTtsConfig((prev) => ({ ...prev, provider: value }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="选择 TTS 提供商" />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    sideOffset={4}
                    className="z-[100] bg-white shadow-lg"
                  >
                    <SelectItem value="elevenlabs" className="text-xs">
                      ElevenLabs
                    </SelectItem>
                    <SelectItem value="openai" className="text-xs">
                      OpenAI
                    </SelectItem>
                    <SelectItem value="edge" className="text-xs">
                      Edge TTS
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* API Key (非 Edge 时显示) */}
              {ttsConfig.provider !== "edge" && (
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">API Key</label>
                  <Input
                    type="password"
                    value={ttsConfig.apiKey || ""}
                    onChange={(e) => setTtsConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                    placeholder="输入 API Key"
                    className="h-8 text-xs"
                  />
                </div>
              )}

              {/* Voice ID / Voice Name */}
              {(ttsConfig.provider === "elevenlabs" || ttsConfig.provider === "openai") && (
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">
                    {ttsConfig.provider === "elevenlabs" ? "Voice ID" : "Voice"}
                  </label>
                  <Input
                    value={ttsConfig.voiceId || ""}
                    onChange={(e) => setTtsConfig((prev) => ({ ...prev, voiceId: e.target.value }))}
                    placeholder={
                      ttsConfig.provider === "elevenlabs" ? "输入 Voice ID" : "输入 Voice ID"
                    }
                    className="h-8 text-xs"
                  />
                </div>
              )}

              {/* Edge TTS 设置 */}
              {ttsConfig.provider === "edge" && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">语言</label>
                    <Select
                      value={ttsConfig.edgeLanguage || "zh-CN"}
                      onValueChange={(value) =>
                        setTtsConfig((prev) => ({ ...prev, edgeLanguage: value }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="选择语言" />
                      </SelectTrigger>
                      <SelectContent
                        position="popper"
                        sideOffset={4}
                        className="z-[100] bg-white shadow-lg"
                      >
                        <SelectItem value="zh-CN" className="text-xs">
                          中文 (简体)
                        </SelectItem>
                        <SelectItem value="zh-HK" className="text-xs">
                          中文 (香港)
                        </SelectItem>
                        <SelectItem value="zh-TW" className="text-xs">
                          中文 (台湾)
                        </SelectItem>
                        <SelectItem value="en-US" className="text-xs">
                          English (US)
                        </SelectItem>
                        <SelectItem value="en-GB" className="text-xs">
                          English (UK)
                        </SelectItem>
                        <SelectItem value="ja-JP" className="text-xs">
                          日本語
                        </SelectItem>
                        <SelectItem value="ko-KR" className="text-xs">
                          한국어
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">声音</label>
                    <Select
                      value={ttsConfig.edgeVoice || ""}
                      onValueChange={(value) =>
                        setTtsConfig((prev) => ({ ...prev, edgeVoice: value }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="选择声音" />
                      </SelectTrigger>
                      <SelectContent
                        position="popper"
                        sideOffset={4}
                        className="z-[100] bg-white shadow-lg"
                      >
                        <SelectItem value="zh-CN-XiaoxiaoNeural" className="text-xs">
                          Xiaoxiao (女声)
                        </SelectItem>
                        <SelectItem value="zh-CN-YunxiNeural" className="text-xs">
                          Yunxi (男声)
                        </SelectItem>
                        <SelectItem value="zh-CN-YunyangNeural" className="text-xs">
                          Yunyang (男声)
                        </SelectItem>
                        <SelectItem value="zh-CN-XiaoyiNeural" className="text-xs">
                          Xiaoyi (女声)
                        </SelectItem>
                        <SelectItem value="zh-HK-HiuGaaiNeural" className="text-xs">
                          HiuGaai (女声)
                        </SelectItem>
                        <SelectItem value="zh-TT-ZhiweiNeural" className="text-xs">
                          Zhiwei (男声)
                        </SelectItem>
                        <SelectItem value="en-US-JennyNeural" className="text-xs">
                          Jenny (女声)
                        </SelectItem>
                        <SelectItem value="en-US-GuyNeural" className="text-xs">
                          Guy (男声)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">语速</label>
                    <Select
                      value={ttsConfig.edgeRate || "0"}
                      onValueChange={(value) =>
                        setTtsConfig((prev) => ({ ...prev, edgeRate: value }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="选择语速" />
                      </SelectTrigger>
                      <SelectContent
                        position="popper"
                        sideOffset={4}
                        className="z-[100] bg-white shadow-lg"
                      >
                        <SelectItem value="-50%" className="text-xs">
                          慢 (-50%)
                        </SelectItem>
                        <SelectItem value="-25%" className="text-xs">
                          较慢 (-25%)
                        </SelectItem>
                        <SelectItem value="0" className="text-xs">
                          正常 (0%)
                        </SelectItem>
                        <SelectItem value="+25%" className="text-xs">
                          较快 (+25%)
                        </SelectItem>
                        <SelectItem value="+50%" className="text-xs">
                          快 (+50%)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* ElevenLabs 语音设置 */}
              {ttsConfig.provider === "elevenlabs" && (
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">语音设置</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground">稳定性</label>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={ttsConfig.voiceSettings?.stability ?? 0.5}
                        onChange={(e) =>
                          setTtsConfig((prev) => ({
                            ...prev,
                            voiceSettings: {
                              ...prev.voiceSettings!,
                              stability: parseFloat(e.target.value),
                            },
                          }))
                        }
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">相似度</label>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={ttsConfig.voiceSettings?.similarityBoost ?? 0.75}
                        onChange={(e) =>
                          setTtsConfig((prev) => ({
                            ...prev,
                            voiceSettings: {
                              ...prev.voiceSettings!,
                              similarityBoost: parseFloat(e.target.value),
                            },
                          }))
                        }
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">风格</label>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.01}
                        value={ttsConfig.voiceSettings?.style ?? 0}
                        onChange={(e) =>
                          setTtsConfig((prev) => ({
                            ...prev,
                            voiceSettings: {
                              ...prev.voiceSettings!,
                              style: parseFloat(e.target.value),
                            },
                          }))
                        }
                        className="h-7 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">语速</label>
                      <Input
                        type="number"
                        min={0.5}
                        max={2}
                        step={0.1}
                        value={ttsConfig.voiceSettings?.speed ?? 1.0}
                        onChange={(e) =>
                          setTtsConfig((prev) => ({
                            ...prev,
                            voiceSettings: {
                              ...prev.voiceSettings!,
                              speed: parseFloat(e.target.value),
                            },
                          }))
                        }
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end p-3 shrink-0 bg-background">
        <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>

      {/* 添加/编辑动作 Dialog */}
      <Dialog
        open={isMotionDialogOpen}
        onOpenChange={(open) => {
          setIsMotionDialogOpen(open);
          if (!open) setIsEditMode(false);
        }}
      >
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{isEditMode ? "编辑动作" : "添加动作"}</DialogTitle>
            <DialogDescription>
              {isEditMode ? "修改动作信息" : "上传动作文件 (.vmd, .vma, .vrma)"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* 动作类型 */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">动作类型</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="motionType"
                    checked={motionForm.type === "idle"}
                    onChange={() => setMotionForm((prev) => ({ ...prev, type: "idle" }))}
                    className="accent-primary"
                  />
                  <span>idle (待机动作)</span>
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="motionType"
                    checked={motionForm.type === "emote"}
                    onChange={() => setMotionForm((prev) => ({ ...prev, type: "emote" }))}
                    className="accent-primary"
                  />
                  <span>emote (情感动作)</span>
                </label>
              </div>
            </div>

            {/* Motion 文件 */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Motion 文件</label>
              <div
                className={`border-2 border-dashed border-gray-300 rounded-lg p-4 text-center ${isEditMode ? "bg-muted/50" : "hover:border-gray-400 transition-colors"}`}
              >
                {isEditMode ? (
                  // 编辑模式：只显示文件名
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {motionFileName || motionForm.file.split("/").pop()}
                    </span>
                  </div>
                ) : (
                  // 添加模式：显示上传控件
                  <>
                    <input
                      type="file"
                      accept=".vmd,.vma,.vrma"
                      className="hidden"
                      id="motion-dialog-upload"
                      onChange={handleMotionFileSelect}
                    />
                    <label htmlFor="motion-dialog-upload" className="cursor-pointer">
                      {motionFileName ? (
                        <div className="flex items-center justify-center gap-2">
                          <Upload className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{motionFileName}</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <Upload className="w-5 h-5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            点击上传 motion 文件
                          </span>
                        </div>
                      )}
                    </label>
                  </>
                )}
              </div>
            </div>

            {/* 预览图 (可选) */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">预览图 (可选)</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id="motion-thumbnail-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setMotionForm((prev) => ({ ...prev, thumbnail: file.name }));
                    }
                  }}
                />
                <label htmlFor="motion-thumbnail-upload" className="cursor-pointer">
                  <div className="flex flex-col items-center gap-1">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">点击上传预览图</span>
                  </div>
                </label>
              </div>
            </div>

            {/* 动作 ID (仅 emote) */}
            {motionForm.type === "emote" && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">动作 ID</label>
                <Select
                  value={motionForm.id}
                  onValueChange={(value) => {
                    const selected = PREDEFINED_EMOTES.find((e) => e.id === value);
                    if (selected) {
                      setMotionForm((prev) => ({
                        ...prev,
                        id: selected.id,
                        keywords: selected.keywords,
                        description: selected.description,
                      }));
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="选择动作类型" />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    sideOffset={4}
                    className="z-[100] bg-white shadow-lg max-h-[350px] w-[320px]"
                  >
                    {PREDEFINED_EMOTES.map((emote) => (
                      <SelectItem key={emote.id} value={emote.id} className="text-xs">
                        <div className="flex flex-col gap-0.5 max-w-[280px]">
                          <span className="font-medium">{emote.label}</span>
                          <span
                            className="text-[10px] text-muted-foreground truncate"
                            title={emote.keywords}
                          >
                            {emote.keywords}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 描述 (可选) */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">描述 (可选)</label>
              <Input
                value={motionForm.description}
                onChange={(e) =>
                  setMotionForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="例如: 挥手打招呼"
                className="h-8 text-xs"
              />
            </div>

            {/* 触发关键词 (仅 emote) */}
            {motionForm.type === "emote" && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">触发关键词</label>
                <Textarea
                  value={motionForm.keywords}
                  onChange={(e) => setMotionForm((prev) => ({ ...prev, keywords: e.target.value }))}
                  placeholder="英文逗号分隔，如: hello, hi, hey, good morning"
                  className="min-h-[60px] text-xs resize-none"
                />
                <p className="text-[10px] text-muted-foreground">
                  AI 根据对话内容匹配关键词后自动触发动作
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsMotionDialogOpen(false);
                setIsEditMode(false);
                setSelectedMotionFile(null);
                setMotionFileName("");
                setMotionForm({
                  type: "emote",
                  file: "",
                  thumbnail: "",
                  id: "",
                  description: "",
                  keywords: "",
                });
              }}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleMotionDialogConfirm}
              disabled={(isEditMode ? false : !selectedMotionFile) || uploadingMotion}
            >
              {uploadingMotion ? "上传中..." : isEditMode ? "保存修改" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SettingsPanel;
