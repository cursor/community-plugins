"use client";

import { grokBotPluginUrl } from "@directories/plugins/apps";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DirectoryApp } from "@/data/apps";
import { appContents } from "@/lib/app-categories";
import { AppLogo } from "./app-logo";

export function AppRow({ app }: { app: DirectoryApp }) {
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
            {app.publisher && <span className="by"> by {app.publisher}</span>}
          </div>
          <p className="row-desc">{app.description}</p>
        </div>
      </div>
      <div className="row-side">
        {contents && <span className="app-contents">{contents}</span>}
        {app.marketplaceId ? (
          <a
            href={grokBotPluginUrl(app.marketplaceId)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-gray btn-sm"
            data-testid="app-add"
            onClick={(e) => e.stopPropagation()}
          >
            Add
          </a>
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
