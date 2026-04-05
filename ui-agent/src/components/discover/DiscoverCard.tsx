"use client";

import { Bookmark, EyeOff, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DiscoverFeedItem } from "./types";

type DiscoverCardProps = {
  item: DiscoverFeedItem;
  onSave: (item: DiscoverFeedItem) => void;
  onHide: (item: DiscoverFeedItem) => void;
  busy?: boolean;
};

export function DiscoverCard({ item, onSave, onHide, busy = false }: DiscoverCardProps) {
  const timeLabel = item.publishedAt
    ? new Date(item.publishedAt).toLocaleString("zh-CN")
    : "未知时间";

  return (
    <Card className="border-border-light bg-background/80">
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="truncate text-sm font-semibold leading-5 text-text-primary">
              {item.title}
            </h3>
            <p className="truncate text-xs leading-5 text-text-secondary">{item.summary}</p>
            <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
              <span className="truncate">{item.sourceName}</span>
              <span>·</span>
              <span className="shrink-0">{timeLabel}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {item.tags.slice(0, 2).map((tag) => (
                <span
                  key={`${item.id}-${tag}`}
                  className="rounded-full border border-border-light px-2 py-0.5 text-[10px] text-text-tertiary"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant={item.saved ? "default" : "outline"}
              className="h-8 w-8 cursor-pointer rounded-full"
              onClick={() => onSave(item)}
              disabled={busy}
              aria-label="收藏"
              title="收藏"
            >
              <Bookmark className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8 cursor-pointer rounded-full"
              onClick={() => onHide(item)}
              disabled={busy}
              aria-label="隐藏"
              title="隐藏"
            >
              <EyeOff className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 cursor-pointer rounded-full"
              onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")}
              disabled={busy}
              aria-label="原文"
              title="原文"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
