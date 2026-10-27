"use client";

import {
  BadgeCheck,
  Eye,
  EyeOff,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { deletePluginAction } from "@/actions/delete-plugin";
import { requestPluginVerificationAction } from "@/actions/request-plugin-verification";
import { rescanOwnPluginAction } from "@/actions/rescan-own-plugin";
import { togglePluginListingAction } from "@/actions/toggle-plugin-listing";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PluginRow } from "@/lib/plugins/types";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";

const menuItemClass = "gap-2";

type Props = {
  plugin: PluginRow;
};

export function PluginOwnerMenu({ plugin }: Props) {
  const router = useRouter();
  const [isOwner, setIsOwner] = useState(false);
  const [active, setActive] = useState(plugin.active);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      const userId = session?.user.id ?? null;
      setIsOwner(!!userId && plugin.owner_id === userId);
    });
  }, [plugin.owner_id]);

  useEffect(() => {
    setActive(plugin.active);
  }, [plugin.active]);

  const requestPending = !!plugin.verification_requested_at;

  const { execute: requestVerification, isExecuting: isRequesting } = useAction(
    requestPluginVerificationAction,
    {
      onSuccess: () => {
        toast.success("Verification requested. We'll review it shortly.");
        router.refresh();
      },
      onError: ({ error }) => {
        toast.error(
          error.serverError ?? "Failed to submit verification request.",
        );
      },
    },
  );

  const { execute: toggleListing, isExecuting: isToggling } = useAction(
    togglePluginListingAction,
    {
      onSuccess: ({ input }) => {
        setActive(input.active);
        toast.success(
          input.active ? "Plugin is now published." : "Plugin unpublished.",
        );
        setConfirmUnpublish(false);
        router.refresh();
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to update listing status.");
      },
    },
  );

  const { execute: rescanPlugin, isExecuting: isRescanning } = useAction(
    rescanOwnPluginAction,
    {
      onSuccess: () => {
        toast.success("Scan queued. The listing updates when it finishes.");
        router.refresh();
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to start the scan.");
      },
    },
  );

  const { execute: deletePlugin, isExecuting: isDeleting } = useAction(
    deletePluginAction,
    {
      onSuccess: () => {
        toast.success("Plugin deleted.");
        setConfirmDelete(false);
        router.push("/");
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to delete plugin.");
      },
    },
  );

  if (!isOwner) {
    return null;
  }

  const busy = isRequesting || isToggling || isRescanning || isDeleting;
  const canVerify = !plugin.verified && !requestPending;
  const canPublish = !active && !plugin.permanently_blocked;
  // Mirrors the server-side gate in rescanOwnPluginAction.
  const canRescan =
    !plugin.permanently_blocked &&
    (plugin.scan_status === "flagged" ||
      plugin.scan_status === "error" ||
      plugin.scan_status === "unscanned");

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="size-8 shrink-0"
            disabled={busy}
            aria-label="Plugin options"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem asChild className={menuItemClass}>
            <Link href={`/plugins/${plugin.slug}/edit`}>
              <Pencil className="size-4 shrink-0" />
              Edit
            </Link>
          </DropdownMenuItem>

          {canVerify ? (
            <DropdownMenuItem
              className={menuItemClass}
              disabled={busy}
              onClick={() => requestVerification({ pluginId: plugin.id })}
            >
              <BadgeCheck className="size-4 shrink-0" />
              Submit for verification
            </DropdownMenuItem>
          ) : null}

          {requestPending && !plugin.verified ? (
            <DropdownMenuItem disabled className={menuItemClass}>
              <Loader2 className="size-4 shrink-0 animate-spin" />
              Verification requested
            </DropdownMenuItem>
          ) : null}

          {active ? (
            <DropdownMenuItem
              className={menuItemClass}
              disabled={busy}
              onClick={() => setConfirmUnpublish(true)}
            >
              <EyeOff className="size-4 shrink-0" />
              Unpublish
            </DropdownMenuItem>
          ) : canPublish ? (
            <DropdownMenuItem
              className={menuItemClass}
              disabled={busy}
              onClick={() => toggleListing({ id: plugin.id, active: true })}
            >
              <Eye className="size-4 shrink-0" />
              Publish
            </DropdownMenuItem>
          ) : null}

          {canRescan ? (
            <DropdownMenuItem
              className={menuItemClass}
              disabled={busy}
              onClick={() => rescanPlugin({ pluginId: plugin.id })}
            >
              <RefreshCw className="size-4 shrink-0" />
              Re-run scan
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className={cn(
              menuItemClass,
              "text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400",
            )}
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4 shrink-0" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmUnpublish} onOpenChange={setConfirmUnpublish}>
        <DialogContent title="Unpublish plugin">
          <DialogHeader>
            <DialogTitle>Unpublish plugin?</DialogTitle>
            <DialogDescription>
              &ldquo;{plugin.name}&rdquo; will be hidden from the directory. You
              can still edit it or publish again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmUnpublish(false)}
              disabled={isToggling}
            >
              Cancel
            </Button>
            <Button
              disabled={isToggling}
              onClick={() => toggleListing({ id: plugin.id, active: false })}
            >
              {isToggling ? <Loader2 className="size-4 animate-spin" /> : null}
              Unpublish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete plugin permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{plugin.name}&rdquo; and all of its components will be
              removed from the directory. This cannot be undone.
              {active ? " The plugin is currently published." : null}
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
                deletePlugin({ id: plugin.id });
              }}
            >
              {isDeleting ? (
                <Loader2 className="size-4 shrink-0 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
