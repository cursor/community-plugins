import type { Metadata } from "next";
import Link from "next/link";
import { AppLogo } from "@/components/app-logo";
import { CardBot, SceneBot } from "@/components/bot-art";
import { Segmented } from "@/components/segmented";
import { type AppSubmission, listAppsByOwner } from "@/data/apps";
import {
  type BotStatus,
  type DirectoryBot,
  listBotsByOwner,
} from "@/data/bots";
import { appContents } from "@/lib/app-categories";
import { requireViewer } from "@/lib/auth";
import { categoryLabel } from "@/lib/categories";
import { formatRelativeDate } from "@/lib/format";
import { shareUrl } from "@/lib/share-link";

export const metadata: Metadata = { title: "Your submissions" };
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

type Submission =
  | { kind: "bot"; at: string; status: BotStatus; bot: DirectoryBot }
  | { kind: "app"; at: string; status: BotStatus; app: AppSubmission };

type Props = { searchParams: Promise<{ status?: string; submitted?: string }> };

export default async function MyBotsPage({ searchParams }: Props) {
  const { status = "all", submitted } = await searchParams;
  const qs = new URLSearchParams({
    ...(status !== "all" ? { status } : {}),
  }).toString();
  const viewer = await requireViewer(`/my-bots${qs ? `?${qs}` : ""}`);
  const [bots, apps] = await Promise.all([
    listBotsByOwner(viewer.id),
    listAppsByOwner(viewer.id),
  ]);
  const all: Submission[] = [
    ...bots.map(
      (bot): Submission => ({
        kind: "bot",
        at: bot.submittedAt,
        status: bot.status,
        bot,
      }),
    ),
    ...apps.map(
      (app): Submission => ({
        kind: "app",
        at: app.createdAt,
        status: app.status,
        app,
      }),
    ),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const shown = status === "all" ? all : all.filter((s) => s.status === status);
  const count = (s: BotStatus | "all") =>
    s === "all" ? all.length : all.filter((x) => x.status === s).length;

  return (
    <div className="shell page subs-page">
      <div className="subs-head">
        <div>
          <h1 className="page-title">Your submissions</h1>
          <p className="lede">
            Bots and apps you’ve submitted and where they are in review.
          </p>
        </div>
        <div className="subs-actions">
          <Link href="/submit" className="btn">
            Submit a bot
          </Link>
          <Link href="/submit?kind=app" className="btn btn-gray">
            Submit an app
          </Link>
        </div>
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
          {all.length === 0 ? (
            <>
              You haven’t submitted anything yet.{" "}
              <Link href="/submit" style={{ textDecoration: "underline" }}>
                Submit a bot
              </Link>{" "}
              or{" "}
              <Link
                href="/submit?kind=app"
                style={{ textDecoration: "underline" }}
              >
                an app
              </Link>
            </>
          ) : (
            `Nothing ${FILTERS.find(([id]) => id === status)?.[1].toLowerCase() ?? ""}.`
          )}
        </div>
      ) : (
        <div className="sub-list" data-testid="sub-list">
          {shown.map((s) =>
            s.kind === "bot" ? (
              <BotSubmission
                key={s.bot.id}
                bot={s.bot}
                fresh={s.bot.id === submitted}
              />
            ) : (
              <AppSubmissionCard
                key={s.app.id}
                app={s.app}
                fresh={s.app.slug === submitted}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function BotSubmission({ bot, fresh }: { bot: DirectoryBot; fresh: boolean }) {
  const st = STATUS[bot.status];
  return (
    <article
      className={`sub${fresh ? " fresh" : ""}`}
      data-testid="submission"
      data-kind="bot"
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
          <span className={`status ${st.cls}`} data-testid="submission-status">
            {st.label}
          </span>
        </div>
        <p className="sub-desc">{bot.description}</p>
        <div className="sub-meta">
          <span>Bot · submitted {formatRelativeDate(bot.submittedAt)}</span>
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
            <Link className="btn btn-gray btn-sm" href={`/bots/${bot.slug}`}>
              View listing
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function AppSubmissionCard({
  app,
  fresh,
}: {
  app: AppSubmission;
  fresh: boolean;
}) {
  const st = STATUS[app.status];
  const contents = appContents(app.mcpServers, app.skills);
  return (
    <article
      className={`sub${fresh ? " fresh" : ""}`}
      data-testid="submission"
      data-kind="app"
      data-status={app.status}
    >
      <span className="sub-mark">
        <AppLogo name={app.name} logo={app.logo} size={48} />
      </span>
      <div className="sub-body">
        <div className="sub-top">
          <h2>
            {app.status === "listed" ? (
              <Link href={`/apps/${app.slug}`}>{app.name}</Link>
            ) : (
              app.name
            )}
          </h2>
          <span className={`status ${st.cls}`} data-testid="submission-status">
            {st.label}
          </span>
        </div>
        <p className="sub-desc">{app.description}</p>
        <div className="sub-meta">
          <span>
            App{contents ? ` (${contents})` : ""} · submitted{" "}
            {formatRelativeDate(app.createdAt)}
          </span>
          {app.status === "pending" && (
            <span>
              ·{" "}
              {app.checking
                ? "Security check running…"
                : "Waiting for a reviewer"}
            </span>
          )}
        </div>
        <div className="sub-actions">
          {app.status === "listed" && (
            <Link className="btn btn-gray btn-sm" href={`/apps/${app.slug}`}>
              View listing
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
