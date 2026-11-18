import { grokBotPluginUrl } from "@directories/plugins/apps";
import { type AddPart, grokBotAddUrl } from "@directories/plugins/grok-bot-add";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLogo } from "@/components/app-logo";
import { AppRow } from "@/components/app-row";
import { firstAppsPage, getApp } from "@/data/apps";
import {
  appCategoryLabel,
  appContents,
  primaryAppCategory,
} from "@/lib/app-categories";
import { formatRelativeDate } from "@/lib/format";
import { siteUrl } from "@/lib/og";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const OPENS_GROK_BOT = "Opens Grok Bot to add this app";

const titleCase = (text: string) =>
  text.replace(
    /(^|\s)(\p{Ll})/gu,
    (_, space, letter) => space + letter.toUpperCase(),
  );

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const app = await getApp((await params).slug);
  if (!app) return { title: "App not found" };
  return {
    title: app.name,
    description: app.description,
    openGraph: {
      type: "article",
      title: `${app.name} · Grok Bot Directory`,
      description: app.description,
    },
    twitter: {
      card: "summary_large_image",
      title: `${app.name} · Grok Bot Directory`,
      description: app.description,
    },
    alternates: { canonical: `/apps/${app.slug}` },
  };
}

export default async function AppPage({ params }: Props) {
  const app = await getApp((await params).slug);
  if (!app) notFound();
  const category = primaryAppCategory(app.categories);
  // Three others in its category: official ones first, a fresh pick each
  // visit.
  const more = category
    ? await firstAppsPage({ limit: 3, category, exclude: app.id })
    : null;
  const related = more ? [...more.official, ...more.community].slice(0, 3) : [];
  const contents = appContents(app.mcpServers.length, app.skills.length);
  // One message adding every server and skill; null unless all of them can
  // be added (a listed community app always can: see grok_bot_addable).
  const addAll = app.marketplaceId
    ? null
    : grokBotAddUrl(
        app.slug,
        app.components.map(
          (c): AddPart =>
            c.type === "skill"
              ? {
                  type: "skill",
                  name: c.name,
                  slug: c.slug,
                  stored: !!c.content,
                }
              : { type: "mcp_server", name: c.name, setup: c.setup },
        ),
        siteUrl(),
      );

  return (
    <div className="detail">
      <Link href="/?tab=apps" className="back">
        ‹ Back to apps
      </Link>
      <div>
        <AppLogo name={app.name} logo={app.logo} size={72} />
      </div>
      <h1>
        {app.name}
        {app.marketplaceId && (
          <span className="app-badge" data-testid="official-badge">
            Official
          </span>
        )}
      </h1>
      <div className="byline">
        {app.publisher && (
          <>
            By{" "}
            {app.publisherUrl ? (
              <a
                href={app.publisherUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {app.publisher}
              </a>
            ) : (
              <span>{app.publisher}</span>
            )}
            {" · "}
          </>
        )}
        {category && (
          <>
            <Link href={`/?tab=apps&category=${category}`}>
              {appCategoryLabel(category)}
            </Link>
            {" · "}
          </>
        )}
        {!app.marketplaceId && "Community App · "}
        {titleCase(`listed ${formatRelativeDate(app.createdAt)}`)}
      </div>
      <p className="detail-desc">{app.description}</p>
      <div className="detail-actions">
        {app.marketplaceId ? (
          <a
            href={grokBotPluginUrl(app.marketplaceId)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-lg has-tooltip"
            data-tooltip={OPENS_GROK_BOT}
            data-testid="app-add"
          >
            Add to Grok Bot
            <span className="sr-only"> ({OPENS_GROK_BOT})</span>
          </a>
        ) : (
          addAll && (
            <a
              href={addAll}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-lg has-tooltip"
              data-tooltip={OPENS_GROK_BOT}
              data-testid="app-add"
            >
              Add to Grok Bot
              <span className="sr-only"> ({OPENS_GROK_BOT})</span>
            </a>
          )
        )}
        {app.repository && (
          <a
            href={app.repository}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-lg btn-gray"
          >
            Source ↗
          </a>
        )}
        {app.homepage && app.homepage !== app.publisherUrl && (
          <a
            href={app.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-lg btn-gray"
          >
            Website ↗
          </a>
        )}
      </div>

      {contents && (
        <section className="app-parts" aria-labelledby="inside-title">
          <div className="section-head">
            <h2 id="inside-title">What’s inside</h2>
            <span className="muted section-count">{contents}</span>
          </div>
          <ul className="part-list">
            {app.components.map((c) => (
              <li key={`${c.type}:${c.name}`} className="part">
                <span className="part-kind">
                  {c.type === "mcp_server" ? "MCP server" : "Skill"}
                </span>
                <span className="part-name">{c.name}</span>
                {c.description && (
                  <span className="part-desc">{c.description}</span>
                )}
                {c.signIn && (
                  <span className="part-note" data-testid="requires-sign-in">
                    Requires signing in when you add it
                  </span>
                )}
                {c.tools.length > 0 && (
                  <ul className="part-tools" aria-label={`${c.name} tools`}>
                    {c.tools.map((t) => (
                      <li key={t.name} title={t.description || undefined}>
                        {t.name}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {related.length > 0 && category && (
        <div className="related">
          <div className="section-head">
            <h2>More in {appCategoryLabel(category)}</h2>
            <Link
              href={`/?tab=apps&category=${category}`}
              className="muted"
              style={{ fontSize: 14 }}
            >
              View all
            </Link>
          </div>
          {related.map((a) => (
            <AppRow key={a.slug} app={a} />
          ))}
        </div>
      )}
    </div>
  );
}
