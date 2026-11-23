import "server-only";

import { appCategories, worksInGrokBot } from "@directories/plugins/apps";
import { type McpSetup, parseMcpSetup } from "@directories/plugins/mcp-config";
import { cache } from "react";
import { type AppSource, appSource } from "@/lib/app-source";
import { cached } from "@/lib/data-cache";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";
import { allRows } from "@/utils/supabase/all-rows";

/**
 * Apps are cursor.directory's plugins under Grok Bot's name: the same rows in
 * the shared Supabase project, limited to the ones Grok Bot can use. Official
 * apps come from the Cursor Marketplace (imported by cursor.directory's
 * daily sync); the rest are community plugins.
 */
export type DirectoryApp = {
  id: string;
  slug: string;
  name: string;
  description: string;
  logo: string | null;
  publisher: string | null;
  publisherUrl: string | null;
  homepage: string | null;
  repository: string | null;
  /** The Cursor Marketplace id; set for official apps. */
  marketplaceId: string | null;
  categories: string[];
  createdAt: string;
  mcpServers: string[];
  skills: string[];
  /**
   * The plugin's installs: cursor.directory's count, which "Add to Grok
   * Bot" here adds to.
   */
  installs: number;
  /** Installs in the last 30 days, for Trending. */
  installsRecent: number;
};

/**
 * What a row in the Apps list shows and searches. The Apps tab sends every
 * app to the browser, so rows carry only this.
 */
export type AppListItem = Pick<
  DirectoryApp,
  | "slug"
  | "name"
  | "description"
  | "logo"
  | "publisher"
  | "marketplaceId"
  | "categories"
  | "mcpServers"
  | "skills"
  | "createdAt"
  | "installs"
  | "installsRecent"
>;

const LIST_DESCRIPTION_CHARS = 200;

export function toAppListItem(app: DirectoryApp): AppListItem {
  const description =
    app.description.length > LIST_DESCRIPTION_CHARS
      ? `${app.description.slice(0, LIST_DESCRIPTION_CHARS).trimEnd()}…`
      : app.description;
  return {
    slug: app.slug,
    name: app.name,
    description,
    logo: app.logo,
    publisher: app.publisher,
    marketplaceId: app.marketplaceId,
    categories: app.categories,
    mcpServers: app.mcpServers,
    skills: app.skills,
    createdAt: app.createdAt,
    installs: app.installs,
    installsRecent: app.installsRecent,
  };
}

export type AppComponent = {
  type: string;
  name: string;
  slug: string;
  description: string | null;
  /** The MCP server's config (JSON) or the skill's SKILL.md body. */
  content: string | null;
  /** How to add the MCP server, when its stored config can be read. */
  setup: McpSetup | null;
  /** Tools a remote server listed when it was submitted. */
  tools: { name: string; description: string }[];
  /** The server asked for an OAuth sign-in when it was submitted. */
  signIn: boolean;
};

export type AppDetail = DirectoryApp & {
  components: AppComponent[];
  /** The member who submitted it, when it's a community app. */
  ownerId: string | null;
  /** Nobody owns it yet, and there's a source its maker can prove is theirs. */
  claimable: boolean;
};

type AppRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo: string | null;
  author_name: string | null;
  author_url: string | null;
  homepage: string | null;
  repository: string | null;
  marketplace_plugin_id: string | null;
  categories: string[] | null;
  created_at: string;
  mcp_servers: string[] | null;
  skills: string[] | null;
  installs?: number | null;
  installs_recent?: number | null;
};

function toApp(row: AppRow): DirectoryApp {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    logo: row.logo,
    publisher: row.author_name,
    publisherUrl: row.author_url,
    homepage: row.homepage,
    repository: row.repository,
    marketplaceId: row.marketplace_plugin_id,
    categories: row.categories ?? [],
    createdAt: row.created_at,
    mcpServers: row.mcp_servers ?? [],
    skills: row.skills ?? [],
    installs: row.installs ?? 0,
    installsRecent: row.installs_recent ?? 0,
  };
}

export type AppsFirstPage = {
  /** The first rows, in Trending order. */
  apps: AppListItem[];
  /** How many there are in all, in the category when one was asked for. */
  total: number;
  /** Every app, whatever the category. */
  allTotal: number;
};

/**
 * The first rows of the Apps list in Trending order, with the totals, so a
 * page doesn't load every app to show a few (`grok_bot_apps_page()` in SQL).
 */
export function firstAppsPage({
  limit = 60,
  category = null,
}: {
  limit?: number;
  category?: string | null;
} = {}): Promise<AppsFirstPage> {
  return appsFirstPage(limit, category);
}

const RELATED_APPS = 3;

/**
 * The most added apps in `category` other than the app at `slug`, for an app
 * page. It reads one row more than it shows and drops the page's own app
 * here, so every app page in a category shares one cached query.
 */
export async function relatedApps(
  category: string,
  slug: string,
): Promise<AppListItem[]> {
  const { apps } = await appsFirstPage(RELATED_APPS + 1, category);
  return apps.filter((app) => app.slug !== slug).slice(0, RELATED_APPS);
}

const appsFirstPage = cached("apps-first-page", ["apps"], loadAppsFirstPage);

async function loadAppsFirstPage(
  limit: number,
  category: string | null,
): Promise<AppsFirstPage> {
  const admin = await createAdminClient();
  const { data, error } = await admin.rpc("grok_bot_apps_page", {
    p_limit: limit,
    p_category: category,
  });
  if (error) throw error;
  const page = (data ?? {}) as {
    apps?: AppRow[];
    total?: number;
    all_total?: number;
  };
  return {
    apps: (page.apps ?? []).map((row) => toAppListItem(toApp(row))),
    total: Number(page.total ?? 0),
    allTotal: Number(page.all_total ?? 0),
  };
}

/**
 * Every app: official first, then community, alphabetical within each (the
 * sitemap's order; the Apps list sorts its own). It's several megabytes;
 * pages use firstAppsPage and the browser fetches this (through /api/apps)
 * only to search, sort or show more.
 */
export async function listApps(): Promise<DirectoryApp[]> {
  const admin = await createAdminClient();
  const { data, error } = await admin.rpc("list_grok_bot_apps_json");
  if (error) throw error;
  return ((data ?? []) as AppRow[])
    .map(toApp)
    .sort(
      (a, b) =>
        Number(!a.marketplaceId) - Number(!b.marketplaceId) ||
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
    );
}

/**
 * A member's listed apps, newest first: what their profile shows
 * (`grok_bot_creator_apps_json()` in SQL, the Apps list's rule for one owner).
 */
export async function listAppsByCreator(
  ownerId: string,
): Promise<AppListItem[]> {
  const admin = await createAdminClient();
  const { data, error } = await admin.rpc("grok_bot_creator_apps_json", {
    p_owner: ownerId,
  });
  if (error) throw error;
  return ((data ?? []) as AppRow[]).map((row) => toAppListItem(toApp(row)));
}

function toolsFrom(value: unknown): AppComponent["tools"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((t) =>
    t && typeof t.name === "string"
      ? [
          {
            name: t.name,
            description: typeof t.description === "string" ? t.description : "",
          },
        ]
      : [],
  );
}

/** One listed app. A page asks twice (metadata, then the page): once each. */
export const getApp = cache(cached("app", ["apps"], loadApp));

async function loadApp(slug: string): Promise<AppDetail | null> {
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("plugins")
    .select(
      "id, slug, name, description, logo, author_name, author_url, homepage, repository, marketplace_plugin_id, marketplace_categories, app_category, created_at, install_count, active, unavailable_in, grok_bot_addable, owner_id, plugin_components(type, name, slug, description, content, metadata, sort_order)",
    )
    .eq("slug", slug)
    .maybeSingle();
  // A failed read must not be cached as "no such app".
  if (error) throw new Error(error.message);
  // Apps Grok Bot can't add aren't in the directory at all.
  if (
    !data?.active ||
    !data.grok_bot_addable ||
    (data.unavailable_in ?? []).includes("grok_bot")
  )
    return null;
  const components = (
    (data.plugin_components ?? []) as {
      type: string;
      name: string;
      slug: string;
      description: string | null;
      content: string | null;
      metadata: Record<string, unknown> | null;
      sort_order: number;
    }[]
  ).sort((a, b) => a.sort_order - b.sort_order);
  if (!worksInGrokBot(components.map((c) => c.type))) return null;
  const app = toApp({
    ...data,
    installs: data.install_count,
    categories: appCategories(data.marketplace_categories, data.app_category),
    mcp_servers: components
      .filter((c) => c.type === "mcp_server")
      .map((c) => c.name),
    skills: components.filter((c) => c.type === "skill").map((c) => c.name),
  } as AppRow);
  return {
    ...app,
    components: components
      .filter((c) => c.type === "mcp_server" || c.type === "skill")
      .map(({ type, name, slug, description, content, metadata }) => ({
        type,
        name,
        slug,
        description,
        content,
        setup:
          type === "mcp_server" ? parseMcpSetup(name, content, metadata) : null,
        tools: toolsFrom(metadata?.tools),
        signIn: metadata?.auth === "oauth",
      })),
    ownerId: data.owner_id,
    claimable:
      !data.owner_id &&
      appSource({
        repository: data.repository,
        marketplace_plugin_id: data.marketplace_plugin_id,
        components,
      }) !== null,
  };
}

/** An app as its claim page needs it. */
export type AppToClaim = {
  id: string;
  slug: string;
  name: string;
  description: string;
  logo: string | null;
  homepage: string | null;
  ownerId: string | null;
  /** Null for an app that can't be claimed: official, or only a link. */
  source: AppSource | null;
};

/** A listed app at this address, with who owns it and where it comes from. */
export async function getAppToClaim(slug: string): Promise<AppToClaim | null> {
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("plugins")
    .select(
      "id, slug, name, description, logo, homepage, repository, owner_id, marketplace_plugin_id, plugin_components(type, metadata)",
    )
    .eq("slug", slug)
    .eq("active", true)
    .eq("permanently_blocked", false)
    .eq("grok_bot_addable", true)
    .not("unavailable_in", "cs", "{grok_bot}")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description ?? "",
    logo: data.logo,
    homepage: data.homepage,
    ownerId: data.owner_id,
    source: appSource({
      repository: data.repository,
      marketplace_plugin_id: data.marketplace_plugin_id,
      components: (data.plugin_components ?? []) as {
        type: string;
        metadata: Record<string, unknown> | null;
      }[],
    }),
  };
}

/** Where a submitted app stands, in the same terms as bots. */
export type AppStatus = "pending" | "listed" | "declined" | "unlisted";

export type AppSubmission = {
  id: string;
  slug: string;
  name: string;
  description: string;
  logo: string | null;
  createdAt: string;
  status: AppStatus;
  /** True while the security check runs; false once it waits for an admin. */
  checking: boolean;
  mcpServers: number;
  skills: number;
  /** What Refresh reads again; null when there's nothing to read. */
  source: AppSource["kind"] | null;
};

function appStatus(p: {
  active: boolean;
  scan_status: string;
  permanently_blocked: boolean;
}): AppStatus {
  if (p.permanently_blocked) return "declined";
  if (p.active) return "listed";
  if (["pending", "scanning", "flagged", "error"].includes(p.scan_status))
    return "pending";
  return "unlisted";
}

/**
 * A member's plugins that Grok Bot can use (any status), newest first, for
 * "Your submissions". Plugins submitted on either site count.
 */
export async function listAppsByOwner(
  ownerId: string,
): Promise<AppSubmission[]> {
  const admin = await createAdminClient();
  type OwnedRow = {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    logo: string | null;
    created_at: string;
    active: boolean;
    scan_status: string;
    permanently_blocked: boolean;
    unavailable_in: string[] | null;
    repository: string | null;
    marketplace_plugin_id: string | null;
    plugin_components:
      | { type: string; metadata: Record<string, unknown> | null }[]
      | null;
  };
  const rows = await allRows<OwnedRow>((from, to) =>
    admin
      .from("plugins")
      .select(
        "id, slug, name, description, logo, created_at, active, scan_status, permanently_blocked, unavailable_in, repository, marketplace_plugin_id, plugin_components(type, metadata)",
        { count: "exact" },
      )
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  return rows.flatMap((p) => {
    const components = p.plugin_components ?? [];
    const types = components.map((c) => c.type);
    if ((p.unavailable_in ?? []).includes("grok_bot") || !worksInGrokBot(types))
      return [];
    return [
      {
        id: p.id,
        slug: p.slug,
        name: p.name,
        description: p.description ?? "",
        logo: p.logo,
        createdAt: p.created_at,
        status: appStatus(p),
        checking: p.scan_status === "pending" || p.scan_status === "scanning",
        mcpServers: types.filter((t: string) => t === "mcp_server").length,
        skills: types.filter((t: string) => t === "skill").length,
        source:
          appSource({
            repository: p.repository,
            marketplace_plugin_id: p.marketplace_plugin_id,
            components,
          })?.kind ?? null,
      },
    ];
  });
}

/** One of a member's listed apps, as its edit page needs it. */
export type OwnApp = {
  id: string;
  slug: string;
  name: string;
  description: string;
  logo: string | null;
  homepage: string | null;
  repository: string | null;
  source: AppSource["kind"] | null;
};

/**
 * The member's own app at this address, if it's listed: only a listed app
 * can be edited, since one in review is waiting on the scan.
 */
export async function getOwnListedApp(
  slug: string,
  ownerId: string,
): Promise<OwnApp | null> {
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("plugins")
    .select(
      "id, slug, name, description, logo, homepage, repository, marketplace_plugin_id, plugin_components(type, metadata)",
    )
    .eq("slug", slug)
    .eq("owner_id", ownerId)
    .eq("active", true)
    .eq("permanently_blocked", false)
    .eq("grok_bot_addable", true)
    .not("unavailable_in", "cs", "{grok_bot}")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description ?? "",
    logo: data.logo,
    homepage: data.homepage,
    repository: data.repository,
    source:
      appSource({
        repository: data.repository,
        marketplace_plugin_id: data.marketplace_plugin_id,
        components: (data.plugin_components ?? []) as {
          type: string;
          metadata: Record<string, unknown> | null;
        }[],
      })?.kind ?? null,
  };
}
