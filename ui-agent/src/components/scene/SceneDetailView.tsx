"use client";

import { ArrowLeft, Loader2, Save } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchScene, updateScene } from "@/features/scene/api/sceneApi";
import type { Scene } from "@/features/scene/types/scene";
import { useConnectionStore } from "@/stores/connectionStore";

const SceneViewer = dynamic(
  () => import("@/components/scene/SceneViewer").then((mod) => mod.SceneViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-gray-100">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    ),
  },
);

const DEFAULT_AGENT_ID = "default";

type SceneDetailViewProps = {
  sceneId: string;
  onBack: () => void;
};

function getSceneUrl(data: Partial<Scene>): string | null {
  if (!data.r_path || !data.main_file) {
    return null;
  }

  return `${data.r_path}/${data.main_file}`;
}

export function SceneDetailView({ sceneId, onBack }: SceneDetailViewProps) {
  const wsClient = useConnectionStore((state) => state.wsClient);
  const [scene, setScene] = useState<Scene | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Scene>>({});
  const [sceneUrl, setSceneUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!wsClient?.isConnected() || !sceneId) {
      setLoading(false);
      return;
    }

    const loadScene = async () => {
      try {
        setLoading(true);
        const sceneData = await fetchScene(wsClient, DEFAULT_AGENT_ID, sceneId);
        if (sceneData) {
          setScene(sceneData);
          setFormData(sceneData);
          setSceneUrl(getSceneUrl(sceneData));
        }
      } catch (error) {
        // Ignore error
      } finally {
        setLoading(false);
      }
    };

    void loadScene();
  }, [sceneId, wsClient]);

  const handleSave = useCallback(async () => {
    if (!wsClient || !sceneId) {
      return;
    }

    try {
      setSaving(true);
      await updateScene(wsClient, {
        agentId: DEFAULT_AGENT_ID,
        sceneId,
        name: formData.name,
        description: formData.description,
        r_path: formData.r_path,
        main_file: formData.main_file,
        thumb: formData.thumb,
      });
      window.alert("保存成功");
    } catch (error) {
      window.alert("保存失败");
    } finally {
      setSaving(false);
    }
  }, [formData, sceneId, wsClient]);

  const handleFieldChange = useCallback((field: keyof Scene, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "r_path" || field === "main_file") {
        setSceneUrl(getSceneUrl(next));
      }
      return next;
    });
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
          <h1 className="text-xl font-semibold">{scene?.name || sceneId}</h1>
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
        <div className="w-1/2 overflow-auto border-r">
          <ScrollArea className="h-full">
            <div className="space-y-6 p-6">
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">基本信息</h2>

                <div className="space-y-2">
                  <label className="text-sm font-medium">名称</label>
                  <input
                    type="text"
                    value={formData.name || ""}
                    onChange={(event) => handleFieldChange("name", event.target.value)}
                    className="w-full rounded-md border px-3 py-2"
                    placeholder="场景名称"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">描述</label>
                  <textarea
                    value={formData.description || ""}
                    onChange={(event) => handleFieldChange("description", event.target.value)}
                    className="min-h-[100px] w-full rounded-md border px-3 py-2"
                    placeholder="场景描述"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-lg font-semibold">场景配置</h2>

                <div className="space-y-2">
                  <label className="text-sm font-medium">资源路径</label>
                  <input
                    type="text"
                    value={formData.r_path || ""}
                    onChange={(event) => handleFieldChange("r_path", event.target.value)}
                    className="w-full rounded-md border px-3 py-2"
                    placeholder="/path/to/scene"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">主文件</label>
                  <input
                    type="text"
                    value={formData.main_file || ""}
                    onChange={(event) => handleFieldChange("main_file", event.target.value)}
                    className="w-full rounded-md border px-3 py-2"
                    placeholder="scene.glb"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">缩略图路径</label>
                  <input
                    type="text"
                    value={formData.thumb || ""}
                    onChange={(event) => handleFieldChange("thumb", event.target.value)}
                    className="w-full rounded-md border px-3 py-2"
                    placeholder="/path/to/thumb.png"
                  />
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        <div className="flex w-1/2 flex-col bg-gray-100">
          <SceneViewer modelUrl={sceneUrl} className="flex-1" />
          <div className="truncate bg-gray-200 p-2 text-xs text-gray-600">
            {sceneUrl || "未配置场景模型"}
          </div>
        </div>
      </div>
    </div>
  );
}
