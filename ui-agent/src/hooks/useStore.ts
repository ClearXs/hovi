import { useEffect } from "react";
import { useAgentStore } from "@/stores/agentStore";
import { useChatStore } from "@/stores/chatStore";
import { useUIStore } from "@/stores/uiStore";

export const useStore = () => {
  const chatStore = useChatStore();
  const agentStore = useAgentStore();
  const uiStore = useUIStore();

  // Initialize theme on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("ui-storage");
      if (savedTheme) {
        try {
          const { state } = JSON.parse(savedTheme);
          if (state?.theme) {
            document.documentElement.classList.toggle("dark", state.theme === "dark");
          }
        } catch (error) {
          // Ignore parse errors
        }
      }
    }
  }, []);

  return {
    chat: chatStore,
    agent: agentStore,
    ui: uiStore,
  };
};
