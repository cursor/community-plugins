"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";

const WORDS = { bots: "a bot", apps: "an app" } as const;
type Tab = keyof typeof WORDS;
const TABS = Object.keys(WORDS) as Tab[];

/**
 * "Submit a bot" / "Submit an app". It stays mounted when the home page
 * switches tabs, so only the last words move: they slide in the direction of
 * the switch while the button eases to the new width.
 */
export function HeroCta({ tab }: { tab: Tab }) {
  const slot = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const on = slot.current?.querySelector<HTMLElement>(`[data-word="${tab}"]`);
    if (on) setWidth(on.offsetWidth);
  }, [tab]);

  return (
    <Link
      href={tab === "apps" ? "/submit?kind=app" : "/submit"}
      className="btn btn-lg hero-cta"
      aria-label={`Submit ${WORDS[tab]}`}
    >
      Submit
      <span
        ref={slot}
        className="cta-words"
        aria-hidden="true"
        // Measured before the first paint, so only later changes animate.
        data-ready={width !== null || undefined}
        style={width !== null ? { width } : undefined}
      >
        {TABS.map((t) => (
          <span key={t} className="cta-word" data-word={t} data-on={t === tab}>
            {WORDS[t]}
          </span>
        ))}
      </span>
    </Link>
  );
}
