"use server";

import {
  GitHubParseError,
  type ParsedPlugin,
  parseGitHubPlugin,
  parseGitHubUrl,
} from "@directories/plugins/github";
import { InsertPluginError, insertPlugin } from "@directories/plugins/insert";
import {
  inspectMcpServer,
  type McpTool,
  type SuggestedDetails,
  suggestDetails,
} from "@directories/plugins/mcp-inspect";
import { slugify } from "@directories/plugins/slug";
import { revalidatePath } from "next/cache";
import { repoAddable, serverMetadata } from "@/lib/app-parts";
import { getViewer } from "@/lib/auth";
import { submitLimit } from "@/lib/rate-limit";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

// Server actions run under the function timeout; don't wait out long GitHub
// rate-limit pauses.
const GITHUB_MAX_WAIT_MS = 3000;

export type AppPart = { type: string; name: string };

export type RepoPreview =
  | {
      ok: true;
      name: string;
      description: string;
      logo: string | null;
      repository: string;
      parts: AppPart[];
      /** Grok Bot can add it as it stands (see `addable`). */
      usable: boolean;
      existing: { slug: string; listed: boolean; yours: boolean } | null;
      stars: number | null;
      archived: boolean;
      pushedAt: string | null;
    }
  | {
      ok: false;
      error:
        | "invalid"
        | "unreadable"
        | "no_components"
        | "github_busy"
        | "unavailable";
    };

function parseError(
  err: unknown,
): "invalid" | "unreadable" | "no_components" | "github_busy" {
  if (err instanceof GitHubParseError) {
    if (err.code === "invalid_url") return "invalid";
    if (err.code === "no_components") return "no_components";
    if (err.code === "rate_limited") return "github_busy";
    return "unreadable";
  }
  throw err;
}

async function findExisting(repository: string) {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("plugins")
    .select("slug, active, owner_id")
    .eq("repository", repository)
    .limit(1)
    .maybeSingle();
  return data;
}

const partsOf = (parsed: ParsedPlugin): AppPart[] =>
  parsed.components.map((c) => ({ type: c.type, name: c.name }));

/** Reads a GitHub repository the way cursor.directory does, for the preview. */
export async function previewAppRepo(url: string): Promise<RepoPreview> {
  if (!parseGitHubUrl(String(url ?? "")))
    return { ok: false, error: "invalid" };
  let parsed: ParsedPlugin;
  try {
    parsed = await parseGitHubPlugin(url, { maxWaitMs: GITHUB_MAX_WAIT_MS });
  } catch (err) {
    return { ok: false, error: parseError(err) };
  }
  const [viewer, row] = await Promise.all([
    getViewer(),
    findExisting(parsed.repository),
  ]);
  const parts = partsOf(parsed);
  return {
    ok: true,
    name: parsed.name,
    description: parsed.description,
    logo: parsed.logo ?? null,
    repository: parsed.repository,
    parts,
    usable: repoAddable(parsed),
    stars: parsed.stars ?? null,
    archived: parsed.archived ?? false,
    pushedAt: parsed.pushed_at ?? null,
    existing: row
      ? {
          slug: row.slug,
          listed: row.active,
          yours: !!viewer && row.owner_id === viewer.id,
        }
      : null,
  };
}

export type ServerPreview =
  | {
      ok: true;
      /** Name, description, website and logo the server or its site report. */
      suggested: SuggestedDetails;
      /** Null when the server lists them only after sign-in. */
      tools: McpTool[] | null;
      signIn: boolean;
    }
  | {
      ok: false;
      error: "signed_out" | "invalid_server" | "unreachable" | "not_mcp";
    };

const INSPECT_ERRORS = {
  invalid: "invalid_server",
  blocked: "invalid_server",
  unreachable: "unreachable",
  not_mcp: "not_mcp",
} as const;

/**
 * Connects to a pasted MCP server the way Grok Bot would, for the form's
 * preview and prefill. Signed-in members only: it fetches the address they
 * give (with mcp-inspect's guards).
 */
export async function previewMcpServer(url: string): Promise<ServerPreview> {
  if (!(await getViewer())) return { ok: false, error: "signed_out" };
  const inspection = await inspectMcpServer(String(url ?? ""));
  if (!inspection.ok)
    return { ok: false, error: INSPECT_ERRORS[inspection.error] };
  return {
    ok: true,
    suggested: suggestDetails(inspection),
    tools: inspection.tools,
    signIn: inspection.auth === "oauth",
  };
}

export type SubmitAppInput =
  | { kind: "repo"; url: string }
  | {
      kind: "server";
      url: string;
      name: string;
      description: string;
      logo?: string;
      homepage?: string;
    };

export type SubmitAppResult =
  | { ok: true; slug: string }
  | {
      ok: false;
      error:
        | "signed_out"
        | "rate_limited"
        | "invalid"
        | "invalid_server"
        | "unreachable"
        | "not_mcp"
        | "invalid_details"
        | "unreadable"
        | "no_components"
        | "github_busy"
        | "not_usable"
        | "duplicate";
    };

const httpsUrl = (value: string | undefined) => {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

/**
 * Submits an app as a cursor.directory plugin owned by the member. It gets
 * cursor.directory's security scan; a safe result lists it on both sites.
 */
export async function submitApp(
  input: SubmitAppInput,
): Promise<SubmitAppResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "signed_out" };
  if (!(await submitLimit(viewer.id)).success)
    return { ok: false, error: "rate_limited" };

  let plugin: Parameters<typeof insertPlugin>[1];
  let githubRepoId: number | null = null;

  if (input?.kind === "repo") {
    // Read the repository again server-side; never trust what the form showed.
    let parsed: ParsedPlugin;
    try {
      parsed = await parseGitHubPlugin(String(input.url ?? ""), {
        maxWaitMs: GITHUB_MAX_WAIT_MS,
      });
    } catch (err) {
      return { ok: false, error: parseError(err) };
    }
    if (!repoAddable(parsed)) return { ok: false, error: "not_usable" };
    githubRepoId = parsed.github_repo_id ?? null;
    plugin = {
      name: parsed.name,
      description: parsed.description,
      logo: parsed.logo ?? null,
      repository: parsed.repository,
      homepage: parsed.homepage ?? null,
      license: parsed.license ?? null,
      keywords: parsed.keywords,
      author_name: parsed.author_name ?? viewer.name,
      author_url: parsed.author_url ?? null,
      author_avatar: parsed.author_avatar ?? null,
      components: parsed.components,
    };
  } else if (input?.kind === "server") {
    const url = httpsUrl(input.url);
    if (!url) return { ok: false, error: "invalid_server" };
    const name = String(input.name ?? "").trim();
    const description = String(input.description ?? "").trim();
    if (
      name.length < 2 ||
      name.length > 80 ||
      description.length < 10 ||
      description.length > 2000 ||
      (input.logo && !httpsUrl(input.logo)) ||
      (input.homepage && !httpsUrl(input.homepage))
    ) {
      return { ok: false, error: "invalid_details" };
    }
    // Connect again server-side; never trust what the form showed. Only real
    // MCP servers are listed. What it reports goes on the component, where
    // the app page and cursor.directory's security scan read it.
    const inspection = await inspectMcpServer(url);
    if (!inspection.ok)
      return { ok: false, error: INSPECT_ERRORS[inspection.error] };
    const serverName = slugify(name) || "server";
    plugin = {
      name,
      description,
      logo: httpsUrl(input.logo),
      homepage: httpsUrl(input.homepage),
      author_name: viewer.name,
      components: [
        {
          type: "mcp_server",
          name: serverName,
          description: `MCP server: ${name}`,
          content: JSON.stringify({ url }, null, 2),
          metadata: serverMetadata(url, inspection),
        },
      ],
    };
  } else {
    return { ok: false, error: "invalid" };
  }

  try {
    const { slug } = await insertPlugin(await createAdminClient(), plugin, {
      ownerId: viewer.id,
      source: "grok-bot",
      githubRepoId,
      skipScan: false,
    });
    revalidatePath("/my-bots");
    return { ok: true, slug };
  } catch (err) {
    if (
      err instanceof InsertPluginError &&
      (err.code === "duplicate_name" || err.code === "duplicate_repo")
    ) {
      return { ok: false, error: "duplicate" };
    }
    throw err;
  }
}
