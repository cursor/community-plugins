import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppReviewCard } from "@/components/app-review-card";
import { SceneBot } from "@/components/bot-art";
import { ModerationHistory } from "@/components/moderation-history";
import { ListedCard, RemovedCard, ReviewCard } from "@/components/review-card";
import { Segmented } from "@/components/segmented";
import {
  ADMIN_PAGE_SIZE,
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

type Props = {
  searchParams: Promise<{
    tab?: string;
    kind?: string;
    q?: string;
    page?: string;
  }>;
};

const href = (
  kind: Kind,
  tab: Tab,
  { q, page }: { q?: string; page?: number } = {},
) => {
  const qs = new URLSearchParams({
    ...(kind === "apps" ? { kind } : {}),
    ...(tab !== "queue" ? { tab } : {}),
    ...(q ? { q } : {}),
    ...(page && page > 1 ? { page: String(page) } : {}),
  }).toString();
  return qs ? `/admin?${qs}` : "/admin";
};

export default async function AdminPage({ searchParams }: Props) {
  const {
    tab: rawTab,
    kind: rawKind,
    q: rawQuery,
    page: rawPage,
  } = await searchParams;
  const kind: Kind = rawKind === "apps" ? "apps" : "bots";
  const tab: Tab = TABS.some(([id]) => id === rawTab)
    ? (rawTab as Tab)
    : "queue";
  const query = (rawQuery ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.floor(Number(rawPage)) || 1);
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
      <div className="admin-kind">
        <Segmented
          label="What to moderate"
          value={kind}
          options={[
            {
              id: "bots",
              label: <KindLabel name="Bots" waiting={botCounts.pending} />,
              href: href("bots", "queue"),
            },
            {
              id: "apps",
              label: <KindLabel name="Apps" waiting={appCounts.queue} />,
              href: href("apps", "queue"),
            },
          ]}
        />
      </div>
      {kind === "bots" ? (
        <BotAdmin tab={tab} counts={botCounts} />
      ) : (
        <AppAdmin tab={tab} counts={appCounts} query={query} page={page} />
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
  query,
  page,
}: {
  tab: AppAdminTab;
  counts: Record<AppAdminTab, number>;
  query: string;
  page: number;
}) {
  const { apps, total } = await listAppsForAdmin(tab, { query, page });
  const history = await listAppModerationHistory(apps.map((a) => a.id));
  const lede: Record<AppAdminTab, string> = {
    queue:
      counts.queue === 0
        ? "Nothing waiting. Apps the security scan finds safe are listed automatically."
        : `${counts.queue} waiting. Flagged and failed scans first. Decisions here apply on cursor.directory too.`,
    listed:
      "Community apps live on both sites, most recently updated first. Official apps follow the Cursor Marketplace and aren’t shown here.",
    removed:
      "Unpublished and blocked apps. Relist one to put it back on both sites.",
  };
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const first = (page - 1) * ADMIN_PAGE_SIZE + 1;
  const pager =
    total > ADMIN_PAGE_SIZE ? (
      <nav className="admin-pager" aria-label="Pages">
        {page > 1 ? (
          <Link
            className="btn btn-sm btn-gray"
            href={href("apps", tab, { q: query, page: page - 1 })}
          >
            Previous
          </Link>
        ) : (
          <span />
        )}
        <span className="muted">
          {first.toLocaleString("en-US")}–
          {Math.min(page * ADMIN_PAGE_SIZE, total).toLocaleString("en-US")} of{" "}
          {total.toLocaleString("en-US")}
        </span>
        {page < pages ? (
          <Link
            className="btn btn-sm btn-gray"
            href={href("apps", tab, { q: query, page: page + 1 })}
          >
            Next
          </Link>
        ) : (
          <span />
        )}
      </nav>
    ) : null;
  return (
    <>
      <StatusTabs kind="apps" tab={tab} counts={counts} />
      <p className="lede">{lede[tab]}</p>
      <form className="search admin-search" action="/admin">
        <input type="hidden" name="kind" value="apps" />
        {tab !== "queue" && <input type="hidden" name="tab" value={tab} />}
        <input
          name="q"
          defaultValue={query}
          placeholder="Search by name, slug or repository"
          aria-label="Search apps"
        />
        {query && (
          <Link
            href={href("apps", tab)}
            className="icon-btn"
            aria-label="Clear search"
          >
            ×
          </Link>
        )}
      </form>
      {apps.length === 0 ? (
        query ? (
          <div className="subs-empty">No apps match “{query}”.</div>
        ) : (
          <AllClear tab={tab} />
        )
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
      {pager}
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
    <div
      className="admin-tabs"
      role="tablist"
      aria-label={`${kind === "apps" ? "App" : "Bot"} admin views`}
    >
      {TABS.map(([id, label]) => (
        <Link
          key={id}
          href={href(kind, id)}
          replace
          role="tab"
          aria-selected={tab === id}
          className={tab === id ? "on" : undefined}
        >
          {label}
          <span className="admin-tab-count">{counts[id]}</span>
        </Link>
      ))}
    </div>
  );
}

function KindLabel({ name, waiting }: { name: string; waiting: number }) {
  return (
    <>
      {name}
      {waiting > 0 && (
        <span className="admin-kind-badge" title={`${waiting} waiting`}>
          {waiting}
        </span>
      )}
    </>
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
