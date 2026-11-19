"use client";

import Fuse from "fuse.js";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DirectoryBot } from "@/data/bots";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { formatAddCount, formatRelativeDate } from "@/lib/format";
import { rankResults, SEARCH_THRESHOLD } from "@/lib/search-rank";
import { useHeld } from "@/lib/use-held";
import { SceneBot } from "./bot-art";
import { BotRow } from "./bot-row";
import { Segmented } from "./segmented";

type Sort = "trending" | "installs" | "recent";
const SORTS: [Sort, string][] = [
  ["trending", "Trending"],
  ["installs", "Top"],
  ["recent", "New"],
];

// Filtering (and the ?q= URL update) waits this long after the last keystroke.
const SEARCH_DEBOUNCE_MS = 150;

const listedAt = (b: DirectoryBot) =>
  new Date(b.reviewedAt ?? b.submittedAt).getTime();

// Same rule as cursor.directory's leaderboard: recent installs win, lifetime
// installs break ties.
function metricFor(b: DirectoryBot, sort: Sort): number {
  if (sort === "trending") return b.installsRecent * 1e9 + b.installs;
  if (sort === "installs") return b.installs;
  return listedAt(b);
}

export function Directory({ bots }: { bots: DirectoryBot[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  // The home page keeps this list mounted while the Apps tab shows; the URL
  // is the Apps tab's then.
  const live = params.get("tab") !== "apps";
  const [search, setSearch] = useState(live ? (params.get("q") ?? "") : "");
  const category = useHeld(params.get("category") ?? "", live);
  const [sort, setSort] = useState<Sort>("trending");

  // Keep q and category in the URL (shareable, survives Back) without a
  // history entry per keystroke. The list is filtered here, so the URL is
  // rewritten in place: going through the router would ask the server for
  // the page again and hold the filter back until it answered.
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };

  // The input updates at once; the list and URL follow after a short pause.
  const [query, setQuery] = useState(() => search.trim());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // Shown again after the other tab: start from the URL, which the switch
  // reset. (Effects run again each time a hidden list is shown.)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q") ?? "";
    setSearch(q);
    setQuery(q.trim());
  }, []);
  const onSearch = (value: string) => {
    setSearch(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setQuery(value.trim());
      setParam("q", value);
    }, SEARCH_DEBOUNCE_MS);
  };
  const clearSearch = () => {
    clearTimeout(timer.current);
    setSearch("");
    setQuery("");
    setParam("q", "");
  };

  const fuse = useMemo(
    () =>
      new Fuse(bots, {
        keys: [
          { name: "name", weight: 3 },
          { name: "creator.name", weight: 1.5 },
          { name: "creator.xHandle", weight: 1 },
          { name: "description", weight: 0.5 },
        ],
        threshold: SEARCH_THRESHOLD,
        ignoreLocation: true,
        minMatchCharLength: 2,
        includeScore: true,
      }),
    [bots],
  );

  const searching = query.length >= 2;
  // The chosen sort orders the list, and settles ties between search
  // results that match equally well.
  const bySort = (a: DirectoryBot, b: DirectoryBot) =>
    metricFor(b, sort) - metricFor(a, sort);
  const matched = searching
    ? rankResults(fuse.search(query), query, bySort)
    : [...bots].sort(bySort);
  const counts = Object.fromEntries(
    CATEGORIES.map((c) => [
      c.id,
      matched.filter((b) => b.category === c.id).length,
    ]),
  );
  // A category with no bots isn't offered. The one in the URL still is, so
  // it can be turned off.
  const shownCategories = CATEGORIES.filter(
    (c) => c.id === category || bots.some((b) => b.category === c.id),
  );
  const visible = matched.filter((b) => !category || b.category === category);

  return (
    <>
      <form className="search" onSubmit={(e) => e.preventDefault()}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by creator or bot name"
          aria-label="Search bots"
        />
        {search && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Clear search"
            onClick={clearSearch}
          >
            ×
          </button>
        )}
      </form>
      <fieldset className="chips cats" aria-label="Categories">
        <button
          type="button"
          className={`chip${category ? "" : " on"}`}
          aria-pressed={!category}
          onClick={() => setParam("category", "")}
        >
          All
        </button>
        {shownCategories.map((c) => (
          <button
            key={c.id}
            type="button"
            // While searching, categories without matches fade instead of
            // showing counts, so the chips keep their width.
            className={`chip${category === c.id ? " on" : ""}${searching && counts[c.id] === 0 ? " no-match" : ""}`}
            aria-pressed={category === c.id}
            onClick={() => setParam("category", category === c.id ? "" : c.id)}
          >
            {c.label}
          </button>
        ))}
      </fieldset>

      <div className="section">
        {visible.length > 0 ? (
          <>
            <div className="section-head">
              <h2>
                {searching
                  ? "Results"
                  : sort === "trending"
                    ? "Trending bots"
                    : sort === "installs"
                      ? "Most added"
                      : "New bots"}
              </h2>
              <Segmented
                label="Sort bots"
                value={sort}
                onChange={setSort}
                options={SORTS.map(([id, label]) => ({ id, label }))}
              />
            </div>
            {visible.map((bot, i) => (
              <BotRow
                key={bot.id}
                bot={bot}
                rank={i + 1}
                metric={
                  sort === "recent"
                    ? formatRelativeDate(new Date(listedAt(bot)).toISOString())
                    : formatAddCount(bot.installs)
                }
              />
            ))}
          </>
        ) : (
          <div className="empty" data-testid="empty-state">
            <SceneBot
              body="blob"
              color="black"
              face="neutral"
              className="empty-bot"
              testId="empty-bot"
            />
            <p>
              {query
                ? `No bots found for "${query}"${category ? ` in ${categoryLabel(category)}` : ""}`
                : category
                  ? `No bots in ${categoryLabel(category)} yet`
                  : "No bots listed yet"}
            </p>
            <Link href="/submit" className="btn btn-gray">
              Submit a bot
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
