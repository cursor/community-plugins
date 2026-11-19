import type { AppListItem } from "@/data/apps";

export type AppSort = "trending" | "installs" | "recent";

export const APP_SORTS: [AppSort, string][] = [
  ["trending", "Trending"],
  ["installs", "Top"],
  ["recent", "New"],
];

type Ranked = Pick<
  AppListItem,
  "slug" | "installs" | "installsRecent" | "createdAt"
>;

const newestFirst = (a: Ranked, b: Ranked) =>
  b.createdAt.localeCompare(a.createdAt) || a.slug.localeCompare(b.slug);

/**
 * The order of the Apps list, the same as `grok_bot_apps_page()` in SQL and
 * the bots' rule: installs in the last 30 days for Trending, all installs
 * for Top (and to break Trending's ties), then the newest first.
 */
export function compareApps(sort: AppSort): (a: Ranked, b: Ranked) => number {
  if (sort === "recent") return newestFirst;
  return (a, b) =>
    (sort === "trending" ? b.installsRecent - a.installsRecent : 0) ||
    b.installs - a.installs ||
    newestFirst(a, b);
}
