"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { PluginIconFallback } from "../plugin-icon";

function isValidImageUrl(url: string | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function PluginLogo({
  logo,
  name,
  size = 40,
}: {
  logo: string | null;
  name: string;
  size?: number;
}) {
  const [error, setError] = useState(false);
  const validUrl = isValidImageUrl(logo);

  if (!validUrl || error) {
    return <PluginIconFallback size={size} />;
  }

  return (
    <Image
      src={logo}
      alt={`${name} logo`}
      width={size}
      height={size}
      className={cn(
        "rounded-lg border border-border bg-card p-1",
        logo.endsWith(".svg") && "invert",
      )}
      onError={() => setError(true)}
      // Logos come from whatever host the plugin manifest points at (raw
      // GitHub content for relative paths, anything for absolute URLs), so
      // the image optimizer's remotePatterns allowlist would 500 the page
      // for most of them. The card and leaderboard already render the same
      // URLs as plain <img>; do the same here.
      unoptimized
    />
  );
}
