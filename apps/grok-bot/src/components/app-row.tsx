"use client";

import { grokBotPluginUrl } from "@directories/plugins/apps";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AppListItem } from "@/data/apps";
import { appContents } from "@/lib/app-categories";
import { AppAddLink } from "./app-add-link";
import { AppLogo } from "./app-logo";

export function AppRow({
  app,
  metric,
}: {
  app: AppListItem;
  /** The list's number for this row (adds, or when it was listed). */
  metric?: string;
}) {
  const router = useRouter();
  const href = `/apps/${app.slug}`;
  const contents = appContents(app.mcpServers.length, app.skills.length);
  return (
    // The whole row opens the app; the name is the real link for keyboards
    // and crawlers, and Add stays its own action.
    // biome-ignore lint/a11y/useSemanticElements: a row holding a link and a button can't be one <a>
    <div
      className="row app-row"
      data-testid="app-row"
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => e.key === "Enter" && router.push(href)}
    >
      <div className="row-main">
        <AppLogo name={app.name} logo={app.logo} />
        <div className="row-text">
          <div className="row-title">
            <Link
              href={href}
              className="name"
              onClick={(e) => e.stopPropagation()}
            >
              {app.name}
            </Link>
            {app.marketplaceId && (
              <span
                className="app-badge row-badge"
                data-testid="row-official-badge"
              >
                Official
              </span>
            )}
          </div>
          <p className="row-desc">{app.description}</p>
        </div>
      </div>
      <div className="row-side">
        {contents && <span className="app-contents">{contents}</span>}
        {metric && <span className="metric">{metric}</span>}
        {app.marketplaceId ? (
          <AppAddLink
            slug={app.slug}
            href={grokBotPluginUrl(app.marketplaceId)}
            className="btn btn-gray btn-sm"
          >
            Add
          </AppAddLink>
        ) : (
          <Link
            href={href}
            className="btn btn-gray btn-sm"
            onClick={(e) => e.stopPropagation()}
          >
            View
          </Link>
        )}
      </div>
    </div>
  );
}
