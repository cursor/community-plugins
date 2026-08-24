/**
 * Server-side read queries.
 *
 * Every query here uses the privileged admin client (RLS bypassed), so each
 * function is responsible for its own visibility filtering — e.g.
 * `.eq("public", true)` for user-facing reads. Mutations live in
 * `src/actions`.
 *
 * Caching model (Cache Components): public, non-viewer-specific reads are
 * cached with `"use cache"` and tagged so mutations in `src/actions` can
 * invalidate them (`updateTag`/`revalidateTag`). Viewer-scoped reads (owner
 * checks, per-user lists that must be read-your-own-writes fresh) stay
 * uncached and run inside <Suspense> at request time.
 *
 * Tags:
 *   plugins            — any plugin list/detail data
 *   plugin-{slug}      — a single plugin
 *   users              — member lists and counts
 *   user-{slug}        — a single public profile
 *   followers-{id}     — a user's followers list
 *   following-{id}     — a user's following list
 *   stars-{userId}     — a user's starred plugins
 *   companies          — company lists
 *   company-{slug}     — a single company profile
 *   mcps               — MCP listings
 *   bots               — bot use-case listings
 *   bot-{slug}         — a single bot
 */

import { cacheLife, cacheTag } from "next/cache";
import {
  type BotDetail,
  type BotNeed,
  type BotRow,
  parseBotNeeds,
  parseScanStatus,
  type ResolvedBotNeed,
} from "@/lib/bots/types";
import type { PluginRow } from "@/lib/plugins/types";
import { createClient } from "@/utils/supabase/admin-client";
import { fetchAllPages } from "@/utils/supabase/pagination";

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asBotRow(row: Record<string, unknown>): BotRow {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    description: String(row.description ?? ""),
    writeup: String(row.writeup ?? ""),
    template: String(row.template ?? ""),
    needs: parseBotNeeds(row.needs),
    repository: asOptionalString(row.repository),
    homepage: asOptionalString(row.homepage),
    logo: asOptionalString(row.logo),
    owner_id: asOptionalString(row.owner_id),
    active: Boolean(row.active),
    scan_status: parseScanStatus(row.scan_status),
    discovery_source: asOptionalString(row.discovery_source),
    github_repo_id: asOptionalNumber(row.github_repo_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function resolveBotNeeds(needs: BotNeed[]): Promise<ResolvedBotNeed[]> {
  const slugs = needs.flatMap((n) =>
    n.kind === "plugin" && n.slug ? [n.slug] : [],
  );
  const hrefBySlug = new Map<string, string>();

  if (slugs.length > 0) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("plugins")
      .select("slug")
      .eq("active", true)
      .in("slug", slugs);
    for (const plugin of data ?? []) {
      hrefBySlug.set(plugin.slug, `/plugins/${plugin.slug}`);
    }
  }

  return needs.map((need) => {
    if (need.kind === "skill") return need;
    return {
      ...need,
      href: need.slug ? (hrefBySlug.get(need.slug) ?? null) : null,
    };
  });
}

async function fetchUserProfile(slug: string, userId?: string) {
  const supabase = await createClient();

  const query = supabase
    .from("users")
    .select(
      "id, name, image, hero, status, bio, work, website, slug, social_x_link, created_at, public, follow_email, is_ambassador, is_following, follower_count, following_count",
    )
    .eq("slug", slug);

  if (userId) {
    query.eq("id", userId);
  } else {
    query.eq("public", true);
  }

  const { data } = await query.single();

  if (!data) {
    return {
      data: null,
    };
  }

  const isOwner = userId && data.id === userId;

  return {
    data: {
      ...data,
      follow_email: isOwner ? data.follow_email : undefined,
      following_count: data?.following_count || 0,
      followers_count: data?.follower_count || 0,
    },
  };
}

async function getPublicUserProfile(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("users", `user-${slug}`);
  return fetchUserProfile(slug);
}

export async function getUserProfile(slug: string, userId?: string) {
  // Owner reads (settings, own-profile views) must be fresh and include
  // private fields, so only the public variant is cached.
  if (userId) return fetchUserProfile(slug, userId);
  return getPublicUserProfile(slug);
}

export async function getUserFollowers(id: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`followers-${id}`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("followers")
    .select("follower:follower_id(id, name, image, slug)")
    .eq("following_id", id);

  return { data, error };
}

export async function getUserFollowing(id: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`following-${id}`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("followers")
    .select("following:following_id(id, name, image, slug)")
    .eq("follower_id", id);

  return { data, error };
}

async function fetchCompanyProfile(slug: string, userId?: string) {
  const supabase = await createClient();
  const query = supabase
    .from("companies")
    .select(
      "id, name, slug, image, location, bio, website, social_x_link, hero, public, owner_id, created_at",
    )
    .eq("slug", slug);

  if (userId) {
    query.eq("owner_id", userId);
  }

  const { data, error } = await query.single();

  return { data, error };
}

async function getPublicCompanyProfile(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("companies", `company-${slug}`);
  return fetchCompanyProfile(slug);
}

export async function getCompanyProfile(slug: string, userId?: string) {
  // Owner reads stay uncached so edits are immediately visible.
  if (userId) return fetchCompanyProfile(slug, userId);
  return getPublicCompanyProfile(slug);
}

export async function getUserCompanies(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, name, slug, image, location, bio, website, social_x_link, hero, public, owner_id, created_at",
    )
    .eq("owner_id", userId);

  return { data, error };
}

async function fetchUserPlugins(
  userId: string,
  { includeInactive = false }: { includeInactive?: boolean } = {},
) {
  const supabase = await createClient();
  let query = supabase
    .from("plugins")
    .select("*, plugin_components(*)")
    .eq("owner_id", userId);

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query
    .order("install_count", { ascending: false })
    .order("created_at", { ascending: false });

  return { data: data as PluginRow[] | null, error };
}

async function getPublicUserPlugins(userId: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("plugins");
  return fetchUserPlugins(userId);
}

export async function getUserPlugins(
  userId: string,
  { includeInactive = false }: { includeInactive?: boolean } = {},
) {
  // Owner views include inactive plugins and must reflect publish/delete
  // actions immediately, so only the public variant is cached.
  if (includeInactive) return fetchUserPlugins(userId, { includeInactive });
  return getPublicUserPlugins(userId);
}

export async function getCompanies() {
  "use cache";
  cacheLife("hours");
  cacheTag("companies");

  const supabase = await createClient();

  return fetchAllPages((from, to) =>
    supabase
      .from("companies")
      .select("id, name, slug, image, location")
      .order("created_at", { ascending: false })
      .range(from, to),
  );
}

export async function getFeaturedMCPs({
  onlyPremium,
}: {
  onlyPremium?: boolean;
} = {}) {
  "use cache";
  cacheLife("hours");
  cacheTag("mcps");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mcps")
    .select("*")
    .limit(100)
    .order("created_at", { ascending: false })
    .order("order", { ascending: false })
    .eq("active", true)
    .or(onlyPremium ? "plan.eq.premium" : "plan.eq.featured,plan.eq.premium");

  return {
    // Shuffle so featured placement rotates between cache revalidations.
    data: data?.sort(() => Math.random() - 0.5),
    error,
  };
}

export async function getTotalUsers() {
  "use cache";
  // Mirrors the old `revalidate = 300` behavior on the members page.
  cacheLife({ stale: 300, revalidate: 300, expire: 86400 });
  cacheTag("users");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("count", { count: "exact" })
    .single();

  return { data, error };
}

export async function getNewUsers() {
  "use cache";
  cacheLife("hours");
  cacheTag("users");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("slug, name, image")
    .eq("public", true)
    .order("created_at", { ascending: false })
    .limit(24);

  return { data, error };
}

export async function getMCPs({
  page = 1,
  limit = 36,
  fetchAll = false,
}: {
  page?: number;
  limit?: number;
  fetchAll?: boolean;
} = {}) {
  "use cache";
  cacheLife("hours");
  cacheTag("mcps");

  const supabase = await createClient();

  const baseQuery = () =>
    supabase
      .from("mcps")
      .select("*")
      .eq("active", true)
      .order("company_id", { ascending: true, nullsFirst: false });

  if (fetchAll) {
    return fetchAllPages((from, to) => baseQuery().range(from, to), 100);
  }

  const { data, error } = await baseQuery()
    .limit(limit)
    .range((page - 1) * limit, page * limit - 1);

  return { data, error };
}

export async function getRecentMCPs({ limit = 8 }: { limit?: number } = {}) {
  "use cache";
  cacheLife("hours");
  cacheTag("mcps");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mcps")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  return { data, error };
}

export async function getMCPBySlug(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("mcps", `mcp-${slug}`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mcps")
    .select("*")
    .eq("slug", slug)
    .single();

  return { data, error };
}

// ---------------------------------------------------------------------------
// Plugins (Open Plugins spec)
// ---------------------------------------------------------------------------

export async function getPlugins({
  page = 1,
  limit = 36,
  fetchAll = false,
}: {
  page?: number;
  limit?: number;
  fetchAll?: boolean;
} = {}): Promise<{ data: PluginRow[] | null; error: unknown }> {
  "use cache";
  cacheLife("hours");
  cacheTag("plugins");

  const supabase = await createClient();

  const baseQuery = () =>
    supabase
      .from("plugins")
      .select("*, plugin_components(*)")
      .eq("active", true)
      .order("created_at", { ascending: false });

  if (fetchAll) {
    return fetchAllPages<PluginRow>(async (from, to) => {
      const { data, error } = await baseQuery().range(from, to);
      return { data: data as PluginRow[] | null, error };
    }, 100);
  }

  const { data, error } = await baseQuery()
    .limit(limit)
    .range((page - 1) * limit, page * limit - 1);

  return { data: data as PluginRow[] | null, error };
}

// Slugs of every `rule` component on an active plugin. Legacy rule URLs
// (`/{rule-slug}`) prerender a redirect to the parent plugin, and there are
// thousands of them — they need a slugs-only query. Building the list from
// `getPlugins({ fetchAll: true })` (full table, all columns, serial pages)
// inside every prerendering page caused `USE_CACHE_TIMEOUT` build failures.
export async function getRuleRedirectSlugs() {
  "use cache";
  cacheLife("hours");
  cacheTag("plugins");

  const supabase = await createClient();

  return fetchAllPages<{ slug: string }>((from, to) =>
    supabase
      .from("plugin_components")
      .select("slug, plugins!inner(id)")
      .eq("type", "rule")
      .eq("plugins.active", true)
      .order("id", { ascending: true })
      .range(from, to),
  );
}

// Resolves a legacy rule slug to the slug of the active plugin that contains
// it. The newest plugin wins when several contain the same rule slug,
// matching the old redirect map that was built from a newest-first plugin
// list. Cached per slug, so each redirect page fills a tiny cache entry
// instead of waiting on the full-table plugins fetch.
export async function getRuleRedirectTarget(ruleSlug: string): Promise<{
  data: string | null;
  error: unknown;
}> {
  "use cache";
  cacheLife("hours");
  cacheTag("plugins");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plugin_components")
    .select("plugins!inner(slug, created_at)")
    .eq("type", "rule")
    .eq("slug", ruleSlug)
    .eq("plugins.active", true);

  if (error) return { data: null, error };

  const newest = (data ?? [])
    .map(
      (row) =>
        row.plugins as unknown as { slug: string; created_at: string } | null,
    )
    .filter((plugin) => plugin !== null)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];

  return { data: newest?.slug ?? null, error: null };
}

// Returns a Map<plugin_id, installs in last `windowDays` days>, derived
// from `plugin_install_snapshots` via the `plugin_install_velocity` SQL
// function. Plugins with no snapshot history yet (or no fresh installs)
// will simply be absent from the map; callers should default to 0.
export async function getPluginInstallVelocity(windowDays = 30): Promise<{
  data: Map<string, number> | null;
  error: unknown;
}> {
  "use cache";
  cacheLife("hours");
  cacheTag("plugins");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("plugin_install_velocity", {
    window_days: windowDays,
  });

  if (error) return { data: null, error };

  const map = new Map<string, number>();
  for (const row of (data ?? []) as {
    plugin_id: string;
    installs_window: number;
  }[]) {
    map.set(row.plugin_id, row.installs_window);
  }
  return { data: map, error: null };
}

export async function getPluginBySlug(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("plugins", `plugin-${slug}`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plugins")
    .select("*, plugin_components(*)")
    .eq("slug", slug)
    .single();

  return { data: data as PluginRow | null, error };
}

export async function getPendingPlugins() {
  const supabase = await createClient();

  return fetchAllPages<PluginRow>(async (from, to) => {
    const { data, error } = await supabase
      .from("plugins")
      .select("*, plugin_components(*)")
      .eq("active", false)
      .order("created_at", { ascending: false })
      .range(from, to);
    return { data: data as PluginRow[] | null, error };
  }, 100);
}

export async function getFlaggedPlugins() {
  const supabase = await createClient();
  const severityRank = { high: 0, medium: 1, low: 2 } as const;

  const { data, error } = await supabase
    .from("plugins")
    .select("*, plugin_components(*)")
    .eq("scan_status", "flagged")
    .order("flagged_at", { ascending: false, nullsFirst: false })
    .limit(500);

  if (error) return { data: null as PluginRow[] | null, error };

  const sorted = (data as PluginRow[] | null)?.slice().sort((a, b) => {
    const aRank = a.flag_severity ? severityRank[a.flag_severity] : 3;
    const bRank = b.flag_severity ? severityRank[b.flag_severity] : 3;
    if (aRank !== bRank) return aRank - bRank;
    const aTime = a.flagged_at ? new Date(a.flagged_at).getTime() : 0;
    const bTime = b.flagged_at ? new Date(b.flagged_at).getTime() : 0;
    return bTime - aTime;
  });

  return { data: sorted ?? null, error: null };
}

export async function getPendingVerificationRequests() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plugins")
    .select("*, plugin_components(*)")
    .not("verification_requested_at", "is", null)
    .eq("verified", false)
    .order("verification_requested_at", { ascending: false, nullsFirst: false })
    .limit(500);

  return { data: data as PluginRow[] | null, error };
}

export async function getStuckScans() {
  const supabase = await createClient();
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("plugins")
    .select("*, plugin_components(*)")
    .or(
      `scan_status.eq.error,and(scan_status.in.(pending,scanning),created_at.lt.${fifteenMinutesAgo})`,
    )
    .order("created_at", { ascending: false })
    .limit(200);

  return { data: data as PluginRow[] | null, error };
}

export async function getStarredPlugins(userId: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("plugins", `stars-${userId}`);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plugin_stars")
    .select("plugin:plugin_id(*, plugin_components(*))")
    .eq("user_id", userId);

  // Without generated DB types, supabase-js can't tell this embedded
  // resource is to-one, so the inferred shape needs correcting.
  const rows = (data ?? []) as unknown as Array<{ plugin: PluginRow | null }>;
  const plugins = rows
    .map((row) => row.plugin)
    .filter((plugin): plugin is PluginRow => Boolean(plugin));

  return { data: plugins, error };
}

export async function hasUserStarredPlugin(pluginId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("plugin_stars")
    .select("plugin_id")
    .eq("plugin_id", pluginId)
    .eq("user_id", userId)
    .maybeSingle();

  return !!data;
}

type GetMembersParams = {
  page?: number;
  limit?: number;
  q?: string;
  ambassadorsOnly?: boolean;
};

export async function getMembers({
  page = 1,
  limit = 33,
  q,
  ambassadorsOnly = false,
}: GetMembersParams = {}) {
  "use cache";
  // Mirrors the old `revalidate = 300` behavior on the members page.
  cacheLife({ stale: 300, revalidate: 300, expire: 86400 });
  cacheTag("users");

  const supabase = await createClient();
  const query = supabase
    .from("users")
    .select("id, name, image, slug, follower_count, is_ambassador")
    .eq("public", true)
    .order("created_at", { ascending: false })
    .limit(limit)
    .range((page - 1) * limit, page * limit - 1)
    .neq("name", "unknown user");

  if (ambassadorsOnly) {
    query.eq("is_ambassador", true);
  }

  if (q) {
    query.textSearch("name", q, {
      type: "websearch",
      config: "english",
    });
  }

  const { data, error } = await query;

  return { data, error };
}

// ---------------------------------------------------------------------------
// Bots (use-case listings)
// ---------------------------------------------------------------------------

export async function getBots({
  fetchAll = true,
}: {
  fetchAll?: boolean;
} = {}): Promise<{ data: BotRow[] | null; error: unknown }> {
  "use cache";
  cacheLife("hours");
  cacheTag("bots");

  const supabase = await createClient();

  const baseQuery = () =>
    supabase
      .from("bots")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false });

  if (fetchAll) {
    const result = await fetchAllPages<Record<string, unknown>>(
      async (from, to) => {
        const { data, error } = await baseQuery().range(from, to);
        return { data: data as Record<string, unknown>[] | null, error };
      },
      100,
    );
    if (result.error || !result.data) {
      return { data: null, error: result.error };
    }
    return {
      data: result.data.map(asBotRow),
      error: null,
    };
  }

  const { data, error } = await baseQuery();
  return {
    data: (data ?? []).map((row) => asBotRow(row as Record<string, unknown>)),
    error,
  };
}

export async function getBotBySlug(slug: string): Promise<{
  data: BotDetail | null;
  error: unknown;
}> {
  "use cache";
  cacheLife("hours");
  cacheTag("bots", `bot-${slug}`, "plugins");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bots")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!data) return { data: null, error };

  const bot = asBotRow(data as Record<string, unknown>);
  return {
    data: { ...bot, needs: await resolveBotNeeds(bot.needs) },
    error,
  };
}

export async function getPendingBots(): Promise<{
  data: BotRow[] | null;
  error: unknown;
}> {
  const supabase = await createClient();

  const result = await fetchAllPages<Record<string, unknown>>(
    async (from, to) => {
      const { data, error } = await supabase
        .from("bots")
        .select("*")
        .eq("active", false)
        .order("created_at", { ascending: false })
        .range(from, to);
      return { data: data as Record<string, unknown>[] | null, error };
    },
    100,
  );

  if (result.error || !result.data) {
    return { data: null, error: result.error };
  }

  return {
    data: result.data.map(asBotRow),
    error: null,
  };
}
