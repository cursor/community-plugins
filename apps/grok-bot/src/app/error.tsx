"use client";

import Link from "next/link";
import { useEffect } from "react";
import { BotArt } from "@/components/bot-art";

// Shown when a page fails to load (for example Supabase or x.ai is down);
// the header and footer stay, and the person can retry.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="shell page" data-testid="error-page">
      <div className="empty">
        <BotArt body="blob" color="black" face="sad" className="empty-bot" />
        <p>Something went wrong loading this page. It’s usually temporary.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="btn btn-gray">
            Back to all bots
          </Link>
        </div>
        {error.digest && (
          <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
