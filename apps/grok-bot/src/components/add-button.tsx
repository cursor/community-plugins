"use client";

import type { ReactNode } from "react";
import { trackInstall } from "@/actions/track-install";
import { shareUrl } from "@/lib/share-link";

/**
 * "Add to Grok Bot": opens the bot's public x.ai share page, which opens
 * Grok Bot (or offers to install it), and counts the click as an install.
 */
export function AddButton({
  botId,
  slug,
  shareId,
  className,
  children,
}: {
  botId: string;
  slug: string;
  shareId: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <a
      href={shareUrl(shareId)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      data-testid="add-button"
      onClick={(e) => {
        e.stopPropagation();
        void trackInstall({ botId, slug });
      }}
    >
      {children}
    </a>
  );
}
