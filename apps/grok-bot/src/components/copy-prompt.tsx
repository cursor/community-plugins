"use client";

import { useEffect, useRef, useState } from "react";

/** A chat bubble that copies its prompt when clicked. */
export function CopyPrompt({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
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
      className="mc-bubble mc-copy"
      onClick={copy}
      aria-label={`Copy prompt: ${prompt}`}
      data-copied={copied || undefined}
      data-testid="copy-prompt"
    >
      <span>{prompt}</span>
      <span className="mc-copy-icon" aria-hidden="true">
        {copied ? (
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path
              d="M3.5 8.5l3 3 6-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" width="14" height="14">
            <rect
              x="5.5"
              y="5.5"
              width="8"
              height="8"
              rx="2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <path
              d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            />
          </svg>
        )}
      </span>
      <span className="mc-copied" aria-hidden="true">
        Copied
      </span>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}
