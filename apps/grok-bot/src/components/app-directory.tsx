"use client";

import Fuse from "fuse.js";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppListItem, AppsFirstPage } from "@/data/apps";
import { APP_CATEGORIES, appCategoryLabel } from "@/lib/app-categories";
import { useHeld } from "@/lib/use-held";
import { AppRow } from "./app-row";
import { SceneBot } from "./bot-art";

// Filtering (and the ?q= URL update) waits this long after the last keystroke.
const SEARCH_DEBOUNCE_MS = 150;
const PAGE_SIZE = 60;
// Every app is fetched this long after the list appears, so it's there by
// the time someone searches, picks a category or asks for more.
const PRELOAD_AFTER_MS = 300;

// One fetch for the visit, however often the list is shown: /api/apps is
// large, and switching tabs remounts the list.
let everyApp: Promise<AppListItem[]> | null = null;
function fetchEveryApp(): Promise<AppListItem[]> {
  everyApp ??= fetch("/api/apps")
    .then((res) => {
      if (!res.ok) throw new Error(`apps: ${res.status}`);
      return res.json() as Promise<AppListItem[]>;
    })
    .catch((err) => {
      // A failed fetch can be tried again.
      everyApp = null;
      throw err;
    });
  return everyApp;
}

function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The Apps list. The page arrives with the first rows only (`first`: a pick
 * of official and community apps, in `firstCategory` when the URL names
 * one), since every app is over a megabyte. That list is fetched once from
 * /api/apps, shortly after the first rows appear; search, categories and
 * "Show more" then run in the browser. Until it has arrived, the rows on the
 * page stay where they are (dimmed while an answer is pending) rather than
 * being swapped for placeholders.
 */
export function AppDirectory({
  first,
  firstCategory,
}: {
  first: AppsFirstPage;
  firstCategory: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  // The home page keeps this list mounted while the Bots tab shows; the URL
  // is the Bots tab's then.
  const live = params.get("tab") === "apps";
  const [search, setSearch] = useState(live ? (params.get("q") ?? "") : "");
  // An unknown category in the URL is no category, as on the server.
  const rawCategory = useHeld(params.get("category") ?? "", live);
  const urlCategory = appCategoryLabel(rawCategory) ? rawCategory : "";
  // A clicked category shows as chosen at once; the URL follows, and once it
  // has moved on from where the click was made it speaks for itself again.
  const [chosen, setChosen] = useState<{ value: string; from: string } | null>(
    null,
  );
  const category =
    chosen && chosen.from === urlCategory ? chosen.value : urlCategory;
  const choose = (value: string) => {
    setChosen({ value, from: urlCategory });
    setParam("category", value);
  };

  // Keep q and category in the URL (shareable, survives Back) without a
  // history entry per keystroke. The list is filtered here, so the URL is
  // rewritten in place rather than asking the server for the page again.
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };

  const [query, setQuery] = useState(() => search.trim());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // Shown again after the other tab: start from the URL, which the switch
  // reset. (Effects run again each time a hidden list is shown.)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q") ?? "";
    setSearch(q);
    setQuery(q.trim());
    setChosen(null);
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

  // Every app, once it's been asked for: the rows already on the page keep
  // their place and the rest follow in a fresh order, official first.
  const [all, setAll] = useState<AppListItem[] | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "failed">(
    "idle",
  );
  const loading = useRef(false);
  const firstRows = useRef(first);
  useEffect(() => {
    firstRows.current = first;
  }, [first]);
  const loadAll = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    setLoadState("loading");
    try {
      const list = await fetchEveryApp();
      const { official, community } = firstRows.current;
      const here = new Set([...official, ...community].map((a) => a.slug));
      const rest = shuffle(list.filter((a) => !here.has(a.slug)));
      setAll([
        ...official,
        ...rest.filter((a) => a.marketplaceId),
        ...community,
        ...rest.filter((a) => !a.marketplaceId),
      ]);
      setLoadState("idle");
    } catch {
      loading.current = false;
      setLoadState("failed");
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(loadAll, PRELOAD_AFTER_MS);
    return () => clearTimeout(id);
  }, [loadAll]);

  const searching = query.length >= 2;
  // Built for the first search, not on arrival: indexing every app takes a
  // moment most visits never need.
  const fuse = useMemo(
    () =>
      all &&
      searching &&
      new Fuse(all, {
        keys: [
          { name: "name", weight: 3 },
          { name: "publisher", weight: 1.5 },
          { name: "mcpServers", weight: 1 },
          { name: "skills", weight: 1 },
          { name: "description", weight: 0.5 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
        minMatchCharLength: 2,
      }),
    [all, searching],
  );
  // Searching needs every app, and so does a category the page didn't
  // arrive with.
  useEffect(() => {
    if (searching || category !== firstCategory) loadAll();
  }, [searching, category, firstCategory, loadAll]);

  const categoryName = appCategoryLabel(category);
  const inCategory = (a: AppListItem) =>
    !category || a.categories.includes(category);

  // With every app loaded, search and filters are computed here. Until then
  // the page shows the rows it arrived with, which the server already
  // picked for the URL's category.
  let official: AppListItem[];
  let community: AppListItem[];
  let officialTotal: number;
  let communityTotal: number;
  let counts: Record<string, number> | null = null;
  if (all) {
    // Search results keep Fuse's relevance order; otherwise the list keeps
    // the order it has (official first, each group shuffled per visit).
    const matched = fuse ? fuse.search(query).map((r) => r.item) : all;
    if (searching)
      counts = Object.fromEntries(
        APP_CATEGORIES.map((c) => [
          c.id,
          matched.filter((a) => a.categories.includes(c.id)).length,
        ]),
      );
    const visible = matched.filter(inCategory);
    official = visible.filter((a) => a.marketplaceId);
    community = visible.filter((a) => !a.marketplaceId);
    officialTotal = official.length;
    communityTotal = community.length;
  } else {
    official = first.official;
    community = first.community;
    officialTotal = first.officialTotal;
    communityTotal = first.communityTotal;
  }
  const categories = all
    ? APP_CATEGORIES.filter((c) => all.some((a) => a.categories.includes(c.id)))
    : APP_CATEGORIES;

  // The answer isn't here yet: a search or a category chosen before every
  // app has arrived. The rows on the page stay, dimmed, until it is.
  const waiting = !all && (searching || category !== firstCategory);
  const failed = waiting && loadState === "failed";
  const empty = !waiting && officialTotal + communityTotal === 0;

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
          // Start fetching before the first keystroke.
          onFocus={loadAll}
          placeholder="Search apps, publishers or tools"
          aria-label="Search apps"
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
          onClick={() => choose("")}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip${category === c.id ? " on" : ""}${counts && counts[c.id] === 0 ? " no-match" : ""}`}
            aria-pressed={category === c.id}
            onClick={() => choose(category === c.id ? "" : c.id)}
          >
            {c.label}
          </button>
        ))}
      </fieldset>

      {failed ? (
        <div className="empty" data-testid="apps-failed">
          <p>Couldn’t load the apps to search. Check your connection.</p>
          <button type="button" className="btn btn-gray" onClick={loadAll}>
            Try again
          </button>
        </div>
      ) : empty ? (
        <div className="empty" data-testid="empty-state">
          <SceneBot
            body="blob"
            color="black"
            face="confused"
            className="empty-bot"
            testId="empty-bot"
          />
          <p>
            {query
              ? `No apps found for "${query}"${categoryName ? ` in ${categoryName}` : ""}`
              : categoryName
                ? `No apps in ${categoryName} yet`
                : "No apps listed yet"}
          </p>
          <Link href="/submit?kind=app" className="btn btn-gray">
            Submit an app
          </Link>
        </div>
      ) : (
        <div
          className={waiting ? "is-pending" : undefined}
          aria-busy={waiting || undefined}
          data-testid={waiting ? "apps-pending" : undefined}
        >
          {(
            [
              ["Official apps", official, officialTotal, "official-apps"],
              ["Community apps", community, communityTotal, "community-apps"],
            ] as const
          ).map(
            ([title, list, total, id]) =>
              total > 0 && (
                <AppSection
                  // A new search or category starts from the first page, once
                  // its rows are here.
                  key={waiting ? id : `${id}:${query}:${category}`}
                  id={id}
                  title={
                    searching && !waiting
                      ? `${title} matching “${query}”`
                      : title
                  }
                  apps={list}
                  total={total}
                  loadState={all ? "idle" : loadState}
                  onMore={loadAll}
                />
              ),
          )}
        </div>
      )}
    </>
  );
}

function AppSection({
  id,
  title,
  apps,
  total,
  loadState,
  onMore,
}: {
  id: string;
  title: string;
  /** The rows there are to show so far; fewer than `total` until every app has loaded. */
  apps: AppListItem[];
  total: number;
  loadState: "idle" | "loading" | "failed";
  /** Fetches every app, when more are wanted than the page arrived with. */
  onMore: () => void;
}) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const wanted = Math.min(shown, total);
  const missing = apps.length < wanted;
  return (
    <div className="section" data-testid={id}>
      <div className="section-head">
        <h2>{title}</h2>
        <span className="muted section-count">{total}</span>
      </div>
      {apps.slice(0, shown).map((app) => (
        <AppRow key={app.slug} app={app} />
      ))}
      {missing && loadState === "failed" ? (
        <button
          type="button"
          className="btn btn-gray show-more"
          onClick={onMore}
        >
          Couldn’t load more. Try again
        </button>
      ) : (
        total > shown && (
          <button
            type="button"
            className="btn btn-gray show-more"
            // More was asked for and is on its way.
            disabled={missing && loadState === "loading"}
            onClick={() => {
              setShown((n) => n + PAGE_SIZE);
              if (apps.length < total) onMore();
            }}
          >
            {missing && loadState === "loading"
              ? "Loading more…"
              : `Show more (${total - shown} more)`}
          </button>
        )
      )}
    </div>
  );
}
