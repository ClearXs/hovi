"use client";

// Simple event names for mobile tab bar actions
export const MOBILE_EVENTS = {
  OPEN_CHAT: "mobile:open-chat",
  OPEN_CHANNEL: "mobile:open-channel",
  OPEN_DISCOVER: "mobile:open-discover",
  OPEN_PERSONA: "mobile:open-persona",
  OPEN_SETTINGS: "mobile:open-settings",
  OPEN_CRON_JOBS: "mobile:open-cron-jobs",
  OPEN_AGENT_MANAGE: "mobile:open-agent-manage",
  OPEN_KNOWLEDGE: "mobile:open-knowledge",
  OPEN_MY: "mobile:open-my",
} as const;

// Dispatch helper
export function dispatchMobileEvent(eventName: (typeof MOBILE_EVENTS)[keyof typeof MOBILE_EVENTS]) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(eventName));
  }
}

// Listen helper (for cleanup)
export function addMobileEventListener(
  eventName: (typeof MOBILE_EVENTS)[keyof typeof MOBILE_EVENTS],
  handler: () => void,
) {
  if (typeof window !== "undefined") {
    window.addEventListener(eventName, handler);
  }
}

export function removeMobileEventListener(
  eventName: (typeof MOBILE_EVENTS)[keyof typeof MOBILE_EVENTS],
  handler: () => void,
) {
  if (typeof window !== "undefined") {
    window.removeEventListener(eventName, handler);
  }
}
