"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  getKnowledgeIconOption,
  getKnowledgeIconOptions,
} from "@/components/knowledge/iconRegistry";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type KnowledgeIconPickerProps = {
  value?: string | null;
  onChange: (icon: string) => void;
  triggerClassName?: string;
};

export function KnowledgeIconPicker({
  value,
  onChange,
  triggerClassName,
}: KnowledgeIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = useMemo(() => getKnowledgeIconOptions(), []);
  const selected = getKnowledgeIconOption(value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((item) => {
      const sourceLabel = item.source === "lucide" ? "lucide" : "react icons";
      return `${item.label} ${sourceLabel}`.toLowerCase().includes(q);
    });
  }, [options, query]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={triggerClassName ?? "h-10 w-10 p-0"}
        onClick={() => setOpen(true)}
      >
        <selected.Icon className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[52rem] max-w-[92vw] p-6">
          <DialogHeader>
            <DialogTitle>选择图标</DialogTitle>
          </DialogHeader>
          <div className="space-y-sm">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
                placeholder="搜索图标（Lucide / React Icons）"
              />
            </div>
            <div className="grid max-h-[26rem] grid-cols-3 gap-sm overflow-auto scrollbar-default pr-1 md:grid-cols-6">
              {filtered.map((item) => {
                const active = item.key === selected.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={
                      active
                        ? "rounded-lg border border-primary bg-primary/10 p-sm text-left"
                        : "rounded-lg border border-border-light p-sm text-left hover:border-primary/40 hover:bg-primary/5"
                    }
                    onClick={() => {
                      onChange(item.key);
                      setOpen(false);
                    }}
                  >
                    <item.Icon className="mb-xs h-4 w-4" />
                    <div className="truncate text-xs text-text-primary">{item.label}</div>
                    <div className="text-[10px] text-text-tertiary">
                      {item.source === "lucide" ? "Lucide" : "React Icons"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
