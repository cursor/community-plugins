"use client";

import type { PluginRow } from "@directories/plugins/types";
import { Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";

export function ScanStatusBanner({
  plugin,
  isOwner,
}: {
  plugin: PluginRow;
  isOwner: boolean;
}) {
  const status = plugin.scan_status;

  if (status === "safe") return null;
  if (status === "unscanned") return null;
  if (status === "flagged" && plugin.active && !isOwner) return null;
  if (!isOwner && status === "error") return null;

  if (status === "pending" || status === "scanning") {
    return (
      <div className="mb-6 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {isOwner
            ? "Scanning your plugin… it will appear publicly once the security agent finishes."
            : "Plugin is being verified."}
        </span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mb-6 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <ShieldAlert className="size-4 text-amber-500" />
        <span className="text-sm text-amber-600 dark:text-amber-400">
          Scan failed. An admin will re-run it shortly.
        </span>
      </div>
    );
  }

  if (status === "flagged") {
    const reasons = plugin.flag_reasons ?? [];
    const live = plugin.active;
    return (
      <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 size-4 text-red-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              {live
                ? "Flagged by the security agent — pending manual review."
                : "Flagged by the security agent. Hidden from the directory pending manual review."}
            </p>
            {isOwner && plugin.flag_summary && (
              <p className="mt-1 text-sm text-red-600/90 dark:text-red-400/90">
                {plugin.flag_summary}
              </p>
            )}
            {isOwner && reasons.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-red-600/80 dark:text-red-400/80">
                {reasons.map((reason) => (
                  <li key={reason}>• {reason}</li>
                ))}
              </ul>
            )}
            {isOwner && (
              <p className="mt-2 text-xs text-red-600/80 dark:text-red-400/80">
                <Link
                  href={`/plugins/${plugin.slug}/edit`}
                  className="underline underline-offset-2"
                >
                  Edit your plugin
                </Link>{" "}
                and resubmit to trigger another scan.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
