"use client";

import { useEffect, useState } from "react";

// Light, dark or system, stored in localStorage and applied as
// <html data-theme>. The inline THEME_SCRIPT runs in <head> before paint so
// there's no flash of the wrong theme.
type Theme = "light" | "dark" | "system";
const STORAGE_KEY = "theme";

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t;}catch(e){}})();`;

function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function Icon({ d }: { d: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const OPTIONS: [Theme, string, string][] = [
  [
    "light",
    "Light theme",
    "M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5L19 19M3 12h2M19 12h2M5 19l1.5-1.5M17.5 6.5L19 5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  ],
  ["dark", "Dark theme", "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"],
  ["system", "System theme", "M3 4h18v12H3zM8 20h8M12 16v4"],
];

export function ThemeToggle() {
  // Known only on the client; render unselected first to match the server.
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const current: Theme =
      saved === "light" || saved === "dark" ? saved : "system";
    // Next skips beforeInteractive scripts on not-found responses; apply the
    // theme here when THEME_SCRIPT didn't run.
    if (!document.documentElement.dataset.theme) apply(current);
    setTheme(current);
  }, []);
  useEffect(() => {
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);
  const choose = (next: Theme) => {
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
    apply(next);
    setTheme(next);
  };
  return (
    <div className="theme-toggle">
      {OPTIONS.map(([id, label, d]) => (
        <button
          key={id}
          type="button"
          aria-label={label}
          aria-pressed={theme === id}
          className={theme === id ? "on" : ""}
          onClick={() => choose(id)}
        >
          <Icon d={d} />
        </button>
      ))}
    </div>
  );
}

/** The Grok Bot lockup in the ink that suits the current theme. */
export function Lockup({ className }: { className?: string }) {
  return (
    <>
      {/* biome-ignore lint/performance/noImgElement: tiny SVG logos; next/image adds nothing */}
      <img
        src="/brand/lockup-black.svg"
        alt="Grok Bot"
        className={`${className ?? ""} theme-light-only`}
      />
      {/* biome-ignore lint/performance/noImgElement: tiny SVG logos; next/image adds nothing */}
      <img
        src="/brand/lockup-white.svg"
        alt=""
        aria-hidden="true"
        className={`${className ?? ""} theme-dark-only`}
      />
    </>
  );
}
