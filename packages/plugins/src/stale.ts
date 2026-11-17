import type { SupabaseClient } from "@supabase/supabase-js";
import { unpublishPlugin } from "./moderation";

// Clears out community plugins whose GitHub repository has gone away. A
// listing points at a repository two ways: `plugins.repository` (plugins
// submitted from a repo) or, for old listings that are only a link, each MCP
// server's `metadata.link`. The weekly clean-up (cursor.directory's
// /api/cron/clean-stale-plugins) unpublishes a plugin Grok Bot can't add
// when either holds, recording a moderation event so an admin can find and
// restore it:
//
//   - every repository it points at no longer exists; or
//   - it is only a link, and every repository it points at is gone or
//     archived.
//
// A plugin Grok Bot can still add is left alone even when its repository is
// gone: its setup was stored when it was submitted and still works. A
// repository that can't be checked (rate limit, outage, access denied) is
// never treated as gone.

export type RepoState = "alive" | "archived" | "gone";

const GONE = "The GitHub repository it links to no longer exists.";
const ARCHIVED = "The GitHub repository it links to has been archived.";

/** `owner/name` from a GitHub URL, or null. */
export function githubRepo(url: string | null | undefined): string | null {
  const m = String(url ?? "")
    .trim()
    .match(
      /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/,
    );
  return m ? `${m[1]}/${m[2]}` : null;
}

export type StaleCandidate = {
  repository: string | null;
  grok_bot_addable: boolean;
  components: { type: string; link: string | null }[];
};

/** The repositories a plugin stands on, or null when there is none to judge by. */
export function reposOf(p: StaleCandidate): string[] | null {
  const own = githubRepo(p.repository);
  if (own) return [own];
  if (p.repository) return null;
  if (
    p.components.length === 0 ||
    !p.components.every((c) => c.type === "mcp_server")
  )
    return null;
  const repos = p.components.map((c) => githubRepo(c.link));
  return repos.every((r): r is string => r !== null)
    ? [...new Set(repos)]
    : null;
}

/** Why a plugin should be unpublished, or null to leave it. */
export function staleReason(
  p: StaleCandidate,
  state: (repo: string) => RepoState | null,
): string | null {
  if (p.grok_bot_addable) return null;
  const repos = reposOf(p);
  if (!repos) return null;
  const states = repos.map(state);
  if (states.some((s) => s === null)) return null;
  if (states.every((s) => s === "gone")) return GONE;
  const linkOnly = !p.repository;
  if (linkOnly && states.every((s) => s !== "alive")) return ARCHIVED;
  return null;
}

const GRAPHQL_BATCH = 50;

async function github(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "cursor-directory",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
}

/**
 * Whether each repository exists and is archived. A repository GitHub didn't
 * answer for, or refused, is left out of the result.
 */
export async function repoStates(
  repos: string[],
  token: string,
): Promise<Map<string, RepoState>> {
  const out = new Map<string, RepoState>();
  for (let i = 0; i < repos.length; i += GRAPHQL_BATCH) {
    const batch = repos.slice(i, i + GRAPHQL_BATCH);
    const query = `query{${batch
      .map((repo, j) => {
        const [owner, name] = repo.split("/");
        return `r${j}: repository(owner:${JSON.stringify(owner)}, name:${JSON.stringify(name)}){isArchived}`;
      })
      .join(" ")}}`;
    const res = await github("/graphql", token, {
      method: "POST",
      body: JSON.stringify({ query }),
    }).catch(() => null);
    if (!res?.ok) continue;
    const body = (await res.json().catch(() => null)) as {
      data?: Record<string, { isArchived: boolean } | null>;
      errors?: { type?: string; path?: string[] }[];
    } | null;
    if (!body?.data) continue;
    // A missing repository is null with a NOT_FOUND error; any other error
    // (rate limit, an organisation that blocks the token) means "unknown".
    const notFound = new Set(
      (body.errors ?? [])
        .filter((e) => e.type === "NOT_FOUND")
        .map((e) => e.path?.[0]),
    );
    batch.forEach((repo, j) => {
      const node = body.data?.[`r${j}`];
      if (node) out.set(repo, node.isArchived ? "archived" : "alive");
      else if (notFound.has(`r${j}`)) out.set(repo, "gone");
    });
  }
  return out;
}

/** A second look before unpublishing: the REST API must also say 404. */
async function confirmGone(repo: string, token: string): Promise<boolean> {
  const res = await github(`/repos/${repo}`, token).catch(() => null);
  return res?.status === 404;
}

export type CleanSummary = {
  /** Active community plugins looked at. */
  plugins: number;
  /** Distinct repositories they point at, and how many GitHub answered for. */
  repos: number;
  checked: number;
  gone: number;
  archived: number;
  /** Slugs unpublished (or, on a dry run, that would be). */
  unpublished: string[];
  /** Set when the run stopped without changing anything. */
  stopped?: string;
};

// The hosted Data API returns at most 100 rows per request.
const PAGE = 100;

type Row = {
  id: string;
  slug: string;
  repository: string | null;
  grok_bot_addable: boolean;
  plugin_components: {
    type: string;
    metadata: Record<string, unknown> | null;
  }[];
};

/**
 * Unpublishes active community plugins whose repository is gone (see the
 * rule at the top). Stops without changing anything when more than
 * `maxUnpublish` would go at once: that many usually means GitHub answered
 * wrongly, not that the repositories all vanished in a week.
 */
export async function cleanStalePlugins(
  supabase: SupabaseClient,
  {
    token,
    dryRun = false,
    maxUnpublish = 50,
    log = () => {},
  }: {
    token: string;
    dryRun?: boolean;
    maxUnpublish?: number;
    log?: (line: string) => void;
  },
): Promise<CleanSummary> {
  const plugins: (StaleCandidate & { id: string; slug: string })[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("plugins")
      .select(
        "id, slug, repository, grok_bot_addable, plugin_components(type, metadata)",
      )
      .eq("active", true)
      .is("marketplace_plugin_id", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Reading plugins failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data as Row[]) {
      plugins.push({
        id: row.id,
        slug: row.slug,
        repository: row.repository,
        grok_bot_addable: row.grok_bot_addable,
        components: (row.plugin_components ?? []).map((c) => ({
          type: c.type,
          link: typeof c.metadata?.link === "string" ? c.metadata.link : null,
        })),
      });
    }
  }

  const repos = [...new Set(plugins.flatMap((p) => reposOf(p) ?? []))];
  const states = await repoStates(repos, token);
  const count = (s: RepoState) =>
    [...states.values()].filter((v) => v === s).length;
  const summary: CleanSummary = {
    plugins: plugins.length,
    repos: repos.length,
    checked: states.size,
    gone: count("gone"),
    archived: count("archived"),
    unpublished: [],
  };
  log(
    `${summary.plugins} plugins point at ${summary.repos} repositories; GitHub answered for ${summary.checked}: ${summary.gone} gone, ${summary.archived} archived`,
  );
  // An answer for well under all of them means the token or GitHub is the
  // problem; next week will do.
  if (summary.checked < summary.repos * 0.9) {
    summary.stopped = "GitHub answered for too few repositories";
    log(`stopped: ${summary.stopped}`);
    return summary;
  }

  const stale: { id: string; slug: string; reason: string }[] = [];
  for (const p of plugins) {
    const reason = staleReason(p, (repo) => states.get(repo) ?? null);
    if (!reason) continue;
    const gone = (reposOf(p) ?? []).filter((r) => states.get(r) === "gone");
    const confirmed = await Promise.all(gone.map((r) => confirmGone(r, token)));
    if (confirmed.every(Boolean))
      stale.push({ id: p.id, slug: p.slug, reason });
  }
  if (stale.length > maxUnpublish) {
    summary.stopped = `${stale.length} plugins look stale, more than the ${maxUnpublish} allowed in one run`;
    summary.unpublished = stale.map((p) => p.slug);
    log(`stopped: ${summary.stopped}`);
    return summary;
  }

  for (const p of stale) {
    log(
      `${dryRun ? "would unpublish" : "unpublishing"} ${p.slug}: ${p.reason}`,
    );
    if (!dryRun) {
      await unpublishPlugin(
        {
          actorId: null,
          source: "system",
          clientId: "cron:clean-stale-plugins",
          db: async () => supabase,
          invalidate: () => {},
        },
        p.id,
        { reason: p.reason },
      );
    }
    summary.unpublished.push(p.slug);
  }
  return summary;
}
