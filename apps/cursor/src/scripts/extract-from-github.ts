/**
 * Phase 1 of the directory seed: discover plugin-shaped repos on GitHub,
 * parse each one, and write the result to a JSONL file.
 *
 * Discovery sources (all gated by `--min-stars` to suppress junk):
 *   - cursor/plugins (curated baseline)
 *   - GitHub Code Search for plugin manifests, MCP configs, hooks
 *   - GitHub Repo Search for `topic:cursor-plugin`, `topic:claude-plugin`, etc.
 *
 * Discovery results are cached to JSON so re-runs skip Code Search entirely.
 *
 * No DB writes. Re-runnable. Inspect the output before running phase 2.
 *
 * Usage:
 *   bun run --env-file=apps/cursor/.env apps/cursor/src/scripts/extract-from-github.ts \
 *     [--limit 1000] \
 *     [--min-stars 5] \
 *     [--candidates-cache apps/cursor/.seed/candidates.json] \
 *     [--refresh-candidates] \
 *     [--output apps/cursor/.seed/plugins.jsonl] \
 *     [--resume]
 *
 * Requires GITHUB_TOKEN in env (Code Search and Repo Search need auth).
 */

import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  fetchGitHubRepoMeta,
  GitHubParseError,
  type GitHubRepoMeta,
  type ParsedPlugin,
  parseGitHubPlugin,
} from "@directories/plugins/github";

type Source =
  | "seed:cursor-spec"
  | "seed:cursor-org"
  | "seed:claude-plugin"
  | "seed:open-plugin"
  | "seed:mcp"
  | "seed:hooks"
  | "seed:topic";

type Candidate = {
  owner: string;
  repo: string;
  source: Source;
  matchedQuery: string;
};

type ExtractedRow = {
  github_repo_id: number;
  discovery_source: Source;
  stars: number;
  license: string | null;
  parsed: ParsedPlugin;
};

type Args = {
  limit: number;
  minStars: number;
  output: string;
  candidatesCache: string;
  refreshCandidates: boolean;
  resume: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = {
    limit: Number.POSITIVE_INFINITY,
    minStars: 5,
    output: "apps/cursor/.seed/plugins.jsonl",
    candidatesCache: "apps/cursor/.seed/candidates.json",
    refreshCandidates: false,
    resume: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--min-stars") out.minStars = Number(argv[++i]);
    else if (a === "--output") out.output = argv[++i];
    else if (a === "--candidates-cache") out.candidatesCache = argv[++i];
    else if (a === "--refresh-candidates") out.refreshCandidates = true;
    else if (a === "--resume") out.resume = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: extract-from-github.ts [--limit N] [--min-stars N] [--candidates-cache path] [--refresh-candidates] [--output path] [--resume]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(1);
    }
  }
  return out;
}

function authHeaders(): Record<string, string> {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error(
      "GITHUB_TOKEN env var is required (Code Search endpoints need auth).",
    );
  }
  return { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sleep until the GitHub Search rate-limit resets if we're nearly empty. */
async function respectRateLimit(res: Response, label: string) {
  const remaining = Number(res.headers.get("x-ratelimit-remaining") ?? "30");
  if (remaining > 1) return;
  const reset = Number(res.headers.get("x-ratelimit-reset") ?? "0") * 1000;
  const wait = Math.max(reset - Date.now(), 0) + 1000;
  if (wait > 0) {
    console.warn(
      `  ${label}: rate budget exhausted (remaining=${remaining}), sleeping ${Math.ceil(wait / 1000)}s`,
    );
    await sleep(wait);
  }
}

async function githubSearch<T>(
  endpoint: "code" | "repositories",
  query: string,
  page: number,
  perPage: number,
  label: string,
): Promise<{ total_count: number; items: T[] } | null> {
  while (true) {
    const url = `https://api.github.com/search/${endpoint}?q=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github.v3+json",
        ...authHeaders(),
      },
    });

    if (res.status === 403 || res.status === 429) {
      const retry = Number(res.headers.get("retry-after") ?? "30");
      console.warn(`  ${label}: 429 rate-limited, sleeping ${retry}s`);
      await sleep(retry * 1000);
      continue;
    }
    if (res.status === 422) {
      // Query syntax error or hit the 1000-result cap mid-pagination.
      return null;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `${endpoint} search failed for "${query}": ${res.status} ${res.statusText} ${body.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as {
      total_count?: number;
      items?: T[];
    };

    await respectRateLimit(res, label);

    return {
      total_count: data.total_count ?? 0,
      items: data.items ?? [],
    };
  }
}

async function githubCodeSearch(
  query: string,
  source: Source,
  minStars: number,
): Promise<Candidate[]> {
  // Code Search doesn't support `stars:>=N` directly, but it does support
  // a `repo:owner/name` filter. We can't pre-filter by stars in Code Search,
  // so we filter post-hoc via fetchGitHubRepoMeta. Instead, we keep the query
  // clean and rely on the meta-filter step to apply --min-stars.
  void minStars;

  const out: Candidate[] = [];
  const PER_PAGE = 100;
  const MAX_PAGES = 10;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await githubSearch<{ repository?: { full_name?: string } }>(
      "code",
      query,
      page,
      PER_PAGE,
      `code "${query}"`,
    );
    if (!data) break;

    if (page === 1) {
      console.log(
        `  query "${query}": total_count=${data.total_count}, fetching up to ${MAX_PAGES * PER_PAGE}`,
      );
    }

    for (const item of data.items) {
      const fullName = item.repository?.full_name;
      if (!fullName) continue;
      const [owner, repo] = fullName.split("/");
      if (!owner || !repo) continue;
      out.push({ owner, repo, source, matchedQuery: query });
    }

    if (data.items.length < PER_PAGE) break;
  }

  return out;
}

async function githubTopicSearch(
  topic: string,
  minStars: number,
): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const PER_PAGE = 100;
  const MAX_PAGES = 10;
  const query =
    minStars > 0 ? `topic:${topic} stars:>=${minStars}` : `topic:${topic}`;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await githubSearch<{ full_name?: string }>(
      "repositories",
      query,
      page,
      PER_PAGE,
      `topic "${topic}"`,
    );
    if (!data) break;

    if (page === 1) {
      console.log(
        `  topic "${topic}" stars>=${minStars}: total_count=${data.total_count}, fetching up to ${MAX_PAGES * PER_PAGE}`,
      );
    }

    for (const item of data.items) {
      const fullName = item.full_name;
      if (!fullName) continue;
      const [owner, repo] = fullName.split("/");
      if (!owner || !repo) continue;
      out.push({
        owner,
        repo,
        source: "seed:topic",
        matchedQuery: query,
      });
    }

    if (data.items.length < PER_PAGE) break;
  }

  return out;
}

async function fetchCursorOrgPlugins(): Promise<Candidate[]> {
  // Always include the official cursor/plugins org as the curated baseline.
  // The repo itself will be parsed (multi-plugin marketplace), so a single
  // candidate suffices.
  return [
    {
      owner: "cursor",
      repo: "plugins",
      source: "seed:cursor-org",
      matchedQuery: "cursor/plugins",
    },
  ];
}

async function loadResumeIds(output: string): Promise<Set<number>> {
  if (!existsSync(output)) return new Set();
  const ids = new Set<number>();
  const text = await readFile(output, "utf8");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (typeof row.github_repo_id === "number") {
        ids.add(row.github_repo_id);
      }
    } catch {
      // ignore
    }
  }
  return ids;
}

async function discoverCandidates(args: Args): Promise<Map<string, Candidate>> {
  const candidates = new Map<string, Candidate>();

  if (!args.refreshCandidates && existsSync(args.candidatesCache)) {
    try {
      const text = await readFile(args.candidatesCache, "utf8");
      const cached = JSON.parse(text) as { candidates: Candidate[] };
      for (const c of cached.candidates ?? []) {
        candidates.set(`${c.owner}/${c.repo}`.toLowerCase(), c);
      }
      console.log(
        `Loaded ${candidates.size} candidates from cache: ${args.candidatesCache}`,
      );
      return candidates;
    } catch (err) {
      console.warn(
        `Cache read failed, re-discovering: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log("Discovering candidates...");
  const orgCandidates = await fetchCursorOrgPlugins();
  for (const c of orgCandidates) {
    candidates.set(`${c.owner}/${c.repo}`.toLowerCase(), c);
  }
  console.log(`  cursor org: +${orgCandidates.length}`);

  const codeQueries: Array<{ query: string; source: Source }> = [
    {
      query: "filename:plugin.json path:.cursor-plugin",
      source: "seed:cursor-spec",
    },
    {
      query: "filename:marketplace.json path:.cursor-plugin",
      source: "seed:cursor-spec",
    },
    {
      query: "filename:plugin.json path:.claude-plugin",
      source: "seed:claude-plugin",
    },
    { query: "filename:plugin.json path:.plugin", source: "seed:open-plugin" },
    { query: "filename:.mcp.json", source: "seed:mcp" },
    { query: "filename:mcp.json", source: "seed:mcp" },
    { query: "filename:hooks.json path:hooks", source: "seed:hooks" },
  ];
  for (const { query, source } of codeQueries) {
    const found = await githubCodeSearch(query, source, args.minStars);
    let added = 0;
    for (const c of found) {
      const key = `${c.owner}/${c.repo}`.toLowerCase();
      if (!candidates.has(key)) {
        candidates.set(key, c);
        added++;
      }
    }
    console.log(`  code search: +${added} (of ${found.length})`);
  }

  // Topic search uses Repo Search (separate rate budget) and supports
  // `stars:>=N` directly, so it returns curated, popular plugin repos.
  const topics = [
    "cursor-plugin",
    "claude-plugin",
    "cursor-rules",
    "cursor-mcp",
    "mcp-server",
  ];
  for (const topic of topics) {
    const found = await githubTopicSearch(topic, args.minStars);
    let added = 0;
    for (const c of found) {
      const key = `${c.owner}/${c.repo}`.toLowerCase();
      if (!candidates.has(key)) {
        candidates.set(key, c);
        added++;
      }
    }
    console.log(`  topic search: +${added} (of ${found.length})`);
  }

  await mkdir(dirname(args.candidatesCache), { recursive: true });
  await writeFile(
    args.candidatesCache,
    `${JSON.stringify(
      {
        discovered_at: new Date().toISOString(),
        min_stars_hint: args.minStars,
        candidates: Array.from(candidates.values()),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Cached candidates to: ${args.candidatesCache}`);

  return candidates;
}

async function main() {
  const args = parseArgs();
  console.log("Args:", args);

  await mkdir(dirname(args.output), { recursive: true });

  const candidates = await discoverCandidates(args);

  console.log(`Total unique candidates: ${candidates.size}`);

  const resumeIds = args.resume ? await loadResumeIds(args.output) : new Set();
  if (args.resume) {
    console.log(`Resume: skipping ${resumeIds.size} already-extracted repos.`);
  }

  const outStream = createWriteStream(args.output, {
    flags: args.resume ? "a" : "w",
  });
  const failedStream = createWriteStream(`${args.output}.failed.jsonl`, {
    flags: args.resume ? "a" : "w",
  });

  const summary = {
    total_candidates: candidates.size,
    after_filter: 0,
    parsed_ok: 0,
    parse_failed: 0,
    skipped_fork: 0,
    skipped_archived: 0,
    skipped_unreadable: 0,
    skipped_low_stars: 0,
    skipped_resume: 0,
    by_source: {} as Record<string, number>,
    by_component_type: {} as Record<string, number>,
  };

  let processed = 0;
  for (const [key, candidate] of candidates) {
    if (processed >= args.limit) break;
    processed++;

    const url = `https://github.com/${candidate.owner}/${candidate.repo}`;
    const prefix = `[${processed}/${Math.min(candidates.size, args.limit)}] ${key}`;

    let meta: GitHubRepoMeta | null;
    try {
      meta = await fetchGitHubRepoMeta(candidate.owner, candidate.repo);
    } catch (err) {
      console.warn(
        `${prefix} repo meta fetch failed: ${err instanceof Error ? err.message : err}`,
      );
      summary.skipped_unreadable++;
      failedStream.write(
        `${JSON.stringify({
          url,
          source: candidate.source,
          reason: "meta_fetch_failed",
        })}\n`,
      );
      continue;
    }

    if (!meta) {
      console.warn(`${prefix} repo not found / private`);
      summary.skipped_unreadable++;
      failedStream.write(
        `${JSON.stringify({
          url,
          source: candidate.source,
          reason: "repo_not_found",
        })}\n`,
      );
      continue;
    }

    if (meta.fork) {
      console.log(`${prefix} skip: fork`);
      summary.skipped_fork++;
      continue;
    }
    if (meta.archived) {
      console.log(`${prefix} skip: archived`);
      summary.skipped_archived++;
      continue;
    }

    // The cursor org baseline is exempt — it's curated by definition.
    if (
      args.minStars > 0 &&
      meta.stars < args.minStars &&
      candidate.source !== "seed:cursor-org"
    ) {
      summary.skipped_low_stars++;
      continue;
    }

    if (resumeIds.has(meta.id)) {
      summary.skipped_resume++;
      continue;
    }

    summary.after_filter++;

    let parsed: ParsedPlugin;
    try {
      parsed = await parseGitHubPlugin(url, { repoMeta: meta });
    } catch (err) {
      const reason =
        err instanceof GitHubParseError ? err.code : "unknown_error";
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`${prefix} parse failed: ${reason} - ${message}`);
      summary.parse_failed++;
      failedStream.write(
        `${JSON.stringify({
          url,
          source: candidate.source,
          github_repo_id: meta.id,
          stars: meta.stars,
          reason,
          message,
        })}\n`,
      );
      continue;
    }

    const row: ExtractedRow = {
      github_repo_id: meta.id,
      discovery_source: candidate.source,
      stars: meta.stars,
      license: meta.license_spdx,
      parsed,
    };
    outStream.write(`${JSON.stringify(row)}\n`);

    summary.parsed_ok++;
    summary.by_source[candidate.source] =
      (summary.by_source[candidate.source] ?? 0) + 1;
    for (const comp of parsed.components) {
      summary.by_component_type[comp.type] =
        (summary.by_component_type[comp.type] ?? 0) + 1;
    }

    console.log(
      `${prefix} ok: ${parsed.components.length} components (${parsed.name})`,
    );

    // Per-candidate pacing keeps us under the 5,000 req/hr authed core API
    // ceiling. Each candidate uses ~2 API calls (meta + tree), so 800ms
    // ≈ 4,500 candidates/hr — comfortably under the limit with margin for
    // retries and the script's own discovery budget.
    await sleep(800);
  }

  await new Promise<void>((r) => outStream.end(() => r()));
  await new Promise<void>((r) => failedStream.end(() => r()));

  await writeFile(
    `${args.output}.summary.json`,
    `${JSON.stringify(summary, null, 2)}\n`,
  );

  console.log("\nSummary:");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote: ${args.output}`);
  console.log(`Failed log: ${args.output}.failed.jsonl`);
  console.log(`Summary: ${args.output}.summary.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
