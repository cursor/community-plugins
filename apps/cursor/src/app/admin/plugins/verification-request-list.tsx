"use client";

import type { PluginRow } from "@directories/plugins/types";
import { BadgeCheck, ExternalLink, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import {
  dismissVerificationRequestAction,
  setPluginVerifiedAction,
} from "@/actions/verify-plugin";
import { Button } from "@/components/ui/button";

function VerificationRequestCard({ plugin }: { plugin: PluginRow }) {
  const [dismissed, setDismissed] = useState(false);

  const { execute: approve, isExecuting: isApproving } = useAction(
    setPluginVerifiedAction,
    {
      onSuccess: () => {
        toast.success(`"${plugin.name}" verified.`);
        setDismissed(true);
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to verify plugin.");
      },
    },
  );

  const { execute: dismiss, isExecuting: isDismissing } = useAction(
    dismissVerificationRequestAction,
    {
      onSuccess: () => {
        toast.success(`Verification request for "${plugin.name}" dismissed.`);
        setDismissed(true);
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to dismiss request.");
      },
    },
  );

  if (dismissed) return null;

  const busy = isApproving || isDismissing;
  const requestedAt = plugin.verification_requested_at
    ? new Date(plugin.verification_requested_at)
    : null;

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
                className="border-b border-border border-dashed transition-colors hover:text-foreground"
              >
                Repository
              </a>
            )}
            {plugin.author_name && <span>by {plugin.author_name}</span>}
            {requestedAt && (
              <span className="text-text-tertiary">
                Requested {requestedAt.toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => dismiss({ pluginId: plugin.id })}
          >
            {isDismissing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <X className="size-3.5" />
            )}
            <span className="ml-1.5">Deny</span>
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => approve({ pluginId: plugin.id, verified: true })}
          >
            {isApproving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <BadgeCheck className="size-3.5" />
            )}
            <span className="ml-1.5">Approve</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function VerificationRequestList({ plugins }: { plugins: PluginRow[] }) {
  if (plugins.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center shadow-cursor">
        <p className="text-sm text-muted-foreground">
          No pending verification requests.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {plugins.map((plugin) => (
        <VerificationRequestCard key={plugin.id} plugin={plugin} />
      ))}
    </div>
  );
}
