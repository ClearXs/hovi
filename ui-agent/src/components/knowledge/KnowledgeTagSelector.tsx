"use client";

import { Check, Plus, Settings2, Tag, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { KnowledgeBaseTag } from "@/services/knowledgeApi";

// Preset tag colors
const PRESET_TAG_COLORS = [
  "#64748b", // slate
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
];

type KnowledgeTagSelectorProps = {
  selectedTagNames: string[];
  availableTags: KnowledgeBaseTag[];
  isLoadingTags?: boolean;
  isUpdatingTags?: boolean;
  onChange: (nextTagNames: string[]) => void;
  onCreateTag: (params: { name: string; color?: string }) => Promise<void>;
  onDeleteTag: (tagId: string) => Promise<void>;
  popoverSide?: "top" | "bottom" | "left" | "right";
};

export function KnowledgeTagSelector({
  selectedTagNames,
  availableTags,
  isLoadingTags,
  isUpdatingTags,
  onChange,
  onCreateTag,
  onDeleteTag,
  popoverSide = "bottom",
}: KnowledgeTagSelectorProps) {
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#64748b");

  const filteredTags = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableTags;
    return availableTags.filter((tag) => tag.name.toLowerCase().includes(q));
  }, [availableTags, query]);

  const queryName = query.trim();
  const queryExists = availableTags.some(
    (tag) => tag.name.toLowerCase() === queryName.toLowerCase(),
  );

  return (
    <div className="space-y-sm">
      <div className="flex flex-wrap items-center gap-xs">
        {selectedTagNames.length === 0 ? (
          <span className="text-xs text-text-tertiary">暂无标签</span>
        ) : (
          selectedTagNames.map((name) => {
            const matched = availableTags.find((tag) => tag.name === name);
            return (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: matched?.color ?? "#64748b" }}
                />
                {name}
              </span>
            );
          })
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" type="button" variant="outline">
              <Plus className="mr-1 h-3.5 w-3.5" />
              添加标签
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="z-[70] w-[22rem] max-w-[92vw] rounded-xl border border-border-light bg-white p-sm shadow-lg"
            align="start"
            side={popoverSide}
            sideOffset={8}
          >
            <div className="space-y-sm">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索或创建标签"
              />
              <div className="max-h-52 space-y-1 overflow-auto scrollbar-default pr-1">
                {isLoadingTags ? (
                  <div className="py-sm text-xs text-text-tertiary">标签加载中...</div>
                ) : filteredTags.length === 0 ? (
                  <div className="py-sm text-xs text-text-tertiary">暂无匹配标签</div>
                ) : (
                  filteredTags.map((tag) => {
                    const checked = selectedTagNames.includes(tag.name);
                    return (
                      <button
                        key={tag.tagId}
                        type="button"
                        className={
                          checked
                            ? "flex w-full items-center justify-between rounded-md bg-primary/5 px-sm py-xs text-left"
                            : "flex w-full items-center justify-between rounded-md px-sm py-xs text-left hover:bg-slate-100"
                        }
                        onClick={() => {
                          if (checked) {
                            onChange(selectedTagNames.filter((name) => name !== tag.name));
                          } else {
                            onChange([...selectedTagNames, tag.name]);
                          }
                        }}
                      >
                        <span className="inline-flex items-center gap-2 text-sm text-text-primary">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: tag.color ?? "#64748b" }}
                          />
                          {tag.name}
                        </span>
                        {checked ? <Check className="h-4 w-4 text-primary" /> : null}
                      </button>
                    );
                  })
                )}
              </div>
              {queryName && !queryExists ? (
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  className="w-full justify-start"
                  disabled={Boolean(isUpdatingTags)}
                  onClick={async () => {
                    await onCreateTag({ name: queryName, color: newTagColor });
                    onChange(Array.from(new Set([...selectedTagNames, queryName])));
                    setQuery("");
                  }}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  创建标签 “{queryName}”
                </Button>
              ) : null}
              <div className="border-t border-border-light pt-sm">
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    setOpen(false);
                    setManageOpen(true);
                  }}
                >
                  <Settings2 className="mr-1 h-3.5 w-3.5" />
                  管理标签
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="w-[42rem] max-w-[92vw] p-6 border-0">
          <DialogHeader>
            <DialogTitle>管理标签</DialogTitle>
          </DialogHeader>
          <div className="space-y-md">
            <div className="flex items-center gap-sm">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="新标签名称"
                className="flex-1"
              />
              <div className="flex items-center gap-1">
                {PRESET_TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`h-7 w-7 rounded-full border-2 transition-all ${
                      newTagColor === color
                        ? "border-text-primary scale-110"
                        : "border-transparent hover:scale-110"
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewTagColor(color)}
                    title={color}
                  />
                ))}
              </div>
              <Button
                size="sm"
                type="button"
                disabled={Boolean(isUpdatingTags) || !newTagName.trim()}
                onClick={async () => {
                  const name = newTagName.trim();
                  await onCreateTag({ name, color: newTagColor });
                  onChange(Array.from(new Set([...selectedTagNames, name])));
                  setNewTagName("");
                }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                添加
              </Button>
            </div>
            <div className="max-h-64 space-y-1 overflow-auto scrollbar-default pr-1">
              {availableTags.map((tag) => {
                const selected = selectedTagNames.includes(tag.name);
                return (
                  <div
                    key={tag.tagId}
                    className="flex items-center justify-between rounded-md px-sm py-xs"
                  >
                    <div className="inline-flex items-center gap-2 text-sm">
                      <Tag className="h-3.5 w-3.5 text-text-tertiary" />
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: tag.color ?? "#64748b" }}
                      />
                      <span>{tag.name}</span>
                      {selected ? (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                          已选择
                        </span>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      type="button"
                      variant="ghost"
                      className="h-7 px-2 text-error hover:text-error"
                      disabled={Boolean(isUpdatingTags)}
                      onClick={async () => {
                        await onDeleteTag(tag.tagId);
                        onChange(selectedTagNames.filter((name) => name !== tag.name));
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
