"use client";

import { Store } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const TOOLTIP = "From the Cursor Marketplace";

export function OfficialBadge({
  size = "sm",
  className,
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  if (size === "md") {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-border bg-muted px-2 text-xs font-medium text-foreground",
                className,
              )}
            >
              <Store className="size-3.5" aria-hidden="true" />
              <span>Official</span>
            </span>
          </TooltipTrigger>
          <TooltipContent sideOffset={6}>{TOOLTIP}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label={TOOLTIP}
            className={cn(
              "inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground",
              className,
            )}
          >
            <Store className="size-3.5" aria-hidden="true" />
          </span>
        </TooltipTrigger>
        <TooltipContent sideOffset={6}>{TOOLTIP}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
