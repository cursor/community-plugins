import Link from "next/link";
import { Suspense } from "react";
import { AppDirectory } from "@/components/app-directory";
import { HeroBot } from "@/components/bot-art";
import { Directory } from "@/components/directory";
import { HomeIntro, IntroWord } from "@/components/home-intro";
import { Segmented } from "@/components/segmented";
import { RowsSkeleton } from "@/components/skeletons";
import { type DirectoryApp, listApps } from "@/data/apps";
import { type DirectoryBot, listListedBots } from "@/data/bots";
import { formatCount } from "@/lib/format";

// Listings and install counts change constantly; render per request.
export const dynamic = "force-dynamic";

const FALLBACK_COPY = {
  bots: "Bots built by the Grok Bot community, ranked by what’s trending.",
  apps: "Apps that give your bots new tools and skills.",
};

type Tab = keyof typeof FALLBACK_COPY;
type Props = { searchParams: Promise<{ tab?: string }> };

// The hero renders at once so its intro plays from the first paint; only the
// count line and the directory wait for the listings.
export default async function HomePage({ searchParams }: Props) {
  const tab: Tab = (await searchParams).tab === "apps" ? "apps" : "bots";
  const bots = tab === "bots" ? listListedBots() : null;
  const apps = tab === "apps" ? listApps() : null;
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
            <Link
              href={tab === "apps" ? "/submit?kind=app" : "/submit"}
              className="btn btn-lg hero-cta"
            >
              {tab === "apps" ? "Submit an app" : "Submit a bot"}
            </Link>
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
            {apps ? <AppList apps={apps} /> : null}
          </Suspense>
        </div>
      </HomeIntro>
    </div>
  );
}

async function BotCopy({ bots }: { bots: Promise<DirectoryBot[]> }) {
  const list = await bots;
  const creators = new Set(list.map((b) => b.creator.name)).size;
  return (
    <p className="hero-copy">
      {list.length > 0
        ? `${formatCount(list.length)} bots from ${formatCount(creators)} creators in the Grok Bot community, ranked by what’s trending.`
        : FALLBACK_COPY.bots}
    </p>
  );
}

async function AppCopy({ apps }: { apps: Promise<DirectoryApp[]> }) {
  const list = await apps;
  const community = list.filter((a) => !a.marketplaceId).length;
  return (
    <p className="hero-copy">
      {list.length > 0
        ? `${formatCount(list.length)} apps that give your bots new tools and skills${community > 0 ? `, ${formatCount(community)} of them from the community` : ""}.`
        : FALLBACK_COPY.apps}
    </p>
  );
}

async function BotDirectory({ bots }: { bots: Promise<DirectoryBot[]> }) {
  return <Directory bots={await bots} />;
}

async function AppList({ apps }: { apps: Promise<DirectoryApp[]> }) {
  return <AppDirectory apps={await apps} />;
}
