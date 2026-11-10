"use client";

import Fuse from "fuse.js";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DirectoryApp } from "@/data/apps";
import { APP_CATEGORIES, appCategoryLabel } from "@/lib/app-categories";
import { AppRow } from "./app-row";
import { SceneBot } from "./bot-art";

// Filtering (and the ?q= URL update) waits this long after the last keystroke.
const SEARCH_DEBOUNCE_MS = 150;

export function AppDirectory({ apps }: { apps: DirectoryApp[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const category = params.get("category") ?? "";

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

  const fuse = useMemo(
    () =>
      new Fuse(apps, {
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
    [apps],
  );

  const searching = query.length >= 2;
  // Search results keep Fuse's relevance order; otherwise the list keeps the
  // order it came in (official first, each group shuffled per visit).
  const matched = searching ? fuse.search(query).map((r) => r.item) : apps;
  const categories = APP_CATEGORIES.filter((c) =>
    apps.some((a) => a.categories.includes(c.id)),
  );
  const counts = Object.fromEntries(
    categories.map((c) => [
      c.id,
      matched.filter((a) => a.categories.includes(c.id)).length,
    ]),
  );
  const visible = matched.filter(
    (a) => !category || a.categories.includes(category),
  );
  const official = visible.filter((a) => a.marketplaceId);
  const community = visible.filter((a) => !a.marketplaceId);
  const categoryName = appCategoryLabel(category);

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
          onClick={() => setParam("category", "")}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip${category === c.id ? " on" : ""}${searching && counts[c.id] === 0 ? " no-match" : ""}`}
            aria-pressed={category === c.id}
            onClick={() => setParam("category", category === c.id ? "" : c.id)}
          >
            {c.label}
          </button>
        ))}
      </fieldset>

      {visible.length === 0 ? (
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
        [
          ["Official apps", official, "official-apps"] as const,
          ["Community apps", community, "community-apps"] as const,
        ].map(
          ([title, list, id]) =>
            list.length > 0 && (
              <AppSection
                // A new search or category starts from the first page.
                key={`${id}:${query}:${category}`}
                id={id}
                title={searching ? `${title} matching “${query}”` : title}
                apps={list}
              />
            ),
        )
      )}
    </>
  );
}

const PAGE_SIZE = 60;

function AppSection({
  id,
  title,
  apps,
}: {
  id: string;
  title: string;
  apps: DirectoryApp[];
}) {
  const [shown, setShown] = useState(PAGE_SIZE);
  return (
    <div className="section" data-testid={id}>
      <div className="section-head">
        <h2>{title}</h2>
        <span className="muted section-count">{apps.length}</span>
      </div>
      {apps.slice(0, shown).map((app) => (
        <AppRow key={app.id} app={app} />
      ))}
      {apps.length > shown && (
        <button
          type="button"
          className="btn btn-gray show-more"
          onClick={() => setShown((n) => n + PAGE_SIZE)}
        >
          Show more ({apps.length - shown} more)
        </button>
      )}
    </div>
  );
}
