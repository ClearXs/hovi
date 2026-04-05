"use client";

import dynamic from "next/dynamic";
import { ReactNode, useState, memo } from "react";
import { Button } from "@/components/ui/button";
import { useResponsive } from "@/hooks/useResponsive";
import { cn } from "@/lib/utils";
import type { GatewaySessionRow } from "@/types/clawdbot";
import Sidebar from "../sidebar/Sidebar";
import { ToastStack } from "../ui/toast-stack";
import { TooltipProvider } from "../ui/tooltip";
import { HydrationLoader } from "./HydrationLoader";
import { MobileTabBar } from "./MobileTabBar";
import { TopBar } from "./TopBar";

// Dynamic import for VirtualAssistant (SSR disabled)
const VirtualAssistant = dynamic(
  () => import("@/components/desk-pet/VirtualAssistant").then((mod) => mod.default),
  { ssr: false },
);

interface MainLayoutProps {
  children: ReactNode;
  userName?: string;
  sessions?: GatewaySessionRow[];
  unreadMap?: Record<string, boolean>;
  currentSessionKey?: string | null;
  isLoading?: boolean;
  conversationTitle?: string;
  onSelectSession?: (key: string) => void;
  onNewSession?: () => void;
  onRenameSession?: (key: string) => void;
  onDeleteSession?: (key: string) => void;
  onViewSession?: (key: string) => void;
  filterKind?: "all" | "direct" | "group" | "global" | "unknown";
  onFilterChange?: (value: MainLayoutProps["filterKind"]) => void;
  unreadOnly?: boolean;
  onUnreadToggle?: (value: boolean) => void;
  sortMode?: "recent" | "name";
  onSortChange?: (value: MainLayoutProps["sortMode"]) => void;
  selectionMode?: boolean;
  selectedKeys?: string[];
  onToggleSelectionMode?: () => void;
  onToggleSelectedKey?: (key: string) => void;
  onSelectAllKeys?: (keys: string[]) => void;
  onClearSelection?: () => void;
  onBatchDelete?: () => void;
  onShare?: () => void;
  onExport?: () => void;
  onDelete?: () => void;
  onRename?: () => void;
  showTopBar?: boolean;
  showSidebar?: boolean;
  onOpenKnowledge?: () => void;
  onOpenDiscover?: () => void;
  onOpenChannel?: () => void;
  onOpenPersonaSettings?: () => void;
  onOpenCronJobs?: () => void;
  onOpenAgentManage?: () => void;
  onOpenTaskSearch?: () => void;
  onGoHome?: () => void;
  assistantVisible?: boolean;
  onToggleAssistantVisible?: () => void;
  activeView?: "chat" | "channel" | "discover" | "knowledge" | "persona" | "my";
  searchShortcutLabel?: string;
  newSessionShortcutLabel?: string;
  onOpenChat?: () => void;
  onStartVoiceChat?: () => void;
  onOpenTasks?: () => void;
}

const MainLayout = ({
  children,
  userName = "用户",
  sessions = [],
  unreadMap = {},
  currentSessionKey = null,
  isLoading = false,
  conversationTitle,
  onSelectSession = () => {},
  onNewSession = () => {},
  onRenameSession = () => {},
  onDeleteSession = () => {},
  onViewSession = () => {},
  filterKind = "all",
  onFilterChange = () => {},
  unreadOnly = false,
  onUnreadToggle = () => {},
  sortMode = "recent",
  onSortChange = () => {},
  selectionMode = false,
  selectedKeys = [],
  onToggleSelectionMode = () => {},
  onToggleSelectedKey = () => {},
  onSelectAllKeys = () => {},
  onClearSelection = () => {},
  onBatchDelete = () => {},
  onShare = () => {},
  onExport = () => {},
  onDelete = () => {},
  onRename = () => {},
  showTopBar = true,
  showSidebar = true,
  onOpenKnowledge = () => {},
  onOpenDiscover = () => {},
  onOpenChannel = () => {},
  onOpenPersonaSettings = () => {},
  onOpenCronJobs = () => {},
  onOpenAgentManage = () => {},
  onOpenTaskSearch = () => {},
  onGoHome = () => {},
  assistantVisible = true,
  onToggleAssistantVisible = () => {},
  activeView = "chat",
  searchShortcutLabel = "Ctrl+Cmd+K",
  newSessionShortcutLabel = "Ctrl+Cmd+N",
  onOpenChat = () => {},
  onStartVoiceChat = () => {},
  onOpenTasks = () => {},
}: MainLayoutProps) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const { isDesktop, isHydrated } = useResponsive();

  return (
    <div className="flex h-screen bg-background">
      <HydrationLoader isHydrated={isHydrated} />
      <ToastStack />
      {/* Desktop: Sidebar with integrated branding */}
      {isDesktop && showSidebar && (
        <TooltipProvider>
          <Sidebar
            sessions={sessions}
            unreadMap={unreadMap}
            currentSessionKey={currentSessionKey}
            isLoading={isLoading}
            onSelectSession={onSelectSession}
            onNewSession={onNewSession}
            onRenameSession={onRenameSession}
            onDeleteSession={onDeleteSession}
            onViewSession={onViewSession}
            filterKind={filterKind}
            onFilterChange={onFilterChange}
            unreadOnly={unreadOnly}
            onUnreadToggle={onUnreadToggle}
            sortMode={sortMode}
            onSortChange={onSortChange}
            selectionMode={selectionMode}
            selectedKeys={selectedKeys}
            onToggleSelectionMode={onToggleSelectionMode}
            onToggleSelectedKey={onToggleSelectedKey}
            onSelectAllKeys={onSelectAllKeys}
            onClearSelection={onClearSelection}
            onBatchDelete={onBatchDelete}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            onOpenKnowledge={onOpenKnowledge}
            onOpenDiscover={onOpenDiscover}
            onOpenChannel={onOpenChannel}
            onOpenPersonaSettings={onOpenPersonaSettings}
            onOpenCronJobs={onOpenCronJobs}
            onOpenAgentManage={onOpenAgentManage}
            onOpenTaskSearch={onOpenTaskSearch}
            onGoHome={onGoHome}
            assistantVisible={assistantVisible}
            onToggleAssistantVisible={onToggleAssistantVisible}
            activeView={activeView}
            searchShortcutLabel={searchShortcutLabel}
            newSessionShortcutLabel={newSessionShortcutLabel}
          />
        </TooltipProvider>
      )}

      {/* 虚拟助手 - 桌面端显示 */}
      {isDesktop && assistantVisible && (
        <VirtualAssistant
          onOpenSettings={onOpenPersonaSettings}
          onOpenChat={onOpenChat}
          onStartVoiceChat={onStartVoiceChat}
          onOpenTasks={onOpenTasks}
          onClose={onToggleAssistantVisible}
        />
      )}

      {/* 虚拟助手隐藏时显示按钮（仅桌面端、非 persona 页面显示） */}
      {isDesktop && !assistantVisible && activeView !== "persona" && (
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-6 right-6 z-[99998] rounded-full w-12 h-12 bg-background/80 backdrop-blur shadow-lg hover:bg-background p-1 cursor-pointer"
          onClick={onToggleAssistantVisible}
        >
          <img src="/img/logo.png" alt="OpenClaw" className="w-full h-full object-contain" />
        </Button>
      )}

      {/* Mobile/Tablet: Bottom Tab Bar */}
      {!isDesktop && (
        <MobileTabBar
          activeTab={
            activeView as
              | "chat"
              | "channel"
              | "discover"
              | "personas"
              | "knowledge"
              | "my"
              | undefined
          }
        />
      )}

      {/* Main content - full height */}
      <main className="flex-1 flex flex-col overflow-hidden bg-background-tertiary">
        {/* TopBar - context aware (desktop only) */}
        {isDesktop && showTopBar && (
          <TopBar
            mode={activeView === "chat" && currentSessionKey ? "chat" : "welcome"}
            conversationTitle={activeView === "chat" ? conversationTitle : undefined}
            userName={userName}
            onShare={activeView === "chat" ? onShare : undefined}
            onExport={activeView === "chat" ? onExport : undefined}
            onDelete={activeView === "chat" ? onDelete : undefined}
            onRename={activeView === "chat" ? onRename : undefined}
          />
        )}

        {/* Content area */}
        <div className={cn("flex-1 min-h-0 overflow-hidden", !isDesktop && "pb-14")}>
          {children}
        </div>
      </main>
    </div>
  );
};

export default memo(MainLayout);
