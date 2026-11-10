"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { OfficialBadge } from "@/components/plugins/official-badge";
import { PluginIconFallback } from "@/components/plugins/plugin-icon";
import { VerifiedBadge } from "@/components/plugins/verified-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn, formatCount } from "@/lib/utils";

export type LeaderboardItem = {
  name: string;
  slug: string;
  description?: string;
  logo?: string | null;
  author?: string | null;
  authorUrl?: string | null;
  verified?: boolean;
  official?: boolean;
  installCount: number;
  installs30d?: number;
  starCount: number;
  createdAt: string;
  updatedAt?: string;
  permanentlyBlocked?: boolean;
  flagSeverity?: "low" | "medium" | "high" | null;
  scanStatus?:
    | "pending"
    | "scanning"
    | "safe"
    | "flagged"
    | "error"
    | "unscanned";
  href: string;
};

type LeaderboardSort = "trending" | "installs" | "recent";

const TABS: { id: LeaderboardSort; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "installs", label: "Top" },
  { id: "recent", label: "New" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

// Hides plugins that should never appear on the public leaderboard,
// regardless of how many installs they have.
function isExcluded(item: LeaderboardItem): boolean {
  if (item.permanentlyBlocked) return true;
  if (item.flagSeverity === "high") return true;
  if (item.scanStatus === "flagged") return true;
  return false;
}

// Estimated 30-day install count for plugins where we don't yet have a
// real velocity signal. Assumes a uniform install rate over the
// plugin's lifetime — an imperfect proxy (real install curves spike
// at launch and taper), but defensible as an *estimate* and clearly
// marked in the UI with a `~` prefix to distinguish from measured
// velocity.
//
// `now` is passed in (instead of calling Date.now()) so rendering stays
// deterministic — required for the leaderboard to be part of the cached
// static shell under Cache Components. It refreshes whenever the page
// cache revalidates.
function syntheticVelocity(item: LeaderboardItem, now: number): number {
  const lifetime = Math.max(0, item.installCount);
  if (lifetime === 0) return 0;
  const ageDays = Math.max(
    1,
    (now - new Date(item.createdAt).getTime()) / DAY_MS,
  );
  return Math.round(lifetime * Math.min(1, 30 / ageDays));
}

// Trending = installs in the last 30 days, real or estimated.
//   1. Real velocity wins always (bumped into a range no synthetic
//      value can reach via the 1e9 multiplier).
//   2. Synthetic velocity ranks the long tail so Trending stays
//      populated before snapshots accumulate. Lifetime breaks ties.
//   3. Plugins with no installs at all are filtered out.
//
// Real velocity is sourced from the daily snapshot pipeline
// (`snapshot_plugin_installs()` scheduled via Supabase Cron / pg_cron,
// exposed by `plugin_install_velocity`). For plugins younger than the
// window, the SQL function returns their full install_count — every
// install they have happened inside the window by definition.
function trendingScore(item: LeaderboardItem, now: number): number {
  const realVelocity = Math.max(0, item.installs30d ?? 0);
  const lifetime = Math.max(0, item.installCount);
  if (realVelocity > 0) {
    return realVelocity * 1_000_000_000 + lifetime;
  }
  return syntheticVelocity(item, now) * 1_000 + lifetime;
}

const isSvgLogo = (url: string) => url.endsWith(".svg");

function isValidImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function metricFor(
  item: LeaderboardItem,
  sort: LeaderboardSort,
  now: number,
): number {
  switch (sort) {
    case "trending":
      return trendingScore(item, now);
    case "installs":
      return item.installCount;
    case "recent":
      return new Date(item.createdAt).getTime();
  }
}

function formatRelativeDate(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(diff / day);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

type Row =
  | { kind: "item"; rank: number; item: LeaderboardItem }
  | {
      kind: "more";
      author: string;
      count: number;
      totalMetric: number;
      sort: LeaderboardSort;
    };

// While searching, a plugin whose name or slug exactly matches the query
// is pinned to the top regardless of the tab metric — searching "vercel"
// should always surface the Vercel plugin first, even on Trending where
// fuzzier matches may have higher recent install velocity.
function isExactMatch(item: LeaderboardItem, query: string): boolean {
  if (!query) return false;
  return (
    item.name.trim().toLowerCase() === query ||
    item.slug.toLowerCase() === query
  );
}

function buildRows(
  items: LeaderboardItem[],
  sort: LeaderboardSort,
  groupByAuthor: boolean,
  now: number,
  searchQuery: string,
): Row[] {
  const query = searchQuery.trim().toLowerCase();
  const safeItems = items.filter((i) => !isExcluded(i));
  // Trending requires *some* signal: either real recent installs, or
  // at least a positive lifetime install_count (so we can compute a
  // synthetic per-month estimate from the install rate). Plugins with
  // zero installs ever are not "trending" — unless they exactly match an
  // active search, in which case hiding them would be more confusing.
  const candidates =
    sort === "trending"
      ? safeItems.filter(
          (i) =>
            (i.installs30d ?? 0) > 0 ||
            i.installCount > 0 ||
            isExactMatch(i, query),
        )
      : safeItems;
  const sorted = [...candidates].sort((a, b) => {
    const exactDiff =
      Number(isExactMatch(b, query)) - Number(isExactMatch(a, query));
    if (exactDiff !== 0) return exactDiff;
    return metricFor(b, sort, now) - metricFor(a, sort, now);
  });

  if (!groupByAuthor) {
    return sorted.map((item, i) => ({ kind: "item", rank: i + 1, item }));
  }

  const totalsPerAuthor = new Map<string, number>();
  const countPerAuthor = new Map<string, number>();
  for (const it of sorted) {
    if (!it.author) continue;
    totalsPerAuthor.set(
      it.author,
      (totalsPerAuthor.get(it.author) ?? 0) + metricFor(it, sort, now),
    );
    countPerAuthor.set(it.author, (countPerAuthor.get(it.author) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const rows: Row[] = [];
  let rank = 0;

  for (const item of sorted) {
    rank += 1;
    const author = item.author?.trim() || null;
    if (author && seen.has(author)) {
      // collapsed into the "+X more" entry shown earlier; rank still
      // advances so the next visible item reflects its true position
      continue;
    }
    rows.push({ kind: "item", rank, item });
    if (author) {
      seen.add(author);
      const total = countPerAuthor.get(author) ?? 1;
      if (total > 1) {
        rows.push({
          kind: "more",
          author,
          count: total - 1,
          totalMetric: totalsPerAuthor.get(author) ?? 0,
          sort,
        });
      }
    }
  }

  return rows;
}

function PluginLogo({ item }: { item: LeaderboardItem }) {
  if (isValidImageUrl(item.logo)) {
    return (
      <Avatar className="size-7 rounded-none shrink-0 border border-border bg-transparent">
        <AvatarImage
          src={item.logo}
          alt={item.name}
          className={cn("object-cover", isSvgLogo(item.logo) && "invert")}
        />
        <AvatarFallback className="rounded-none bg-transparent text-xs text-foreground">
          {item.name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
    );
  }
  return <PluginIconFallback size={28} />;
}

function ItemRow({
  rank,
  item,
  display,
}: {
  rank: number;
  item: LeaderboardItem;
  display: string;
}) {
  return (
    <Link
      href={item.href}
      className="group grid grid-cols-[44px_1fr_auto] items-center gap-4 border-b border-border py-3 transition-colors hover:text-foreground"
    >
      <span className="text-sm font-mono tabular-nums text-muted-foreground">
        {rank}
      </span>

      <div className="flex min-w-0 items-center gap-3">
        <PluginLogo item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-foreground">
              {item.name}
            </span>
            {item.verified ? <VerifiedBadge size="sm" /> : null}
            {item.official ? <OfficialBadge size="sm" /> : null}
          </div>
          {item.description ? (
            <p className="max-w-[60ch] truncate text-xs text-muted-foreground">
              {item.description}
            </p>
          ) : null}
        </div>
      </div>

      <span className="text-right text-sm font-mono tabular-nums text-muted-foreground">
        {display}
      </span>
    </Link>
  );
}

function MoreRow({
  author,
  count,
  totalMetric,
  sort,
}: {
  author: string;
  count: number;
  totalMetric: number;
  sort: LeaderboardSort;
}) {
  const href = `/?q=${encodeURIComponent(author)}`;
  return (
    <Link
      href={href}
      className="grid grid-cols-[44px_1fr_auto] items-center gap-4 border-b border-border py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <span aria-hidden />
      <span className="truncate">
        +{count} more from <span className="text-foreground">{author}</span>
      </span>
      {sort === "recent" ? (
        <span aria-hidden />
      ) : (
        <span className="text-right font-mono tabular-nums">
          {formatCount(totalMetric)} total
        </span>
      )}
    </Link>
  );
}

export function PluginLeaderboard({
  items,
  now,
  initialSort = "trending",
  groupByAuthor = false,
  maxItems = Number.POSITIVE_INFINITY,
  chunkSize = 50,
  searchQuery = "",
}: {
  items: LeaderboardItem[];
  /**
   * Reference timestamp for age-based scoring and "Xd ago" labels. Computed
   * inside the cached page scope (never `Date.now()` here) so prerendering
   * stays deterministic; it refreshes when the page cache revalidates.
   */
  now: number;
  initialSort?: LeaderboardSort;
  groupByAuthor?: boolean;
  maxItems?: number;
  chunkSize?: number;
  /** Active search query, used to pin exact matches to the top. */
  searchQuery?: string;
}) {
  const [sort, setSort] = useState<LeaderboardSort>(initialSort);
  const [visible, setVisible] = useState(chunkSize);

  const rows = useMemo(() => {
    const built = buildRows(items, sort, groupByAuthor, now, searchQuery);
    return built.slice(0, maxItems);
  }, [items, sort, groupByAuthor, maxItems, now, searchQuery]);

  const visibleRows = rows.slice(0, visible);
  const hasMore = visible < rows.length;

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => Math.min(v + chunkSize, rows.length));
        }
      },
      { rootMargin: "600px 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, rows.length, chunkSize]);

  const onTabChange = (next: LeaderboardSort) => {
    setSort(next);
    setVisible(chunkSize);
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-5 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "-mb-px border-b py-2 text-sm transition-colors",
              sort === tab.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {visibleRows.map((row) => {
          if (row.kind === "more") {
            return (
              <MoreRow
                key={`more-${sort}-${row.author}`}
                author={row.author}
                count={row.count}
                totalMetric={row.totalMetric}
                sort={row.sort}
              />
            );
          }
          const display =
            sort === "recent"
              ? formatRelativeDate(row.item.createdAt, now)
              : formatCount(row.item.installCount);
          return (
            <ItemRow
              key={row.item.slug}
              rank={row.rank}
              item={row.item}
              display={display}
            />
          );
        })}

        {visibleRows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No plugins to show yet.
          </div>
        ) : null}
      </div>

      {hasMore ? <div ref={sentinelRef} className="h-10" aria-hidden /> : null}
    </div>
  );
}
