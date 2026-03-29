"use client";

import { AlertTriangle, CheckCircle2, PlugZap } from "lucide-react";
import { ChannelLogo } from "@/components/channel/ChannelLogo";
import { cn } from "@/lib/utils";
import type { ChannelCardVM } from "@/services/channelApi";

interface ChannelCardProps {
  card: ChannelCardVM;
  onOpenMonitor: (channelId: string) => void;
  onOpenConfig: (channelId: string) => void;
  onOpenLogs: (channelId: string) => void;
}

function HealthIcon({ health }: { health: ChannelCardVM["health"] }) {
  if (health === "healthy") {
    return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  }
  if (health === "warning") {
    return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  }
  return <PlugZap className="h-4 w-4 text-text-tertiary" />;
}

export function ChannelCard({ card, onOpenMonitor, onOpenConfig, onOpenLogs }: ChannelCardProps) {
  return (
    <div className="rounded-xl border border-border-light bg-background-secondary p-md">
      <div className="mb-sm flex items-start justify-between gap-sm">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ChannelLogo channelId={card.channelId} label={card.label} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-text-primary">{card.label}</div>
              <div className="text-xs text-text-tertiary">
                {card.configured ? "已配置" : "未配置"} · {card.accountConnected}/
                {card.accountTotal} 在线
              </div>
            </div>
          </div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-xs text-text-secondary">
          <HealthIcon health={card.health} />
          <span>
            {card.health === "healthy" ? "正常" : card.health === "warning" ? "告警" : "离线"}
          </span>
        </div>
      </div>

      <div className="mb-md grid grid-cols-3 gap-sm text-xs">
        <div className="rounded-lg bg-background px-sm py-xs">
          <div className="text-text-tertiary">账号</div>
          <div className="font-medium text-text-primary">{card.accountTotal}</div>
        </div>
        <div className="rounded-lg bg-background px-sm py-xs">
          <div className="text-text-tertiary">在线</div>
          <div className="font-medium text-text-primary">{card.accountConnected}</div>
        </div>
        <div className="rounded-lg bg-background px-sm py-xs">
          <div className="text-text-tertiary">告警</div>
          <div
            className={cn(
              "font-medium",
              card.alertCount > 0 ? "text-yellow-500" : "text-text-primary",
            )}
          >
            {card.alertCount}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-sm">
        <button
          type="button"
          className="h-8 rounded-md bg-primary px-md text-xs font-medium text-white"
          onClick={() => onOpenMonitor(card.channelId)}
        >
          监控
        </button>
        <button
          type="button"
          className="h-8 rounded-md border border-border-light px-md text-xs font-medium text-text-secondary hover:bg-background"
          onClick={() => onOpenConfig(card.channelId)}
        >
          配置
        </button>
        <button
          type="button"
          className="h-8 rounded-md border border-border-light px-md text-xs font-medium text-text-secondary hover:bg-background"
          onClick={() => onOpenLogs(card.channelId)}
        >
          日志
        </button>
      </div>
    </div>
  );
}
