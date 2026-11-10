"use client";

import type { PluginRow } from "@directories/plugins/types";
import { BadgeCheck, BadgeMinus, Check, Loader2, X } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import {
  dismissVerificationRequestAction,
  setPluginVerifiedAction,
} from "@/actions/verify-plugin";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-is-admin";

type Props = {
  plugin: PluginRow;
};

export function VerifyControls({ plugin }: Props) {
  const isAdmin = useIsAdmin();

  const requestPending = !!plugin.verification_requested_at;

  const { execute: setVerified, isExecuting: isSettingVerified } = useAction(
    setPluginVerifiedAction,
    {
      onSuccess: ({ input }) => {
        toast.success(
          input.verified ? "Plugin verified." : "Verification removed.",
        );
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to update verification.");
      },
    },
  );

  const { execute: dismiss, isExecuting: isDismissing } = useAction(
    dismissVerificationRequestAction,
    {
      onSuccess: () => {
        toast.success("Verification request dismissed.");
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to dismiss request.");
      },
    },
  );

  const busy = isSettingVerified || isDismissing;

  if (!isAdmin) {
    return null;
  }

  if (plugin.verified) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => setVerified({ pluginId: plugin.id, verified: false })}
      >
        {isSettingVerified ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <BadgeMinus className="size-3.5" />
        )}
        <span className="ml-1.5">Remove verification</span>
      </Button>
    );
  }

  if (requestPending) {
    return (
      <div className="flex items-center gap-2">
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
          onClick={() => setVerified({ pluginId: plugin.id, verified: true })}
        >
          {isSettingVerified ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          <span className="ml-1.5">Approve</span>
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => setVerified({ pluginId: plugin.id, verified: true })}
    >
      {isSettingVerified ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <BadgeCheck className="size-3.5" />
      )}
      <span className="ml-1.5">Mark verified</span>
    </Button>
  );
}
