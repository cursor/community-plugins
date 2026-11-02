import type { MetadataRoute } from "next";
import { listListedBots } from "@/data/bots";
import { siteUrl } from "@/lib/og";

// The home page and every listed bot.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const bots = await listListedBots().catch(() => []);
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    ...bots.map((bot) => ({
      url: `${base}/bots/${bot.slug}`,
      lastModified: new Date(bot.reviewedAt ?? bot.submittedAt),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
