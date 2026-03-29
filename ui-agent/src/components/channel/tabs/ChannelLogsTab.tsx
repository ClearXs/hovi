"use client";

import type { ChannelMonitorSnapshotVM } from "@/services/channelApi";

interface ChannelLogsTabProps {
  monitor: ChannelMonitorSnapshotVM | null;
}

export function ChannelLogsTab({ monitor }: ChannelLogsTabProps) {
  return (
    <div className="rounded-lg border border-border-light bg-background-secondary p-md">
      <div className="mb-sm text-sm font-medium text-text-primary">频道日志</div>
      {!monitor || monitor.stream.length === 0 ? (
        <div className="text-xs text-text-tertiary">暂无日志</div>
      ) : (
        <div className="max-h-[28rem] space-y-1 overflow-auto scrollbar-default pr-1">
          {monitor.stream
            .slice()
            .reverse()
            .map((item, index) => (
              <div
                key={`${item.ts}-${item.accountId}-${index}`}
                className="rounded bg-background px-sm py-xs"
              >
                <div className="text-[11px] text-text-tertiary">
                  {new Date(item.ts).toLocaleString()} · {item.accountId} · {item.severity}
                </div>
                <div className="text-xs text-text-primary">{item.raw}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
