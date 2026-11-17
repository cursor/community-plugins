// Recomputes plugins.grok_bot_addable for every plugin from what is stored
// (packages/plugins/src/grok-bot-add.ts). Both directories keep it up to date
// as plugins change; this fills it in the first time and repairs it after the
// rule or the stored setups change (recover:mcp-setups). Safe to re-run.
//
//   bun run refresh:grok-bot-addable [--dry-run]
import { grokBotAddable } from "@directories/plugins/grok-bot-add";
import { createClient } from "@/utils/supabase/admin-client";

// The hosted Data API returns at most 100 rows per request.
const PAGE = 100;
const dryRun = process.argv.includes("--dry-run");

type Row = {
  id: string;
  slug: string;
  active: boolean;
  marketplace_plugin_id: string | null;
  grok_bot_addable: boolean;
  plugin_components: {
    type: string;
    name: string;
    slug: string;
    content: string | null;
    metadata: Record<string, unknown> | null;
  }[];
};

async function main() {
  const db = await createClient();
  const change: Record<"true" | "false", string[]> = { true: [], false: [] };
  const active = { addable: 0, hidden: 0 };
  let seen = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("plugins")
      .select(
        "id, slug, active, marketplace_plugin_id, grok_bot_addable, plugin_components(type, name, slug, content, metadata)",
      )
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data as Row[]) {
      seen++;
      const addable = grokBotAddable({
        slug: row.slug,
        marketplace_plugin_id: row.marketplace_plugin_id,
        components: row.plugin_components ?? [],
      });
      if (row.active) active[addable ? "addable" : "hidden"]++;
      if (addable !== row.grok_bot_addable)
        change[addable ? "true" : "false"].push(row.id);
    }
    if (seen % 1000 === 0) console.log(`  ${seen} plugins read`);
  }
  console.log(
    `refresh-grok-bot-addable: ${seen} plugins; of the active ones, Grok Bot can add ${active.addable} and can't add ${active.hidden}`,
  );
  console.log(
    `  to change: ${change.true.length} become addable, ${change.false.length} stop being addable${dryRun ? " (dry run, nothing saved)" : ""}`,
  );
  if (dryRun) return;
  for (const value of ["true", "false"] as const) {
    const ids = change[value];
    for (let i = 0; i < ids.length; i += PAGE) {
      const { error } = await db
        .from("plugins")
        .update({ grok_bot_addable: value === "true" })
        .in("id", ids.slice(i, i + PAGE));
      if (error) throw error;
    }
  }
  console.log("  saved");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
