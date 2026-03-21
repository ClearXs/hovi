"use client";

import { Plus, Box, MoreVertical, Trash2, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SceneDetailView } from "@/components/scene/SceneDetailView";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { fetchScenes, createScene, deleteScene } from "@/features/scene/api/sceneApi";
import type { Scene } from "@/features/scene/types/scene";
import { useConnectionStore } from "@/stores/connectionStore";

function ScenesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const wsClient = useConnectionStore((s) => s.wsClient);
  const activeSceneId = searchParams.get("id")?.trim() || "";
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    r_path: "",
    main_file: "",
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // For now, use default agent - in real implementation, user would select an agent
  const agentId = "default";

  // Navigate to scene detail
  const handleSceneClick = (sceneId: string) => {
    router.push(`/scenes?id=${encodeURIComponent(sceneId)}`);
  };

  // Load scenes list
  useEffect(() => {
    if (!wsClient?.isConnected()) {
      setLoading(false);
      return;
    }

    loadScenes();
  }, [wsClient]);

  const loadScenes = async () => {
    if (!wsClient) return;
    try {
      setLoading(true);
      const sceneList = await fetchScenes(wsClient, agentId);
      setScenes(sceneList || []);
    } catch (error) {
      // Ignore error
    } finally {
      setLoading(false);
    }
  };

  // Open dialog for creating new scene
  const handleOpenCreate = () => {
    setFormData({
      name: "",
      description: "",
      r_path: "",
      main_file: "",
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  // Handle form field change
  const handleFieldChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = "名称不能为空";
    }
    if (!formData.r_path.trim()) {
      errors.r_path = "资源路径不能为空";
    }
    if (!formData.main_file.trim()) {
      errors.main_file = "主文件不能为空";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submit
  const handleSubmit = async () => {
    if (!wsClient) return;
    if (!validateForm()) return;

    try {
      setCreating(true);
      await createScene(wsClient, {
        agentId,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        r_path: formData.r_path.trim(),
        main_file: formData.main_file.trim(),
      });
      await loadScenes();
      setDialogOpen(false);
    } catch (error) {
      alert("创建失败");
    } finally {
      setCreating(false);
    }
  };

  // Delete scene
  const handleDeleteScene = async (sceneId: string) => {
    if (!wsClient) return;

    if (!confirm("确定要删除这个场景吗？")) return;

    try {
      await deleteScene(wsClient, agentId, sceneId);
      await loadScenes();
    } catch (error) {
      alert("删除失败");
    }
  };

  if (activeSceneId) {
    return <SceneDetailView sceneId={activeSceneId} onBack={() => router.push("/scenes")} />;
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col p-2xl">
        {/* Header - like KnowledgeBasePage */}
        <div className="flex items-center justify-between mb-lg">
          <h2 className="text-lg font-semibold text-text-primary">场景</h2>
          <Button size="sm" onClick={handleOpenCreate} disabled={creating}>
            {creating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            新建场景
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          {/* Loading state */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : scenes.length === 0 ? (
            /* Empty state */
            <div className="text-center py-12">
              <Box className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无场景</h3>
              <p className="text-gray-600 mb-4">点击上方按钮创建你的第一个3D场景</p>
              <Button onClick={handleOpenCreate} disabled={creating}>
                {creating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                创建场景
              </Button>
            </div>
          ) : (
            /* Scenes grid */
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {scenes.map((scene) => (
                <div
                  key={scene.id}
                  className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleSceneClick(scene.id)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white">
                      <Box className="w-6 h-6" />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleDeleteScene(scene.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{scene.name || "未命名"}</h3>
                  <p className="text-sm text-gray-500 truncate">
                    {scene.description || scene.r_path || "暂无描述"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Create Dialog - matching KnowledgeBasePage style */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[56rem]">
          <DialogHeader>
            <DialogTitle>新建场景</DialogTitle>
          </DialogHeader>
          <div className="space-y-md text-sm">
            {/* Name */}
            <div>
              <div className="text-xs text-text-tertiary mb-xs">名称 *</div>
              <Input
                value={formData.name}
                onChange={(e) => handleFieldChange("name", e.target.value)}
                placeholder="我的3D场景"
              />
              {formErrors.name && <p className="text-xs text-error mt-1">{formErrors.name}</p>}
            </div>

            {/* Description */}
            <div>
              <div className="text-xs text-text-tertiary mb-xs">描述</div>
              <Textarea
                value={formData.description}
                onChange={(e) => handleFieldChange("description", e.target.value)}
                placeholder="描述这个场景的用途..."
                rows={2}
              />
            </div>

            {/* Resource Path */}
            <div>
              <div className="text-xs text-text-tertiary mb-xs">资源路径 *</div>
              <Input
                value={formData.r_path}
                onChange={(e) => handleFieldChange("r_path", e.target.value)}
                placeholder="/path/to/scene"
              />
              {formErrors.r_path && <p className="text-xs text-error mt-1">{formErrors.r_path}</p>}
            </div>

            {/* Main File */}
            <div>
              <div className="text-xs text-text-tertiary mb-xs">主文件 *</div>
              <Input
                value={formData.main_file}
                onChange={(e) => handleFieldChange("main_file", e.target.value)}
                placeholder="scene.glb"
              />
              {formErrors.main_file && (
                <p className="text-xs text-error mt-1">{formErrors.main_file}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-sm pt-md">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(false)}
                disabled={creating}
              >
                取消
              </Button>
              <Button
                size="sm"
                disabled={
                  !formData.name.trim() ||
                  !formData.r_path.trim() ||
                  !formData.main_file.trim() ||
                  creating
                }
                onClick={handleSubmit}
              >
                {creating ? "创建中..." : "创建"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ScenesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center p-2xl">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <ScenesPageContent />
    </Suspense>
  );
}
