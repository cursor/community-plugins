import type { Metadata } from "next";
import Link from "next/link";

const DESCRIPTION =
  "What Grok Bot Directory is, how it differs from the Marketplace, how to list a bot, and how ranking works.";

export const metadata: Metadata = {
  title: "About",
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
};

// The questions people ask about the directory, answered in one place. Each
// section has an id so a reply can link straight to it.
export default function AboutPage() {
  return (
    <div className="shell page about-page" data-testid="about">
      <h1 className="page-title">About the directory</h1>
      <p className="lede">
        Grok Bot Directory is where the community shares bots and apps for Grok
        Bot. Anyone can submit one.
      </p>

      <section id="marketplace">
        <h2>How it differs from the Marketplace</h2>
        <p>
          The{" "}
          <a
            href="https://x.ai/bot/marketplace"
            target="_blank"
            rel="noopener noreferrer"
          >
            Marketplace
          </a>{" "}
          is the official, curated catalog on x.ai.
        </p>
        <p>
          The Directory is open to everyone. You submit a bot you’ve shared,
          it’s reviewed, and it’s listed. Marketplace bots appear here too.
        </p>
      </section>

      <section id="listing">
        <h2>Listing your bot</h2>
        <p>
          Ask your bot to “Share yourself as a public template”, then paste the
          link on <Link href="/submit">Submit a bot</Link>. Every submission is
          reviewed before it’s listed. Most are listed within minutes; some wait
          for a person to look.
        </p>
        <p>
          On <Link href="/my-bots">Your submissions</Link> you can remove a bot
          or change the name it’s credited to.
        </p>
      </section>

      <section id="ranking">
        <h2>How ranking works</h2>
        <ul>
          <li>
            <b>Trending</b> counts adds in the last 30 days.
          </li>
          <li>
            <b>Most added</b> counts every add since the bot was listed.
          </li>
          <li>
            <b>New</b> shows the latest listings first.
          </li>
        </ul>
        <p>
          An add is counted when someone presses Add to Grok Bot on this site.
          Adds made anywhere else aren’t counted.
        </p>
      </section>

      <section id="adding">
        <h2>Before you add a bot</h2>
        <p>
          Community bots are made by their creators, not by the Grok Bot team,
          and a bot may act on your behalf. Listings are reviewed from their
          public name and description, so read what a bot says it does before
          you add it.
        </p>
      </section>
    </div>
  );
}
