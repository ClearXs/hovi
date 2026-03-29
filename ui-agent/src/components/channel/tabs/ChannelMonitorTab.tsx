"use client";

import type { ChannelMonitorSnapshotVM } from "@/services/channelApi";

interface ChannelMonitorTabProps {
  monitor: ChannelMonitorSnapshotVM | null;
}

export function ChannelMonitorTab({ monitor }: ChannelMonitorTabProps) {
  if (!monitor) {
    return <div className="py-xl text-sm text-text-tertiary">暂无监控数据</div>;
  }

  return (
    <div className="space-y-md">
      <div className="grid grid-cols-2 gap-sm lg:grid-cols-5">
        <div className="rounded-lg bg-background px-sm py-sm">
          <div className="text-xs text-text-tertiary">总消息</div>
          <div className="text-sm font-semibold text-text-primary">{monitor.stats.total}</div>
        </div>
        <div className="rounded-lg bg-background px-sm py-sm">
          <div className="text-xs text-text-tertiary">入站</div>
          <div className="text-sm font-semibold text-text-primary">{monitor.stats.inbound}</div>
        </div>
        <div className="rounded-lg bg-background px-sm py-sm">
          <div className="text-xs text-text-tertiary">出站</div>
          <div className="text-sm font-semibold text-text-primary">{monitor.stats.outbound}</div>
        </div>
        <div className="rounded-lg bg-background px-sm py-sm">
          <div className="text-xs text-text-tertiary">成功率</div>
          <div className="text-sm font-semibold text-text-primary">
            {(monitor.stats.successRate * 100).toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg bg-background px-sm py-sm">
          <div className="text-xs text-text-tertiary">错误率</div>
          <div className="text-sm font-semibold text-text-primary">
            {(monitor.stats.errorRate * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border-light bg-background-secondary p-md">
        <div className="mb-sm text-xs font-medium text-text-secondary">告警</div>
        {monitor.alerts.length === 0 ? (
          <div className="text-xs text-text-tertiary">暂无告警</div>
        ) : (
          <div className="space-y-1">
            {monitor.alerts.map((alert, index) => (
              <div
                key={`${alert.kind}-${alert.accountId}-${index}`}
                className="text-xs text-text-primary"
              >
                [{alert.severity}] {alert.accountId ? `${alert.accountId}: ` : ""}
                {alert.message}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border-light bg-background-secondary p-md">
        <div className="mb-sm text-xs font-medium text-text-secondary">实时消息流</div>
        <div className="max-h-[20rem] space-y-1 overflow-auto scrollbar-default pr-1">
          {monitor.stream.length === 0 ? (
            <div className="text-xs text-text-tertiary">暂无实时消息</div>
          ) : (
            monitor.stream
              .slice()
              .reverse()
              .map((item, index) => (
                <div
                  key={`${item.ts}-${item.accountId}-${index}`}
                  className="rounded bg-background px-sm py-xs text-xs text-text-primary"
                >
                  <span className="text-text-tertiary">
                    {new Date(item.ts).toLocaleTimeString()} [{item.accountId}] [{item.direction}]
                  </span>{" "}
                  {item.message}
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
