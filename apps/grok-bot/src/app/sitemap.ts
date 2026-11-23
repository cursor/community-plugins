import type { MetadataRoute } from "next";
import { listApps } from "@/data/apps";
import { listListedBots } from "@/data/bots";
import { listCreators } from "@/data/creators";
import { creatorPath } from "@/lib/creator-handle";
import { siteUrl } from "@/lib/og";

// The home page, the Apps tab, every listed bot and app, and the profile of
// every creator who has one listed.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [bots, apps, creators] = await Promise.all([
    listListedBots().catch(() => []),
    listApps().catch(() => []),
    listCreators().catch(() => []),
  ]);
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/?tab=apps`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/whats-new`, changeFrequency: "weekly", priority: 0.3 },
    ...bots.map((bot) => ({
      url: `${base}/bots/${bot.slug}`,
      lastModified: new Date(bot.reviewedAt ?? bot.submittedAt),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...apps.map((app) => ({
      url: `${base}/apps/${app.slug}`,
      lastModified: new Date(app.createdAt),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...creators.map((creator) => ({
      url: `${base}${creatorPath(creator.handle)}`,
      ...(creator.updatedAt
        ? { lastModified: new Date(creator.updatedAt) }
        : {}),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
