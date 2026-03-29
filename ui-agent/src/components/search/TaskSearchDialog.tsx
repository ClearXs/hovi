"use client";

import { Clock3, MessageSquare, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn, formatDate } from "@/lib/utils";
import type { GatewaySessionRow } from "@/types/clawdbot";

const RECENT_SEARCHES_KEY = "hovi.task-search.recent-searches.v1";
const MAX_RECENT_SEARCHES = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

type TaskSearchDialogProps = {
  open: boolean;
  sessions: GatewaySessionRow[];
  currentSessionKey: string | null;
  onSelectSession: (key: string) => void;
  onOpenChange: (open: boolean) => void;
  mobile?: boolean;
};

function resolveTitle(session: GatewaySessionRow): string {
  return session.label || session.derivedTitle || session.displayName || "新任务";
}

function resolveUpdatedAtMs(session: GatewaySessionRow): number {
  if (typeof session.updatedAt !== "number" || !Number.isFinite(session.updatedAt)) {
    return 0;
  }
  return session.updatedAt;
}

function resolveAgeGroupLabel(updatedAtMs: number, nowMs: number): string {
  if (updatedAtMs <= 0) return "更早";
  const delta = Math.max(0, nowMs - updatedAtMs);
  if (delta < DAY_MS) return "最近（1天内）";
  if (delta < DAY_MS * 3) return "3天前";
  if (delta < DAY_MS * 7) return "7天前";
  return "更早";
}

function loadStringList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    );
  } catch {
    return [];
  }
}

function persistStringList(key: string, values: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(values));
}

function getTaskOptionId(sessionKey: string): string {
  return `task-search-option-${sessionKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function TaskSearchDialog({
  open,
  sessions,
  currentSessionKey,
  onSelectSession,
  onOpenChange,
  mobile = false,
}: TaskSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isResultsScrolled, setIsResultsScrolled] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    loadStringList(RECENT_SEARCHES_KEY),
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) return;
    setIsResultsScrolled(false);
  }, [open]);

  const rememberSearch = (raw: string) => {
    const normalized = raw.trim();
    if (!normalized) return;
    const next = [
      normalized,
      ...recentSearches.filter((item) => item.toLowerCase() !== normalized.toLowerCase()),
    ].slice(0, MAX_RECENT_SEARCHES);
    setRecentSearches(next);
    persistStringList(RECENT_SEARCHES_KEY, next);
  };

  const queryValue = query.trim();
  const normalizedQuery = queryValue.toLowerCase();

  const searchedTasks = useMemo(() => {
    if (!normalizedQuery) return sessions;
    return sessions.filter((session) =>
      resolveTitle(session).toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, sessions]);

  const groupedTasks = useMemo(() => {
    const nowMs = Date.now();
    const buckets = new Map<string, GatewaySessionRow[]>();
    const order = ["最近（1天内）", "3天前", "7天前", "更早"];
    order.forEach((label) => buckets.set(label, []));

    searchedTasks.forEach((task) => {
      const label = resolveAgeGroupLabel(resolveUpdatedAtMs(task), nowMs);
      buckets.get(label)?.push(task);
    });

    return order
      .map((label) => ({ label, items: buckets.get(label) ?? [] }))
      .filter((group) => group.items.length > 0);
  }, [searchedTasks]);

  const flatTasks = useMemo(() => groupedTasks.flatMap((group) => group.items), [groupedTasks]);
  const totalItems = flatTasks.length;
  const highlightedIndex = totalItems === 0 ? 0 : Math.min(activeIndex, totalItems - 1);
  const highlightedTask = flatTasks[highlightedIndex];
  const highlightedOptionId = highlightedTask ? getTaskOptionId(highlightedTask.key) : undefined;

  const selectTask = (sessionKey: string) => {
    if (queryValue) {
      rememberSearch(queryValue);
    }
    onSelectSession(sessionKey);
    onOpenChange(false);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (totalItems === 0) return;
      setActiveIndex((prev) => (Math.min(prev, totalItems - 1) + 1) % totalItems);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (totalItems === 0) return;
      setActiveIndex((prev) => (Math.min(prev, totalItems - 1) - 1 + totalItems) % totalItems);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (!highlightedTask) return;
      selectTask(highlightedTask.key);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileFullScreen={mobile}
        className={cn(
          "task-search-surface p-0 overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.22)]",
          mobile
            ? "w-full h-full border-none rounded-none"
            : "w-[min(860px,92vw)] max-w-none rounded-3xl border-border-light/80",
        )}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>搜索任务</DialogTitle>
          <DialogDescription className="sr-only">
            搜索所有任务标题并快速打开对应任务
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "border-b border-border-light/70 transition-all duration-fast",
            mobile ? "px-4 pt-12 pb-3" : "px-6 pt-14 pb-4",
            isResultsScrolled && "bg-background/96 shadow-[0_8px_20px_rgba(0,0,0,0.06)]",
          )}
        >
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-text-tertiary" />
            <Input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="搜索任务..."
              role="combobox"
              aria-autocomplete="list"
              aria-controls="task-search-results-listbox"
              aria-expanded={flatTasks.length > 0}
              aria-activedescendant={highlightedOptionId}
              aria-label="搜索任务"
              className={cn(
                "h-12 rounded-xl border-border-light/80 bg-background pl-10 pr-10 text-[14px] leading-6",
                "placeholder:text-text-tertiary focus-visible:ring-primary/30",
              )}
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setActiveIndex(0);
                  inputRef.current?.focus();
                }}
                aria-label="清空搜索"
                className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary transition-colors duration-fast hover:bg-surface-hover hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div
          ref={resultsRef}
          onScroll={(event) => {
            const nextScrolled = event.currentTarget.scrollTop > 12;
            if (nextScrolled !== isResultsScrolled) {
              setIsResultsScrolled(nextScrolled);
            }
          }}
          className={cn(
            "relative px-3 pb-3 pt-2 overflow-y-auto scrollbar-default",
            mobile ? "h-[calc(100vh-118px)]" : "max-h-[66vh]",
          )}
        >
          {!normalizedQuery && recentSearches.length > 0 && (
            <div className="px-1.5 pb-2.5 pt-1">
              <div className="mb-2 text-[11px] font-semibold tracking-[0.02em] text-text-tertiary">
                最近搜索
              </div>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((item, index) => (
                  <button
                    key={item}
                    onClick={() => {
                      setQuery(item);
                      setActiveIndex(0);
                    }}
                    className="task-search-chip rounded-lg border border-border-light/80 bg-background px-2.5 py-1.5 text-[12px] text-text-secondary transition-colors duration-fast hover:bg-surface-hover"
                    style={{ animationDelay: `${Math.min(index, 8) * 18}ms` }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div id="task-search-results-listbox" role="listbox" aria-label="任务搜索结果">
            {flatTasks.length === 0 ? (
              <div className="task-search-item flex flex-col items-center justify-center py-10 text-center">
                <Search className="h-9 w-9 text-text-tertiary mb-2" />
                <p className="text-sm font-medium text-text-secondary">没有匹配的任务</p>
                <p className="mt-1 text-xs text-text-tertiary">试试其他关键词</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(() => {
                  let absoluteIndex = 0;
                  return groupedTasks.map((group, groupIndex) => (
                    <div key={group.label} role="group" aria-label={group.label}>
                      <div
                        className="task-search-group px-2 pb-1.5 pt-2.5 text-[11px] font-semibold tracking-[0.02em] text-text-tertiary"
                        style={{ animationDelay: `${Math.min(groupIndex, 8) * 28}ms` }}
                      >
                        <span>{group.label}</span>
                      </div>
                      <div className="space-y-2">
                        {group.items.map((session) => {
                          const title = resolveTitle(session);
                          const updatedLabel = session.updatedAt
                            ? new Date(session.updatedAt).toLocaleString(
                                "zh-CN",
                                mobile
                                  ? {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: false,
                                    }
                                  : {
                                      month: "2-digit",
                                      day: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: false,
                                    },
                              )
                            : "—";
                          const currentIndex = absoluteIndex++;
                          const isActive = highlightedIndex === currentIndex;
                          const isCurrent = session.key === currentSessionKey;
                          const optionId = getTaskOptionId(session.key);
                          return (
                            <button
                              key={session.key}
                              id={optionId}
                              role="option"
                              aria-selected={isActive}
                              onMouseEnter={() => setActiveIndex(currentIndex)}
                              onClick={() => selectTask(session.key)}
                              className={cn(
                                "task-search-item group w-full cursor-pointer border text-left transition-all duration-fast ease-out",
                                mobile ? "rounded-xl px-3 py-2" : "rounded-2xl px-3.5 py-2.5",
                                isActive
                                  ? "border-primary/70 bg-primary/14 shadow-[0_10px_28px_rgba(99,102,241,0.18)]"
                                  : isCurrent
                                    ? "border-primary/60 bg-primary/10"
                                    : "border-border-light/70 bg-background hover:border-primary/25 hover:bg-primary/6",
                              )}
                              style={{ animationDelay: `${Math.min(currentIndex, 14) * 22}ms` }}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                  <span
                                    className={cn(
                                      "inline-flex items-center justify-center rounded-xl border transition-all duration-fast",
                                      mobile ? "h-7 w-7" : "h-8 w-8",
                                      isActive
                                        ? "border-primary/45 bg-primary/18 text-primary"
                                        : isCurrent
                                          ? "border-primary/35 bg-primary/12 text-primary"
                                          : "border-border-light/70 bg-surface-hover text-text-secondary group-hover:text-text-primary",
                                    )}
                                  >
                                    <MessageSquare
                                      className={cn(mobile ? "h-3 w-3" : "h-3.5 w-3.5")}
                                    />
                                  </span>
                                  <div className="min-w-0">
                                    <div
                                      className={cn(
                                        "truncate font-medium text-text-primary",
                                        mobile ? "text-[13px] leading-5" : "text-[14px] leading-5",
                                      )}
                                    >
                                      {title}
                                    </div>
                                    <div
                                      className={cn(
                                        "mt-0.5 truncate text-text-tertiary",
                                        mobile ? "text-[11px] leading-4" : "text-[12px] leading-4",
                                      )}
                                    >
                                      {session.updatedAt
                                        ? formatDate(new Date(session.updatedAt))
                                        : "—"}
                                    </div>
                                  </div>
                                </div>
                                <div
                                  className={cn(
                                    "flex flex-shrink-0 items-center transition-colors",
                                    mobile ? "gap-1 text-[10px]" : "gap-1.5 text-[11px]",
                                    isActive
                                      ? "text-primary"
                                      : isCurrent
                                        ? "text-primary/90"
                                        : "text-text-tertiary",
                                  )}
                                >
                                  {isCurrent && (
                                    <span
                                      className={cn(
                                        "rounded-md text-white transition-all duration-fast",
                                        mobile ? "px-1 py-0.5 text-[10px]" : "px-1.5 py-0.5",
                                        isActive
                                          ? "bg-primary shadow-[0_6px_16px_rgba(99,102,241,0.28)]"
                                          : "bg-primary/90",
                                      )}
                                    >
                                      当前任务
                                    </span>
                                  )}
                                  <span
                                    className={cn(
                                      "inline-flex items-center rounded-md border transition-all duration-fast",
                                      mobile
                                        ? "gap-0.5 px-1 py-0.5 text-[10px]"
                                        : "gap-1 px-1.5 py-0.5",
                                      isActive
                                        ? "border-primary/45 bg-primary/12 text-primary"
                                        : isCurrent
                                          ? "border-primary/25 bg-primary/8 text-primary/90"
                                          : "border-border-light/70 bg-background text-text-tertiary group-hover:border-primary/25 group-hover:bg-primary/6 group-hover:text-primary/90",
                                    )}
                                  >
                                    <Clock3 className={cn(mobile ? "h-2.5 w-2.5" : "h-3 w-3")} />
                                    <span className="leading-none">{updatedLabel}</span>
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
