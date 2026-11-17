import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddButton } from "@/components/add-button";
import { DetailBot } from "@/components/bot-art";
import { BotRow } from "@/components/bot-row";
import { MemberAvatar } from "@/components/member-avatar";
import { getListedBot, listListedBots } from "@/data/bots";
import { categoryLabel } from "@/lib/categories";
import { formatAdds, formatRelativeDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const bot = await getListedBot((await params).slug);
  if (!bot) return { title: "Bot not found" };
  return {
    title: bot.name,
    description: bot.description,
    openGraph: {
      type: "article",
      title: `${bot.name} · Grok Bot Directory`,
      description: bot.description,
    },
    twitter: {
      card: "summary_large_image",
      title: `${bot.name} · Grok Bot Directory`,
      description: bot.description,
    },
    alternates: { canonical: `/bots/${bot.slug}` },
  };
}

export default async function BotPage({ params }: Props) {
  const bot = await getListedBot((await params).slug);
  if (!bot) notFound();
  const related = (await listListedBots())
    .filter((b) => b.category === bot.category && b.id !== bot.id)
    .sort(
      (a, b) => b.installsRecent - a.installsRecent || b.installs - a.installs,
    )
    .slice(0, 3);

  return (
    <div className="detail">
      <Link href="/" className="back">
        ‹ Back to directory
      </Link>
      <div>
        <span className="bot-with-avatar">
          <DetailBot
            body={bot.body}
            color={bot.color}
            seed={bot.shareId}
            label={`${bot.name} bot`}
          />
          <MemberAvatar name={bot.creator.name} image={bot.creator.image} />
        </span>
      </div>
      <h1>{bot.name}</h1>
      <div className="byline">
        By{" "}
        {bot.creator.xHandle ? (
          <a
            href={`https://x.com/${bot.creator.xHandle}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {bot.creator.name}
          </a>
        ) : (
          <span>{bot.creator.name}</span>
        )}
        {" · "}
        <Link href={`/?category=${bot.category}`}>
          {categoryLabel(bot.category)}
        </Link>
        {" · "}listed {formatRelativeDate(bot.reviewedAt ?? bot.submittedAt)}
      </div>
      <p className="detail-desc">{bot.description}</p>
      <div className="detail-actions">
        <AddButton
          botId={bot.id}
          slug={bot.slug}
          shareId={bot.shareId}
          className="btn btn-lg"
        >
          Add to Grok Bot
        </AddButton>
        {formatAdds(bot.installs) && (
          <span className="imports" data-testid="install-count">
            {formatAdds(bot.installs)}
          </span>
        )}
      </div>
      {related.length > 0 && (
        <div className="related">
          <div className="section-head">
            <h2>More in {categoryLabel(bot.category)}</h2>
            <Link
              href={`/?category=${bot.category}`}
              className="muted"
              style={{ fontSize: 14 }}
            >
              View all
            </Link>
          </div>
          {related.map((b, i) => (
            <BotRow key={b.id} bot={b} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
