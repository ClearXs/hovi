import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ShortcutItem {
  id: string; // 'newSession' | 'search' | 'persona' | 'cron' | 'agent' | 'settings' | 'home'
  label: string; // 显示名称
  key: string; // 键位字符 (小写)
  ctrl: boolean; // 是否需要 Ctrl
  shift: boolean; // 是否需要 Shift
  alt: boolean; // 是否需要 Alt
  meta: boolean; // 是否需要 Cmd/Meta
}

const DEFAULT_SHORTCUTS: ShortcutItem[] = [
  {
    id: "newSession",
    label: "新建任务",
    key: "n",
    ctrl: true,
    shift: false,
    alt: false,
    meta: true,
  },
  { id: "search", label: "搜索任务", key: "k", ctrl: true, shift: false, alt: false, meta: true },
  { id: "persona", label: "角色设定", key: "z", ctrl: true, shift: true, alt: false, meta: false },
  { id: "cron", label: "定时任务", key: "x", ctrl: true, shift: true, alt: false, meta: false },
  { id: "agent", label: "Agent管理", key: "c", ctrl: true, shift: true, alt: false, meta: false },
  { id: "settings", label: "设置", key: "v", ctrl: true, shift: true, alt: false, meta: false },
  { id: "home", label: "对话首页", key: "h", ctrl: true, shift: true, alt: false, meta: false },
];

function normalizeShortcut(
  fallback: ShortcutItem,
  candidate?: Partial<ShortcutItem> | undefined,
): ShortcutItem {
  return {
    ...fallback,
    ...candidate,
    key: typeof candidate?.key === "string" ? candidate.key : fallback.key,
    ctrl: candidate?.ctrl ?? fallback.ctrl,
    shift: candidate?.shift ?? fallback.shift,
    alt: candidate?.alt ?? fallback.alt,
    meta: candidate?.meta ?? fallback.meta,
  };
}

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
          shortcuts: state.shortcuts.map((s) =>
            s.id === id ? normalizeShortcut(s, config) : normalizeShortcut(s),
          ),
        })),

      resetToDefault: () => set({ shortcuts: DEFAULT_SHORTCUTS }),
    }),
    {
      name: "shortcut-storage",
      merge: (persisted, current) => {
        const state = (persisted as Partial<ShortcutState>) ?? {};
        const persistedShortcuts = Array.isArray(state.shortcuts) ? state.shortcuts : [];
        const shortcuts = DEFAULT_SHORTCUTS.map((entry) =>
          normalizeShortcut(
            entry,
            persistedShortcuts.find((candidate) => candidate?.id === entry.id),
          ),
        );
        return {
          ...current,
          ...state,
          shortcuts,
        };
      },
    },
  ),
);
