"use client";

import Fuse from "fuse.js";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppListItem, AppsFirstPage } from "@/data/apps";
import { APP_CATEGORIES, appCategoryLabel } from "@/lib/app-categories";
import { AppRow } from "./app-row";
import { SceneBot } from "./bot-art";
import { RowsSkeleton } from "./skeletons";

// Filtering (and the ?q= URL update) waits this long after the last keystroke.
const SEARCH_DEBOUNCE_MS = 150;
const PAGE_SIZE = 60;

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
 * one). Every app is several megabytes, so that list is fetched once, from
 * /api/apps, when someone searches or asks for more; after that, search and
 * filters run in the browser.
 */
export function AppDirectory({
  first,
  firstCategory,
}: {
  first: AppsFirstPage;
  firstCategory: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  // An unknown category in the URL is no category, as on the server.
  const rawCategory = params.get("category") ?? "";
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
  // history entry per keystroke.
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const [query, setQuery] = useState(() => search.trim());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
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
      const res = await fetch("/api/apps");
      if (!res.ok) throw new Error(`apps: ${res.status}`);
      const list = (await res.json()) as AppListItem[];
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

  const fuse = useMemo(
    () =>
      all &&
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
    [all],
  );

  const searching = query.length >= 2;
  // Searching needs every app.
  useEffect(() => {
    if (searching) loadAll();
  }, [searching, loadAll]);

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
  if (all && fuse) {
    // Search results keep Fuse's relevance order; otherwise the list keeps
    // the order it has (official first, each group shuffled per visit).
    const matched = searching ? fuse.search(query).map((r) => r.item) : all;
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

  // Rows can't be shown yet: a search before every app has arrived, or a
  // category the server hasn't answered for.
  const waiting = !all && (searching || category !== firstCategory);
  const failed = waiting && searching && loadState === "failed";
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
      ) : waiting ? (
        <div className="section" data-testid="apps-loading">
          <RowsSkeleton rows={8} />
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
        (
          [
            ["Official apps", official, officialTotal, "official-apps"],
            ["Community apps", community, communityTotal, "community-apps"],
          ] as const
        ).map(
          ([title, list, total, id]) =>
            total > 0 && (
              <AppSection
                // A new search or category starts from the first page.
                key={`${id}:${query}:${category}`}
                id={id}
                title={searching ? `${title} matching “${query}”` : title}
                apps={list}
                total={total}
                loadState={all ? "idle" : loadState}
                onMore={loadAll}
              />
            ),
        )
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
      {missing && loadState === "loading" && <RowsSkeleton rows={4} />}
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
            onClick={() => {
              setShown((n) => n + PAGE_SIZE);
              if (apps.length < total) onMore();
            }}
          >
            Show more ({total - shown} more)
          </button>
        )
      )}
    </div>
  );
}
