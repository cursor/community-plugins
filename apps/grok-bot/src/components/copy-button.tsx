"use client";

import { useEffect, useRef, useState } from "react";

/** Copies `text`; says "Copied" for a moment. */
export function CopyButton({
  text,
  label = "Copy",
  className = "btn btn-gray btn-sm",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
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
      data-testid="copy-button"
    >
      {copied ? "Copied" : label}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}
