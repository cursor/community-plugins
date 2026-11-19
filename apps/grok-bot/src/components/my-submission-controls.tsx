"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  creditMyBots,
  refreshMyBot,
  removeMyBot,
} from "@/actions/my-submissions";
import type { RefreshOutcome } from "@/lib/refresh-bot";

/**
 * "Remove" on one of the member's own bots, asked twice: it comes off the
 * directory at once.
 */
export function RemoveBot({
  botId,
  name,
  pending,
  marketplace = false,
}: {
  botId: string;
  name: string;
  /** Still in review: this withdraws it instead. */
  pending: boolean;
  /** Also on the official marketplace, which this doesn't touch. */
  marketplace?: boolean;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const verb = pending ? "Withdraw" : "Remove";

  if (!asking) {
    return (
      <button
        type="button"
        className="btn btn-gray btn-sm"
        data-testid="remove-bot"
        onClick={() => setAsking(true)}
      >
        {verb}
      </button>
    );
  }
  return (
    <span className="sub-confirm" data-testid="remove-confirm">
      <span>
        {pending
          ? `Withdraw ${name} from review?`
          : marketplace
            ? `Remove ${name} from this directory? It stays on the official Marketplace.`
            : `Remove ${name} from the directory?`}
      </span>
      <button
        type="button"
        className="btn btn-sm"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const result = await removeMyBot(botId);
            if (!result.ok) return setFailed(true);
            router.refresh();
          })
        }
      >
        {busy ? "Removing…" : `Yes, ${verb.toLowerCase()}`}
      </button>
      <button
        type="button"
        className="btn btn-gray btn-sm"
        disabled={busy}
        onClick={() => setAsking(false)}
      >
        Cancel
      </button>
      {failed && <span role="alert">That didn’t work. Try again.</span>}
    </span>
  );
}

// What the member is told after a refresh. "held" and "unshared" change
// where the bot stands, so the page is reloaded to show it.
const REFRESHED: Record<RefreshOutcome, string> = {
  unchanged: "Already up to date.",
  updated: "Updated from x.ai.",
  held: "Your changes need a person to review them. The bot is back in review until then.",
  unshared:
    "This bot isn’t shared publicly on x.ai any more. Share it again, or remove it here.",
  unavailable: "Couldn’t check right now. Try again in a moment.",
  not_listed: "This bot isn’t listed any more.",
};

/**
 * "Refresh" on one of the member's own listed bots: brings the listing up
 * to date with the bot's name, description and avatar on x.ai.
 */
export function RefreshBot({ botId }: { botId: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-gray btn-sm"
        data-testid="refresh-bot"
        title="Update this listing from the bot on x.ai"
        disabled={busy}
        onClick={() =>
          start(async () => {
            setNote(null);
            const result = await refreshMyBot(botId);
            setNote(
              result.ok
                ? REFRESHED[result.outcome]
                : "That didn’t work. Try again.",
            );
            if (result.ok && result.outcome !== "unchanged") router.refresh();
          })
        }
      >
        {busy ? "Refreshing…" : "Refresh"}
      </button>
      {note && (
        <span className="sub-result" role="status" data-testid="refresh-result">
          {note}
        </span>
      )}
    </>
  );
}

/**
 * Which name the member's bots are credited to: the one on each bot's share
 * card, or their directory profile.
 */
export function CreditChoice({
  cardName,
  profileName,
}: {
  /** A name their bots show from a share card, or null when none does. */
  cardName: string | null;
  profileName: string;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const change = (to: "profile" | "card") =>
    start(async () => {
      setNote(null);
      const result = await creditMyBots(to);
      if (!result.ok) return setNote("That didn’t work. Try again.");
      if (result.changed === 0 && to === "card")
        setNote("Your bots’ share cards don’t name anyone else.");
      router.refresh();
    });
  return (
    <div className="credit-choice" data-testid="credit-choice">
      {cardName ? (
        <>
          <span>
            Your bots are credited to <b>{cardName}</b>, the name on their share
            card.
          </span>
          <button
            type="button"
            className="btn btn-gray btn-sm"
            disabled={busy}
            onClick={() => change("profile")}
          >
            {busy ? "Changing…" : `Show ${profileName} instead`}
          </button>
        </>
      ) : (
        <>
          <span>
            Your bots are credited to your profile, <b>{profileName}</b>.
          </span>
          <button
            type="button"
            className="btn btn-gray btn-sm"
            disabled={busy}
            onClick={() => change("card")}
          >
            {busy ? "Changing…" : "Use the name on the share card"}
          </button>
        </>
      )}
      {note && <span role="status">{note}</span>}
    </div>
  );
}
