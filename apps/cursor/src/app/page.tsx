import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import type { LeaderboardItem } from "@/components/plugins/plugin-leaderboard";
import { Startpage } from "@/components/startpage";
import {
  getPluginInstallVelocity,
  getPluginListing,
  getTotalUsers,
} from "@/data/queries";

export const metadata: Metadata = {
  title: "Cursor Directory - Plugins for Cursor",
  description: "Discover plugins built by the Cursor community.",
  openGraph: {
    title: "Cursor Directory - Plugins for Cursor",
    description: "Discover plugins built by the Cursor community.",
  },
  twitter: {
    title: "Cursor Directory - Plugins for Cursor",
    description: "Discover plugins built by the Cursor community.",
  },
};

function toLeaderboardItem(
  p: NonNullable<Awaited<ReturnType<typeof getPluginListing>>["data"]>[number],
  installs30d: number,
): LeaderboardItem {
  return {
    name: p.name,
    slug: p.slug,
    description: p.description ?? "",
    logo: p.logo,
    author: p.author_name,
    authorUrl: p.author_url,
    verified: p.verified,
    official: !!p.marketplace_plugin_id,
    installCount: p.install_count,
    installs30d,
    starCount: p.star_count,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    permanentlyBlocked: p.permanently_blocked,
    flagSeverity: p.flag_severity,
    scanStatus: p.scan_status,
    href: `/plugins/${p.slug}`,
  };
}

/**
 * The entire page is cached (stale-while-revalidate): served from the static
 * shell, refreshed in the background hourly, and expired immediately when
 * actions invalidate the `plugins`/`users` tags (installs, stars, plugin
 * mutations). The `?q=` search filter is client-only state (see
 * `nuqs-static-adapter`), so nothing here defers to request time. The
 * hourly background revalidation also covers pg_cron snapshot drift in the
 * install-velocity leaderboard (20260514_plugin_install_snapshots).
 */
export default async function Page() {
  "use cache";
  cacheLife("hours");
  cacheTag("plugins", "users");

  const [
    { data: totalUsers },
    { data: allPluginsData },
    { data: velocityMap },
  ] = await Promise.all([
    getTotalUsers(),
    getPluginListing(),
    getPluginInstallVelocity(30),
  ]);

  const velocity = velocityMap ?? new Map<string, number>();
  const leaderboardItems = (allPluginsData ?? []).map((p) =>
    toLeaderboardItem(p, velocity.get(p.id) ?? 0),
  );

  // Captured inside the cache scope so leaderboard age math is deterministic
  // during prerendering; refreshes with each cache revalidation.
  const generatedAt = Date.now();

  return (
    <div className="min-h-screen w-full">
      <div className="w-full">
        <Startpage
          leaderboardItems={leaderboardItems}
          totalUsers={totalUsers?.count ?? 0}
          generatedAt={generatedAt}
        />
      </div>
    </div>
  );
}
