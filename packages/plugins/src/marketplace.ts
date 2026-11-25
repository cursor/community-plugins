/**
 * Imports the Cursor plugin marketplace into `plugins`, so cursor.directory
 * and the Grok Bot Directory list official plugins alongside community ones.
 *
 * The catalog is the public `ListMarketplacePlugins` RPC. It names each
 * plugin's parts but doesn't include their contents (MCP configs, skill
 * text), so imported components carry a name, a description and a link to
 * the source; installing goes through the marketplace.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { refreshGrokBotAddable } from "./grok-bot-add";
import { insertPlugin } from "./insert";
import { slugify } from "./slug";

const CATALOG_URL = `${process.env.MARKETPLACE_API_URL ?? "https://api2.cursor.sh"}/aiserver.v1.DashboardService/ListMarketplacePlugins`;

const Part = z.object({
  name: z.string(),
  description: z.string().default(""),
  sourceUrl: z.string().optional(),
});

// Proto3 JSON omits empty fields, so nearly everything defaults.
const CatalogPlugin = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string().default(""),
  description: z.string().default(""),
  status: z.string().default(""),
  isPublished: z.boolean().default(false),
  lifecycleState: z.string().default(""),
  logoUrl: z.string().optional(),
  repositoryUrl: z.string().optional(),
  gitUrl: z.string().optional(),
  gitPath: z.string().optional(),
  updatedAt: z.string().optional(),
  tags: z.array(z.string()).default([]),
  curatedCategoryKeys: z.array(z.string()).default([]),
  minClientVersions: z.record(z.string(), z.string()).default({}),
  publisher: z
    .object({
      name: z.string().default(""),
      displayName: z.string().default(""),
      isVerified: z.boolean().default(false),
      websiteUrl: z.string().optional(),
      logoUrl: z.string().optional(),
    })
    .optional(),
  mcpServers: z.array(Part).default([]),
  skills: z.array(Part).default([]),
  rules: z.array(Part).default([]),
  commands: z.array(Part).default([]),
  hooks: z.array(Part).default([]),
  subagents: z.array(Part).default([]),
});
export type CatalogPlugin = z.infer<typeof CatalogPlugin>;

const Catalog = z.object({ plugins: z.array(z.unknown()).default([]) });

/** Approved, published, publicly listed plugins. Malformed entries are skipped. */
export async function fetchMarketplaceCatalog(): Promise<CatalogPlugin[]> {
  const res = await fetch(CATALOG_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
    },
    body: "{}",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ListMarketplacePlugins answered ${res.status}`);
  const { plugins } = Catalog.parse(await res.json());
  return plugins.flatMap((raw) => {
    const parsed = CatalogPlugin.safeParse(raw);
    if (!parsed.success) return [];
    const p = parsed.data;
    const listed =
      p.status === "PLUGIN_STATUS_APPROVED" &&
      p.isPublished &&
      p.lifecycleState === "PLUGIN_LIFECYCLE_STATE_PUBLIC_LISTED";
    return listed ? [p] : [];
  });
}

const httpUrl = (value: string | undefined) =>
  value && /^https?:\/\//.test(value) ? value : null;

/** Clients the marketplace marks a plugin as never supporting. */
function unavailableIn(p: CatalogPlugin): string[] {
  const out: string[] = [];
  if (p.minClientVersions.cursor === "never") out.push("cursor");
  // "sand" is Grok Bot's client name in the catalog.
  if (p.minClientVersions.sand === "never") out.push("grok_bot");
  return out;
}

/** The plugin's own folder when it lives inside a monorepo. */
function repositoryFor(p: CatalogPlugin): string | null {
  const base = httpUrl(p.gitUrl)?.replace(/\.git$/, "") ?? null;
  if (base && p.gitPath) return `${base}/tree/HEAD/${p.gitPath}`;
  return base ?? httpUrl(p.repositoryUrl);
}

function componentsFor(p: CatalogPlugin) {
  const parts: [string, z.infer<typeof Part>[]][] = [
    ["mcp_server", p.mcpServers],
    ["skill", p.skills],
    ["rule", p.rules],
    ["command", p.commands],
    ["hook", p.hooks],
    ["agent", p.subagents],
  ];
  return parts.flatMap(([type, list]) =>
    list.map((part) => ({
      type,
      name: part.name,
      description: part.description || null,
      metadata: part.sourceUrl ? { source_url: part.sourceUrl } : {},
    })),
  );
}

function marketplaceFields(p: CatalogPlugin) {
  return {
    description: p.description,
    logo: httpUrl(p.logoUrl) ?? httpUrl(p.publisher?.logoUrl),
    homepage: httpUrl(p.publisher?.websiteUrl),
    repository: repositoryFor(p),
    keywords: p.tags,
    author_name: p.publisher?.displayName || p.publisher?.name || null,
    author_url: httpUrl(p.publisher?.websiteUrl),
  };
}

function linkFields(p: CatalogPlugin) {
  return {
    marketplace_plugin_id: p.id,
    marketplace_updated_at: p.updatedAt
      ? new Date(Number(p.updatedAt)).toISOString()
      : null,
    marketplace_categories: p.curatedCategoryKeys,
    unavailable_in: unavailableIn(p),
    // Official apps are added through the marketplace itself.
    grok_bot_addable: true,
  };
}

const sameText = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

const repoKey = (url: string | null | undefined) =>
  url
    ?.toLowerCase()
    .replace(/\.git$/, "")
    .replace(/\/+$/, "") ?? null;

type ExistingPlugin = {
  id: string;
  name: string;
  slug: string;
  repository: string | null;
  discovery_source: string | null;
  marketplace_plugin_id: string | null;
  marketplace_updated_at: string | null;
};

export type SyncPluginAction =
  | "inserted"
  | "updated"
  | "linked"
  | "unchanged"
  | "deactivated";

export type SyncPluginResult = {
  action: SyncPluginAction;
  id: string;
  slug: string;
  name: string;
  marketplace_plugin_id: string;
};

export type SyncSummary = {
  catalog: number;
  inserted: number;
  updated: number;
  linked: number;
  unchanged: number;
  deactivated: number;
  failed: number;
};

export class MarketplaceSyncError extends Error {
  constructor(
    public readonly code: "not_found" | "ambiguous",
    message: string,
  ) {
    super(message);
    this.name = "MarketplaceSyncError";
  }
}

async function fetchExisting(
  supabase: SupabaseClient,
): Promise<ExistingPlugin[]> {
  const rows: ExistingPlugin[] = [];
  // The hosted Data API returns at most 100 rows however many are asked for,
  // so a short page doesn't mean the last one: read until a page is empty.
  const pageSize = 100;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("plugins")
      .select(
        "id, name, slug, repository, discovery_source, marketplace_plugin_id, marketplace_updated_at",
      )
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Reading plugins failed: ${error.message}`);
    if (!data || data.length === 0) return rows;
    rows.push(...(data as ExistingPlugin[]));
  }
}

async function replaceComponents(
  supabase: SupabaseClient,
  pluginId: string,
  p: CatalogPlugin,
) {
  const { error: delError } = await supabase
    .from("plugin_components")
    .delete()
    .eq("plugin_id", pluginId);
  if (delError) throw new Error(delError.message);
  const rows = componentsFor(p).map((c, i) => ({
    ...c,
    plugin_id: pluginId,
    slug: slugify(c.name) || `${c.type}-${i + 1}`,
    content: null,
    sort_order: i,
  }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("plugin_components").insert(rows);
  if (error) throw new Error(error.message);
}

type SyncState = {
  existing: ExistingPlugin[];
  byMarketplaceId: Map<string, ExistingPlugin>;
  takenSlugs: Set<string>;
};

async function syncOneCatalogPlugin(
  supabase: SupabaseClient,
  p: CatalogPlugin,
  state: SyncState,
  options: { force?: boolean; log: (line: string) => void },
): Promise<SyncPluginResult> {
  const label = `${p.name} (${p.id})`;
  const known = state.byMarketplaceId.get(p.id);
  const link = linkFields(p);

  if (known) {
    const imported = known.discovery_source === "marketplace";
    if (
      !options.force &&
      known.marketplace_updated_at &&
      link.marketplace_updated_at &&
      new Date(known.marketplace_updated_at).getTime() ===
        new Date(link.marketplace_updated_at).getTime()
    ) {
      return {
        action: "unchanged",
        id: known.id,
        slug: known.slug,
        name: known.name,
        marketplace_plugin_id: p.id,
      };
    }
    const nextName = imported ? p.displayName || p.name : known.name;
    const { error } = await supabase
      .from("plugins")
      .update(
        imported
          ? // The marketplace renames plugins too; the slug stays.
            {
              ...marketplaceFields(p),
              name: nextName,
              ...link,
            }
          : link,
      )
      .eq("id", known.id);
    if (error) throw new Error(error.message);
    if (imported) await replaceComponents(supabase, known.id, p);
    options.log(`[updated] ${label}`);
    return {
      action: "updated",
      id: known.id,
      slug: known.slug,
      name: nextName,
      marketplace_plugin_id: p.id,
    };
  }

  const displayName = p.displayName || p.name;
  const repository = repositoryFor(p);
  const match = state.existing.find(
    (e) =>
      !e.marketplace_plugin_id &&
      sameText(e.name, displayName) &&
      repoKey(e.repository) !== null &&
      repoKey(e.repository) === repoKey(repository),
  );
  if (match) {
    const { error } = await supabase
      .from("plugins")
      .update(link)
      .eq("id", match.id);
    if (error) throw new Error(error.message);
    match.marketplace_plugin_id = p.id;
    state.byMarketplaceId.set(p.id, match);
    options.log(`[linked] ${label} -> ${match.slug}`);
    return {
      action: "linked",
      id: match.id,
      slug: match.slug,
      name: match.name,
      marketplace_plugin_id: p.id,
    };
  }

  // An official plugin keeps its own name even when community plugins
  // share it; only slugs are unique, and the database numbers a taken one.
  const preferredSlug = slugify(p.name);
  const slug =
    preferredSlug && !state.takenSlugs.has(preferredSlug)
      ? preferredSlug
      : undefined;
  const inserted = await insertPlugin(
    supabase,
    {
      ...marketplaceFields(p),
      name: displayName,
      slug,
      components: componentsFor(p).map((c) => ({ ...c, content: null })),
    },
    { ownerId: null, source: "marketplace", skipScan: true },
  );
  const { error } = await supabase
    .from("plugins")
    .update(link)
    .eq("id", inserted.id);
  if (error) throw new Error(error.message);
  state.takenSlugs.add(inserted.slug);
  options.log(`[inserted] ${label} -> ${inserted.slug}`);
  return {
    action: "inserted",
    id: inserted.id,
    slug: inserted.slug,
    name: displayName,
    marketplace_plugin_id: p.id,
  };
}

async function deactivateGonePlugin(
  supabase: SupabaseClient,
  gone: ExistingPlugin,
  log: (line: string) => void,
): Promise<SyncPluginResult> {
  const imported = gone.discovery_source === "marketplace";
  const { error } = await supabase
    .from("plugins")
    .update(
      imported
        ? { active: false }
        : {
            marketplace_plugin_id: null,
            marketplace_updated_at: null,
            marketplace_categories: [],
            unavailable_in: [],
          },
    )
    .eq("id", gone.id);
  if (error) throw new Error(error.message);

  // A community plugin again: whether Grok Bot can add it now depends on
  // its own setup.
  if (!imported) {
    try {
      await refreshGrokBotAddable(supabase, gone.id);
    } catch (err) {
      log(
        `[failed] grok_bot_addable for ${gone.slug}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  log(`[removed] ${gone.slug}`);
  return {
    action: "deactivated",
    id: gone.id,
    slug: gone.slug,
    name: gone.name,
    marketplace_plugin_id: gone.marketplace_plugin_id ?? "",
  };
}

function buildSyncState(existing: ExistingPlugin[]): SyncState {
  return {
    existing,
    byMarketplaceId: new Map(
      existing
        .filter((e) => e.marketplace_plugin_id)
        .map((e) => [e.marketplace_plugin_id as string, e]),
    ),
    takenSlugs: new Set(existing.map((e) => e.slug)),
  };
}

/**
 * Brings `plugins` in line with the marketplace. New plugins are inserted
 * (listed at once: the marketplace already reviewed them), changed ones are
 * rewritten, and ones that left the catalog are deactivated. A community
 * plugin with the same name and repository is linked instead of duplicated;
 * it keeps its own components, which carry real configs. Needs a
 * service-role client.
 */
export async function syncMarketplacePlugins(
  supabase: SupabaseClient,
  log: (line: string) => void = () => {},
  onChange?: (result: SyncPluginResult) => void,
): Promise<SyncSummary> {
  const [catalog, existing] = await Promise.all([
    fetchMarketplaceCatalog(),
    fetchExisting(supabase),
  ]);
  const state = buildSyncState(existing);
  const summary: SyncSummary = {
    catalog: catalog.length,
    inserted: 0,
    updated: 0,
    linked: 0,
    unchanged: 0,
    deactivated: 0,
    failed: 0,
  };

  for (const p of catalog) {
    const label = `${p.name} (${p.id})`;
    try {
      const result = await syncOneCatalogPlugin(supabase, p, state, { log });
      summary[result.action]++;
      if (result.action !== "unchanged") onChange?.(result);
    } catch (err) {
      summary.failed++;
      log(
        `[failed] ${label}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Plugins that left the catalog: imported ones go away; linked community
  // plugins stay listed as community plugins.
  const live = new Set(catalog.map((p) => p.id));
  for (const gone of existing.filter(
    (e) => e.marketplace_plugin_id && !live.has(e.marketplace_plugin_id),
  )) {
    try {
      const result = await deactivateGonePlugin(supabase, gone, log);
      summary.deactivated++;
      onChange?.(result);
    } catch (err) {
      summary.failed++;
      log(
        `[failed] removing ${gone.slug}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return summary;
}

function resolveCatalogTarget(
  ref: string,
  catalog: CatalogPlugin[],
  existing: ExistingPlugin[],
): { catalogPlugin: CatalogPlugin } | { gonePlugin: ExistingPlugin } {
  const needle = ref.trim();
  const lower = needle.toLowerCase();

  const byId = catalog.find((p) => p.id === needle);
  if (byId) return { catalogPlugin: byId };

  const byName = catalog.filter((p) => p.name.toLowerCase() === lower);
  if (byName.length === 1) return { catalogPlugin: byName[0] };
  if (byName.length > 1) {
    const list = byName.map((p) => `${p.name} (${p.id})`).join(", ");
    throw new MarketplaceSyncError(
      "ambiguous",
      `Multiple marketplace plugins match "${needle}": ${list}. Pass the marketplace plugin ID instead.`,
    );
  }

  const byDisplay = catalog.filter(
    (p) => p.displayName.toLowerCase() === lower,
  );
  if (byDisplay.length === 1) return { catalogPlugin: byDisplay[0] };
  if (byDisplay.length > 1) {
    const list = byDisplay.map((p) => `${p.name} (${p.id})`).join(", ");
    throw new MarketplaceSyncError(
      "ambiguous",
      `Multiple marketplace plugins match "${needle}": ${list}. Pass the marketplace plugin ID instead.`,
    );
  }

  // Fall back to an already-synced row by directory UUID, slug, or marketplace ID.
  const existingRow = existing.find(
    (e) =>
      e.id === needle ||
      e.slug.toLowerCase() === lower ||
      e.marketplace_plugin_id === needle,
  );
  if (existingRow) {
    if (!existingRow.marketplace_plugin_id) {
      throw new MarketplaceSyncError(
        "not_found",
        `"${existingRow.slug}" is a community plugin, not linked to a public Cursor Marketplace plugin.`,
      );
    }
    const liveMatch = catalog.find(
      (p) => p.id === existingRow.marketplace_plugin_id,
    );
    if (liveMatch) return { catalogPlugin: liveMatch };
    return { gonePlugin: existingRow };
  }

  throw new MarketplaceSyncError(
    "not_found",
    `No approved, publicly listed marketplace plugin found matching "${needle}".`,
  );
}

/**
 * Syncs a single plugin from the Cursor Marketplace by marketplace ID,
 * marketplace name, display name, or directory slug/UUID. Always rewrites the
 * plugin's fields and components even if `marketplace_updated_at` matches.
 * If an already-synced plugin left the catalog, deactivates or unlinks it.
 */
export async function syncMarketplacePlugin(
  supabase: SupabaseClient,
  ref: string,
  log: (line: string) => void = () => {},
): Promise<SyncPluginResult> {
  const [catalog, existing] = await Promise.all([
    fetchMarketplaceCatalog(),
    fetchExisting(supabase),
  ]);
  const target = resolveCatalogTarget(ref, catalog, existing);
  if ("gonePlugin" in target) {
    return deactivateGonePlugin(supabase, target.gonePlugin, log);
  }
  return syncOneCatalogPlugin(
    supabase,
    target.catalogPlugin,
    buildSyncState(existing),
    { force: true, log },
  );
}
