import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SceneBot } from "@/components/bot-art";
import { ModerationHistory } from "@/components/moderation-history";
import { ListedCard, RemovedCard, ReviewCard } from "@/components/review-card";
import { Segmented } from "@/components/segmented";
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

type Props = { searchParams: Promise<{ tab?: string }> };

export default async function AdminPage({ searchParams }: Props) {
  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.some(([id]) => id === rawTab)
    ? (rawTab as Tab)
    : "queue";
  const viewer = await requireViewer(
    tab === "queue" ? "/admin" : `/admin?tab=${tab}`,
  );
  // Admins are shared with cursor.directory (public.admins).
  if (!(await isAdmin(viewer.id))) notFound();

  const [counts, bots] = await Promise.all([
    countBotsByStatus(),
    tab === "queue"
      ? listBotsForReview()
      : listBotsByStatus(
          tab === "listed" ? ["listed"] : ["declined", "unlisted"],
        ),
  ]);
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
    <div className="shell page subs-page">
      <h1 className="page-title">Admin</h1>
      <Segmented
        label="Admin views"
        value={tab}
        style={{ marginBottom: 16 }}
        options={TABS.map(([id, label]) => ({
          id,
          label: `${label} ${tabCount[id]}`,
          href: id === "queue" ? "/admin" : `/admin?tab=${id}`,
        }))}
      />
      <p className="lede">{lede[tab]}</p>
      {bots.length === 0 ? (
        <div className="subs-empty">
          <SceneBot
            body="cloud"
            color="blue"
            face="happy"
            className="cta-bot"
          />
          {tab === "queue" ? "All caught up." : "Nothing here."}
        </div>
      ) : (
        <div className="review-list">{bots.map(card)}</div>
      )}
    </div>
  );
}
