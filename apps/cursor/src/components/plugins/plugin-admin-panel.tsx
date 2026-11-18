"use client";

import type {
  FlagSeverity,
  PluginRow,
  ScanStatus,
} from "@directories/plugins/types";
import {
  Check,
  EyeOff,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  approveFlaggedPluginAction,
  confirmFlagAction,
  rescanPluginAction,
} from "@/actions/review-flagged-plugin";
import {
  approvePluginAction,
  declinePluginAction,
  unpublishPluginAction,
} from "@/actions/review-plugin";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { cn } from "@/lib/utils";

const severityClass: Record<FlagSeverity, string> = {
  high: "bg-red-500/15 text-red-500 border-red-500/30",
  medium: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  low: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
};

const scanStatusClass: Record<ScanStatus, string> = {
  flagged: "border-red-500/30 bg-red-500/10 text-red-500",
  error: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  pending: "border-border bg-muted text-muted-foreground",
  scanning: "border-border bg-muted text-muted-foreground",
  safe: "border-border bg-muted text-muted-foreground",
  unscanned: "border-border bg-muted text-muted-foreground",
};

function StatusBadge({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-mono uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

type Props = {
  plugin: PluginRow;
};

/**
 * Moderation toolbar shown only to admins on the public plugin page, so the
 * queue actions (approve, re-scan, confirm flag, unpublish, delete) don't
 * require a round trip to /admin/plugins. Rendering is gated client-side by
 * `useIsAdmin`; every action is enforced server-side by `adminActionClient`.
 */
export function PluginAdminPanel({ plugin }: Props) {
  const router = useRouter();
  const isAdmin = useIsAdmin();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();

  // The actions invalidate the detail cache tag; refresh so the panel and the
  // rest of the page re-render with the new row. The transition keeps the
  // buttons disabled until the fresh data has actually arrived.
  const refresh = () => startRefresh(() => router.refresh());

  const { execute: approve, isExecuting: isApproving } = useAction(
    approvePluginAction,
    {
      onSuccess: () => {
        toast.success(`"${plugin.name}" approved and now live.`);
        refresh();
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to approve plugin.");
      },
    },
  );

  const { execute: approveFlagged, isExecuting: isApprovingFlagged } =
    useAction(approveFlaggedPluginAction, {
      onSuccess: () => {
        toast.success(`"${plugin.name}" approved and now live.`);
        refresh();
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to approve plugin.");
      },
    });

  const { execute: unpublish, isExecuting: isUnpublishing } = useAction(
    unpublishPluginAction,
    {
      onSuccess: () => {
        toast.success(`"${plugin.name}" unpublished.`);
        refresh();
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to unpublish plugin.");
      },
    },
  );

  const { execute: rescan, isExecuting: isRescanning } = useAction(
    rescanPluginAction,
    {
      onSuccess: () => {
        toast.success(`Re-scanning "${plugin.name}"…`);
        refresh();
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to enqueue re-scan.");
      },
    },
  );

  const { execute: confirmFlag, isExecuting: isConfirming } = useAction(
    confirmFlagAction,
    {
      onSuccess: () => {
        toast.success(`"${plugin.name}" permanently blocked.`);
        refresh();
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to confirm flag.");
      },
    },
  );

  const { execute: deletePlugin, isExecuting: isDeleting } = useAction(
    declinePluginAction,
    {
      onSuccess: () => {
        toast.success(`"${plugin.name}" deleted.`);
        setConfirmDelete(false);
        router.push("/admin/plugins");
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to delete plugin.");
      },
    },
  );

  if (!isAdmin) {
    return null;
  }

  const busy =
    isApproving ||
    isApprovingFlagged ||
    isUnpublishing ||
    isRescanning ||
    isConfirming ||
    isDeleting ||
    isRefreshing;

  const status = plugin.scan_status;
  const isFlagged = status === "flagged";
  // A blocked plugin must go through the flagged path so approving also
  // clears `permanently_blocked`; plain approve would leave the block in
  // place and the next scan would hide it again.
  const needsFlagReview = isFlagged || plugin.permanently_blocked;
  const isScanRunning = status === "pending" || status === "scanning";
  const verdict = plugin.scan_verdict?.verdict;
  const reasons = isFlagged ? (plugin.flag_reasons ?? []) : [];
  // `flag_summary` carries the agent's summary when flagged and the error
  // message when the scan failed; both are useful to an admin.
  const summary = isFlagged || status === "error" ? plugin.flag_summary : null;

  return (
    <>
      <div className="mb-6 rounded-lg border border-border bg-card p-4 shadow-cursor">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <ShieldCheck className="size-4 text-muted-foreground" />
                Admin
              </span>
              <StatusBadge
                className={
                  plugin.active
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-border bg-muted text-muted-foreground"
                }
              >
                {plugin.active ? "Live" : "Hidden"}
              </StatusBadge>
              <StatusBadge className={scanStatusClass[status]}>
                {isScanRunning && <Loader2 className="size-2.5 animate-spin" />}
                scan: {status}
              </StatusBadge>
              {isFlagged && plugin.flag_severity && (
                <StatusBadge className={severityClass[plugin.flag_severity]}>
                  {plugin.flag_severity}
                </StatusBadge>
              )}
              {isFlagged && verdict && verdict !== "safe" && (
                <StatusBadge className="border-border bg-muted text-muted-foreground">
                  {verdict}
                </StatusBadge>
              )}
              {plugin.permanently_blocked && (
                <StatusBadge className="border-red-500/30 bg-red-500/15 text-red-500">
                  Blocked
                </StatusBadge>
              )}
              <Link
                href="/admin/plugins"
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Open queue
              </Link>
            </div>

            {summary && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-foreground">{summary}</p>
              </div>
            )}

            {reasons.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {reasons.map((reason) => (
                  <li key={reason} className="flex gap-2">
                    <span>•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {needsFlagReview ? (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => approveFlagged({ pluginId: plugin.id })}
              >
                {isApprovingFlagged ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                <span className="ml-1.5">Approve anyway</span>
              </Button>
            ) : plugin.active ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => unpublish({ pluginId: plugin.id })}
              >
                {isUnpublishing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <EyeOff className="size-3.5" />
                )}
                <span className="ml-1.5">Unpublish</span>
              </Button>
            ) : (
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
            )}

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

            {isFlagged && !plugin.permanently_blocked && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => confirmFlag({ pluginId: plugin.id })}
              >
                {isConfirming ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ShieldAlert className="size-3.5" />
                )}
                <span className="ml-1.5">Confirm flag</span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
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

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete plugin permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{plugin.name}&rdquo; and all of its components will be
              removed from the directory. This cannot be undone.
              {plugin.active ? " The plugin is currently published." : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                buttonVariants({ variant: "destructive" }),
                "gap-2",
              )}
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                deletePlugin({ pluginId: plugin.id });
              }}
            >
              {isDeleting ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
