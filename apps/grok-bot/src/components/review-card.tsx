"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import {
  editBotCategory,
  rerunAiReview,
  reviewBot,
} from "@/actions/review-bot";
import type { DirectoryBot } from "@/data/bots";
import { CATEGORIES, type CategoryId } from "@/lib/categories";
import { formatRelativeDate } from "@/lib/format";
import { shareUrl } from "@/lib/share-link";
import { CardBot } from "./bot-art";

/** " by <member>" when someone other than the author submitted the bot. */
function submittedBy(bot: DirectoryBot) {
  return bot.submitter && bot.submitter !== bot.creator.name
    ? ` by ${bot.submitter}`
    : "";
}

export function ReviewCard({
  bot,
  children,
}: {
  bot: DirectoryBot;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [category, setCategory] = useState(bot.category as CategoryId);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"list" | "decline" | "rerun" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "list" | "decline") {
    setError(null);
    if (action === "decline" && !note.trim()) {
      setError("Add a note so the submitter knows what to change.");
      return;
    }
    setBusy(action);
    const result = await reviewBot({
      botId: bot.id,
      action,
      note: note.trim() || undefined,
      category,
    });
    setBusy(null);
    if (!result.ok) {
      setError(
        result.error === "forbidden"
          ? "Only admins can review bots."
          : "Couldn’t save that review.",
      );
      return;
    }
    router.refresh();
  }

  async function rerun() {
    setError(null);
    setBusy("rerun");
    const result = await rerunAiReview(bot.id);
    setBusy(null);
    if (!result.ok) setError("Couldn’t start the AI review.");
    router.refresh();
  }

  return (
    <article
      className="review"
      data-rig-hover
      data-testid="review"
      data-bot={bot.slug}
      data-ai={bot.aiReviewStatus ?? ""}
    >
      <CardBot body={bot.body} color={bot.color} seed={bot.shareId} />
      <div className="sub-body">
        <div className="sub-top">
          <h2>{bot.name}</h2>
          <a
            href={shareUrl(bot.shareId)}
            target="_blank"
            rel="noopener noreferrer"
            className="muted"
            style={{ fontSize: 13 }}
          >
            View on x.ai ↗
          </a>
        </div>
        <p className="sub-desc" style={{ WebkitLineClamp: "unset" }}>
          {bot.description}
        </p>
        <div className="sub-meta">
          <span>
            By {bot.creator.name} · submitted
            {submittedBy(bot)} {formatRelativeDate(bot.submittedAt)}
          </span>
        </div>
        <AiReviewPanel bot={bot} />
        <textarea
          placeholder="Note to the submitter (required to decline)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Reviewer note"
        />
        <div className="controls">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoryId)}
            aria-label="Category"
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!!busy}
            onClick={() => act("list")}
          >
            {busy === "list" ? "Listing…" : "List"}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-gray"
            disabled={!!busy}
            onClick={() => act("decline")}
          >
            {busy === "decline" ? "Declining…" : "Decline"}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            disabled={!!busy || bot.aiReviewStatus === "reviewing"}
            onClick={rerun}
          >
            {busy === "rerun" ? "Starting…" : "Re-run AI review"}
          </button>
          {error && (
            <span className="form-error" style={{ margin: 0 }}>
              {error}
            </span>
          )}
        </div>
        {children}
      </div>
    </article>
  );
}

const VERDICT_LABEL = {
  safe: ["AI: Safe", ""],
  suspicious: ["AI: Suspicious", "warn"],
  malicious: ["AI: Malicious", "declined"],
} as const;

/** What the AI reviewer concluded, for the admin deciding on a flagged bot. */
function AiReviewPanel({ bot }: { bot: DirectoryBot }) {
  const review = bot.aiReview;
  if (bot.aiReviewStatus === "queued" || bot.aiReviewStatus === "reviewing") {
    return (
      <div className="ai-review" data-testid="ai-review">
        <span className="status off">AI review in progress</span>
      </div>
    );
  }
  if (!review) {
    return (
      <div className="ai-review" data-testid="ai-review">
        <span className="status off">Not reviewed by AI</span>
      </div>
    );
  }
  if ("error" in review) {
    return (
      <div className="ai-review" data-testid="ai-review">
        <span className="status off">AI review failed</span>
        <p className="muted">{review.error}</p>
      </div>
    );
  }
  const [label, cls] = VERDICT_LABEL[review.verdict];
  return (
    <div
      className="ai-review"
      data-testid="ai-review"
      data-verdict={review.verdict}
    >
      <div className="ai-head">
        <span className={`status ${cls}`}>{label}</span>
        <span className="muted">
          {review.severity} severity
          {review.categories.length > 0 &&
            ` · ${review.categories.join(", ").replaceAll("_", " ")}`}
        </span>
      </div>
      <p>{review.summary}</p>
      {review.reasons.length > 0 && (
        <ul>
          {review.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CategorySelect({
  value,
  onChange,
}: {
  value: CategoryId;
  onChange: (c: CategoryId) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as CategoryId)}
      aria-label="Category"
    >
      {CATEGORIES.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

function CardHead({ bot, link }: { bot: DirectoryBot; link: boolean }) {
  return (
    <div className="sub-top">
      <h2>{link ? <a href={`/bots/${bot.slug}`}>{bot.name}</a> : bot.name}</h2>
      <a
        href={shareUrl(bot.shareId)}
        target="_blank"
        rel="noopener noreferrer"
        className="muted"
        style={{ fontSize: 13 }}
      >
        View on x.ai ↗
      </a>
    </div>
  );
}

/** A listed bot: change its category or unlist it (with a note). */
export function ListedCard({
  bot,
  children,
}: {
  bot: DirectoryBot;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [category, setCategory] = useState(bot.category as CategoryId);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"save" | "unlist" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setError(null);
    setBusy("save");
    const result = await editBotCategory(bot.id, category);
    setBusy(null);
    if (!result.ok) return setError("Couldn’t save the category.");
    setSaved(true);
    router.refresh();
  }
  async function unlist() {
    setError(null);
    if (!note.trim())
      return setError("Add a note so the submitter knows why it came down.");
    setBusy("unlist");
    const result = await reviewBot({
      botId: bot.id,
      action: "unlist",
      note: note.trim(),
    });
    setBusy(null);
    if (!result.ok) return setError("Couldn’t unlist the bot.");
    router.refresh();
  }

  return (
    <article
      className="review"
      data-testid="listed-card"
      data-bot={bot.slug}
      data-rig-hover
    >
      <CardBot body={bot.body} color={bot.color} seed={bot.shareId} />
      <div className="sub-body">
        <CardHead bot={bot} link />
        <p className="sub-desc">{bot.description}</p>
        <div className="sub-meta">
          <span>
            By {bot.creator.name}
            {submittedBy(bot) && ` · submitted${submittedBy(bot)}`} ·{" "}
            {bot.installs} {bot.installs === 1 ? "add" : "adds"} · listed{" "}
            {formatRelativeDate(bot.reviewedAt ?? bot.submittedAt)}
          </span>
        </div>
        <textarea
          placeholder="Note to the submitter (required to unlist)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Unlist note"
        />
        <div className="controls">
          <CategorySelect
            value={category}
            onChange={(c) => {
              setCategory(c);
              setSaved(false);
            }}
          />
          <button
            type="button"
            className="btn btn-sm btn-gray"
            disabled={!!busy || category === bot.category}
            onClick={save}
          >
            {busy === "save" ? "Saving…" : saved ? "Saved" : "Save category"}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            disabled={!!busy}
            onClick={unlist}
          >
            {busy === "unlist" ? "Unlisting…" : "Unlist"}
          </button>
          {error && (
            <span className="form-error" style={{ margin: 0 }}>
              {error}
            </span>
          )}
        </div>
        {children}
      </div>
    </article>
  );
}

/** A declined or unlisted bot: see why, and relist it. */
export function RemovedCard({
  bot,
  children,
}: {
  bot: DirectoryBot;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [category, setCategory] = useState(bot.category as CategoryId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function relist() {
    setError(null);
    setBusy(true);
    const result = await reviewBot({
      botId: bot.id,
      action: "list",
      category,
    });
    setBusy(false);
    if (!result.ok) return setError("Couldn’t relist the bot.");
    router.refresh();
  }

  return (
    <article
      className="review"
      data-testid="removed-card"
      data-bot={bot.slug}
      data-rig-hover
    >
      <CardBot body={bot.body} color={bot.color} seed={bot.shareId} />
      <div className="sub-body">
        <CardHead bot={bot} link={false} />
        <p className="sub-desc">{bot.description}</p>
        <div className="sub-meta">
          <span
            className={`status ${bot.status === "declined" ? "declined" : "off"}`}
          >
            {bot.status === "declined" ? "Declined" : "Unlisted"}
          </span>
          <span>
            By {bot.creator.name}
            {submittedBy(bot) && ` · submitted${submittedBy(bot)}`}
            {bot.reviewedAt && ` · ${formatRelativeDate(bot.reviewedAt)}`}
          </span>
        </div>
        {bot.reviewNote && (
          <div className="sub-note">
            <b>Note:</b> {bot.reviewNote}
          </div>
        )}
        <div className="controls">
          <CategorySelect value={category} onChange={setCategory} />
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={relist}
          >
            {busy ? "Relisting…" : "Relist"}
          </button>
          {error && (
            <span className="form-error" style={{ margin: 0 }}>
              {error}
            </span>
          )}
        </div>
        {children}
      </div>
    </article>
  );
}
