"use client";

import type { FlagSeverity, PluginRow } from "@directories/plugins/types";
import {
  Check,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import {
  approveFlaggedPluginAction,
  confirmFlagAction,
  rescanPluginAction,
} from "@/actions/review-flagged-plugin";
import { declinePluginAction } from "@/actions/review-plugin";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const severityClass: Record<FlagSeverity, string> = {
  high: "bg-red-500/15 text-red-500 border-red-500/30",
  medium: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  low: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
};

function FlaggedCard({ plugin }: { plugin: PluginRow }) {
  const [dismissed, setDismissed] = useState(false);

  const { execute: approve, isExecuting: isApproving } = useAction(
    approveFlaggedPluginAction,
    {
      onSuccess: () => {
        toast.success(`"${plugin.name}" approved and now live.`);
        setDismissed(true);
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to approve plugin.");
      },
    },
  );

  const { execute: confirm, isExecuting: isConfirming } = useAction(
    confirmFlagAction,
    {
      onSuccess: () => {
        toast.success(`"${plugin.name}" permanently blocked.`);
        setDismissed(true);
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to confirm flag.");
      },
    },
  );

  const { execute: rescan, isExecuting: isRescanning } = useAction(
    rescanPluginAction,
    {
      onSuccess: () => {
        toast.success(`Re-scanning "${plugin.name}"…`);
        setDismissed(true);
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to enqueue re-scan.");
      },
    },
  );

  const { execute: del, isExecuting: isDeleting } = useAction(
    declinePluginAction,
    {
      onSuccess: () => {
        toast.success(`"${plugin.name}" deleted.`);
        setDismissed(true);
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to delete plugin.");
      },
    },
  );

  if (dismissed) return null;

  const busy = isApproving || isConfirming || isRescanning || isDeleting;
  const reasons = plugin.flag_reasons ?? [];
  const verdictLabel = plugin.scan_verdict?.verdict ?? "flagged";

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-cursor">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/plugins/${plugin.slug}`}
              target="_blank"
              className="group flex items-center gap-1.5 truncate text-sm font-medium hover:underline"
            >
              {plugin.name}
              <ExternalLink className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
            {plugin.flag_severity && (
              <span
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-[10px] font-mono uppercase",
                  severityClass[plugin.flag_severity],
                )}
              >
                {plugin.flag_severity}
              </span>
            )}
            <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono uppercase text-muted-foreground">
              {verdictLabel}
            </span>
            {plugin.active && (
              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-mono uppercase text-amber-500">
                Live with warning
              </span>
            )}
            {plugin.permanently_blocked && (
              <span className="rounded-md border border-red-500/30 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-mono uppercase text-red-500">
                Blocked
              </span>
            )}
          </div>

          {plugin.flag_summary && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-foreground">{plugin.flag_summary}</p>
            </div>
          )}

          {reasons.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {reasons.map((reason) => (
                <li key={reason} className="flex gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {plugin.repository && (
              <a
                href={plugin.repository}
                target="_blank"
                rel="noreferrer"
                className="border-b border-border border-dashed transition-colors hover:text-foreground"
              >
                Repository
              </a>
            )}
            {plugin.scan_run_id && (
              <span className="font-mono text-text-tertiary">
                run {plugin.scan_run_id.slice(0, 12)}
              </span>
            )}
            {plugin.flagged_at && (
              <span className="text-text-tertiary">
                flagged {new Date(plugin.flagged_at).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => approve({ pluginId: plugin.id })}
          >
            {isApproving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            <span className="ml-1.5">Approve anyway</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => rescan({ pluginId: plugin.id })}
          >
            {isRescanning ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            <span className="ml-1.5">Re-scan</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => confirm({ pluginId: plugin.id })}
          >
            {isConfirming ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ShieldAlert className="size-3.5" />
            )}
            <span className="ml-1.5">Confirm flag</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => del({ pluginId: plugin.id })}
          >
            {isDeleting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            <span className="ml-1.5">Delete</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FlaggedReviewList({ plugins }: { plugins: PluginRow[] }) {
  if (plugins.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center shadow-cursor">
        <p className="text-sm text-muted-foreground">
          Nothing flagged. The agent is happy.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {plugins.map((plugin) => (
        <FlaggedCard key={plugin.id} plugin={plugin} />
      ))}
    </div>
  );
}
