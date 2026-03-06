"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AgentManageCreate } from "@/types/agent-manage";

interface AgentFormProps {
  onSubmit: (data: AgentManageCreate) => void;
  onCancel: () => void;
  loading: boolean;
}

export function AgentForm({ onSubmit, onCancel, loading }: AgentFormProps) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = () => {
    if (!id.trim() || !name.trim()) return;

    const data: AgentManageCreate = {
      id: id.trim(),
      name: name.trim(),
      description: description.trim() || undefined,
    };

    onSubmit(data);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">Agent ID *</label>
        <Input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="my_agent"
          className="mt-1"
        />
        <p className="text-xs text-gray-500 mt-1">唯一标识符，只能包含字母、数字和下划线</p>
      </div>

      <div>
        <label className="text-sm font-medium">名称 *</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="我的Agent"
          className="mt-1"
        />
      </div>

      <div>
        <label className="text-sm font-medium">描述</label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Agent 描述..."
          className="mt-1"
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          取消
        </Button>
        <Button onClick={handleSubmit} disabled={loading || !id.trim() || !name.trim()}>
          {loading ? "创建中..." : "创建"}
        </Button>
      </div>
    </div>
  );
}
