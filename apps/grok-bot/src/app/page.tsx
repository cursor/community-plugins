import Link from "next/link";
import { Suspense } from "react";
import { HeroBot } from "@/components/bot-art";
import { Directory } from "@/components/directory";
import { HomeIntro, IntroWord } from "@/components/home-intro";
import { RowsSkeleton } from "@/components/skeletons";
import { type DirectoryBot, listListedBots } from "@/data/bots";
import { formatCount } from "@/lib/format";

// Listings and install counts change constantly; render per request.
export const dynamic = "force-dynamic";

const FALLBACK_COPY =
  "Bots built by the Grok Bot community, ranked by what’s trending.";

// The hero renders at once so its intro plays from the first paint; only the
// count line and the directory wait for the listings.
export default function HomePage() {
  const bots = listListedBots();
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
            <Suspense fallback={<p className="hero-copy">{FALLBACK_COPY}</p>}>
              <HeroCopy bots={bots} />
            </Suspense>
          </div>
          <div className="intro-cta">
            <Link href="/submit" className="btn btn-lg hero-cta">
              Submit a bot
            </Link>
          </div>
        </div>
        <div className="intro-rest">
          <Suspense
            fallback={
              <div className="section">
                <RowsSkeleton rows={8} />
              </div>
            }
          >
            <BotDirectory bots={bots} />
          </Suspense>
        </div>
      </HomeIntro>
    </div>
  );
}

async function HeroCopy({ bots }: { bots: Promise<DirectoryBot[]> }) {
  const list = await bots;
  const creators = new Set(list.map((b) => b.creator.name)).size;
  return (
    <p className="hero-copy">
      {list.length > 0
        ? `${formatCount(list.length)} bots from ${formatCount(creators)} creators in the Grok Bot community, ranked by what’s trending.`
        : FALLBACK_COPY}
    </p>
  );
}

async function BotDirectory({ bots }: { bots: Promise<DirectoryBot[]> }) {
  return <Directory bots={await bots} />;
}
