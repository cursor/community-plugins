import type { Metadata } from "next";
import Link from "next/link";
import { CardBot, SceneBot } from "@/components/bot-art";
import { Segmented } from "@/components/segmented";
import { type BotStatus, listBotsByOwner } from "@/data/bots";
import { requireViewer } from "@/lib/auth";
import { categoryLabel } from "@/lib/categories";
import { formatRelativeDate } from "@/lib/format";
import { shareUrl } from "@/lib/share-link";

export const metadata: Metadata = { title: "Your bots" };
export const dynamic = "force-dynamic";

const STATUS: Record<BotStatus, { label: string; cls: string }> = {
  pending: { label: "In review", cls: "warn" },
  listed: { label: "Listed", cls: "" },
  declined: { label: "Declined", cls: "declined" },
  unlisted: { label: "Unlisted", cls: "off" },
};
const FILTERS: [BotStatus | "all", string][] = [
  ["all", "All"],
  ["pending", "In review"],
  ["listed", "Listed"],
  ["declined", "Declined"],
];

type Props = { searchParams: Promise<{ status?: string; submitted?: string }> };

export default async function MyBotsPage({ searchParams }: Props) {
  const { status = "all", submitted } = await searchParams;
  const qs = new URLSearchParams({
    ...(status !== "all" ? { status } : {}),
  }).toString();
  const viewer = await requireViewer(`/my-bots${qs ? `?${qs}` : ""}`);
  const bots = await listBotsByOwner(viewer.id);
  const shown =
    status === "all" ? bots : bots.filter((b) => b.status === status);
  const count = (s: BotStatus | "all") =>
    s === "all" ? bots.length : bots.filter((b) => b.status === s).length;

  return (
    <div className="shell page subs-page">
      <div className="subs-head">
        <div>
          <h1 className="page-title">Your bots</h1>
          <p className="lede">
            Bots you’ve submitted and where they are in review.
          </p>
        </div>
        <Link href="/submit" className="btn">
          Submit a bot
        </Link>
      </div>
      <Segmented
        label="Filter by status"
        value={status}
        options={FILTERS.map(([id, label]) => ({
          id,
          label: `${label} ${count(id)}`,
          href: id === "all" ? "/my-bots" : `/my-bots?status=${id}`,
        }))}
      />
      {shown.length === 0 ? (
        <div className="subs-empty" data-testid="subs-empty">
          <SceneBot
            body="house"
            color="gray"
            face="sleepy"
            className="cta-bot"
          />
          {bots.length === 0 ? (
            <>
              You haven’t submitted a bot yet.{" "}
              <Link href="/submit" style={{ textDecoration: "underline" }}>
                Submit one
              </Link>
            </>
          ) : (
            `No bots ${FILTERS.find(([id]) => id === status)?.[1].toLowerCase() ?? ""}.`
          )}
        </div>
      ) : (
        <div className="sub-list" data-testid="sub-list">
          {shown.map((bot) => {
            const st = STATUS[bot.status];
            return (
              <article
                key={bot.id}
                className={`sub${bot.id === submitted ? " fresh" : ""}`}
                data-testid="submission"
                data-status={bot.status}
                data-rig-hover
              >
                <CardBot body={bot.body} color={bot.color} seed={bot.shareId} />
                <div className="sub-body">
                  <div className="sub-top">
                    <h2>
                      {bot.status === "listed" ? (
                        <Link href={`/bots/${bot.slug}`}>{bot.name}</Link>
                      ) : (
                        bot.name
                      )}
                    </h2>
                    <span
                      className={`status ${st.cls}`}
                      data-testid="submission-status"
                    >
                      {st.label}
                    </span>
                  </div>
                  <p className="sub-desc">{bot.description}</p>
                  <div className="sub-meta">
                    <span>Submitted {formatRelativeDate(bot.submittedAt)}</span>
                    {bot.status === "pending" && (
                      <span>
                        ·{" "}
                        {bot.aiReviewStatus === "queued" ||
                        bot.aiReviewStatus === "reviewing"
                          ? "Being checked…"
                          : "Waiting for a reviewer"}
                      </span>
                    )}
                    {bot.status === "listed" && (
                      <span>
                        · Listed in{" "}
                        <Link href={`/?category=${bot.category}`}>
                          {categoryLabel(bot.category)}
                        </Link>
                      </span>
                    )}
                    {(bot.status === "declined" || bot.status === "unlisted") &&
                      bot.reviewedAt && (
                        <span>
                          · {st.label} {formatRelativeDate(bot.reviewedAt)}
                        </span>
                      )}
                  </div>
                  {bot.reviewNote && bot.status !== "listed" && (
                    <div className="sub-note">
                      <b>Reviewer note:</b> {bot.reviewNote}
                    </div>
                  )}
                  <div className="sub-actions">
                    {bot.status === "declined" && (
                      <Link
                        className="btn btn-gray btn-sm"
                        href={`/submit?link=${encodeURIComponent(shareUrl(bot.shareId))}`}
                      >
                        Submit again
                      </Link>
                    )}
                    {bot.status === "listed" && (
                      <Link
                        className="btn btn-gray btn-sm"
                        href={`/bots/${bot.slug}`}
                      >
                        View listing
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
