import type { Metadata } from "next";
import { HeroBot } from "@/components/bot-art";
import { HomeDirectory } from "@/components/home-directory";
import { HomeIntro, IntroWord } from "@/components/home-intro";
import { firstAppsPage } from "@/data/apps";
import { listListedBots } from "@/data/bots";
import { appCategoryLabel } from "@/lib/app-categories";
import { OG_SIZE } from "@/lib/og";

// Listings and install counts change constantly; render per request.
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ tab?: string; category?: string }> };

const APPS_TITLE = "Apps for Grok Bot";
const APPS_DESCRIPTION =
  "Official and community apps that give your Grok Bots new tools and skills.";

// The Apps tab is this same route, so it gets its link preview here; the
// Bots tab keeps the site's own (layout.tsx and opengraph-image.tsx).
export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  if ((await searchParams).tab !== "apps") return {};
  const image = {
    url: "/og/apps",
    ...OG_SIZE,
    alt: "Grok Bot Directory: tools and skills for your bots",
  };
  return {
    // The layout's title template only reaches pages in folders below it.
    title: `${APPS_TITLE} · Grok Bot Directory`,
    description: APPS_DESCRIPTION,
    openGraph: {
      type: "website",
      siteName: "Grok Bot Directory",
      title: `${APPS_TITLE} · Grok Bot Directory`,
      description: APPS_DESCRIPTION,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: `${APPS_TITLE} · Grok Bot Directory`,
      description: APPS_DESCRIPTION,
      images: [image],
    },
    alternates: { canonical: "/?tab=apps" },
  };
}

// The headline renders at once so its intro plays from the first paint. Both
// tabs' rows start loading here and stream in behind it, so switching between
// Bots and Apps in the browser has nothing to wait for.
export default async function HomePage({ searchParams }: Props) {
  const { tab, category } = await searchParams;
  // Only a category the directory knows reaches the query, and only when
  // the visit lands on the Apps tab (bot categories use the same parameter).
  const appsCategory =
    tab === "apps" && category && appCategoryLabel(category) ? category : "";
  const bots = listListedBots();
  // The first rows only; the browser fetches the rest when it's asked for.
  const apps = firstAppsPage({ category: appsCategory || null });
  return (
    <div className="shell start">
      <HomeIntro>
        <HomeDirectory bots={bots} apps={apps} appsCategory={appsCategory}>
          {/* Says what this site is, and where the official one is. (The
              getting started guide is under Guides in the header.) */}
          <a
            href="https://x.ai/bot/marketplace"
            target="_blank"
            rel="noopener noreferrer"
            className="announce"
          >
            <b>Community Directory</b>
            <span className="sep"> · </span>Official picks are in the
            Marketplace <span className="arrow">↗</span>
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
        </HomeDirectory>
      </HomeIntro>
    </div>
  );
}
