import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { AppRow } from "@/components/app-row";
import { BotRow } from "@/components/bot-row";
import { CopyLink } from "@/components/copy-link";
import { MemberAvatar } from "@/components/member-avatar";
import { getCreatorProfile } from "@/data/creators";
import { creatorPath, listingCounts } from "@/lib/creator-handle";
import { formatAddCount } from "@/lib/format";

// A creator's public profile: their listed bots and apps on one page they
// can share. Only what's listed appears; see getCreatorProfile.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ handle: string }> };

/** The handle as written in the address ("%40name" for "@name"). */
async function handleIn(params: Props["params"]): Promise<string> {
  const { handle } = await params;
  try {
    return decodeURIComponent(handle);
  } catch {
    return handle;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getCreatorProfile(await handleIn(params));
  if (!profile) return { title: "Creator not found" };
  const { creator, bots, apps } = profile;
  const title = creator.xHandle
    ? `${creator.name} (@${creator.xHandle})`
    : creator.name;
  const description = `${listingCounts(bots.length, apps.length)} for Grok Bot by ${creator.name}.`;
  return {
    title,
    description,
    openGraph: {
      type: "profile",
      title: `${title} · Grok Bot Directory`,
      description,
      url: creatorPath(creator.handle),
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · Grok Bot Directory`,
      description,
      ...(creator.xHandle ? { creator: `@${creator.xHandle}` } : {}),
    },
    alternates: { canonical: creatorPath(creator.handle) },
  };
}

export default async function CreatorPage({ params }: Props) {
  const handle = await handleIn(params);
  const profile = await getCreatorProfile(handle);
  if (!profile) notFound();
  const { creator, bots, apps } = profile;
  // One address per creator: a profile slug or an X handle without its "@"
  // goes to the handle they're listed under.
  if (creator.handle !== handle) permanentRedirect(creatorPath(creator.handle));

  return (
    <div className="detail creator" data-testid="creator-profile">
      <Link href="/" className="back">
        ‹ Back to directory
      </Link>
      <div className="creator-head">
        <MemberAvatar name={creator.name} image={creator.image} size={72} />
        <div className="creator-who">
          <h1>{creator.name}</h1>
          <div className="byline">
            {creator.xHandle && (
              <>
                <a
                  href={`https://x.com/${creator.xHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  @{creator.xHandle}
                </a>
                {" · "}
              </>
            )}
            <span data-testid="creator-counts">
              {listingCounts(bots.length, apps.length)}
            </span>
          </div>
        </div>
        <CopyLink url={creatorPath(creator.handle)} />
      </div>
      {bots.length > 0 && (
        <section className="creator-list" aria-labelledby="creator-bots">
          <div className="section-head">
            <h2 id="creator-bots">Bots</h2>
          </div>
          {bots.map((bot, i) => (
            <BotRow
              key={bot.id}
              bot={bot}
              rank={i + 1}
              metric={formatAddCount(bot.installs)}
            />
          ))}
        </section>
      )}
      {apps.length > 0 && (
        <section className="creator-list" aria-labelledby="creator-apps">
          <div className="section-head">
            <h2 id="creator-apps">Apps</h2>
          </div>
          {apps.map((app) => (
            <AppRow key={app.slug} app={app} />
          ))}
        </section>
      )}
    </div>
  );
}
