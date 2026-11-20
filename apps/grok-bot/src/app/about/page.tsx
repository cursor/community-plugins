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
          reviewed against the <a href="#rules">listing rules</a> before it’s
          listed. Most are listed within minutes; some wait for a person to
          look.
        </p>
        <p>
          On <Link href="/my-bots">Your submissions</Link> you can remove a bot
          or change the name it’s credited to.
        </p>
      </section>

      <section id="rules" data-testid="listing-rules">
        <h2>Listing rules</h2>
        <p>We don’t list bots or apps that:</p>
        <ul className="rules">
          <li>copy one that’s already listed</li>
          <li>
            use the name of a real person or another company’s product as their
            own
          </li>
          <li>track or monitor other people without their knowledge</li>
          <li>mislead people about what they do or who made them</li>
          <li>
            are made to get around an AI model’s safety rules (jailbreaks)
          </li>
          <li>are spam, adult content, or built to cause harm</li>
        </ul>
        <p>
          A bot’s description is shown to people. Say what the bot does and who
          it’s for, and don’t write it as instructions to the bot.
        </p>
        <p>
          If we decline a bot, you’ll see why on{" "}
          <Link href="/my-bots">Your submissions</Link> and can submit it again
          once it’s fixed.
        </p>
        <p>
          We can decline or remove any listing at our discretion. A listing
          isn’t an endorsement: community bots and apps are made by their
          creators, not by the Grok Bot team.
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
        <p>
          Apps rank the same way by installs, which include installs into Cursor
          from cursor.directory.
        </p>
      </section>

      <section id="adding">
        <h2>Before you add a bot or app</h2>
        <p>
          Community bots and apps are made by their creators, not by the Grok
          Bot team. A bot may act on your behalf, and an app can read and change
          whatever you connect it to.
        </p>
        <p>
          Bots are reviewed from their public name and description, so read what
          a bot says it does before you add it.
        </p>
        <p>
          Apps get an automated security scan before they’re listed. When an app
          runs on its publisher’s server, the scan can’t see what that server
          does with your data once you connect, so only add apps from publishers
          you trust.
        </p>
        <p>
          You add and use community bots and apps at your own risk. We aren’t
          responsible for what they do.
        </p>
      </section>
    </div>
  );
}
