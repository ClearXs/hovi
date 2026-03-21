import type { SubagentMessageProps } from "@/types";

type SubagentLifecycleEvent = {
  stream: "lifecycle";
  data: {
    phase?: string;
    subagent: SubagentMessageProps;
    startedAt?: string | number;
    endedAt?: string | number;
    output?: string;
    error?: string;
  };
};

export function isSubagentLifecycleEvent(value: unknown): value is SubagentLifecycleEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as {
    stream?: unknown;
    data?: {
      subagent?: unknown;
    };
  };

  return payload.stream === "lifecycle" && !!payload.data?.subagent;
}
