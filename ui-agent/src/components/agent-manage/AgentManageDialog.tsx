"use client";

import { Bot, Plus, Loader2, FileText } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchAgents, createAgent, deleteAgent } from "@/features/agent-manage/api/agentManageApi";
import { useConnectionStore } from "@/stores/connectionStore";
import type { AgentManageInfo, AgentManageCreate } from "@/types/agent-manage";
import { AgentConfigEditor } from "./AgentConfigEditor";
import { AgentForm } from "./AgentForm";
import { AgentList } from "./AgentList";

interface AgentManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentManageDialog({ open, onOpenChange }: AgentManageDialogProps) {
  const wsClient = useConnectionStore((s) => s.wsClient);
  const [agents, setAgents] = useState<AgentManageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentManageInfo | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [configAgent, setConfigAgent] = useState<AgentManageInfo | null>(null);

  // Load agents
  const loadAgents = useCallback(async () => {
    if (!wsClient) return;
    try {
      setLoading(true);
      const list = await fetchAgents(wsClient);
      setAgents(list);
    } catch (error) {
      console.error("Failed to load agents:", error);
    } finally {
      setLoading(false);
    }
  }, [wsClient]);

  useEffect(() => {
    if (open && wsClient) {
      loadAgents();
    }
  }, [open, wsClient, loadAgents]);

  // Subscribe to agent events
  useEffect(() => {
    if (!wsClient || !open) return;

    const handleAgentEvent = (event: unknown) => {
      console.log("Agent event:", event);
      loadAgents();
    };

    wsClient.addEventListener("agent", handleAgentEvent);
    return () => {
      wsClient.removeEventListener("agent", handleAgentEvent);
    };
  }, [wsClient, open, loadAgents]);

  // Handlers
  const handleCreate = async (data: AgentManageCreate) => {
    if (!wsClient) return;
    try {
      setCreating(true);
      await createAgent(wsClient, data);
      await loadAgents();
      setFormOpen(false);
    } catch (error) {
      console.error("Failed to create agent:", error);
      alert("创建失败");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (agentId: string) => {
    if (!wsClient) return;
    if (!confirm("确定要删除这个 Agent 吗？")) return;
    try {
      await deleteAgent(wsClient, agentId);
      await loadAgents();
    } catch (error) {
      console.error("Failed to delete agent:", error);
      alert("删除失败");
    }
  };

  const handleOpenCreate = () => {
    setSelectedAgent(null);
    setFormOpen(true);
  };

  const handleOpenConfig = (agent: AgentManageInfo) => {
    setConfigAgent(agent);
    setConfigOpen(true);
  };

  const handleCardClick = (agent: AgentManageInfo) => {
    // Click card to open config directly
    handleOpenConfig(agent);
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setSelectedAgent(null);
  };

  const handleConfigClose = () => {
    setConfigOpen(false);
    setConfigAgent(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[64rem] h-[80vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-0 flex-shrink-0">
            <DialogTitle className="text-lg font-semibold">Agent 管理</DialogTitle>
          </DialogHeader>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex justify-end px-6 mt-4 gap-2">
              <Button size="sm" onClick={handleOpenCreate} disabled={creating}>
                {creating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                新建Agent
              </Button>
            </div>

            <ScrollArea className="flex-1 px-6 py-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : agents.length === 0 ? (
                <div className="text-center py-12">
                  <Bot className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无Agent</h3>
                  <p className="text-gray-600 mb-4">点击上方按钮创建你的第一个Agent</p>
                </div>
              ) : (
                <AgentList agents={agents} onCardClick={handleCardClick} onDelete={handleDelete} />
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Form Dialog */}
      <Dialog open={formOpen} onOpenChange={handleFormClose}>
        <DialogContent className="max-w-[32rem]">
          <DialogHeader>
            <DialogTitle>新建Agent</DialogTitle>
          </DialogHeader>
          <AgentForm onSubmit={handleCreate} onCancel={handleFormClose} loading={loading} />
        </DialogContent>
      </Dialog>

      {/* Config Editor Dialog */}
      <Dialog open={configOpen} onOpenChange={handleConfigClose}>
        <DialogContent className="max-w-[64rem] max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>配置文件编辑 - {configAgent?.name}</DialogTitle>
          </DialogHeader>
          {configAgent && (
            <AgentConfigEditor
              agentId={configAgent.id}
              agentName={configAgent.name}
              onClose={handleConfigClose}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
