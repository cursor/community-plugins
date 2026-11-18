"use client";

import Image from "next/image";
import { useState } from "react";
import { OPTIMIZED_IMAGE_HOSTS } from "@/lib/image-hosts.mjs";
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

function optimizable(url: string): boolean {
  try {
    return OPTIMIZED_IMAGE_HOSTS.includes(new URL(url).hostname);
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
      unoptimized={!optimizable(logo)}
      className={cn(
        "rounded-lg border border-border bg-card p-1",
        logo.endsWith(".svg") && "invert",
      )}
      onError={() => setError(true)}
    />
  );
}
