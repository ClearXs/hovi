"use client";

import { MessageSquare, Plus, Trash2, Search, Filter, SortAsc, Mail } from "lucide-react";
import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { GatewaySessionRow } from "@/types/clawdbot";

type FilterKind = "all" | "direct" | "group" | "global";
type SortMode = "recent" | "name";

interface MobileSessionDrawerProps {
  sessions: GatewaySessionRow[];
  currentSessionKey: string | null;
  unreadMap: Record<string, boolean>;
  onSelectSession: (key: string) => void;
  onNewSession: () => void;
  onDeleteSession: (key: string) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  filterKind?: FilterKind;
  onFilterChange?: (kind: FilterKind) => void;
  unreadOnly?: boolean;
  onUnreadToggle?: (unread: boolean) => void;
  sortMode?: SortMode;
  onSortChange?: (mode: SortMode) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const MobileSessionDrawer = memo(function MobileSessionDrawer({
  sessions,
  currentSessionKey,
  unreadMap,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  searchQuery: externalSearchQuery,
  onSearchChange,
  filterKind: externalFilterKind = "all",
  onFilterChange,
  unreadOnly: externalUnreadOnly = false,
  onUnreadToggle,
  sortMode: externalSortMode = "recent",
  onSortChange,
  open: controlledOpen,
  onOpenChange,
}: MobileSessionDrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [internalSearchQuery, setInternalSearchQuery] = useState("");

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (onOpenChange ?? setInternalOpen) : setInternalOpen;

  const isSearchControlled = externalSearchQuery !== undefined;
  const searchQuery = isSearchControlled ? externalSearchQuery : internalSearchQuery;
  const setSearchQuery = isSearchControlled
    ? (onSearchChange ?? setInternalSearchQuery)
    : setInternalSearchQuery;

  const [showFilters, setShowFilters] = useState(false);
  const [localFilterKind, setLocalFilterKind] = useState<FilterKind>(externalFilterKind);
  const [localUnreadOnly, setLocalUnreadOnly] = useState(externalUnreadOnly);
  const [localSortMode, setLocalSortMode] = useState<SortMode>(externalSortMode);

  const handleFilterChange = (kind: FilterKind) => {
    setLocalFilterKind(kind);
    onFilterChange?.(kind);
  };

  const handleUnreadToggle = (unread: boolean) => {
    setLocalUnreadOnly(unread);
    onUnreadToggle?.(unread);
  };

  const handleSortChange = (mode: SortMode) => {
    setLocalSortMode(mode);
    onSortChange?.(mode);
  };

  // Apply filters
  let filteredSessions = sessions.filter((session) => {
    const matchesSearch =
      !searchQuery ||
      (session.derivedTitle || session.displayName || session.label || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

    const matchesUnread = !localUnreadOnly || unreadMap[session.key];

    const matchesFilter = localFilterKind === "all" || session.kind === localFilterKind;

    return matchesSearch && matchesUnread && matchesFilter;
  });

  // Sort sessions
  if (localSortMode === "name") {
    filteredSessions = [...filteredSessions].sort((a, b) => {
      const aName = a.derivedTitle || a.displayName || a.label || "";
      const bName = b.derivedTitle || b.displayName || b.label || "";
      return aName.localeCompare(bName);
    });
  } else {
    filteredSessions = [...filteredSessions].sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
  }

  const handleSelectSession = (key: string) => {
    onSelectSession(key);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[99998]" onClick={() => setOpen(false)} />
      <div
        className="fixed left-0 top-0 bottom-0 w-[95%] bg-background z-[99999]"
        style={{ height: "100vh" }}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border-light bg-background">
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold">会话列表</span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant={showFilters ? "default" : "ghost"}
                  onClick={() => setShowFilters(!showFilters)}
                  className="h-8 px-2"
                >
                  <Filter className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={onNewSession} className="h-8 px-2">
                  <Plus className="w-4 h-4 mr-1" />
                  新建
                </Button>
              </div>
            </div>

            {/* Search */}
            <div className="mt-3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <Input
                placeholder="搜索会话..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            {/* Filters - collapsible */}
            {showFilters && (
              <div className="mt-3 space-y-3">
                {/* Filter Kind */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-tertiary">类型:</span>
                  <div className="flex gap-1">
                    {(["all", "direct", "group", "global"] as FilterKind[]).map((kind) => (
                      <button
                        key={kind}
                        onClick={() => handleFilterChange(kind)}
                        className={cn(
                          "px-2 py-1 text-xs rounded-md transition-colors",
                          localFilterKind === kind
                            ? "bg-primary text-white"
                            : "bg-surface-hover text-text-secondary hover:bg-surface-active",
                        )}
                      >
                        {kind === "all"
                          ? "全部"
                          : kind === "direct"
                            ? "私聊"
                            : kind === "group"
                              ? "群组"
                              : "全局"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sort Mode */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-tertiary">排序:</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleSortChange("recent")}
                      className={cn(
                        "px-2 py-1 text-xs rounded-md transition-colors flex items-center gap-1",
                        localSortMode === "recent"
                          ? "bg-primary text-white"
                          : "bg-surface-hover text-text-secondary hover:bg-surface-active",
                      )}
                    >
                      <SortAsc className="w-3 h-3" />
                      最近
                    </button>
                    <button
                      onClick={() => handleSortChange("name")}
                      className={cn(
                        "px-2 py-1 text-xs rounded-md transition-colors",
                        localSortMode === "name"
                          ? "bg-primary text-white"
                          : "bg-surface-hover text-text-secondary hover:bg-surface-active",
                      )}
                    >
                      名称
                    </button>
                  </div>
                </div>

                {/* Unread Only */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleUnreadToggle(!localUnreadOnly)}
                    className={cn(
                      "px-2 py-1 text-xs rounded-md transition-colors flex items-center gap-1",
                      localUnreadOnly
                        ? "bg-primary text-white"
                        : "bg-surface-hover text-text-secondary hover:bg-surface-active",
                    )}
                  >
                    <Mail className="w-3 h-3" />
                    未读
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto bg-background">
            {filteredSessions.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
                <p className="text-sm text-text-tertiary">
                  {searchQuery || localFilterKind !== "all" || localUnreadOnly
                    ? "未找到匹配的会话"
                    : "暂无会话"}
                </p>
              </div>
            ) : (
              filteredSessions.map((session) => {
                const isActive = session.key === currentSessionKey;
                const hasUnread = unreadMap[session.key];
                return (
                  <div
                    key={session.key}
                    className={cn(
                      "group relative flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors",
                      isActive
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-surface-hover border border-transparent",
                    )}
                    onClick={() => handleSelectSession(session.key)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary truncate">
                          {session.derivedTitle || session.displayName || session.label || "新对话"}
                        </span>
                        {hasUnread && (
                          <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                        )}
                      </div>
                      <div className="text-xs text-text-tertiary mt-0.5 truncate">
                        {session.updatedAt ? formatDate(new Date(session.updatedAt)) : ""}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("确定要删除这个会话吗？")) {
                          onDeleteSession(session.key);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-error/10 transition-all"
                    >
                      <Trash2 className="w-4 h-4 text-error" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
});
