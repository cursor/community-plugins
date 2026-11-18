"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { creditMyBots, removeMyBot } from "@/actions/my-submissions";

/**
 * "Remove" on one of the member's own bots, asked twice: it comes off the
 * directory at once.
 */
export function RemoveBot({
  botId,
  name,
  pending,
}: {
  botId: string;
  name: string;
  /** Still in review: this withdraws it instead. */
  pending: boolean;
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
