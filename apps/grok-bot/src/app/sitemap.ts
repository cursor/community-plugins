import type { MetadataRoute } from "next";
import { listApps } from "@/data/apps";
import { listListedBots } from "@/data/bots";
import { siteUrl } from "@/lib/og";

// The home page, the Apps tab, and every listed bot and app.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [bots, apps] = await Promise.all([
    listListedBots().catch(() => []),
    listApps().catch(() => []),
  ]);
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/?tab=apps`, changeFrequency: "daily", priority: 0.9 },
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
  ];
}
