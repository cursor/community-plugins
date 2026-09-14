import type { MetadataRoute } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { getBots, getCompanies, getPlugins } from "@/data/queries";

const BASE_URL = "https://cursor.directory";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("hours");
  cacheTag("plugins", "companies", "bots");

  const routes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${BASE_URL}/learn`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/bots`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/members`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/members/ambassadors`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/members/companies`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  const { data: plugins } = await getPlugins({ fetchAll: true });
  if (plugins) {
    for (const plugin of plugins) {
      routes.push({
        url: `${BASE_URL}/plugins/${plugin.slug}`,
        lastModified: new Date(plugin.updated_at),
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  }

  const { data: bots } = await getBots({ fetchAll: true });
  if (bots) {
    for (const bot of bots) {
      routes.push({
        url: `${BASE_URL}/bots/${bot.slug}`,
        lastModified: new Date(bot.updated_at),
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  }

  const { data: companyData } = await getCompanies();
  if (companyData) {
    for (const company of companyData) {
      routes.push({
        url: `${BASE_URL}/c/${company.slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }
  }

  return routes;
}
