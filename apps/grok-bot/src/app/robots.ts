import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/og";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Account, admin and API routes have nothing to index.
      disallow: ["/admin", "/my-bots", "/submit", "/login", "/auth/", "/api/"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
