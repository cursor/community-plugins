"use client";

import Link from "next/link";
import { CopyButton } from "@/components/plugins/detail/copy-button";
import type { BotDetail } from "@/lib/bots/types";

export function BotDetailView({ bot }: { bot: BotDetail }) {
  const plugins = bot.needs.filter((n) => n.kind === "plugin");
  const skills = bot.needs.filter((n) => n.kind === "skill");

  return (
    <div className="min-h-screen px-4 pt-24 md:pt-32">
      <div className="page-shell max-w-4xl px-0 py-8">
        {!bot.active && (
          <div className="mb-6 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            This bot is in the review queue. It is not listed on /bots until an
            admin publishes it.
          </div>
        )}

        <p className="section-eyebrow mb-3">Bot use case</p>
        <h1 className="marketing-page-title mb-3">{bot.name}</h1>
        <p className="marketing-copy mb-10 max-w-2xl">{bot.description}</p>

        <section className="mb-10">
          <h2 className="mb-3 text-sm font-medium text-foreground">
            Copy this template
          </h2>
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Copy the template below.</li>
            <li>Open Cursor agent chat and paste it.</li>
            <li>
              Install the plugins listed on this page if you do not have them.
            </li>
            <li>Give the agent the task (a PR URL, a repo, a file).</li>
          </ol>
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <span className="text-xs text-muted-foreground">Template</span>
              <CopyButton text={bot.template} />
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap p-4 text-sm text-foreground">
              {bot.template}
            </pre>
          </div>
        </section>

        {(plugins.length > 0 || skills.length > 0) && (
          <section className="mb-10">
            <h2 className="mb-3 text-sm font-medium text-foreground">
              Plugins and skills it needs
            </h2>
            <ul className="space-y-2">
              {plugins.map((need) => (
                <li
                  key={`plugin-${need.slug ?? need.name}`}
                  className="flex items-baseline justify-between gap-4 rounded-md border border-border px-4 py-3"
                >
                  <div>
                    <p className="text-sm text-foreground">{need.name}</p>
                    <p className="text-xs text-muted-foreground">Plugin</p>
                  </div>
                  {need.href ? (
                    <Link
                      href={need.href}
                      className="border-b border-dashed border-border text-sm text-muted-foreground hover:text-foreground"
                    >
                      Open listing
                    </Link>
                  ) : need.repository ? (
                    <a
                      href={need.repository}
                      target="_blank"
                      rel="noreferrer"
                      className="border-b border-dashed border-border text-sm text-muted-foreground hover:text-foreground"
                    >
                      Repository
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Not in the directory yet
                    </span>
                  )}
                </li>
              ))}
              {skills.map((need) => (
                <li
                  key={`skill-${need.name}`}
                  className="rounded-md border border-border px-4 py-3"
                >
                  <p className="text-sm text-foreground">{need.name}</p>
                  <p className="text-xs text-muted-foreground">Skill</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-10">
          <h2 className="mb-3 text-sm font-medium text-foreground">Use case</h2>
          <div className="marketing-copy max-w-2xl whitespace-pre-wrap">
            {bot.writeup}
          </div>
        </section>

        {bot.repository && (
          <a
            href={bot.repository}
            target="_blank"
            rel="noreferrer"
            className="border-b border-dashed border-border text-sm text-muted-foreground hover:text-foreground"
          >
            Source repository
          </a>
        )}
      </div>
    </div>
  );
}
