"use client";

import { useEffect } from "react";
import { ChannelDetailPage } from "@/components/channel/ChannelDetailPage";
import { ChannelGrid } from "@/components/channel/ChannelGrid";
import { useChannelCenterStore } from "@/stores/channelCenterStore";

export function ChannelCenterPage() {
  const view = useChannelCenterStore((state) => state.view);
  const cards = useChannelCenterStore((state) => state.cards);
  const selectedChannelId = useChannelCenterStore((state) => state.selectedChannelId);
  const activeDetailTab = useChannelCenterStore((state) => state.activeDetailTab);
  const monitorWindow = useChannelCenterStore((state) => state.monitorWindow);
  const monitor = useChannelCenterStore((state) => state.monitor);
  const channelConfigDraft = useChannelCenterStore((state) => state.channelConfigDraft);
  const isLoadingConfig = useChannelCenterStore((state) => state.isLoadingConfig);
  const isSavingConfig = useChannelCenterStore((state) => state.isSavingConfig);
  const isCreatingChannel = useChannelCenterStore((state) => state.isCreatingChannel);
  const isProbingChannel = useChannelCenterStore((state) => state.isProbingChannel);
  const isLoading = useChannelCenterStore((state) => state.isLoading);
  const isRefreshingMonitor = useChannelCenterStore((state) => state.isRefreshingMonitor);
  const error = useChannelCenterStore((state) => state.error);
  const createError = useChannelCenterStore((state) => state.createError);
  const configError = useChannelCenterStore((state) => state.configError);
  const createMessage = useChannelCenterStore((state) => state.createMessage);
  const saveMessage = useChannelCenterStore((state) => state.saveMessage);
  const probeMessage = useChannelCenterStore((state) => state.probeMessage);
  const probeDetails = useChannelCenterStore((state) => state.probeDetails);
  const probeSuggestions = useChannelCenterStore((state) => state.probeSuggestions);
  const loadChannels = useChannelCenterStore((state) => state.loadChannels);
  const loadSelectedChannelConfig = useChannelCenterStore(
    (state) => state.loadSelectedChannelConfig,
  );
  const saveSelectedChannelConfig = useChannelCenterStore(
    (state) => state.saveSelectedChannelConfig,
  );
  const createChannel = useChannelCenterStore((state) => state.createChannel);
  const probeSelectedChannel = useChannelCenterStore((state) => state.probeSelectedChannel);
  const refreshMonitor = useChannelCenterStore((state) => state.refreshMonitor);
  const openChannel = useChannelCenterStore((state) => state.openChannel);
  const backToGrid = useChannelCenterStore((state) => state.backToGrid);
  const setDetailTab = useChannelCenterStore((state) => state.setDetailTab);
  const setMonitorWindow = useChannelCenterStore((state) => state.setMonitorWindow);
  const setChannelConfigDraft = useChannelCenterStore((state) => state.setChannelConfigDraft);
  const useChannelConfigTemplate = useChannelCenterStore((state) => state.useChannelConfigTemplate);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    if (view !== "detail" || !selectedChannelId) {
      return;
    }
    void refreshMonitor();
    const timer = setInterval(() => {
      void refreshMonitor();
    }, 5000);
    return () => clearInterval(timer);
  }, [refreshMonitor, selectedChannelId, view]);

  useEffect(() => {
    if (view !== "detail" || !selectedChannelId || activeDetailTab !== "config") {
      return;
    }
    void loadSelectedChannelConfig();
  }, [activeDetailTab, loadSelectedChannelConfig, selectedChannelId, view]);

  const selectedCard = cards.find((card) => card.channelId === selectedChannelId);

  return (
    <div className="h-full min-h-0 bg-background-tertiary">
      {error ? (
        <div className="border-b border-border-light bg-red-500/10 px-2xl py-sm text-xs text-red-500">
          {error}
        </div>
      ) : null}

      {view === "detail" && selectedChannelId ? (
        <ChannelDetailPage
          card={selectedCard}
          monitor={monitor}
          channelId={selectedChannelId}
          activeTab={activeDetailTab}
          monitorWindow={monitorWindow}
          isRefreshing={isRefreshingMonitor}
          channelConfigDraft={channelConfigDraft}
          isLoadingConfig={isLoadingConfig}
          isSavingConfig={isSavingConfig}
          isProbingChannel={isProbingChannel}
          configError={configError}
          saveMessage={saveMessage}
          probeMessage={probeMessage}
          probeDetails={probeDetails}
          probeSuggestions={probeSuggestions}
          onBack={backToGrid}
          onTabChange={setDetailTab}
          onWindowChange={setMonitorWindow}
          onRefresh={() => void refreshMonitor()}
          onChannelConfigDraftChange={setChannelConfigDraft}
          onReloadChannelConfig={() => void loadSelectedChannelConfig()}
          onSaveChannelConfig={() => void saveSelectedChannelConfig()}
          onProbeChannel={() => void probeSelectedChannel()}
          onUseChannelConfigTemplate={useChannelConfigTemplate}
        />
      ) : (
        <ChannelGrid
          cards={cards}
          isLoading={isLoading}
          isCreatingChannel={isCreatingChannel}
          createError={createError}
          createMessage={createMessage}
          onOpenMonitor={(channelId) => openChannel(channelId, "monitor")}
          onOpenConfig={(channelId) => openChannel(channelId, "config")}
          onOpenLogs={(channelId) => openChannel(channelId, "logs")}
          onCreateChannel={createChannel}
        />
      )}
    </div>
  );
}
