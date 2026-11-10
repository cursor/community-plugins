import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppReviewCard } from "@/components/app-review-card";
import { SceneBot } from "@/components/bot-art";
import { ModerationHistory } from "@/components/moderation-history";
import { ListedCard, RemovedCard, ReviewCard } from "@/components/review-card";
import { Segmented } from "@/components/segmented";
import {
  type AppAdminTab,
  countAppsForAdmin,
  listAppModerationHistory,
  listAppsForAdmin,
  queueStatus,
} from "@/data/app-moderation";
import {
  countBotsByStatus,
  type DirectoryBot,
  listBotsByStatus,
  listBotsForReview,
  listModerationHistory,
} from "@/data/bots";
import { isAdmin, requireViewer } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

const TABS = [
  ["queue", "Review queue"],
  ["listed", "Listed"],
  ["removed", "Removed"],
] as const;
type Tab = (typeof TABS)[number][0];
type Kind = "bots" | "apps";

type Props = { searchParams: Promise<{ tab?: string; kind?: string }> };

const href = (kind: Kind, tab: Tab) => {
  const qs = new URLSearchParams({
    ...(kind === "apps" ? { kind } : {}),
    ...(tab !== "queue" ? { tab } : {}),
  }).toString();
  return qs ? `/admin?${qs}` : "/admin";
};

export default async function AdminPage({ searchParams }: Props) {
  const { tab: rawTab, kind: rawKind } = await searchParams;
  const kind: Kind = rawKind === "apps" ? "apps" : "bots";
  const tab: Tab = TABS.some(([id]) => id === rawTab)
    ? (rawTab as Tab)
    : "queue";
  const viewer = await requireViewer(href(kind, tab));
  // Admins are shared with cursor.directory (public.admins).
  if (!(await isAdmin(viewer.id))) notFound();

  const [botCounts, appCounts] = await Promise.all([
    countBotsByStatus(),
    countAppsForAdmin(),
  ]);

  return (
    <div className="shell page subs-page">
      <h1 className="page-title">Admin</h1>
      <Segmented
        label="What to moderate"
        value={kind}
        style={{ marginBottom: 12 }}
        options={[
          {
            id: "bots",
            label: `Bots ${botCounts.pending}`,
            href: href("bots", "queue"),
          },
          {
            id: "apps",
            label: `Apps ${appCounts.queue}`,
            href: href("apps", "queue"),
          },
        ]}
      />
      {kind === "bots" ? (
        <BotAdmin tab={tab} counts={botCounts} />
      ) : (
        <AppAdmin tab={tab} counts={appCounts} />
      )}
    </div>
  );
}

async function BotAdmin({
  tab,
  counts,
}: {
  tab: Tab;
  counts: Awaited<ReturnType<typeof countBotsByStatus>>;
}) {
  const bots =
    tab === "queue"
      ? await listBotsForReview()
      : await listBotsByStatus(
          tab === "listed" ? ["listed"] : ["declined", "unlisted"],
        );
  const history = await listModerationHistory(bots.map((b) => b.id));
  const tabCount: Record<Tab, number> = {
    queue: counts.pending,
    listed: counts.listed,
    removed: counts.declined + counts.unlisted,
  };
  const lede: Record<Tab, string> = {
    queue:
      bots.length === 0
        ? "Nothing waiting for review. Bots the AI review finds safe are listed automatically."
        : `${bots.length} waiting. Flagged and failed AI reviews first; safe bots are listed automatically.`,
    listed:
      "Live in the directory. Change a bot’s category, or unlist it with a note for its submitter.",
    removed:
      "Declined and unlisted bots, with the note their submitter sees. Relist one to put it back.",
  };
  const card = (bot: DirectoryBot) => {
    const h = <ModerationHistory events={history.get(bot.id) ?? []} />;
    if (tab === "queue")
      return (
        <ReviewCard key={bot.id} bot={bot}>
          {h}
        </ReviewCard>
      );
    if (tab === "listed")
      return (
        <ListedCard key={bot.id} bot={bot}>
          {h}
        </ListedCard>
      );
    return (
      <RemovedCard key={bot.id} bot={bot}>
        {h}
      </RemovedCard>
    );
  };

  return (
    <>
      <StatusTabs kind="bots" tab={tab} counts={tabCount} />
      <p className="lede">{lede[tab]}</p>
      {bots.length === 0 ? (
        <AllClear tab={tab} />
      ) : (
        <div className="review-list">{bots.map(card)}</div>
      )}
    </>
  );
}

async function AppAdmin({
  tab,
  counts,
}: {
  tab: AppAdminTab;
  counts: Record<AppAdminTab, number>;
}) {
  const apps = await listAppsForAdmin(tab);
  const history = await listAppModerationHistory(apps.map((a) => a.id));
  const lede: Record<AppAdminTab, string> = {
    queue:
      apps.length === 0
        ? "Nothing waiting. Apps the security scan finds safe are listed automatically."
        : `${apps.length} waiting. Flagged and failed scans first. Decisions here apply on cursor.directory too.`,
    listed:
      "Community apps live on both sites. Official apps follow the Cursor Marketplace and aren’t shown here.",
    removed:
      "Unpublished and blocked apps. Relist one to put it back on both sites.",
  };
  return (
    <>
      <StatusTabs kind="apps" tab={tab} counts={counts} />
      <p className="lede">{lede[tab]}</p>
      {apps.length === 0 ? (
        <AllClear tab={tab} />
      ) : (
        <div className="review-list">
          {apps.map((app) => (
            <AppReviewCard
              key={app.id}
              app={app}
              tab={tab}
              status={queueStatus(app)}
            >
              <ModerationHistory events={history.get(app.id) ?? []} />
            </AppReviewCard>
          ))}
        </div>
      )}
    </>
  );
}

function StatusTabs({
  kind,
  tab,
  counts,
}: {
  kind: Kind;
  tab: Tab;
  counts: Record<Tab, number>;
}) {
  return (
    <Segmented
      label={`${kind === "apps" ? "App" : "Bot"} admin views`}
      value={tab}
      style={{ marginBottom: 16 }}
      options={TABS.map(([id, label]) => ({
        id,
        label: `${label} ${counts[id]}`,
        href: href(kind, id),
      }))}
    />
  );
}

function AllClear({ tab }: { tab: Tab }) {
  return (
    <div className="subs-empty">
      <SceneBot body="cloud" color="blue" face="happy" className="cta-bot" />
      {tab === "queue" ? "All caught up." : "Nothing here."}
    </div>
  );
}
