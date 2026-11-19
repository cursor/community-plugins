"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  type PreviewResult,
  previewShareLink,
  submitBot,
} from "@/actions/submit-bot";
import { bodyForShape } from "@/lib/avatar";
import { parseShareId } from "@/lib/share-link";
import { SceneBot } from "./bot-art";
import { BotRig } from "./bot-rig";
import { MemberAvatar } from "./member-avatar";

const STATUS_LABEL: Record<string, [label: string, cls: string]> = {
  pending: ["In review", "warn"],
  listed: ["Listed", ""],
  declined: ["Declined", "declined"],
  unlisted: ["Unlisted", "off"],
};

const ERRORS: Record<string, string> = {
  invalid: "Paste a Grok Bot share link, like https://x.ai/bot/abc123…",
  not_found:
    "We couldn’t read that link. Check that the bot is shared publicly.",
  team: "This is a team bot. Only bots shared by a person can be listed.",
  unavailable:
    "Couldn’t reach Grok Bot to read that link. Try again in a moment.",
  duplicate: "This bot is already listed or in review.",
  rate_limited: "You’ve submitted a lot of bots recently. Try again later.",
  signed_out: "Your session ended. Sign in again to submit.",
};

type State =
  | { phase: "idle" }
  | { phase: "invalid" }
  | { phase: "loading" }
  | { phase: "done"; result: PreviewResult };

export function SubmitForm({
  viewerName,
  viewerImage,
  initialLink,
}: {
  viewerName: string;
  viewerImage: string | null;
  initialLink: string;
}) {
  const router = useRouter();
  const [link, setLink] = useState(initialLink);
  const [touched, setTouched] = useState(!!initialLink);
  const [state, setState] = useState<State>({ phase: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pasted = useRef(!!initialLink);

  useEffect(() => {
    setSubmitError(null);
    if (!link.trim()) return setState({ phase: "idle" });
    if (!parseShareId(link)) return setState({ phase: "invalid" });
    setState({ phase: "loading" });
    let cancelled = false;
    // Wait for typing to pause; a paste is already whole.
    const delay = pasted.current ? 0 : 300;
    pasted.current = false;
    const t = setTimeout(async () => {
      try {
        const result = await previewShareLink(link);
        if (!cancelled) setState({ phase: "done", result });
      } catch {
        if (!cancelled)
          setState({
            phase: "done",
            result: { ok: false, error: "unavailable" },
          });
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [link]);

  const preview =
    state.phase === "done" && state.result.ok ? state.result : null;
  const existing = preview?.existing;
  // Its owner may send a declined bot, or one they removed, again.
  const blocked = !!existing && !existing.resubmit;
  const linkError =
    state.phase === "invalid" && touched
      ? ERRORS.invalid
      : state.phase === "done" && !state.result.ok
        ? ERRORS[state.result.error]
        : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!preview || blocked || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitBot(link);
      if (result.ok) {
        router.push(`/my-bots?submitted=${result.id}`);
        router.refresh();
        return;
      }
      setSubmitError(ERRORS[result.error] ?? "Something went wrong.");
    } catch {
      setSubmitError("Something went wrong. Try again.");
    }
    setSubmitting(false);
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor="share">Share link</label>
        <div className="link-input">
          <input
            id="share"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={link}
            disabled={submitting}
            onChange={(e) => setLink(e.target.value)}
            onBlur={() => setTouched(true)}
            onPaste={() => {
              pasted.current = true;
              setTouched(true);
            }}
            placeholder="https://x.ai/bot/…"
            aria-invalid={!!linkError}
            aria-describedby="share-help"
          />
          {state.phase === "loading" && (
            <span className="link-state" data-testid="link-loading">
              Reading link…
            </span>
          )}
        </div>
        {/* The hint and the error share one slot, sized to the taller of
            the two, so swapping them doesn't move the page. */}
        <div className="help">
          <div
            className={`hint${linkError ? " is-hidden" : ""}`}
            id={linkError ? undefined : "share-help"}
            aria-hidden={!!linkError}
          >
            Copy it from the bot’s share option in Grok Bot.
          </div>
          {linkError && (
            <div className="err" id="share-help">
              {linkError}
            </div>
          )}
        </div>
      </div>

      {/* While a link is read the card keeps its resting outline. */}
      {state.phase !== "loading" && preview ? (
        <div
          className="submit-preview message-arrive"
          data-testid="submit-preview"
        >
          <div className="head">
            <SceneBot
              body={bodyForShape(preview.template.shape)}
              color={preview.template.color}
              seed={preview.template.shareId}
              className="preview-bot"
              label={`${preview.template.name} bot`}
              testId="preview-bot"
            />
            <div style={{ minWidth: 0 }}>
              <h2>{preview.template.name}</h2>
              <p className="desc">{preview.template.description}</p>
            </div>
          </div>
          <div className="meta" data-testid="preview-author">
            {preview.author ? (
              <>
                <MemberAvatar
                  name={preview.author.name}
                  image={preview.author.image}
                  size={20}
                />
                <span>
                  By{" "}
                  {preview.author.xHandle ? (
                    <a
                      href={`https://x.com/${preview.author.xHandle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="preview-author-link"
                    >
                      {preview.author.name}
                    </a>
                  ) : (
                    preview.author.name
                  )}
                </span>
              </>
            ) : (
              <>
                <MemberAvatar name={viewerName} image={viewerImage} size={20} />
                <span>Shared by you</span>
              </>
            )}
            <span className="meta-link">
              ·{" "}
              <a
                href={`https://x.ai/bot/${preview.template.shareId}`}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="preview-share-link"
              >
                <code>x.ai/bot/{preview.template.shareId}</code>
              </a>
            </span>
          </div>
        </div>
      ) : (
        <div
          className="submit-preview submit-outline"
          data-testid="submit-outline"
          aria-hidden="true"
        >
          {/* The brand blob, stroked, watching the pointer. */}
          <BotRig
            shape="blob-front"
            color="black"
            mode="detail"
            outline
            className="outline-bot"
          />
        </div>
      )}

      {/* Below the card, so the card keeps its fixed height. */}
      {existing && (
        <div className="already" data-testid="already-submitted">
          <span>
            {existing.resubmit && existing.status === "unlisted"
              ? "You removed this bot. Submit it again to send it back to review."
              : existing.yours
                ? "You already submitted this bot."
                : "Someone already submitted this bot."}
          </span>
          <span>
            {!(existing.resubmit && existing.status === "unlisted") && (
              <span
                className={`status ${STATUS_LABEL[existing.status]?.[1] ?? ""}`}
              >
                {STATUS_LABEL[existing.status]?.[0] ?? existing.status}
              </span>
            )}{" "}
            {existing.status === "listed" ? (
              <Link href={`/bots/${existing.slug}`}>View listing</Link>
            ) : existing.yours ? (
              <Link href="/my-bots">Your submissions</Link>
            ) : null}
          </span>
        </div>
      )}

      <button
        type="submit"
        className="btn btn-lg submit-btn"
        disabled={!preview || blocked || submitting}
      >
        {submitting ? "Submitting…" : "Submit for review"}
      </button>
      <p className="submit-note" data-testid="submit-rules">
        Submissions are reviewed against the{" "}
        <Link href="/about#rules">listing rules</Link>.
      </p>
      {submitError && <div className="form-error">{submitError}</div>}
    </form>
  );
}
