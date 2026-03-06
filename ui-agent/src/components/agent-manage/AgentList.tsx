"use client";

import { MoreVertical, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AgentManageInfo } from "@/types/agent-manage";

interface AgentListProps {
  agents: AgentManageInfo[];
  onCardClick: (agent: AgentManageInfo) => void;
  onDelete: (agentId: string) => void;
}

// 生成渐变背景颜色
function getGradientBg(name: string): string {
  const gradients = [
    "from-purple-500 to-pink-500",
    "from-blue-500 to-cyan-500",
    "from-green-500 to-teal-500",
    "from-orange-500 to-red-500",
    "from-indigo-500 to-purple-500",
    "from-pink-500 to-rose-500",
    "from-cyan-500 to-blue-500",
    "from-amber-500 to-orange-500",
  ];
  const index = name.charCodeAt(0) % gradients.length;
  return gradients[index];
}

export function AgentList({ agents, onCardClick, onDelete }: AgentListProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {agents.map((agent) => (
        <div
          key={agent.id}
          className="relative rounded-xl border border-border-light bg-white hover:bg-primary/5 hover:border-primary/40 transition-colors h-28 flex flex-col justify-between p-3 group cursor-pointer"
          onClick={() => onCardClick(agent)}
        >
          {/* 顶部：头像 + 名称 + 更多按钮 */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {/* 头像 */}
              <div
                className={`h-8 w-8 rounded-lg bg-gradient-to-br ${getGradientBg(agent.name || agent.id)} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}
              >
                {agent.name?.charAt(0)?.toUpperCase() || agent.id.charAt(0)?.toUpperCase() || "?"}
              </div>

              {/* 名称 */}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate text-text-primary">
                  {agent.name || "未命名"}
                </div>
                <div className="text-[11px] text-text-tertiary truncate">{agent.id}</div>
              </div>
            </div>

            {/* 更多操作 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(agent.id);
                  }}
                  className="text-red-600"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* 底部：描述 */}
          <div className="text-[11px] text-text-secondary line-clamp-2 mt-1">
            {agent.description || "暂无描述"}
          </div>
        </div>
      ))}
    </div>
  );
}
