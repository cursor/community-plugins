"use client";

import { Check, ExternalLink, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { approveBotAction, declineBotAction } from "@/actions/review-bot";
import { Button } from "@/components/ui/button";
import type { BotRow } from "@/lib/bots/types";

function BotReviewCard({ bot }: { bot: BotRow }) {
  const [dismissed, setDismissed] = useState(false);

  const { execute: approve, isExecuting: isApproving } = useAction(
    approveBotAction,
    {
      onSuccess: () => {
        toast.success(`"${bot.name}" approved and now live.`);
        setDismissed(true);
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to approve bot.");
      },
    },
  );

  const { execute: decline, isExecuting: isDeclining } = useAction(
    declineBotAction,
    {
      onSuccess: () => {
        toast.success(`"${bot.name}" declined and removed.`);
        setDismissed(true);
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? "Failed to decline bot.");
      },
    },
  );

  if (dismissed) return null;

  const busy = isApproving || isDeclining;

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-cursor">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link
            href={`/bots/${bot.slug}`}
            target="_blank"
            className="group flex items-center gap-1.5 truncate text-sm font-medium hover:underline"
          >
            {bot.name}
            <ExternalLink className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {bot.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => decline({ botId: bot.id })}
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
            onClick={() => approve({ botId: bot.id })}
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

export function BotReviewList({ bots }: { bots: BotRow[] }) {
  if (bots.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center shadow-cursor">
        <p className="text-sm text-muted-foreground">
          No pending bots to review.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bots.map((bot) => (
        <BotReviewCard key={bot.id} bot={bot} />
      ))}
    </div>
  );
}
