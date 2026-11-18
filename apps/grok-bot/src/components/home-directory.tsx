"use client";

import { useSearchParams } from "next/navigation";
import { Activity, type ReactNode, Suspense, use, useEffect } from "react";
import type { AppsFirstPage } from "@/data/apps";
import type { DirectoryBot } from "@/data/bots";
import { AppDirectory } from "./app-directory";
import { Directory } from "./directory";
import { HeroCta } from "./hero-cta";
import { Segmented } from "./segmented";

type Tab = "bots" | "apps";

// The line under the headline. It says what the tab holds, not how many.
const COPY: Record<Tab, string> = {
  bots: "Bots from the Grok Bot community",
  apps: "Apps that give your bots new tools and skills",
};
// The server sets these for the tab a visit lands on (page.tsx, layout.tsx).
const TITLE: Record<Tab, string> = {
  bots: "Grok Bot Directory",
  apps: "Apps for Grok Bot · Grok Bot Directory",
};

/**
 * The home page below its headline: a one-line summary, the submit button,
 * the Bots / Apps switch and the lists. The page starts loading both tabs'
 * rows and hands them over as they arrive, and both lists stay mounted (the
 * one not showing is rendered ahead, hidden). So the switch only changes what
 * is shown, and the URL in place: nothing is requested or built at that
 * moment.
 */
export function HomeDirectory({
  bots,
  apps,
  appsCategory,
  children,
}: {
  bots: Promise<DirectoryBot[]>;
  apps: Promise<AppsFirstPage>;
  /** The category the server picked `apps` for, or "". */
  appsCategory: string;
  /** The headline. */
  children: ReactNode;
}) {
  const tab: Tab = useSearchParams().get("tab") === "apps" ? "apps" : "bots";
  useEffect(() => {
    document.title = TITLE[tab];
  }, [tab]);
  return (
    <>
      <div className="hero">
        {children}
        <div className="intro-copy">
          <p className="hero-copy">{COPY[tab]}</p>
        </div>
        <div className="intro-cta">
          <HeroCta tab={tab} />
        </div>
      </div>
      <div className="intro-rest">
        <div className="directory-tabs">
          <Segmented
            label="Directory"
            value={tab}
            inPlace
            options={[
              { id: "bots", label: "Bots", href: "/" },
              { id: "apps", label: "Apps", href: "/?tab=apps" },
            ]}
          />
        </div>
        {/* Rows that haven't arrived yet leave their space empty; nothing
            stands in for them. */}
        <Activity mode={tab === "bots" ? "visible" : "hidden"}>
          <Suspense fallback={<div className="list-pending" />}>
            <BotList bots={bots} />
          </Suspense>
        </Activity>
        <Activity mode={tab === "apps" ? "visible" : "hidden"}>
          <Suspense fallback={<div className="list-pending" />}>
            <AppList apps={apps} category={appsCategory} />
          </Suspense>
        </Activity>
      </div>
    </>
  );
}

function BotList({ bots }: { bots: Promise<DirectoryBot[]> }) {
  return <Directory bots={use(bots)} />;
}

// Apps aren't ranked, so each visit gets a fresh pick (official apps still
// come first). The database picks it, so hydration sees the same order.
function AppList({
  apps,
  category,
}: {
  apps: Promise<AppsFirstPage>;
  category: string;
}) {
  return <AppDirectory first={use(apps)} firstCategory={category} />;
}
