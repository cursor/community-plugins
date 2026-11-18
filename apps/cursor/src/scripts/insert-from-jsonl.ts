/**
 * Phase 2 of the directory seed: read the JSONL produced by
 * extract-from-github.ts and insertPlugin(skipScan=true) each row.
 *
 * Idempotent: the `plugins.github_repo_id` unique index makes re-runs safe.
 * Already-inserted rows return `duplicate_repo` and we just skip.
 *
 * Usage:
 *   bun run --env-file=apps/cursor/.env apps/cursor/src/scripts/insert-from-jsonl.ts \
 *     [--input apps/cursor/.seed/plugins.jsonl] \
 *     [--limit 100] \
 *     [--dry-run]
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { ParsedPlugin } from "@directories/plugins/github";
import { InsertPluginError, insertPlugin } from "@directories/plugins/insert";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

type ExtractedRow = {
  github_repo_id: number;
  discovery_source: string;
  stars: number;
  license: string | null;
  parsed: ParsedPlugin;
};

type Args = {
  input: string;
  limit: number;
  dryRun: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = {
    input: "apps/cursor/.seed/plugins.jsonl",
    limit: Number.POSITIVE_INFINITY,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") out.input = argv[++i];
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: insert-from-jsonl.ts [--input path] [--limit N] [--dry-run]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(1);
    }
  }
  return out;
}

async function* readRows(path: string): AsyncGenerator<ExtractedRow> {
  // Stream-like read by splitting the whole file by newlines. JSONL files at
  // this scale (<= a few MB) fit comfortably in memory.
  const text = await readFile(path, "utf8");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line) as ExtractedRow;
    } catch (err) {
      console.warn(
        `Skipping unparseable JSONL line: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

async function main() {
  const args = parseArgs();
  console.log("Args:", args);

  if (!existsSync(args.input)) {
    console.error(`Input not found: ${args.input}`);
    console.error("Run scripts/extract-from-github.ts first.");
    process.exit(1);
  }

  const summary = {
    processed: 0,
    inserted: 0,
    skipped_duplicate: 0,
    skipped_other: 0,
    failed: 0,
    by_source: {} as Record<string, number>,
  };

  const supabase = await createAdminClient();

  for await (const row of readRows(args.input)) {
    if (summary.processed >= args.limit) break;
    summary.processed++;

    const label = `${row.parsed.repository ?? row.github_repo_id} (${row.parsed.name})`;

    if (args.dryRun) {
      console.log(
        `[dry-run] would insert: ${label} (${row.parsed.components.length} components)`,
      );
      summary.inserted++;
      summary.by_source[row.discovery_source] =
        (summary.by_source[row.discovery_source] ?? 0) + 1;
      continue;
    }

    try {
      const { slug } = await insertPlugin(
        supabase,
        {
          name: row.parsed.name,
          description: row.parsed.description,
          logo: row.parsed.logo ?? null,
          repository: row.parsed.repository,
          homepage: row.parsed.homepage ?? null,
          license: row.license ?? row.parsed.license ?? null,
          keywords: row.parsed.keywords,
          author_name: row.parsed.author_name ?? null,
          author_url: row.parsed.author_url ?? null,
          author_avatar: row.parsed.author_avatar ?? null,
          components: row.parsed.components,
        },
        {
          ownerId: null,
          source: row.discovery_source,
          githubRepoId: row.github_repo_id,
          skipScan: true,
        },
      );
      summary.inserted++;
      summary.by_source[row.discovery_source] =
        (summary.by_source[row.discovery_source] ?? 0) + 1;
      console.log(`[ok] ${label} -> /plugins/${slug}`);
    } catch (err) {
      if (err instanceof InsertPluginError) {
        if (err.code === "duplicate_repo" || err.code === "duplicate_name") {
          summary.skipped_duplicate++;
          console.log(`[skip] ${label}: ${err.code}`);
          continue;
        }
        summary.failed++;
        console.error(`[fail] ${label}: ${err.code} - ${err.message}`);
        continue;
      }
      summary.failed++;
      console.error(
        `[fail] ${label}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log("\nSummary:");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
