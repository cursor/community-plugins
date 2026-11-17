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

export type SyncSummary = {
  catalog: number;
  inserted: number;
  updated: number;
  linked: number;
  unchanged: number;
  deactivated: number;
  failed: number;
};

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
): Promise<SyncSummary> {
  const catalog = await fetchMarketplaceCatalog();
  const existing = await fetchExisting(supabase);
  const byMarketplaceId = new Map(
    existing
      .filter((e) => e.marketplace_plugin_id)
      .map((e) => [e.marketplace_plugin_id as string, e]),
  );
  const takenSlugs = new Set(existing.map((e) => e.slug));
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
      const known = byMarketplaceId.get(p.id);
      const link = linkFields(p);

      if (known) {
        const imported = known.discovery_source === "marketplace";
        if (
          known.marketplace_updated_at &&
          link.marketplace_updated_at &&
          new Date(known.marketplace_updated_at).getTime() ===
            new Date(link.marketplace_updated_at).getTime()
        ) {
          summary.unchanged++;
          continue;
        }
        const { error } = await supabase
          .from("plugins")
          .update(imported ? { ...marketplaceFields(p), ...link } : link)
          .eq("id", known.id);
        if (error) throw new Error(error.message);
        if (imported) await replaceComponents(supabase, known.id, p);
        summary.updated++;
        log(`[updated] ${label}`);
        continue;
      }

      const displayName = p.displayName || p.name;
      const repository = repositoryFor(p);
      const match = existing.find(
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
        summary.linked++;
        log(`[linked] ${label} -> ${match.slug}`);
        continue;
      }

      // An official plugin keeps its own name even when community plugins
      // share it; only slugs are unique, and the database numbers a taken one.
      const preferredSlug = slugify(p.name);
      const slug =
        preferredSlug && !takenSlugs.has(preferredSlug)
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
      takenSlugs.add(inserted.slug);
      summary.inserted++;
      log(`[inserted] ${label} -> ${inserted.slug}`);
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
    if (error) {
      summary.failed++;
      log(`[failed] removing ${gone.slug}: ${error.message}`);
      continue;
    }
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
    summary.deactivated++;
    log(`[removed] ${gone.slug}`);
  }

  return summary;
}
