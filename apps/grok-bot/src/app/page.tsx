import { Suspense } from "react";
import { AppDirectory } from "@/components/app-directory";
import { HeroBot } from "@/components/bot-art";
import { Directory } from "@/components/directory";
import { HeroCta } from "@/components/hero-cta";
import { HomeIntro, IntroWord } from "@/components/home-intro";
import { Segmented } from "@/components/segmented";
import { RowsSkeleton } from "@/components/skeletons";
import { type AppsFirstPage, firstAppsPage } from "@/data/apps";
import { type DirectoryBot, listListedBots } from "@/data/bots";
import { appCategoryLabel } from "@/lib/app-categories";
import { formatCount } from "@/lib/format";

// Listings and install counts change constantly; render per request.
export const dynamic = "force-dynamic";

const FALLBACK_COPY = {
  bots: "Bots built by the Grok Bot community",
  apps: "Apps that give your bots new tools and skills",
};

type Tab = keyof typeof FALLBACK_COPY;
type Props = { searchParams: Promise<{ tab?: string; category?: string }> };

// The hero renders at once so its intro plays from the first paint; only the
// count line and the directory wait for the listings.
export default async function HomePage({ searchParams }: Props) {
  const { tab: rawTab, category: rawCategory } = await searchParams;
  const tab: Tab = rawTab === "apps" ? "apps" : "bots";
  // Only a category the directory knows reaches the query.
  const category =
    rawCategory && appCategoryLabel(rawCategory) ? rawCategory : "";
  const bots = tab === "bots" ? listListedBots() : null;
  // The first rows only; the browser fetches the rest when it's asked for.
  const apps =
    tab === "apps" ? firstAppsPage({ category: category || null }) : null;
  return (
    <div className="shell start">
      <HomeIntro>
        <div className="hero">
          <a
            href="https://x.ai/bot/guides/getting-started"
            target="_blank"
            rel="noopener noreferrer"
            className="announce"
          >
            <b>New to Grok Bot?</b> · Read the getting started guide{" "}
            <span className="arrow">↗</span>
          </a>
          <h1 className="hero-title" aria-label="Find a bot for every job">
            <span>
              <IntroWord i={0}>Find</IntroWord> <IntroWord i={1}>a</IntroWord>
            </span>
            <IntroWord i={2}>
              <HeroBot />
              {/* The bot stands in for the word; this keeps it in the text. */}
              <span className="sr-only"> bot </span>
            </IntroWord>
            <span>
              <IntroWord i={3}>for</IntroWord>{" "}
              <IntroWord i={4}>every</IntroWord>{" "}
              <IntroWord i={5}>job</IntroWord>
            </span>
          </h1>
          {/* The wrapper carries the animation, so streaming the count in
              doesn't restart it. */}
          <div className="intro-copy">
            <Suspense
              fallback={<p className="hero-copy">{FALLBACK_COPY[tab]}</p>}
            >
              {bots ? <BotCopy bots={bots} /> : null}
              {apps ? <AppCopy apps={apps} /> : null}
            </Suspense>
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
              options={[
                { id: "bots", label: "Bots", href: "/" },
                { id: "apps", label: "Apps", href: "/?tab=apps" },
              ]}
            />
          </div>
          <Suspense
            key={tab}
            fallback={
              <div className="section">
                <RowsSkeleton rows={8} />
              </div>
            }
          >
            {bots ? <BotDirectory bots={bots} /> : null}
            {apps ? <AppList apps={apps} category={category} /> : null}
          </Suspense>
        </div>
      </HomeIntro>
    </div>
  );
}

async function BotCopy({ bots }: { bots: Promise<DirectoryBot[]> }) {
  const list = await bots;
  return (
    <p className="hero-copy">
      {list.length > 0
        ? `${formatCount(list.length)} bots from the Grok Bot community`
        : FALLBACK_COPY.bots}
    </p>
  );
}

async function AppCopy({ apps }: { apps: Promise<AppsFirstPage> }) {
  const { allTotal } = await apps;
  return (
    <p className="hero-copy">
      {allTotal > 0
        ? `${formatCount(allTotal)} apps that give your bots new tools and skills`
        : FALLBACK_COPY.apps}
    </p>
  );
}

async function BotDirectory({ bots }: { bots: Promise<DirectoryBot[]> }) {
  return <Directory bots={await bots} />;
}

// Apps aren't ranked, so each visit gets a fresh pick (official apps still
// come first). The database picks it, so hydration sees the same order.
async function AppList({
  apps,
  category,
}: {
  apps: Promise<AppsFirstPage>;
  category: string;
}) {
  return <AppDirectory first={await apps} firstCategory={category} />;
}
