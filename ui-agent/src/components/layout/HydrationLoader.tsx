"use client";

import { Loader2 } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";

interface HydrationLoaderProps {
  isHydrated: boolean;
  className?: string;
}

export const HydrationLoader = memo(function HydrationLoader({
  isHydrated,
  className,
}: HydrationLoaderProps) {
  if (isHydrated) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[99999] flex flex-col items-center justify-center",
        "bg-background",
        className,
      )}
    >
      <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
      <p className="text-sm text-text-secondary">加载中...</p>
    </div>
  );
});
