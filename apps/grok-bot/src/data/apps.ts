import "server-only";

import { worksInGrokBot } from "@directories/plugins/apps";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

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
};

export type AppComponent = {
  type: string;
  name: string;
  description: string | null;
  /** The MCP server's config as cursor.directory stores it (JSON). */
  content: string | null;
  /** Tools a remote server listed when it was submitted. */
  tools: { name: string; description: string }[];
  /** The server asked for an OAuth sign-in when it was submitted. */
  signIn: boolean;
};

export type AppDetail = DirectoryApp & {
  components: AppComponent[];
  /** The member who submitted it, when it's a community app. */
  ownerId: string | null;
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
  };
}

/** Official apps first, then community apps, alphabetical within each. */
export async function listApps(): Promise<DirectoryApp[]> {
  const admin = await createAdminClient();
  const { data, error } = await admin.rpc("list_grok_bot_apps");
  if (error) throw error;
  return ((data ?? []) as AppRow[])
    .map(toApp)
    .sort(
      (a, b) =>
        Number(!a.marketplaceId) - Number(!b.marketplaceId) ||
        a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
    );
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

export async function getApp(slug: string): Promise<AppDetail | null> {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("plugins")
    .select(
      "id, slug, name, description, logo, author_name, author_url, homepage, repository, marketplace_plugin_id, marketplace_categories, created_at, active, unavailable_in, owner_id, plugin_components(type, name, description, content, metadata, sort_order)",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!data?.active || (data.unavailable_in ?? []).includes("grok_bot"))
    return null;
  const components = (
    (data.plugin_components ?? []) as {
      type: string;
      name: string;
      description: string | null;
      content: string | null;
      metadata: Record<string, unknown> | null;
      sort_order: number;
    }[]
  ).sort((a, b) => a.sort_order - b.sort_order);
  if (!worksInGrokBot(components.map((c) => c.type))) return null;
  const app = toApp({
    ...data,
    categories: data.marketplace_categories,
    mcp_servers: components
      .filter((c) => c.type === "mcp_server")
      .map((c) => c.name),
    skills: components.filter((c) => c.type === "skill").map((c) => c.name),
  } as AppRow);
  return {
    ...app,
    components: components
      .filter((c) => c.type === "mcp_server" || c.type === "skill")
      .map(({ type, name, description, content, metadata }) => ({
        type,
        name,
        description,
        content,
        tools: toolsFrom(metadata?.tools),
        signIn: metadata?.auth === "oauth",
      })),
    ownerId: data.owner_id,
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
  const { data, error } = await admin
    .from("plugins")
    .select(
      "id, slug, name, description, logo, created_at, active, scan_status, permanently_blocked, unavailable_in, plugin_components(type)",
    )
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).flatMap((p) => {
    const types = (p.plugin_components ?? []).map(
      (c: { type: string }) => c.type,
    );
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
      },
    ];
  });
}
