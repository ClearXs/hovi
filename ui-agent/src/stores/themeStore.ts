/**
 * Theme Store
 *
 * Global state management for theme switching using Zustand.
 * Handles theme persistence via localStorage and DOM attribute updates.
 */

import { create } from "zustand";
import { ThemeName, DEFAULT_THEME } from "@/config/themes";

interface ThemeState {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

/**
 * Get stored theme from localStorage
 * Returns default theme if no stored theme or if running on server
 */
function getStoredTheme(): ThemeName {
  if (typeof window === "undefined") return DEFAULT_THEME;

  try {
    const stored = localStorage.getItem("theme") as ThemeName;
    return stored || DEFAULT_THEME;
  } catch (error) {
    return DEFAULT_THEME;
  }
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getStoredTheme(),

  setTheme: (theme) => {
    set({ theme });

    // Update DOM attribute for CSS
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }

    // Persist to localStorage
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("theme", theme);
      } catch (error) {
        // Ignore localStorage errors
      }
    }
  },
}));
