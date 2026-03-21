"use client";

import { Plus, User, MoreVertical, Trash2, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PersonaDetailView } from "@/components/persona/PersonaDetailView";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchAgents, createAgent, deleteAgent } from "@/features/persona/services/personaApi";
import type { AgentInfo } from "@/features/persona/types/persona";
import { useConnectionStore } from "@/stores/connectionStore";

function PersonasPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const wsClient = useConnectionStore((s) => s.wsClient);
  const activeAgentId = searchParams.get("id")?.trim() || "";
  const [personas, setPersonas] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Load agents list
  useEffect(() => {
    if (!wsClient?.isConnected()) {
      setLoading(false);
      return;
    }

    loadAgents();
  }, [wsClient]);

  const loadAgents = async () => {
    if (!wsClient) return;
    try {
      setLoading(true);
      const agents = await fetchAgents(wsClient);
      setPersonas(agents || []);
    } catch (error) {
      // Ignore error
    } finally {
      setLoading(false);
    }
  };

  // Open dialog for creating new agent
  const handleOpenCreate = () => {
    setFormData({ name: "", description: "" });
    setFormErrors({});
    setDialogOpen(true);
  };

  // Handle card click - navigate to persona detail
  const handleCardClick = (agentId: string) => {
    router.push(`/personas?id=${encodeURIComponent(agentId)}`);
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
      errors.name = "Name is required";
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
      const id = `agent_${Date.now()}`;
      await createAgent(wsClient, {
        id,
        name: formData.name.trim(),
        description: formData.description.trim(),
      });
      await loadAgents();
      setDialogOpen(false);
    } catch (error) {
      alert("创建失败");
    } finally {
      setCreating(false);
    }
  };

  // Delete agent
  const handleDeleteAgent = async (agentId: string) => {
    if (!wsClient) return;
    if (!confirm("确定要删除这个虚拟角色吗？")) return;

    try {
      await deleteAgent(wsClient, agentId);
      await loadAgents();
    } catch (error) {
      alert("删除失败");
    }
  };

  if (activeAgentId) {
    return <PersonaDetailView agentId={activeAgentId} onBack={() => router.push("/personas")} />;
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col p-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-lg">
          <h2 className="text-lg font-semibold text-text-primary">虚拟角色</h2>
          <Button size="sm" onClick={handleOpenCreate} disabled={creating}>
            {creating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            新建虚拟角色
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          {/* Loading state */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : personas.length === 0 ? (
            /* Empty state */
            <div className="text-center py-12">
              <User className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无虚拟角色</h3>
              <p className="text-gray-600 mb-4">点击上方按钮创建你的第一个虚拟角色</p>
              <Button onClick={handleOpenCreate} disabled={creating}>
                {creating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                创建虚拟角色
              </Button>
            </div>
          ) : (
            /* Personas grid */
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {personas.map((agent) => (
                <div
                  key={agent.id}
                  className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleCardClick(agent.id)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-lg font-bold">
                      {agent.name?.charAt(0) || "?"}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAgent(agent.id);
                          }}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{agent.name || "未命名"}</h3>
                  <p className="text-sm text-gray-500 truncate">
                    {agent.description || "暂无描述"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>创建新虚拟角色</DialogTitle>
            <DialogDescription>配置你的新虚拟角色</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="name" className="text-sm font-medium">
                名称
              </label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleFieldChange("name", e.target.value)}
                placeholder="我的虚拟角色"
                className={formErrors.name ? "border-red-500" : ""}
              />
              {formErrors.name && <p className="text-sm text-red-500">{formErrors.name}</p>}
            </div>
            <div className="grid gap-2">
              <label htmlFor="description" className="text-sm font-medium">
                描述
              </label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => handleFieldChange("description", e.target.value)}
                placeholder="描述这个虚拟角色的用途..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={creating || !formData.name.trim()}>
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              创建虚拟角色
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function PersonasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center p-2xl">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <PersonasPageContent />
    </Suspense>
  );
}
