"use client";

import { MessageSquare, Bot, BookOpen, User, Radio, Compass, TerminalSquare } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { memo, useCallback } from "react";
import { dispatchMobileEvent, MOBILE_EVENTS } from "@/lib/mobileEvents";
import { cn } from "@/lib/utils";

type TabId = "chat" | "channel" | "cli" | "discover" | "personas" | "knowledge" | "my";

interface TabItem {
  id: TabId;
  label: string;
  icon: typeof MessageSquare;
  path?: string;
  isEvent?: boolean;
  event?: string;
}

const TABS: TabItem[] = [
  { id: "chat", label: "对话", icon: MessageSquare, isEvent: true, event: MOBILE_EVENTS.OPEN_CHAT },
  {
    id: "channel",
    label: "频道",
    icon: Radio,
    isEvent: true,
    event: MOBILE_EVENTS.OPEN_CHANNEL,
  },
  {
    id: "cli",
    label: "CLI",
    icon: TerminalSquare,
    isEvent: true,
    event: MOBILE_EVENTS.OPEN_CLI,
  },
  {
    id: "discover",
    label: "动态",
    icon: Compass,
    isEvent: true,
    event: MOBILE_EVENTS.OPEN_DISCOVER,
  },
  { id: "personas", label: "角色", icon: Bot, isEvent: true, event: MOBILE_EVENTS.OPEN_PERSONA },
  {
    id: "knowledge",
    label: "知识库",
    icon: BookOpen,
    isEvent: true,
    event: MOBILE_EVENTS.OPEN_KNOWLEDGE,
  },
  { id: "my", label: "我的", icon: User, isEvent: true, event: MOBILE_EVENTS.OPEN_MY },
];

interface MobileTabBarProps {
  className?: string;
  /** 当前激活的 tab，用于事件触发的 tab (knowledge/my) */
  activeTab?: TabId;
}

export const MobileTabBar = memo(function MobileTabBar({
  className,
  activeTab: activeTabProp,
}: MobileTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Determine active tab: use prop if provided (for event-based tabs), otherwise fallback to pathname
  const getActiveTab = (): TabId => {
    // If parent passes activeTab prop, use it (for event-based tabs like knowledge/my)
    if (activeTabProp) return activeTabProp;
    // Otherwise determine from pathname (for route-based tabs)
    if (pathname === "/") return "chat";
    if (pathname === "/personas") return "personas";
    return "chat";
  };

  const activeTab = getActiveTab();

  const handleTabClick = useCallback(
    (tab: TabItem) => {
      if (tab.isEvent && tab.event) {
        // Dispatch mobile event
        dispatchMobileEvent(tab.event as (typeof MOBILE_EVENTS)[keyof typeof MOBILE_EVENTS]);
      } else if (tab.path) {
        router.push(tab.path);
      }
    },
    [router],
  );

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-[99998]",
        "bg-background/95 backdrop-blur-lg border-t border-border-light",
        "pb-safe-area-inset-bottom",
        className,
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around h-14">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 w-16 h-full",
                "transition-colors duration-fast",
                isActive ? "text-primary" : "text-text-tertiary hover:text-text-secondary",
              )}
            >
              <Icon className="w-6 h-6" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
