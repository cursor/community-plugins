import { grokBotPluginUrl } from "@directories/plugins/apps";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLogo } from "@/components/app-logo";
import { AppRow } from "@/components/app-row";
import { CopyButton } from "@/components/copy-button";
import { type AppDetail, getApp, listApps } from "@/data/apps";
import {
  appCategoryLabel,
  appContents,
  primaryAppCategory,
} from "@/lib/app-categories";
import { formatRelativeDate } from "@/lib/format";
import { parseMcpSetup } from "@/lib/mcp-config";

export const dynamic = "force-dynamic";

const CURSOR_DIRECTORY_URL = "https://cursor.directory";

type Props = { params: Promise<{ slug: string }> };

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
  const related = category
    ? (await listApps())
        .filter((a) => a.categories.includes(category) && a.id !== app.id)
        .slice(0, 3)
    : [];
  const contents = appContents(app.mcpServers.length, app.skills.length);

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
        {app.marketplaceId ? "Official app" : "Community app"}
        {" · "}listed {formatRelativeDate(app.createdAt)}
      </div>
      <p className="detail-desc">{app.description}</p>
      <div className="detail-actions">
        {app.marketplaceId ? (
          <a
            href={grokBotPluginUrl(app.marketplaceId)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-lg"
            data-testid="app-add"
          >
            Add to Grok Bot
          </a>
        ) : (
          <a href="#set-up" className="btn btn-lg">
            Set up in Grok Bot
          </a>
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
              </li>
            ))}
          </ul>
        </section>
      )}

      {!app.marketplaceId && <SetUp app={app} />}

      {app.onCursorDirectory && (
        <p className="app-elsewhere muted">
          Also on{" "}
          <a
            href={`${CURSOR_DIRECTORY_URL}/plugins/${app.slug}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            cursor.directory
          </a>
          , where it’s a Cursor plugin.
        </p>
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
            <AppRow key={a.id} app={a} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Community apps aren't in the Cursor Marketplace, so there's no one-click
 * add: each MCP server is added to Grok Bot as a custom MCP server.
 */
function SetUp({ app }: { app: AppDetail }) {
  const servers = app.components.filter((c) => c.type === "mcp_server");
  const skills = app.components.filter((c) => c.type === "skill");
  return (
    <section id="set-up" className="app-setup" aria-labelledby="setup-title">
      <div className="section-head">
        <h2 id="setup-title">Set up in Grok Bot</h2>
      </div>
      {servers.length > 0 && (
        <p className="setup-lede">
          In Grok Bot, add a custom MCP server for each server below, using its
          settings. Values like API keys are yours to fill in.
        </p>
      )}
      {servers.map((c) => {
        const setup = parseMcpSetup(c.name, c.content);
        return (
          <div className="setup-server" key={c.name} data-testid="setup-server">
            <h3>{c.name}</h3>
            {setup?.kind === "remote" && (
              <dl className="setup-fields">
                <dt>Server URL</dt>
                <dd>
                  <code>{setup.url}</code>
                  <CopyButton text={setup.url} />
                </dd>
                {setup.headers.length > 0 && (
                  <>
                    <dt>Headers</dt>
                    <dd>
                      <code>{setup.headers.join(", ")}</code>
                    </dd>
                  </>
                )}
              </dl>
            )}
            {setup?.kind === "local" && (
              <dl className="setup-fields">
                <dt>Command</dt>
                <dd>
                  <code>{[setup.command, ...setup.args].join(" ")}</code>
                  <CopyButton text={[setup.command, ...setup.args].join(" ")} />
                </dd>
                {setup.env.length > 0 && (
                  <>
                    <dt>Environment</dt>
                    <dd>
                      <code>{setup.env.join(", ")}</code>
                    </dd>
                  </>
                )}
              </dl>
            )}
            {setup ? (
              <details className="setup-json">
                <summary>Full config</summary>
                <div className="code-block">
                  <pre>{setup.json}</pre>
                  <CopyButton text={setup.json} />
                </div>
              </details>
            ) : (
              <p className="muted">
                This server’s settings aren’t listed here.
                {app.repository && (
                  <>
                    {" "}
                    See the{" "}
                    <a
                      href={app.repository}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      repository
                    </a>{" "}
                    for how to run it.
                  </>
                )}
              </p>
            )}
          </div>
        );
      })}
      {skills.length > 0 && (
        <p className="setup-lede">
          {skills.length === 1 ? "Its skill ships" : "Its skills ship"} with the
          app’s source
          {app.repository ? (
            <>
              {" "}
              in{" "}
              <a
                href={app.repository}
                target="_blank"
                rel="noopener noreferrer"
              >
                its repository
              </a>
            </>
          ) : null}
          .
        </p>
      )}
    </section>
  );
}
