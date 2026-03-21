"use client";

import { useState, useEffect } from "react";

export type Breakpoint = "mobile" | "tablet" | "desktop";

export interface UseResponsiveReturn {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isMobileOrTablet: boolean;
  breakpoint: Breakpoint;
  isHydrated: boolean; // Whether we've confirmed the breakpoint on client
}

const TABLET_BREAKPOINT = 768;
const DESKTOP_BREAKPOINT = 1024;

function getBreakpoint(width: number): Breakpoint {
  if (width < TABLET_BREAKPOINT) return "mobile";
  if (width < DESKTOP_BREAKPOINT) return "tablet";
  return "desktop";
}

export function useResponsive(): UseResponsiveReturn {
  // Start with desktop as default (SSR-safe), will be updated on client mount
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Update breakpoint on mount - this runs after hydration
    const updateBreakpoint = () => {
      const width = window.innerWidth;
      setBreakpoint(getBreakpoint(width));
      setIsHydrated(true);
    };

    // Update immediately on mount
    updateBreakpoint();

    // Listen for resize
    window.addEventListener("resize", updateBreakpoint);
    return () => window.removeEventListener("resize", updateBreakpoint);
  }, []);

  return {
    isMobile: breakpoint === "mobile",
    isTablet: breakpoint === "tablet",
    isDesktop: breakpoint === "desktop",
    isMobileOrTablet: breakpoint !== "desktop",
    breakpoint,
    isHydrated,
  };
}
