"use client";

import dynamic from "next/dynamic";
import { ReactNode, useState } from "react";
import type { GatewaySessionRow } from "@/types/clawdbot";
import Sidebar from "../sidebar/Sidebar";
import { ToastStack } from "../ui/toast-stack";
import { TooltipProvider } from "../ui/tooltip";
import { TopBar } from "./TopBar";

// Dynamic import for VirtualAssistant (SSR disabled)
const VirtualAssistant = dynamic(
  () => import("@/components/desk-pet/VirtualAssistant").then((mod) => mod.VirtualAssistant),
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
  searchQuery?: string;
  filterKind?: "all" | "direct" | "group" | "global" | "unknown";
  onSearchChange?: (value: string) => void;
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
  onOpenPersonaSettings?: () => void;
  onOpenCronJobs?: () => void;
  onOpenAgentManage?: () => void;
  assistantVisible?: boolean;
  onToggleAssistantVisible?: () => void;
  activeView?: "chat" | "knowledge" | "persona";
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
  searchQuery = "",
  filterKind = "all",
  onSearchChange = () => {},
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
  onOpenPersonaSettings = () => {},
  onOpenCronJobs = () => {},
  onOpenAgentManage = () => {},
  assistantVisible = true,
  onToggleAssistantVisible = () => {},
  activeView = "chat",
}: MainLayoutProps) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      <ToastStack />
      {/* Sidebar with integrated branding */}
      {showSidebar && (
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
            searchQuery={searchQuery}
            filterKind={filterKind}
            onSearchChange={onSearchChange}
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
            onOpenPersonaSettings={onOpenPersonaSettings}
            onOpenCronJobs={onOpenCronJobs}
            onOpenAgentManage={onOpenAgentManage}
            assistantVisible={assistantVisible}
            onToggleAssistantVisible={onToggleAssistantVisible}
            activeView={activeView}
          />
        </TooltipProvider>
      )}

      {/* 虚拟助手 - 全局显示 */}
      {assistantVisible && <VirtualAssistant onOpenSettings={onOpenPersonaSettings} />}

      {/* Main content - full height */}
      <main className="flex-1 flex flex-col overflow-hidden bg-background-tertiary">
        {/* TopBar - context aware */}
        {showTopBar && (
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
        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      </main>
    </div>
  );
};

export default MainLayout;
