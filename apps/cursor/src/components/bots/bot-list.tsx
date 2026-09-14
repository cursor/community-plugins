"use client";

import Link from "next/link";
import type { BotRow } from "@/lib/bots/types";

export function BotList({ bots }: { bots: BotRow[] }) {
  if (bots.length === 0) {
    return (
      <div className="mt-16 flex flex-col items-center">
        <p className="text-sm text-muted-foreground">No bot use cases yet.</p>
        <Link
          href="/bots/new"
          className="mt-2 border-b border-dashed border-input text-sm text-muted-foreground hover:text-foreground"
        >
          Submit a bot
        </Link>
      </div>
    );
  }

  return (
    <ul className="mx-auto flex w-full max-w-[880px] flex-col gap-3">
      {bots.map((bot) => (
        <li key={bot.id}>
          <Link
            href={`/bots/${bot.slug}`}
            className="block rounded-lg border border-border bg-card p-5 transition-colors hover:border-foreground/20"
          >
            <h2 className="text-base font-medium text-foreground">
              {bot.name}
            </h2>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {bot.description}
            </p>
            {bot.needs.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {bot.needs
                  .map((need) =>
                    need.kind === "plugin"
                      ? `Plugin: ${need.name}`
                      : `Skill: ${need.name}`,
                  )
                  .join(" · ")}
              </p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
