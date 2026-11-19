"use client";

import type { ReactNode } from "react";
import { trackAppAdd } from "@/actions/track-app-add";

/**
 * "Add to Grok Bot" for an app: opens Grok Bot with the app (its marketplace
 * page, or a message that adds its servers and skills) and counts the click
 * as an install of the plugin.
 */
export function AppAddLink({
  slug,
  href,
  className,
  tooltip,
  children,
}: {
  slug: string;
  href: string;
  className: string;
  tooltip?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      data-tooltip={tooltip}
      data-testid="app-add"
      onClick={(e) => {
        e.stopPropagation();
        void trackAppAdd({ slug });
      }}
    >
      {children}
    </a>
  );
}
