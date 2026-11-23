import type { Metadata } from "next";
import Link from "next/link";
import { AppLogo } from "@/components/app-logo";
import { CardBot, SceneBot } from "@/components/bot-art";
import { CopyLink } from "@/components/copy-link";
import {
  CreditChoice,
  RefreshApp,
  RefreshBot,
  RemoveBot,
} from "@/components/my-submission-controls";
import { Segmented } from "@/components/segmented";
import { type AppSubmission, listAppsByOwner } from "@/data/apps";
import {
  type BotStatus,
  type DirectoryBot,
  listBotsByOwner,
} from "@/data/bots";
import { ownProfilePath } from "@/data/creators";
import { appContents } from "@/lib/app-categories";
import { requireViewer } from "@/lib/auth";
import { categoryLabel } from "@/lib/categories";
import { formatRelativeDate } from "@/lib/format";
import { shareUrl } from "@/lib/share-link";
import { listed, otherProviders, type Provider } from "@/lib/sign-in-providers";

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
  // A profile exists once something is listed (and the member's
  // cursor.directory profile is public).
  const [bots, apps, profile] = await Promise.all([
    listBotsByOwner(viewer.id),
    listAppsByOwner(viewer.id),
    ownProfilePath(viewer.id),
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
  // The credit their listed and pending bots show: a name from a share
  // card, if any still does.
  const credited = bots.filter(
    (b) => b.status === "listed" || b.status === "pending",
  );
  const cardName = credited.find((b) => b.creator.fromCard)?.creator.name;
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
          {profile && (
            <div className="subs-profile" data-testid="public-profile">
              <Link href={profile} className="btn btn-gray btn-sm">
                View public profile
              </Link>
              <CopyLink url={profile} className="btn btn-gray btn-sm" />
            </div>
          )}
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
      {credited.length > 0 && (
        <CreditChoice cardName={cardName ?? null} profileName={viewer.name} />
      )}
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
      <MissingListing signIns={viewer.signIns} />
    </div>
  );
}

/**
 * Why something a member made might not be in their list: it was submitted
 * with another sign-in, which is another account, or it was added to the
 * directory for them and has no owner yet.
 */
function MissingListing({ signIns }: { signIns: Provider[] }) {
  const others = otherProviders(signIns, {
    xSignIn: process.env.GROK_BOT_X_SIGN_IN === "1",
  });
  return (
    <aside className="subs-missing" data-testid="missing-listing">
      <h2>Don’t see a listing you expected?</h2>
      <ul>
        {others.length > 0 && (
          <li data-testid="other-sign-in">
            <p>
              Listings stay with the sign-in that submitted them.
              {signIns.length > 0 &&
                ` This account signs in with ${listed(signIns, "and")}.`}{" "}
              If you submitted with {listed(others, "or")}, switch to that
              sign-in.
            </p>
            <form action="/auth/sign-out" method="post">
              <input type="hidden" name="next" value="/login?next=/my-bots" />
              <button type="submit" className="btn btn-gray btn-sm">
                Switch sign-in
              </button>
            </form>
          </li>
        )}
        <li>
          <p>
            If your app was added to the directory for you, it has no owner yet.
            Find it under <Link href="/?tab=apps">Apps</Link> and choose “Claim
            it” on its page.
          </p>
        </li>
      </ul>
    </aside>
  );
}

function BotSubmission({ bot, fresh }: { bot: DirectoryBot; fresh: boolean }) {
  // A bot its owner took down reads as theirs to put back.
  const st = bot.removedByOwner
    ? { label: "Removed", cls: "off" }
    : STATUS[bot.status];
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
                · {st.label}
                {bot.removedByOwner ? " by you" : ""}{" "}
                {formatRelativeDate(bot.reviewedAt)}
              </span>
            )}
        </div>
        {bot.reviewNote && bot.status !== "listed" && (
          <div className="sub-note">
            <b>Reviewer note:</b> {bot.reviewNote}
          </div>
        )}
        <div className="sub-actions">
          {(bot.status === "declined" || bot.removedByOwner) && (
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
          {bot.status === "listed" && <RefreshBot botId={bot.id} />}
          {(bot.status === "listed" || bot.status === "pending") && (
            <RemoveBot
              botId={bot.id}
              name={bot.name}
              pending={bot.status === "pending"}
              marketplace={bot.fromMarketplace}
            />
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
          {app.status === "listed" && (
            <Link
              className="btn btn-gray btn-sm"
              href={`/apps/${app.slug}/edit`}
              data-testid="edit-app"
            >
              Edit
            </Link>
          )}
          {app.source && (
            <RefreshApp
              appId={app.id}
              source={app.source}
              listed={app.status === "listed"}
            />
          )}
        </div>
      </div>
    </article>
  );
}
