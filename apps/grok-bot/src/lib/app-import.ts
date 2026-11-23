import {
  GitHubParseError,
  parseGitHubPlugin,
} from "@directories/plugins/github";
import {
  InsertPluginError,
  type InsertPluginInput,
  insertPlugin,
} from "@directories/plugins/insert";
import {
  inspectMcpServer,
  publicHttpsUrl,
} from "@directories/plugins/mcp-inspect";
import { slugify } from "@directories/plugins/slug";
import type { SupabaseClient } from "@supabase/supabase-js";
import { repoAddable, serverMetadata } from "@/lib/app-parts";

// Adds one candidate app the way a member's submission would be: a GitHub
// repository is parsed and must pass the "Grok Bot can add it" rule; a server
// address is connected to as an MCP client. Nothing is listed until
// cursor.directory's security scan passes it.
//
// Used by the bulk import, from a file (scripts/import-candidates.ts) or
// from the `app_import_candidates` table (api/cron/import-apps).

export type Candidate = {
  kind: "repo" | "server";
  /** "owner/name", or the server's address as submitted. */
  key: string;
  name: string;
  description: string;
  logo: string;
  homepage: string;
  /** Asked to be listed in Cursor too; the rest are Grok Bot only. */
  cursor: boolean;
  /** Its name is shared with another candidate: held for a person to name. */
  sharedName: boolean;
  /** Who to credit a server to, when that isn't its name. */
  publisher?: string;
  /** A repository's plugin under another name than its own manifest gives. */
  rename?: string;
  /** Its address in the directory, when the one made from the name won't do. */
  slug?: string;
  /**
   * List it although another plugin has the same name: a person decided the
   * two are different things (or that the other isn't shown where this is).
   */
  allowSameName?: boolean;
};

export type Outcome =
  | "added"
  | "exists"
  | "held_shared_name"
  | "held_name_taken"
  | "held_no_description"
  | "not_addable"
  | "no_components"
  | "repo_unreadable"
  | "not_mcp"
  | "invalid_address"
  | "unreachable"
  | "github_busy"
  | "error";

/** Worth another try later; everything else is settled. */
export const RETRY: Outcome[] = ["unreachable", "github_busy", "error"];

export const IMPORT_SOURCE = "import:marketplace-submissions";

export type Built =
  | { plugin: InsertPluginInput; githubRepoId: number | null }
  | { outcome: Outcome; detail?: Record<string, unknown> };

export type ImportResult = {
  outcome: Outcome;
  detail?: Record<string, unknown>;
};

/**
 * Another plugin already goes by this name. The database doesn't refuse a
 * second one (it gets a "-1" address), so it's checked here and the
 * candidate is held for a person to decide.
 */
async function nameTaken(
  supabase: SupabaseClient,
  name: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("plugins")
    .select("id")
    .ilike("name", name.trim().replace(/[\\%_]/g, "\\$&"))
    .limit(1);
  if (error) throw new Error(`name check failed: ${error.message}`);
  return (data ?? []).length > 0;
}

const https = (value: string): string | null => {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
};

/** A logo address that really serves an image, or null. */
export async function workingLogo(value: string): Promise<string | null> {
  // A GitHub page for a file isn't the file.
  const raw = value
    .trim()
    .replace(
      /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/,
      "https://raw.githubusercontent.com/$1/$2/$3",
    );
  const checked = publicHttpsUrl(raw);
  if (!checked) return null;
  try {
    const res = await fetch(checked, {
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
      headers: { accept: "image/*" },
    });
    const type = res.headers.get("content-type") ?? "";
    await res.body?.cancel();
    return res.ok && type.startsWith("image/") ? checked.toString() : null;
  } catch {
    return null;
  }
}

async function fromRepo(
  supabase: SupabaseClient,
  c: Candidate,
  githubWaitMs: number,
): Promise<Built> {
  let parsed: Awaited<ReturnType<typeof parseGitHubPlugin>>;
  try {
    parsed = await parseGitHubPlugin(`https://github.com/${c.key}`, {
      maxWaitMs: githubWaitMs,
    });
  } catch (err) {
    if (!(err instanceof GitHubParseError)) throw err;
    if (err.code === "no_components") return { outcome: "no_components" };
    if (err.code === "rate_limited") return { outcome: "github_busy" };
    return { outcome: "repo_unreadable", detail: { code: err.code } };
  }
  if (!repoAddable(parsed)) return { outcome: "not_addable" };
  const { data: existing } = await supabase
    .from("plugins")
    .select("slug")
    .eq("repository", parsed.repository)
    .limit(1)
    .maybeSingle();
  if (existing) return { outcome: "exists", detail: { slug: existing.slug } };
  const name = c.rename?.trim() || parsed.name;
  if (!c.allowSameName && (await nameTaken(supabase, name))) {
    return { outcome: "held_name_taken" };
  }
  return {
    githubRepoId: parsed.github_repo_id ?? null,
    plugin: {
      name,
      ...(c.slug ? { slug: c.slug } : {}),
      description: parsed.description,
      logo: parsed.logo ?? null,
      repository: parsed.repository,
      homepage: parsed.homepage ?? null,
      license: parsed.license ?? null,
      keywords: parsed.keywords,
      author_name: parsed.author_name ?? (c.publisher?.trim() || c.name),
      author_url: parsed.author_url ?? null,
      author_avatar: parsed.author_avatar ?? null,
      components: parsed.components,
    },
  };
}

async function fromServer(
  supabase: SupabaseClient,
  c: Candidate,
): Promise<Built> {
  if (c.sharedName) return { outcome: "held_shared_name" };
  const address = https(c.key);
  if (!address) return { outcome: "invalid_address" };
  const name = c.name.trim();
  const description = c.description.trim();
  if (name.length < 2 || name.length > 80)
    return { outcome: "held_name_taken" };
  if (description.length < 10 || description.length > 2000) {
    return { outcome: "held_no_description" };
  }
  const { data: existing } = await supabase
    .from("plugin_components")
    .select("plugins!inner(slug)")
    .eq("type", "mcp_server")
    .in("metadata->>url", [address, address.replace(/\/$/, ""), c.key])
    .limit(1)
    .maybeSingle();
  if (existing) {
    const { slug } = existing.plugins as unknown as { slug: string };
    return { outcome: "exists", detail: { slug } };
  }
  if (!c.allowSameName && (await nameTaken(supabase, name))) {
    return { outcome: "held_name_taken" };
  }
  const inspection = await inspectMcpServer(address);
  if (!inspection.ok) {
    return {
      outcome:
        inspection.error === "unreachable"
          ? "unreachable"
          : inspection.error === "not_mcp"
            ? "not_mcp"
            : "invalid_address",
    };
  }
  return {
    githubRepoId: null,
    plugin: {
      name,
      ...(c.slug ? { slug: c.slug } : {}),
      description,
      logo: await workingLogo(c.logo),
      homepage: https(c.homepage),
      author_name: c.publisher?.trim() || name,
      components: [
        {
          type: "mcp_server",
          name: slugify(name) || "server",
          description: `MCP server: ${name}`,
          content: JSON.stringify({ url: address }, null, 2),
          metadata: serverMetadata(address, inspection),
        },
      ],
    },
  };
}

/**
 * Checks a candidate and works out its listing, without adding it.
 * `githubWaitMs` is how long to wait out GitHub's rate limit before giving
 * up with `github_busy`.
 */
export function buildCandidate(
  supabase: SupabaseClient,
  c: Candidate,
  githubWaitMs: number,
): Promise<Built> {
  return c.kind === "repo"
    ? fromRepo(supabase, c, githubWaitMs)
    : fromServer(supabase, c);
}

/**
 * Adds what buildCandidate worked out. With `park` it goes in hidden and
 * unqueued, for the feed-parked-scans job to queue; otherwise its scan is
 * queued at once.
 */
export async function addBuilt(
  supabase: SupabaseClient,
  c: Candidate,
  built: Extract<Built, { plugin: InsertPluginInput }>,
  park: boolean,
): Promise<ImportResult> {
  try {
    const { id, slug } = await insertPlugin(supabase, built.plugin, {
      ownerId: null,
      source: IMPORT_SOURCE,
      githubRepoId: built.githubRepoId,
      park,
    });
    if (!c.cursor) {
      const { error } = await supabase
        .from("plugins")
        .update({ unavailable_in: ["cursor"] })
        .eq("id", id);
      if (error)
        throw new Error(
          `added ${slug} but couldn't mark it Grok Bot only: ${error.message}`,
        );
    }
    return {
      outcome: "added",
      detail: { id, slug, cursor: c.cursor, parked: park },
    };
  } catch (err) {
    if (err instanceof InsertPluginError && err.code === "duplicate_repo")
      return { outcome: "exists" };
    if (err instanceof InsertPluginError && err.code === "duplicate_name")
      return { outcome: "held_name_taken" };
    throw err;
  }
}

/** Checks one candidate and, if it passes, adds it parked. Never throws. */
export async function importCandidate(
  supabase: SupabaseClient,
  c: Candidate,
  githubWaitMs: number,
): Promise<ImportResult> {
  try {
    const built = await buildCandidate(supabase, c, githubWaitMs);
    if ("outcome" in built) return built;
    return await addBuilt(supabase, c, built, true);
  } catch (err) {
    return { outcome: "error", detail: { message: String(err).slice(0, 300) } };
  }
}
