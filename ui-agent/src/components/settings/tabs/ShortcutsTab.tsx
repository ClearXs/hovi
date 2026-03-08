"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useShortcutStore } from "@/stores/shortcutStore";

export function ShortcutsTab() {
  const { shortcuts, setShortcut } = useShortcutStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");

  const handleStartEdit = (shortcut: (typeof shortcuts)[0]) => {
    setEditingId(shortcut.id);
    // 初始化输入框显示当前快捷键
    const parts = [];
    if (shortcut.ctrl) parts.push("Ctrl");
    if (shortcut.shift) parts.push("Shift");
    if (shortcut.alt) parts.push("Alt");
    parts.push(shortcut.key.toUpperCase());
    setInputValue(parts.join("+"));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, id: string) => {
    e.preventDefault();

    // 获取修饰键状态
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const alt = e.altKey;

    // 如果按下的是功能键或修饰键，不做处理
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
      return;
    }

    // 如果只按下了一个普通键，直接设置
    if (!ctrl && !shift && !alt) {
      const newKey = e.key.toLowerCase();
      updateShortcut(id, newKey, false, false, false);
      setEditingId(null);
      return;
    }

    // 如果按下了修饰键组合，构建快捷键字符串
    const parts = [];
    if (ctrl) parts.push("Ctrl");
    if (shift) parts.push("Shift");
    if (alt) parts.push("Alt");
    parts.push(e.key.toUpperCase());
    setInputValue(parts.join("+"));

    // 更新快捷键
    updateShortcut(id, e.key.toLowerCase(), ctrl, shift, alt);
    setEditingId(null);
  };

  const updateShortcut = (id: string, key: string, ctrl: boolean, shift: boolean, alt: boolean) => {
    // 检查冲突
    const conflicts = shortcuts.filter(
      (s) =>
        s.id !== id &&
        s.ctrl === ctrl &&
        s.shift === shift &&
        s.alt === alt &&
        s.key === key &&
        key !== "",
    );

    if (conflicts.length > 0) {
      // 清除冲突项
      conflicts.forEach((c) => setShortcut(c.id, { key: "" }));
      toast.warning(`快捷键冲突，${conflicts.map((c) => c.label).join("、")} 的快捷键已被清除`);
    }

    setShortcut(id, { key, ctrl, shift, alt });
  };

  const formatShortcut = (shortcut: (typeof shortcuts)[0]) => {
    const parts = [];
    if (shortcut.ctrl) parts.push("Ctrl");
    if (shortcut.shift) parts.push("Shift");
    if (shortcut.alt) parts.push("Alt");
    if (shortcut.key) parts.push(shortcut.key.toUpperCase());
    return parts.join("+") || "-";
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          点击快捷键进行修改。您可以按下所需的键位组合来设置自定义快捷键。
        </p>
      </div>

      <div className="space-y-2">
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.id}
            className="flex items-center justify-between py-2.5 px-3 rounded-md hover:bg-surface-hover border border-transparent hover:border-border-light transition-colors cursor-pointer"
            onClick={() => handleStartEdit(shortcut)}
          >
            <span className="text-sm text-text-primary">{shortcut.label}</span>
            {editingId === shortcut.id ? (
              <Input
                autoFocus
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, shortcut.id)}
                onBlur={() => setEditingId(null)}
                className="w-36 h-8 text-sm text-center font-mono"
                placeholder="按下快捷键"
              />
            ) : (
              <kbd className="px-2.5 py-1 bg-surface rounded text-xs font-mono text-text-secondary border border-border-light min-w-[60px] text-center">
                {formatShortcut(shortcut)}
              </kbd>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-border-light">
        <p className="text-xs text-text-tertiary text-center">
          提示：点击快捷键后按下您想要的键位组合即可修改
        </p>
      </div>
    </div>
  );
}
