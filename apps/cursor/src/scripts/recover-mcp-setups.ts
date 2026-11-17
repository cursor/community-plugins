// Finds a working setup for MCP servers whose stored one can't be used, so
// Grok Bot can add them (packages/plugins/src/grok-bot-add.ts). Two sources:
//
//   - A server address: an https URL kept where a Cursor install link
//     belongs, a URL inside text stored as the config, or the listing's own
//     website with /mcp added. It is only saved once it answers as an MCP
//     server, through the same guarded check the submit forms use.
//   - The repository's README: old listings link to a GitHub repo whose
//     README shows the config people paste into their client. A block is
//     only used when it works as written (parseMcpSetup) and names the
//     repository or its owner, so an example for some other server isn't
//     mistaken for this one.
//
// The setup is saved as metadata.config, which both directories read. Run
// refresh:grok-bot-addable afterwards.
//
//   bun run recover:mcp-setups [--dry-run] [--limit N]
import { type McpSetup, parseMcpSetup } from "@directories/plugins/mcp-config";
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

const NOT_A_SERVER = /github\.com|npmjs\.com|\/docs?\b/i;

/** Likely server URLs first: an /mcp or /sse path, or an mcp. host. */
function candidates(c: Component): string[] {
  const found = new Set<string>();
  for (const key of ["mcp_link", "link"]) {
    const link = c.metadata?.[key];
    const url = typeof link === "string" ? publicHttpsUrl(link) : null;
    if (!url || NOT_A_SERVER.test(url.href)) continue;
    found.add(url.href);
    // A listing's website often serves its MCP server at /mcp.
    if (url.pathname === "/") found.add(`${url.origin}/mcp`);
  }
  for (const m of (c.content ?? "").matchAll(/https:\/\/[^\s"'`<>)\]\\]+/g))
    found.add(m[0].replace(/[.,;:]+$/, ""));
  const score = (u: string) =>
    /\/(mcp|sse)(\/|$)/i.test(u) || /^https:\/\/mcp\./i.test(u) ? 0 : 1;
  return [...found]
    .filter((u) => !NOT_A_SERVER.test(u))
    .sort((a, b) => score(a) - score(b))
    .slice(0, MAX_CANDIDATES);
}

type Repo = { owner: string; name: string; branch: string; dir: string };

/** The GitHub repository (and folder, for a monorepo) a listing links to. */
function repoOf(c: Component): Repo | null {
  const link = c.metadata?.link;
  if (typeof link !== "string") return null;
  const m = link
    .trim()
    .match(
      /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+)(\/[^?#]*)?)?\/?(?:[?#].*)?$/,
    );
  if (!m) return null;
  return {
    owner: m[1],
    name: m[2],
    branch: m[3] ?? "HEAD",
    dir: (m[4] ?? "").replace(/\/README\.md$/i, "").replace(/\/$/, ""),
  };
}

async function readme(repo: Repo): Promise<string | null> {
  for (const file of ["README.md", "readme.md", "Readme.md"]) {
    const res = await fetch(
      `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${repo.branch}${repo.dir}/${file}`,
      { signal: AbortSignal.timeout(15_000) },
    ).catch(() => null);
    if (res?.ok) return await res.text();
  }
  return null;
}

// Words too common to tie a config to a repository.
const GENERIC = new Set(
  "mcp server servers the for and app api tool tools node python official labs dev inc org com main src model context protocol".split(
    " ",
  ),
);

/** The setup names the repository or its owner (a package, a host). */
function namesRepo(setup: McpSetup, repo: Repo): boolean {
  const text = (
    setup.kind === "remote" ? setup.url : setup.args.join(" ")
  ).toLowerCase();
  const words = `${repo.owner} ${repo.name} ${repo.dir}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !GENERIC.has(w));
  return (
    words.some((w) => text.includes(w)) ||
    text.includes(`${repo.owner}/${repo.name}`.toLowerCase())
  );
}

/** The first config block in a README that works as written for this repo. */
function setupFromReadme(
  name: string,
  text: string,
  repo: Repo,
): McpSetup | null {
  for (const m of text.matchAll(/```[a-zA-Z0-9]*[ \t]*\r?\n([\s\S]*?)```/g)) {
    const block = m[1];
    if (!/"mcpServers"|"command"\s*:|"url"\s*:/.test(block)) continue;
    const setup = parseMcpSetup(name, block, null);
    if (setup && namesRepo(setup, repo)) return setup;
  }
  return null;
}

/** The mcp.json entry for a setup. Values are never kept, only their names. */
function configOf(setup: McpSetup): Record<string, unknown> {
  const blank = (names: string[]) =>
    Object.fromEntries(names.map((n) => [n, ""]));
  return setup.kind === "remote"
    ? {
        url: setup.url,
        ...(setup.headers.length ? { headers: blank(setup.headers) } : {}),
      }
    : {
        command: setup.command,
        args: setup.args,
        ...(setup.env.length ? { env: blank(setup.env) } : {}),
      };
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
    if (!data || data.length === 0) return out;
    for (const row of data as unknown as (Component & {
      plugins: { unavailable_in: string[] | null };
    })[]) {
      if ((row.plugins.unavailable_in ?? []).includes("grok_bot")) continue;
      if (parseMcpSetup(row.name, row.content, row.metadata)) continue;
      if (candidates(row).length > 0 || repoOf(row)) out.push(row);
    }
  }
}

type Found = {
  config: Record<string, unknown>;
  source: "recovered" | "readme";
  extra: Record<string, unknown>;
  label: string;
};

async function find(c: Component): Promise<Found | null> {
  for (const url of candidates(c)) {
    // An address with a blank in it (?key=YOUR_KEY) isn't a setup.
    if (!parseMcpSetup(c.name, JSON.stringify({ url }), null)) continue;
    const result = await inspectMcpServer(url);
    if (!result.ok) continue;
    return {
      config: { url },
      source: "recovered",
      extra: {
        auth: result.auth,
        ...(result.tools ? { tools: result.tools } : {}),
      },
      label: `${url} (${result.auth})`,
    };
  }
  const repo = repoOf(c);
  const text = repo && (await readme(repo));
  const setup = repo && text ? setupFromReadme(c.name, text, repo) : null;
  if (!setup) return null;
  return {
    config: configOf(setup),
    source: "readme",
    extra: {},
    label:
      setup.kind === "remote"
        ? `${setup.url} (README)`
        : `${[setup.command, ...setup.args].join(" ")} (README)`,
  };
}

async function main() {
  const components = (await loadComponents()).slice(0, limit);
  console.log(
    `recover-mcp-setups: ${components.length} servers to look at${dryRun ? " (dry run)" : ""}`,
  );
  const db = await createClient();
  const recovered = { recovered: 0, readme: 0 };
  let checked = 0;
  let next = 0;
  const worker = async () => {
    while (next < components.length) {
      const c = components[next++];
      const found = await find(c).catch((err) => {
        console.log(`  ! ${c.plugins.slug}: ${String(err).slice(0, 120)}`);
        return null;
      });
      if (found) {
        recovered[found.source]++;
        console.log(`  ✓ ${c.plugins.slug}: ${found.label}`);
        if (!dryRun) {
          const { error } = await db
            .from("plugin_components")
            .update({
              metadata: {
                ...(c.metadata ?? {}),
                // The mcp.json shape, which cursor.directory's page reads too.
                config: { mcpServers: { [c.name]: found.config } },
                config_source: found.source,
                ...found.extra,
              },
            })
            .eq("id", c.id);
          if (error) throw error;
        }
      }
      checked++;
      if (checked % 100 === 0)
        console.log(
          `  ${checked}/${components.length} checked, ${recovered.recovered + recovered.readme} found`,
        );
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(
    `recover-mcp-setups: of ${components.length} servers, ${recovered.recovered} answered as MCP and ${recovered.readme} had a usable setup in their README${dryRun ? " (nothing saved)" : "; saved"}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
