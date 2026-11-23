"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SEEN_KEY, UPDATES, type Update, updatesSince } from "@/lib/whats-new";

// Long enough that the page has settled before anything is put over it.
const DELAY_MS = 900;

/**
 * What's new since this browser last looked, for a signed-in member: a card
 * in the corner, shown once. It doesn't take focus or block the page, and
 * closing it (or following one of its links) is the end of it until there's
 * another update. The What's new page always has the whole list.
 */
export function WhatsNew() {
  const pathname = usePathname();
  const [updates, setUpdates] = useState<Update[]>([]);

  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = window.localStorage.getItem(SEEN_KEY);
    } catch {
      // No storage (private mode): it would come back on every page.
      return;
    }
    const fresh = updatesSince(seen);
    if (fresh.length === 0) return;
    const timer = setTimeout(() => setUpdates(fresh), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const close = useCallback(() => {
    setUpdates([]);
    try {
      window.localStorage.setItem(SEEN_KEY, UPDATES[0].id);
    } catch {
      // Nothing to remember it in.
    }
  }, []);

  useEffect(() => {
    if (updates.length === 0) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [updates, close]);

  // The page that lists everything says it already.
  if (updates.length === 0 || pathname === "/whats-new") return null;
  return (
    <aside
      className="whats-new"
      aria-label="What’s new"
      data-testid="whats-new"
    >
      <div className="whats-new-head">
        <h2>What’s new</h2>
        <button
          type="button"
          className="whats-new-close"
          aria-label="Close"
          onClick={close}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <ul>
        {updates.map((update) => (
          <li key={update.id}>
            <h3>{update.title}</h3>
            <p>{update.body}</p>
            {update.link && (
              <Link href={update.link.href} onClick={close}>
                {update.link.label} ›
              </Link>
            )}
          </li>
        ))}
      </ul>
      <div className="whats-new-foot">
        <Link href="/whats-new" onClick={close}>
          See everything new
        </Link>
        <button type="button" className="btn btn-sm" onClick={close}>
          Got it
        </button>
      </div>
    </aside>
  );
}
