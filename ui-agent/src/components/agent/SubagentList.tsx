"use client";

import type { SubagentMessageProps } from "@/types";
import { SubagentCard } from "./SubagentCard";

export function SubagentList({ subagents }: { subagents: SubagentMessageProps[] }) {
  if (!subagents || subagents.length === 0) {
    return null;
  }

  return (
    <div className="mt-md space-y-sm">
      <div className="text-xs font-medium text-text-tertiary px-xs">
        子 Agent ({subagents.length})
      </div>
      {subagents.map((subagent) => (
        <SubagentCard key={subagent.id} subagent={subagent} />
      ))}
    </div>
  );
}
