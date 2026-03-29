"use client";

import type { VRM } from "@pixiv/three-vrm";
import { ArrowLeft, Loader2, Save, Settings, User } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  fetchAgentIdentity,
  getAgentFile,
  setAgentFile,
} from "@/features/persona/services/personaApi";
import type { AgentInfo } from "@/features/persona/types/persona";
import { useConnectionStore } from "@/stores/connectionStore";

const VrmViewer = dynamic(
  () => import("@/components/avatar/VrmViewer").then((mod) => mod.VrmViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-gray-100">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    ),
  },
);

type PersonaDetailViewProps = {
  agentId: string;
  onBack: () => void;
};

export function PersonaDetailView({ agentId, onBack }: PersonaDetailViewProps) {
  const wsClient = useConnectionStore((state) => state.wsClient);
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [identityContent, setIdentityContent] = useState<Record<string, string>>({});
  const [vrmLoading, setVrmLoading] = useState(false);

  const vrmUrl = identityContent.vrm || null;

  const handleVrmLoad = useCallback((_vrm: VRM) => {
    setVrmLoading(false);
  }, []);

  useEffect(() => {
    if (!vrmUrl) {
      setVrmLoading(false);
      return;
    }

    setVrmLoading(true);
  }, [vrmUrl]);

  useEffect(() => {
    if (!wsClient?.isConnected() || !agentId) {
      setLoading(false);
      return;
    }

    const loadAgentData = async () => {
      try {
        setLoading(true);
        const identity = await fetchAgentIdentity(wsClient, agentId);
        if (identity) {
          setAgent({ id: agentId, identity });
        }

        const fileResult = await getAgentFile(wsClient, agentId, ".identity.json");
        if (fileResult?.ok && fileResult.content) {
          try {
            setIdentityContent(JSON.parse(fileResult.content) as Record<string, string>);
          } catch {
            setIdentityContent({});
          }
        }
      } catch (error) {
        // Ignore error
      } finally {
        setLoading(false);
      }
    };

    void loadAgentData();
  }, [agentId, wsClient]);

  const handleSave = useCallback(async () => {
    if (!wsClient) {
      return;
    }

    try {
      setSaving(true);
      await setAgentFile(
        wsClient,
        agentId,
        ".identity.json",
        JSON.stringify(identityContent, null, 2),
      );
      window.alert("保存成功");
    } catch (error) {
      window.alert("保存失败");
    } finally {
      setSaving(false);
    }
  }, [agentId, identityContent, wsClient]);

  const handleFieldChange = useCallback((field: string, value: string) => {
    setIdentityContent((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold">
            {identityContent.name || agent?.identity?.name || "虚拟角色"}
          </h1>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          保存配置
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 overflow-auto scrollbar-default border-r">
          <ScrollArea className="h-full">
            <div className="space-y-6 p-6">
              <div className="flex justify-center">
                <div className="flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-4xl font-bold text-white">
                  {identityContent.name?.charAt?.(0) || agent?.identity?.name?.charAt(0) || "?"}
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <User className="h-5 w-5" />
                  基本信息
                </h2>

                <div className="space-y-2">
                  <label className="text-sm font-medium">名称</label>
                  <input
                    type="text"
                    value={identityContent.name || ""}
                    onChange={(event) => handleFieldChange("name", event.target.value)}
                    className="w-full rounded-md border px-3 py-2"
                    placeholder="虚拟角色名称"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">描述</label>
                  <textarea
                    value={identityContent.description || ""}
                    onChange={(event) => handleFieldChange("description", event.target.value)}
                    className="min-h-[100px] w-full rounded-md border px-3 py-2"
                    placeholder="虚拟角色描述"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium"> Emoji</label>
                  <input
                    type="text"
                    value={identityContent.emoji || ""}
                    onChange={(event) => handleFieldChange("emoji", event.target.value)}
                    className="w-full rounded-md border px-3 py-2"
                    placeholder="🎭"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">主题色</label>
                  <input
                    type="text"
                    value={identityContent.theme || ""}
                    onChange={(event) => handleFieldChange("theme", event.target.value)}
                    className="w-full rounded-md border px-3 py-2"
                    placeholder="purple"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Settings className="h-5 w-5" />
                  虚拟形象配置
                </h2>

                <div className="space-y-2">
                  <label className="text-sm font-medium">VRM 模型路径</label>
                  <input
                    type="text"
                    value={identityContent.vrm || ""}
                    onChange={(event) => handleFieldChange("vrm", event.target.value)}
                    className="w-full rounded-md border px-3 py-2"
                    placeholder="/path/to/model.vrm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">参考音频路径 (TTS)</label>
                  <input
                    type="text"
                    value={identityContent.refAudio || ""}
                    onChange={(event) => handleFieldChange("refAudio", event.target.value)}
                    className="w-full rounded-md border px-3 py-2"
                    placeholder="/path/to/audio.wav"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">待机动画</label>
                  <input
                    type="text"
                    value={identityContent.idleMotion || ""}
                    onChange={(event) => handleFieldChange("idleMotion", event.target.value)}
                    className="w-full rounded-md border px-3 py-2"
                    placeholder="idle_loop"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">语言</label>
                  <select
                    value={identityContent.promptLang || "zh"}
                    onChange={(event) => handleFieldChange("promptLang", event.target.value)}
                    className="w-full rounded-md border px-3 py-2"
                  >
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                    <option value="ja">日本語</option>
                  </select>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        <div className="flex w-1/2 flex-col bg-gray-100">
          <div className="relative flex-1">
            {vrmLoading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-100">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : null}
            <VrmViewer modelUrl={vrmUrl} onVrmLoad={handleVrmLoad} />
          </div>
          <div className="truncate bg-gray-200 p-2 text-xs text-gray-600">
            {vrmUrl || "未配置 VRM 模型路径"}
          </div>
        </div>
      </div>
    </div>
  );
}
