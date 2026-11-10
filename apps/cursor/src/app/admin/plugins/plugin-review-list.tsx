"use client";

import type { PluginRow } from "@directories/plugins/types";
import { Check, ExternalLink, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import {
  approvePluginAction,
  declinePluginAction,
} from "@/actions/review-plugin";
import { Button } from "@/components/ui/button";

function PluginReviewCard({ plugin }: { plugin: PluginRow }) {
  const [dismissed, setDismissed] = useState(false);

  const { execute: approve, isExecuting: isApproving } = useAction(
    approvePluginAction,
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

  const { execute: decline, isExecuting: isDeclining } = useAction(
    declinePluginAction,
    {
      onSuccess: () => {
        toast.success(`"${plugin.name}" declined and removed.`);
        setDismissed(true);
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to decline plugin.");
      },
    },
  );

  if (dismissed) return null;

  const busy = isApproving || isDeclining;
  const componentCount = plugin.plugin_components?.length ?? 0;
  const componentTypes = [
    ...new Set(plugin.plugin_components?.map((c) => c.type) ?? []),
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-cursor">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link
            href={`/plugins/${plugin.slug}`}
            target="_blank"
            className="group flex items-center gap-1.5 truncate text-sm font-medium hover:underline"
          >
            {plugin.name}
            <ExternalLink className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
          {plugin.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {plugin.description}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {plugin.repository && (
              <a
                href={plugin.repository}
                target="_blank"
                rel="noreferrer"
                className="border-b border-border border-dashed hover:text-foreground transition-colors"
              >
                Repository
              </a>
            )}
            <span>
              {componentCount}{" "}
              {componentCount === 1 ? "component" : "components"}
            </span>
            {componentTypes.length > 0 && (
              <span className="text-text-tertiary">
                {componentTypes.join(", ")}
              </span>
            )}
            <span className="text-text-tertiary">
              {new Date(plugin.created_at).toLocaleDateString()}
            </span>
          </div>
          {plugin.keywords && plugin.keywords.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {plugin.keywords.map((kw) => (
                <span
                  key={kw}
                  className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => decline({ pluginId: plugin.id })}
          >
            {isDeclining ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            <span className="ml-1.5">Decline</span>
          </Button>
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
            <span className="ml-1.5">Approve</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PluginReviewList({ plugins }: { plugins: PluginRow[] }) {
  if (plugins.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center shadow-cursor">
        <p className="text-sm text-muted-foreground">
          No pending plugins to review.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {plugins.map((plugin) => (
        <PluginReviewCard key={plugin.id} plugin={plugin} />
      ))}
    </div>
  );
}
