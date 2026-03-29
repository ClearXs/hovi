"use client";

import { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface IconButtonProps {
  icon: LucideIcon;
  onClick: () => void;
  tooltip?: string;
  variant?: "default" | "danger";
  className?: string;
}

export function IconButton({
  icon: Icon,
  onClick,
  tooltip,
  variant = "default",
  className,
}: IconButtonProps) {
  const button = (
    <button
      onClick={onClick}
      className={cn(
        "cursor-pointer p-2 rounded-md transition-colors duration-fast",
        variant === "default" &&
          "hover:bg-surface-hover text-text-secondary hover:text-text-primary",
        variant === "danger" && "hover:bg-error-light text-error",
        className,
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );

  if (tooltip) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}
