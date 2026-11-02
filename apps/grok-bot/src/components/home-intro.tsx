"use client";

import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

// Set once the landing page has mounted, so coming back to it within the
// site skips the intro (a full reload still plays it), like x.ai/bot.
let played = false;

/**
 * The landing page's load-in, after x.ai/bot's hero (hero/intro.tsx): the
 * title flips up word by word, then the pill and copy fan in out of a blur,
 * then the button, then the directory. Pure CSS (`.intro` in globals.css),
 * so it runs from the first paint of the server HTML.
 */
export function HomeIntro({ children }: { children: ReactNode }) {
  const [mode] = useState(() => (played ? "done" : "play"));
  useEffect(() => {
    played = true;
  }, []);
  return (
    <div className="intro" data-intro={mode}>
      {children}
    </div>
  );
}

/** One step of the title's word-by-word reveal. */
export function IntroWord({ i, children }: { i: number; children: ReactNode }) {
  return (
    <span className="intro-word" style={{ "--w": i } as CSSProperties}>
      {children}
    </span>
  );
}
