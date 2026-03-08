import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ShortcutItem {
  id: string; // 'persona' | 'cron' | 'agent' | 'settings' | 'home'
  label: string; // 显示名称
  key: string; // 键位字符 (小写)
  ctrl: boolean; // 是否需要 Ctrl
  shift: boolean; // 是否需要 Shift
  alt?: boolean; // 是否需要 Alt
}

const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  { id: "persona", label: "角色设定", key: "z", ctrl: true, shift: true },
  { id: "cron", label: "定时任务", key: "x", ctrl: true, shift: true },
  { id: "agent", label: "Agent管理", key: "c", ctrl: true, shift: true },
  { id: "settings", label: "设置", key: "v", ctrl: true, shift: true },
  { id: "home", label: "对话首页", key: "h", ctrl: true, shift: true },
];

interface ShortcutState {
  shortcuts: ShortcutItem[];
  setShortcut: (id: string, config: Partial<ShortcutItem>) => void;
  resetToDefault: () => void;
}

export const useShortcutStore = create<ShortcutState>()(
  persist(
    (set) => ({
      shortcuts: DEFAULT_SHORTCUTS,

      setShortcut: (id, config) =>
        set((state) => ({
          shortcuts: state.shortcuts.map((s) => (s.id === id ? { ...s, ...config } : s)),
        })),

      resetToDefault: () => set({ shortcuts: DEFAULT_SHORTCUTS }),
    }),
    {
      name: "shortcut-storage",
    },
  ),
);
