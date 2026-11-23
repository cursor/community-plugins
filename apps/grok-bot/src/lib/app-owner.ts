import "server-only";

import {
  GitHubParseError,
  githubRepoUrlById,
  type ParsedPlugin,
  parseGitHubPlugin,
} from "@directories/plugins/github";
import { refreshGrokBotAddable } from "@directories/plugins/grok-bot-add";
import { inspectMcpServer } from "@directories/plugins/mcp-inspect";
import { enqueuePluginScan } from "@directories/plugins/queue";
import { resolveComponentSlug } from "@directories/plugins/slug";
import type { SupabaseClient } from "@supabase/supabase-js";
import { workingLogo } from "@/lib/app-import";
import { appChanged } from "@/lib/app-moderation";
import { repoAddable, serverMetadata } from "@/lib/app-parts";
import { type AppSource, appSource } from "@/lib/app-source";
import { submitLimit } from "@/lib/rate-limit";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

// What a member can change about their own listed app without an admin.
//
// A listing is a copy of its source, made when the app was submitted: a
// GitHub repository's plugin, or what a remote MCP server reported. Refresh
// reads the source again. Edit changes what the source doesn't decide: the
// logo and website of any app, and the name and description of a server
// (a repository's come from the repository).
//
// The security scan passed the app as it was. A change to its name, its
// description or what it's made of hides it and queues the scan again, the
// way a new submission waits for it; a new logo or website shows at once.

// A server action runs under the function timeout; a long GitHub rate-limit
// pause isn't waited out.
const GITHUB_MAX_WAIT_MS = 3000;

type StoredComponent = {
  type: string;
  name: string;
  slug: string;
  description: string | null;
  content: string | null;
  metadata: Record<string, unknown> | null;
  sort_order: number;
};

type OwnedApp = {
  id: string;
  slug: string;
  name: string;
  description: string;
  logo: string | null;
  homepage: string | null;
  repository: string | null;
  keywords: string[] | null;
  github_repo_id: number | null;
  marketplace_plugin_id: string | null;
  plugin_components: StoredComponent[];
};

const COLUMNS =
  "id, slug, name, description, logo, homepage, repository, keywords, github_repo_id, marketplace_plugin_id, plugin_components(type, name, slug, description, content, metadata, sort_order)";

/** The member's own app, if it's listed in the Grok Bot Directory. */
async function ownListedApp(
  admin: SupabaseClient,
  pluginId: string,
  ownerId: string,
): Promise<OwnedApp | null> {
  const { data, error } = await admin
    .from("plugins")
    .select(COLUMNS)
    .eq("id", pluginId)
    .eq("owner_id", ownerId)
    .eq("active", true)
    .eq("permanently_blocked", false)
    .eq("grok_bot_addable", true)
    .not("unavailable_in", "cs", "{grok_bot}")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as OwnedApp | null;
}

/** JSON with object keys in order, so equal values always read the same. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

type ComponentRow = Omit<StoredComponent, "metadata"> & {
  metadata: Record<string, unknown>;
};

/** What the scan judged: a component's kind, text and reported details. */
const fingerprint = (c: {
  type: string;
  slug: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
}) =>
  stable({
    type: c.type,
    slug: c.slug,
    content: c.content || "",
    metadata: c.metadata ?? {},
  });

function sameContents(before: StoredComponent[], after: ComponentRow[]) {
  const a = before.map(fingerprint).sort();
  const b = after.map(fingerprint).sort();
  return a.length === b.length && a.every((print, i) => print === b[i]);
}

async function nameTakenByAnother(
  admin: SupabaseClient,
  name: string,
  pluginId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("plugins")
    .select("id")
    .ilike("name", name.replace(/[\\%_]/g, "\\$&"))
    .neq("id", pluginId)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

type Details = {
  name: string;
  description: string;
  logo: string | null;
  homepage: string | null;
};

const detailsOf = (app: OwnedApp): Details => ({
  name: app.name,
  description: app.description,
  logo: app.logo,
  homepage: app.homepage,
});

/** The details that differ, by the name a person would give each. */
function changedDetails(before: Details, after: Details): string[] {
  return (["name", "description", "logo", "homepage"] as const)
    .filter((field) => (before[field] ?? "") !== (after[field] ?? ""))
    .map((field) => (field === "homepage" ? "website" : field));
}

/** Queues the scan for an app that was just hidden for it. */
async function queueScan(admin: SupabaseClient, app: OwnedApp) {
  try {
    await enqueuePluginScan(admin, app.id);
  } catch (err) {
    // cursor.directory's recover-stuck-scans job queues a plugin left
    // waiting, so the app isn't stranded.
    console.error(`[app-owner] queueing the scan of ${app.slug} failed:`, err);
  }
}

async function record(
  admin: SupabaseClient,
  app: OwnedApp,
  ownerId: string,
  action: "owner_edit" | "owner_refresh",
  reason: string,
  after: Details & { rescan: boolean },
) {
  const { error } = await admin.from("plugin_moderation_events").insert({
    plugin_id: app.id,
    plugin_slug: app.slug,
    action,
    actor_id: ownerId,
    source: "web",
    reason,
    before: detailsOf(app),
    after,
  });
  // The change is already made; a failed audit write is logged, not undone.
  if (error)
    console.error(`[app-owner] recording ${action} on ${app.slug} failed:`, {
      error: error.message,
    });
}

export type RefreshAppOutcome =
  /** The source says what the listing says. */
  | "unchanged"
  /** Only its logo, website or address changed: shown at once. */
  | "updated"
  /** Its name, description or contents changed: hidden until the scan passes. */
  | "checking"
  /** It isn't the member's, or isn't listed. */
  | "not_listed"
  /** An older listing with nothing to read again. */
  | "no_source"
  /** The repository can't be read, or no longer exists. */
  | "unreadable"
  /** The repository no longer holds anything Grok Bot can add. */
  | "not_usable"
  | "github_busy"
  /** The server didn't answer, or not as an MCP server. */
  | "unreachable"
  | "not_mcp"
  /** Its new name belongs to another listing. */
  | "name_taken"
  | "rate_limited";

type Read =
  | {
      details: Details;
      repository: string | null;
      keywords: string[];
      components: ComponentRow[];
    }
  | { failed: RefreshAppOutcome };

// A manifest that names no logo gets the owner's GitHub avatar from the
// parser. That stand-in never replaces a logo the member chose.
const isGitHubAvatar = (url: string) =>
  url.startsWith("https://avatars.githubusercontent.com/");

async function readRepo(
  app: OwnedApp,
  source: Extract<AppSource, { kind: "repo" }>,
): Promise<Read> {
  // By GitHub's id when it's known: that follows a rename or a move to
  // another owner, and can't be pointed at a different repository.
  let url = source.repository;
  if (app.github_repo_id != null) {
    const current = await githubRepoUrlById(app.github_repo_id, {
      maxWaitMs: GITHUB_MAX_WAIT_MS,
    });
    if (current === "gone") return { failed: "unreadable" };
    if (current) url = current;
  }
  let parsed: ParsedPlugin;
  try {
    parsed = await parseGitHubPlugin(url, { maxWaitMs: GITHUB_MAX_WAIT_MS });
  } catch (err) {
    if (!(err instanceof GitHubParseError)) throw err;
    if (err.code === "rate_limited") return { failed: "github_busy" };
    if (err.code === "no_components") return { failed: "not_usable" };
    return { failed: "unreadable" };
  }
  if (
    app.github_repo_id != null &&
    parsed.github_repo_id != null &&
    parsed.github_repo_id !== app.github_repo_id
  )
    return { failed: "unreadable" };
  if (!repoAddable(parsed)) return { failed: "not_usable" };
  const named = parsed.logo && !isGitHubAvatar(parsed.logo);
  return {
    details: {
      name: parsed.name,
      description: parsed.description,
      logo: named ? (parsed.logo ?? null) : (app.logo ?? parsed.logo ?? null),
      homepage: parsed.homepage ?? app.homepage,
    },
    repository: parsed.repository,
    keywords: parsed.keywords,
    components: parsed.components.map((c, i) => ({
      type: c.type,
      name: c.name,
      slug: resolveComponentSlug(c),
      description: c.description || null,
      content: c.content || null,
      metadata: c.metadata ?? {},
      sort_order: i,
    })),
  };
}

async function readServer(
  app: OwnedApp,
  source: Extract<AppSource, { kind: "server" }>,
): Promise<Read> {
  const inspection = await inspectMcpServer(source.url);
  if (!inspection.ok)
    return {
      failed: inspection.error === "not_mcp" ? "not_mcp" : "unreachable",
    };
  const [server] = app.plugin_components;
  return {
    // A server's listing was written by its owner; only what the server
    // reports (its tools, whether it asks for a sign-in) is read again.
    details: detailsOf(app),
    repository: null,
    keywords: app.keywords ?? [],
    components: [
      {
        ...server,
        metadata: serverMetadata(source.url, inspection),
        sort_order: 0,
      },
    ],
  };
}

/**
 * Reads one of the member's listed apps from its source again and brings the
 * listing up to date.
 */
export async function refreshApp(
  pluginId: string,
  ownerId: string,
): Promise<RefreshAppOutcome> {
  const admin = await createAdminClient();
  const app = await ownListedApp(admin, pluginId, ownerId);
  if (!app) return "not_listed";
  const source = appSource({
    repository: app.repository,
    marketplace_plugin_id: app.marketplace_plugin_id,
    components: app.plugin_components,
  });
  if (!source) return "no_source";

  const read =
    source.kind === "repo"
      ? await readRepo(app, source)
      : await readServer(app, source);
  if ("failed" in read) return read.failed;

  const changed = changedDetails(detailsOf(app), read.details);
  const contents = !sameContents(app.plugin_components, read.components);
  const moved = (read.repository ?? null) !== (app.repository ?? null);
  const keywords =
    stable(read.keywords) !== stable(app.keywords ?? ([] as string[]));
  if (changed.length === 0 && !contents && !moved && !keywords)
    return "unchanged";

  const rescan =
    contents || changed.includes("name") || changed.includes("description");
  if (rescan && !(await submitLimit(ownerId)).success) return "rate_limited";
  if (
    changed.includes("name") &&
    (await nameTakenByAnother(admin, read.details.name, app.id))
  )
    return "name_taken";

  const { error } = await admin.rpc("update_plugin_with_components", {
    p_plugin_id: app.id,
    p_name: read.details.name,
    p_description: read.details.description,
    p_logo: read.details.logo,
    p_repository: read.repository,
    p_homepage: read.details.homepage,
    p_keywords: read.keywords,
    p_components: read.components,
    p_deactivate_for_scan: rescan,
  });
  if (error) {
    // Where names are unique in the database, it says so here.
    if (error.code === "23505") return "name_taken";
    throw new Error(error.message);
  }
  try {
    await refreshGrokBotAddable(admin, app.id);
  } catch (err) {
    console.error(`[app-owner] grok_bot_addable of ${app.slug} failed:`, err);
  }
  if (rescan) await queueScan(admin, app);
  await record(
    admin,
    app,
    ownerId,
    "owner_refresh",
    `Refreshed from its ${source.kind === "repo" ? "repository" : "server"}${
      contents ? "; its contents changed" : ""
    }`,
    { ...read.details, rescan },
  );
  await appChanged(app.slug);
  return rescan ? "checking" : "updated";
}

export type EditAppInput = {
  name?: string;
  description?: string;
  logo?: string;
  homepage?: string;
};

export type EditAppOutcome =
  | "unchanged"
  | "updated"
  | "checking"
  | "not_listed"
  /** A name of 2–80 characters, a description of 10–2000, https links. */
  | "invalid_details"
  /** The logo's address doesn't serve an image. */
  | "bad_logo"
  | "name_taken"
  | "rate_limited";

/** An https address as written, null when empty, false when it isn't one. */
function httpsOrEmpty(value: string | undefined): string | null | false {
  const text = String(value ?? "").trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : false;
  } catch {
    return false;
  }
}

/**
 * Changes one of the member's listed apps by hand: its logo and website,
 * and for a server its name and description.
 */
export async function editApp(
  pluginId: string,
  ownerId: string,
  input: EditAppInput,
): Promise<EditAppOutcome> {
  const admin = await createAdminClient();
  const app = await ownListedApp(admin, pluginId, ownerId);
  if (!app) return "not_listed";
  const source = appSource({
    repository: app.repository,
    marketplace_plugin_id: app.marketplace_plugin_id,
    components: app.plugin_components,
  });

  const logo = httpsOrEmpty(input?.logo);
  const homepage = httpsOrEmpty(input?.homepage);
  if (logo === false || homepage === false) return "invalid_details";
  const next: Details = { ...detailsOf(app), logo, homepage };
  // A repository's name and description are the repository's to give.
  if (source?.kind !== "repo") {
    next.name = String(input?.name ?? "").trim();
    next.description = String(input?.description ?? "").trim();
    if (
      next.name.length < 2 ||
      next.name.length > 80 ||
      next.description.length < 10 ||
      next.description.length > 2000
    )
      return "invalid_details";
  }

  const changed = changedDetails(detailsOf(app), next);
  if (changed.length === 0) return "unchanged";
  if (changed.includes("logo") && logo) {
    const working = await workingLogo(logo);
    if (!working) return "bad_logo";
    next.logo = working;
  }
  const rescan = changed.includes("name") || changed.includes("description");
  if (rescan && !(await submitLimit(ownerId)).success) return "rate_limited";
  if (
    changed.includes("name") &&
    (await nameTakenByAnother(admin, next.name, app.id))
  )
    return "name_taken";

  const { data: saved, error } = await admin
    .from("plugins")
    .update({
      ...next,
      ...(rescan
        ? {
            active: false,
            scan_status: "pending",
            flag_summary: null,
            flag_reasons: [],
            flag_severity: null,
            flagged_at: null,
          }
        : {}),
    })
    .eq("id", app.id)
    .eq("owner_id", ownerId)
    .eq("active", true)
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return "name_taken";
    throw new Error(error.message);
  }
  if (!saved) return "not_listed";
  if (rescan) await queueScan(admin, app);
  await record(
    admin,
    app,
    ownerId,
    "owner_edit",
    `Changed its ${changed.join(", ")}`,
    { ...next, rescan },
  );
  await appChanged(app.slug);
  return rescan ? "checking" : "updated";
}
