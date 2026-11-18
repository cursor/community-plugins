"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DirectoryBot } from "@/data/bots";
import { creatorPath } from "@/lib/creator-handle";
import { AddButton } from "./add-button";
import { RowBot } from "./bot-art";

export function BotRow({
  bot,
  rank,
  metric,
}: {
  bot: DirectoryBot;
  rank: number;
  metric?: string;
}) {
  const router = useRouter();
  const href = `/bots/${bot.slug}`;
  return (
    // The whole row opens the bot; the name is the real link for keyboards
    // and crawlers, and Add stays its own action.
    // biome-ignore lint/a11y/useSemanticElements: a row holding a link and a button can't be one <a>
    <div
      className="row"
      data-testid="bot-row"
      data-rig-hover
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => e.key === "Enter" && router.push(href)}
    >
      <span className="rank">{rank}</span>
      <div className="row-main">
        <RowBot body={bot.body} color={bot.color} seed={bot.shareId} />
        <div className="row-text">
          <div className="row-title">
            <Link
              href={href}
              className="name"
              onClick={(e) => e.stopPropagation()}
            >
              {bot.name}
            </Link>
            <span className="by">
              {" "}
              by{" "}
              {bot.creator.profile ? (
                <Link
                  href={creatorPath(bot.creator.profile)}
                  data-testid="creator-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  {bot.creator.name}
                </Link>
              ) : (
                bot.creator.name
              )}
            </span>
          </div>
          <p className="row-desc">{bot.description}</p>
        </div>
      </div>
      <div className="row-side">
        {/* Rendered even when empty so the Add buttons line up. */}
        {metric !== undefined && <span className="metric">{metric}</span>}
        <AddButton
          botId={bot.id}
          slug={bot.slug}
          shareId={bot.shareId}
          className="btn btn-gray btn-sm"
        >
          Add
        </AddButton>
      </div>
    </div>
  );
}
