"use client";

import { ExternalLink, Loader2, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { rescanPluginAction } from "@/actions/review-flagged-plugin";
import { declinePluginAction } from "@/actions/review-plugin";
import { Button } from "@/components/ui/button";
import type { PluginRow } from "@/lib/plugins/types";

function StuckCard({ plugin }: { plugin: PluginRow }) {
  const [dismissed, setDismissed] = useState(false);

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
  const busy = isRescanning || isDeleting;

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
            <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono uppercase text-muted-foreground">
              {plugin.scan_status}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="text-text-tertiary">
              last change {new Date(plugin.updated_at).toLocaleString()}
            </span>
            {plugin.scan_run_id && (
              <span className="font-mono text-text-tertiary">
                run {plugin.scan_run_id.slice(0, 12)}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
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

export function StuckScanList({ plugins }: { plugins: PluginRow[] }) {
  if (plugins.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center shadow-cursor">
        <p className="text-sm text-muted-foreground">
          No stuck scans. The pipeline is clear.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {plugins.map((plugin) => (
        <StuckCard key={plugin.id} plugin={plugin} />
      ))}
    </div>
  );
}
