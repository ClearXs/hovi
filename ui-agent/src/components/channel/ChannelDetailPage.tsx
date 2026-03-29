"use client";

import { ChevronLeft } from "lucide-react";
import { ChannelConfigTab } from "@/components/channel/tabs/ChannelConfigTab";
import { ChannelLogsTab } from "@/components/channel/tabs/ChannelLogsTab";
import { ChannelMonitorTab } from "@/components/channel/tabs/ChannelMonitorTab";
import { cn } from "@/lib/utils";
import type { ChannelCardVM, ChannelMonitorWindow } from "@/services/channelApi";
import type { ChannelAccountSnapshot, ChannelMonitorSnapshotVM } from "@/services/channelApi";
import type { ChannelDetailTab } from "@/stores/channelCenterStore";

interface ChannelDetailPageProps {
  card?: ChannelCardVM;
  monitor: ChannelMonitorSnapshotVM | null;
  channelId: string;
  activeTab: ChannelDetailTab;
  monitorWindow: ChannelMonitorWindow;
  isRefreshing: boolean;
  channelConfigDraft: string;
  isLoadingConfig: boolean;
  isSavingConfig: boolean;
  isProbingChannel: boolean;
  configError: string | null;
  saveMessage: string | null;
  probeMessage: string | null;
  probeDetails: ChannelAccountSnapshot[];
  probeSuggestions: string[];
  onBack: () => void;
  onTabChange: (tab: ChannelDetailTab) => void;
  onWindowChange: (window: ChannelMonitorWindow) => void;
  onRefresh: () => void;
  onChannelConfigDraftChange: (next: string) => void;
  onReloadChannelConfig: () => void;
  onSaveChannelConfig: () => void;
  onProbeChannel: () => void;
  onUseChannelConfigTemplate: () => void;
}

const TABS: Array<{ key: ChannelDetailTab; label: string }> = [
  { key: "monitor", label: "监控" },
  { key: "config", label: "配置" },
  { key: "logs", label: "日志" },
];

export function ChannelDetailPage({
  card,
  monitor,
  channelId,
  activeTab,
  monitorWindow,
  isRefreshing,
  channelConfigDraft,
  isLoadingConfig,
  isSavingConfig,
  isProbingChannel,
  configError,
  saveMessage,
  probeMessage,
  probeDetails,
  probeSuggestions,
  onBack,
  onTabChange,
  onWindowChange,
  onRefresh,
  onChannelConfigDraftChange,
  onReloadChannelConfig,
  onSaveChannelConfig,
  onProbeChannel,
  onUseChannelConfigTemplate,
}: ChannelDetailPageProps) {
  return (
    <div className="flex h-full min-h-0 flex-col space-y-md p-2xl">
      <div className="flex items-center justify-between gap-md">
        <div className="flex items-center gap-sm">
          <button
            type="button"
            aria-label="返回"
            onClick={onBack}
            className="rounded-md p-1 text-text-tertiary transition-colors hover:bg-background hover:text-text-primary"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="text-base font-semibold text-text-primary">{card?.label ?? "频道"}</div>
            <div className="text-xs text-text-tertiary">按频道查看监控、配置与日志</div>
          </div>
        </div>

        <div className="flex items-center gap-sm">
          <select
            className="h-8 rounded-md border border-border-light bg-background px-sm text-xs text-text-secondary"
            value={monitorWindow}
            onChange={(event) => onWindowChange(event.target.value as ChannelMonitorWindow)}
          >
            <option value="5m">近 5 分钟</option>
            <option value="1h">近 1 小时</option>
            <option value="24h">近 24 小时</option>
          </select>
          <button
            type="button"
            className="h-8 rounded-md border border-border-light px-sm text-xs text-text-secondary hover:bg-background"
            onClick={onRefresh}
          >
            {isRefreshing ? "刷新中..." : "刷新"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-sm">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-label={tab.label}
            className={cn(
              "h-8 rounded-md px-sm text-xs font-medium",
              activeTab === tab.key
                ? "bg-primary/10 text-primary"
                : "border border-border-light text-text-secondary hover:bg-background",
            )}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto scrollbar-default">
        {activeTab === "monitor" ? (
          <ChannelMonitorTab monitor={monitor} />
        ) : activeTab === "config" ? (
          <ChannelConfigTab
            channelId={channelId}
            draft={channelConfigDraft}
            isLoadingConfig={isLoadingConfig}
            isSavingConfig={isSavingConfig}
            isProbing={isProbingChannel}
            configError={configError}
            saveMessage={saveMessage}
            probeMessage={probeMessage}
            probeDetails={probeDetails}
            probeSuggestions={probeSuggestions}
            onDraftChange={onChannelConfigDraftChange}
            onReload={onReloadChannelConfig}
            onSave={onSaveChannelConfig}
            onProbe={onProbeChannel}
            onUseTemplate={onUseChannelConfigTemplate}
          />
        ) : (
          <ChannelLogsTab monitor={monitor} />
        )}
      </div>
    </div>
  );
}
