"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface ShortcutItem {
  key: string;
  action: string;
  category?: string;
}

const SHORTCUTS: ShortcutItem[] = [
  { key: "Ctrl+⌘N", action: "新建任务", category: "导航" },
  { key: "Ctrl+⌘K", action: "搜索任务", category: "导航" },
  { key: "⌘/", action: "切换侧边栏", category: "导航" },
  { key: "⌘⇧S", action: "分享对话", category: "对话" },
  { key: "⌘E", action: "导出对话", category: "对话" },
  { key: "?", action: "显示快捷键帮助", category: "帮助" },
  { key: "Esc", action: "关闭面板/取消", category: "帮助" },
];

interface KeyboardShortcutsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsPanel({ isOpen, onClose }: KeyboardShortcutsPanelProps) {
  // Group shortcuts by category
  const categories = Array.from(new Set(SHORTCUTS.map((s) => s.category || "其他")));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[42rem]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">键盘快捷键</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {categories.map((category) => {
            const categoryShortcuts = SHORTCUTS.filter((s) => (s.category || "其他") === category);

            return (
              <div key={category}>
                <h3 className="text-sm font-medium text-text-secondary mb-3">{category}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {categoryShortcuts.map((shortcut) => (
                    <div
                      key={shortcut.key}
                      className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-surface-hover"
                    >
                      <span className="text-sm text-text-primary">{shortcut.action}</span>
                      <kbd className="px-2 py-1 bg-surface rounded text-xs font-mono text-text-secondary border border-border-light">
                        {shortcut.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-4 border-t border-border-light">
          <p className="text-xs text-text-tertiary text-center">
            按 <kbd className="px-1.5 py-0.5 bg-surface rounded text-xs font-mono mx-1">?</kbd> 或
            <kbd className="px-1.5 py-0.5 bg-surface rounded text-xs font-mono mx-1">⌘/</kbd>{" "}
            随时打开此面板
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook for managing shortcuts panel
export function useShortcutsPanel() {
  const [isOpen, setIsOpen] = useState(false);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(!isOpen),
  };
}
