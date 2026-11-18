// Adds candidate apps in bulk, each the way a member's submission would be:
// a GitHub repository is parsed and must pass the "Grok Bot can add it" rule;
// a server address is connected to as an MCP client. Nothing is listed until
// cursor.directory's security scan passes it.
//
//   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY=… GITHUB_TOKEN=… \
//     bun run --conditions=react-server src/scripts/import-candidates.ts \
//     <candidates.json> <log.jsonl> --park [--limit N]
//
// <candidates.json> is a list of { kind: "repo" | "server", key, name,
// description, logo, homepage, cursor, sharedName } (see Candidate below),
// plus optional publisher, rename, slug and allowSameName for ones a person
// decided on.
//
// The scan queue handles about one plugin a minute and members' submissions
// share it, so imports must not be queued all at once:
//   --park      adds every candidate hidden and unqueued; the site's
//               feed-parked-scans cron then queues them one at a time. Use
//               this: the script finishes in minutes.
//   (default)   queues each one itself, and adds the next only when at most
//               `--waiting` plugins (default 2) are waiting for a scan. This
//               takes as long as the scans do.
// It can be stopped and started again; the log says what is already done.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { worksInGrokBot } from "@directories/plugins/apps";
import {
  GitHubParseError,
  parseGitHubPlugin,
} from "@directories/plugins/github";
import { addParts, grokBotAddUrl } from "@directories/plugins/grok-bot-add";
import {
  InsertPluginError,
  type InsertPluginInput,
  insertPlugin,
} from "@directories/plugins/insert";
import {
  inspectMcpServer,
  publicHttpsUrl,
} from "@directories/plugins/mcp-inspect";
import { resolveComponentSlug, slugify } from "@directories/plugins/slug";
import { createClient } from "@supabase/supabase-js";

type Candidate = {
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

type Outcome =
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

// Worth another try on the next run; everything else is settled.
const RETRY: Outcome[] = ["unreachable", "github_busy", "error"];

const SOURCE = "import:marketplace-submissions";
const POLL_MS = 30_000;
const GIVE_UP_WAITING_MS = 45 * 60_000;

const args = process.argv.slice(2);
const [input, logFile] = args;
const flag = (name: string, fallback: number) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : Number(args[at + 1]);
};
const park = args.includes("--park");
const limit = flag("--limit", Number.POSITIVE_INFINITY);
const maxWaiting = flag("--waiting", 2);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!input || !logFile || !url || !secret) {
  console.error("needs <candidates.json> <log.jsonl> and the Supabase env");
  process.exit(1);
}
const supabase = createClient(url, secret, { auth: { persistSession: false } });

const candidates = JSON.parse(readFileSync(input, "utf8")) as Candidate[];
const settled = new Set<string>();
if (existsSync(logFile)) {
  for (const line of readFileSync(logFile, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as { key: string; outcome: Outcome };
    if (RETRY.includes(entry.outcome)) settled.delete(entry.key);
    else settled.add(entry.key);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);

function record(
  c: Candidate,
  outcome: Outcome,
  detail: Record<string, unknown> = {},
) {
  appendFileSync(
    logFile,
    `${JSON.stringify({ at: new Date().toISOString(), key: c.key, kind: c.kind, outcome, ...detail })}\n`,
  );
  console.log(
    `${stamp()} ${outcome.padEnd(20)} ${c.key}${detail.slug ? ` -> ${detail.slug}` : ""}`,
  );
}

/** Plugins waiting for, or in, a security scan. */
async function waiting(): Promise<number> {
  const { count, error } = await supabase
    .from("plugins")
    .select("id", { count: "exact", head: true })
    .in("scan_status", ["pending", "scanning"]);
  if (error) throw new Error(`count failed: ${error.message}`);
  return count ?? 0;
}

async function waitForRoom() {
  const started = Date.now();
  for (;;) {
    const n = await waiting();
    if (n <= maxWaiting) return;
    if (Date.now() - started > GIVE_UP_WAITING_MS) {
      throw new Error(
        `${n} plugins have been waiting for a scan for 45 minutes; the scan queue isn't draining. Stopped.`,
      );
    }
    await sleep(POLL_MS);
  }
}

/**
 * Another plugin already goes by this name. The database doesn't refuse a
 * second one (it gets a "-1" address), so it's checked here and the
 * candidate is held for a person to decide.
 */
async function nameTaken(name: string): Promise<boolean> {
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
async function workingLogo(value: string): Promise<string | null> {
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

type Built =
  | { plugin: InsertPluginInput; githubRepoId: number | null }
  | { outcome: Outcome; detail?: Record<string, unknown> };

async function fromRepo(c: Candidate): Promise<Built> {
  let parsed: Awaited<ReturnType<typeof parseGitHubPlugin>>;
  try {
    parsed = await parseGitHubPlugin(`https://github.com/${c.key}`, {
      maxWaitMs: 120_000,
    });
  } catch (err) {
    if (!(err instanceof GitHubParseError)) throw err;
    if (err.code === "no_components") return { outcome: "no_components" };
    if (err.code === "rate_limited") return { outcome: "github_busy" };
    return { outcome: "repo_unreadable", detail: { code: err.code } };
  }
  const usable =
    worksInGrokBot(parsed.components.map((p) => p.type)) &&
    grokBotAddUrl(
      slugify(parsed.name) || "app",
      addParts(
        parsed.components.map((p) => ({
          type: p.type,
          name: p.name,
          slug: resolveComponentSlug(p),
          content: p.content ?? null,
          metadata: p.metadata ?? null,
        })),
      ),
    ) !== null;
  if (!usable) return { outcome: "not_addable" };
  const { data: existing } = await supabase
    .from("plugins")
    .select("slug")
    .eq("repository", parsed.repository)
    .limit(1)
    .maybeSingle();
  if (existing) return { outcome: "exists", detail: { slug: existing.slug } };
  const name = c.rename?.trim() || parsed.name;
  if (!c.allowSameName && (await nameTaken(name))) {
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
      author_name: parsed.author_name ?? c.name,
      author_url: parsed.author_url ?? null,
      author_avatar: parsed.author_avatar ?? null,
      components: parsed.components,
    },
  };
}

async function fromServer(c: Candidate): Promise<Built> {
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
  if (!c.allowSameName && (await nameTaken(name))) {
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
          metadata: {
            url: address,
            auth: inspection.auth,
            ...(inspection.server.name || inspection.server.version
              ? {
                  server: {
                    name: inspection.server.name,
                    version: inspection.server.version,
                  },
                }
              : {}),
            ...(inspection.tools ? { tools: inspection.tools } : {}),
          },
        },
      ],
    },
  };
}

let added = 0;
let failures = 0;
for (const c of candidates) {
  if (added >= limit) break;
  if (settled.has(c.key)) continue;
  try {
    const built = await (c.kind === "repo" ? fromRepo(c) : fromServer(c));
    if ("outcome" in built) {
      record(c, built.outcome, built.detail);
      continue;
    }
    if (!park) await waitForRoom();
    const { id, slug } = await insertPlugin(supabase, built.plugin, {
      ownerId: null,
      source: SOURCE,
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
    added++;
    failures = 0;
    record(c, "added", { id, slug, cursor: c.cursor, parked: park });
  } catch (err) {
    if (err instanceof InsertPluginError && err.code === "duplicate_repo") {
      record(c, "exists");
      continue;
    }
    if (err instanceof InsertPluginError && err.code === "duplicate_name") {
      record(c, "held_name_taken");
      continue;
    }
    record(c, "error", { message: String(err).slice(0, 300) });
    if (++failures >= 5 || String(err).includes("Stopped.")) {
      console.error("stopping:", String(err));
      process.exit(1);
    }
  }
}
console.log(`${stamp()} finished this run: ${added} added`);
