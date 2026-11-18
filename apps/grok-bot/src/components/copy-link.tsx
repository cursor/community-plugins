"use client";

import { useEffect, useRef, useState } from "react";

/** A button that copies an address and says so for a moment. */
export function CopyLink({
  url,
  className = "btn btn-gray",
  children = "Copy link",
}: {
  /** A full address, or a path on this site. */
  url: string;
  className?: string;
  children?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(
        new URL(url, window.location.origin).toString(),
      );
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      className={className}
      onClick={copy}
      data-testid="copy-link"
    >
      {/* Says it to screen readers too, without moving focus. */}
      <span aria-live="polite">{copied ? "Copied" : children}</span>
    </button>
  );
}
