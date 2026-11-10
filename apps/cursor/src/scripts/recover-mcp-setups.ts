// Finds a working setup for MCP servers whose stored one can't be used: an
// https URL kept where a Cursor install link belongs, or a URL inside text
// stored as the config. A URL is only saved (as metadata.config, which both
// directories read) once it answers as an MCP server, through the same
// guarded check the submit forms use.
//
//   bun run recover:mcp-setups [--dry-run] [--limit N]
import { parseMcpSetup } from "@directories/plugins/mcp-config";
import {
  inspectMcpServer,
  publicHttpsUrl,
} from "@directories/plugins/mcp-inspect";
import { createClient } from "@/utils/supabase/admin-client";

const CONCURRENCY = 8;
const MAX_CANDIDATES = 3;
// The hosted Data API returns at most 100 rows per request.
const PAGE = 100;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;

type Component = {
  id: string;
  name: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
  plugins: { slug: string };
};

/** Likely server URLs first: an /mcp or /sse path, or an mcp. host. */
function candidates(c: Component): string[] {
  const found = new Set<string>();
  const link = c.metadata?.mcp_link;
  if (typeof link === "string" && publicHttpsUrl(link)) found.add(link.trim());
  for (const m of (c.content ?? "").matchAll(/https:\/\/[^\s"'`<>)\]\\]+/g))
    found.add(m[0].replace(/[.,;:]+$/, ""));
  const score = (u: string) =>
    /\/(mcp|sse)(\/|$)/i.test(u) || /^https:\/\/mcp\./i.test(u) ? 0 : 1;
  return [...found]
    .filter((u) => !/github\.com|npmjs\.com|\/docs?\b/i.test(u))
    .sort((a, b) => score(a) - score(b))
    .slice(0, MAX_CANDIDATES);
}

async function loadComponents(): Promise<Component[]> {
  const db = await createClient();
  const out: Component[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("plugin_components")
      .select(
        "id, name, content, metadata, plugins!inner(slug, active, marketplace_plugin_id, unavailable_in)",
      )
      .eq("type", "mcp_server")
      .eq("plugins.active", true)
      .is("plugins.marketplace_plugin_id", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of (data ?? []) as unknown as (Component & {
      plugins: { unavailable_in: string[] | null };
    })[]) {
      if ((row.plugins.unavailable_in ?? []).includes("grok_bot")) continue;
      if (parseMcpSetup(row.name, row.content, row.metadata)) continue;
      if (candidates(row).length > 0) out.push(row);
    }
    if (!data || data.length < PAGE) return out;
  }
}

async function main() {
  const components = (await loadComponents()).slice(0, limit);
  console.log(
    `recover-mcp-setups: ${components.length} servers with candidate URLs${dryRun ? " (dry run)" : ""}`,
  );
  const db = await createClient();
  let recovered = 0;
  let checked = 0;
  let next = 0;
  const worker = async () => {
    while (next < components.length) {
      const c = components[next++];
      for (const url of candidates(c)) {
        const result = await inspectMcpServer(url);
        if (!result.ok) continue;
        recovered++;
        console.log(`  ✓ ${c.plugins.slug}: ${url} (${result.auth})`);
        if (!dryRun) {
          const { error } = await db
            .from("plugin_components")
            .update({
              metadata: {
                ...(c.metadata ?? {}),
                // The mcp.json shape, which cursor.directory's page reads too.
                config: { mcpServers: { [c.name]: { url } } },
                config_source: "recovered",
                auth: result.auth,
                ...(result.tools ? { tools: result.tools } : {}),
              },
            })
            .eq("id", c.id);
          if (error) throw error;
        }
        break;
      }
      checked++;
      if (checked % 25 === 0)
        console.log(
          `  ${checked}/${components.length} checked, ${recovered} recovered`,
        );
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(
    `recover-mcp-setups: ${recovered} of ${components.length} servers answered as MCP${dryRun ? " (nothing saved)" : " and were saved"}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
