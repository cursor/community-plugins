/**
 * Parse a public GitHub repo into a Cursor plugin shape.
 *
 * Pure module — no `"use server"`, no auth context, no DB calls. Safe to call
 * from server actions, queue workers, or one-shot scripts.
 *
 * Optional `GITHUB_TOKEN` env var bumps the rate limit on the Repos / git tree
 * endpoints from 60 req/h (unauth) to 5,000 req/h (auth).
 */

import { slugify } from "@/lib/slug";

export type ParsedComponent = {
  type: string;
  name: string;
  slug: string;
  description?: string;
  content?: string;
  metadata: Record<string, unknown>;
};

export type ParsedPlugin = {
  name: string;
  description: string;
  version?: string;
  logo?: string;
  homepage?: string;
  repository: string;
  license?: string;
  keywords: string[];
  author_name?: string;
  author_url?: string;
  author_avatar?: string;
  /** GitHub's stable numeric repo id (survives renames). */
  github_repo_id?: number;
  /** Star count at extraction time, useful for ranking the seed batch. */
  stars?: number;
  components: ParsedComponent[];
};

export class GitHubParseError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_url" | "repo_unreadable" | "no_components",
  ) {
    super(message);
    this.name = "GitHubParseError";
  }
}

function parseFrontmatter(input: string): {
  data: Record<string, unknown>;
  body: string;
} {
  const content = input.startsWith("\uFEFF") ? input.slice(1) : input;
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return { data: {}, body: content };
  }

  const endIndex = content.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return { data: {}, body: content };
  }

  const frontmatter = content.slice(4, endIndex);
  const body = content.slice(endIndex + 5);
  const data: Record<string, unknown> = {};
  let currentArrayKey: string | null = null;
  let currentObjectKey: string | null = null;
  const currentObject: Record<string, unknown> = {};

  for (const rawLine of frontmatter.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;

    if (currentObjectKey) {
      const subMatch = rawLine.match(/^\s{2,}(\w+):\s*(.+)$/);
      if (subMatch) {
        currentObject[subMatch[1]] = subMatch[2].replace(/^["']|["']$/g, "");
        continue;
      }
      data[currentObjectKey] = { ...currentObject };
      currentObjectKey = null;
      for (const k of Object.keys(currentObject)) delete currentObject[k];
    }

    if (currentArrayKey && rawLine.match(/^\s+-\s+/)) {
      const value = rawLine.replace(/^\s+-\s+/, "").replace(/^["']|["']$/g, "");
      (data[currentArrayKey] as string[]).push(value);
      continue;
    }

    const arrayKeyMatch = rawLine.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*$/);
    if (arrayKeyMatch) {
      currentArrayKey = arrayKeyMatch[1];
      data[currentArrayKey] = [];
      continue;
    }

    const kvMatch = rawLine.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s+(.+)$/);
    if (kvMatch) {
      currentArrayKey = null;
      data[kvMatch[1]] = kvMatch[2].replace(/^["']|["']$/g, "");
      continue;
    }

    const objectKeyMatch = rawLine.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*$/);
    if (objectKeyMatch && !currentArrayKey) {
      currentObjectKey = objectKeyMatch[1];
    }
  }

  if (currentObjectKey) {
    data[currentObjectKey] = { ...currentObject };
  }

  return { data, body };
}

export function parseGitHubUrl(
  url: string,
): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export function githubAuthHeaders(): Record<string, string> {
  return process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {};
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch with bounded retry on GitHub rate-limit (429 / 403 + retry-after).
 *
 * `maxWaitMs` caps the total time we'll spend sleeping across retries so this
 * remains safe to call from server actions (which have request timeouts).
 * Bulk scripts can pass a larger budget.
 */
export async function fetchWithRateLimit(
  url: string,
  init: RequestInit & { maxWaitMs?: number } = {},
): Promise<Response> {
  const maxWaitMs = init.maxWaitMs ?? 30_000;
  const maxAttempts = 4;
  let totalWait = 0;
  let lastRes: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, init);
    lastRes = res;

    if (res.status !== 429 && res.status !== 403) return res;

    // Distinguish "rate-limited" 403 from "forbidden" 403 by checking the
    // X-RateLimit-Remaining header. A real auth/permission 403 has remaining > 0.
    const remaining = Number(res.headers.get("x-ratelimit-remaining") ?? "");
    if (res.status === 403 && Number.isFinite(remaining) && remaining > 0) {
      return res;
    }

    const retryAfter = Number(res.headers.get("retry-after") ?? "");
    const reset = Number(res.headers.get("x-ratelimit-reset") ?? "0") * 1000;
    let waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.max(reset - Date.now(), 1000);
    waitMs = Math.min(waitMs, maxWaitMs - totalWait);

    if (waitMs <= 0 || attempt === maxAttempts) return res;

    totalWait += waitMs;
    await sleep(waitMs);
  }

  return lastRes as Response;
}

/**
 * Caller-controlled retry budget for GitHub API rate-limits.
 *
 * Server actions should pass a small value (e.g. 3000) so a transient 429 from
 * GitHub doesn't push them past the Vercel function timeout. The bulk seed
 * script can pass a larger budget (e.g. 30000) to ride out longer pauses.
 */
export type FetchOptions = { maxWaitMs?: number };

async function fetchGitHubFile(
  owner: string,
  repo: string,
  path: string,
): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

async function fetchGitHubTree(
  owner: string,
  repo: string,
  opts: FetchOptions = {},
): Promise<{ path: string; type: string }[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
  try {
    const res = await fetchWithRateLimit(url, {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github.v3+json",
        ...githubAuthHeaders(),
      },
      maxWaitMs: opts.maxWaitMs,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.tree ?? []).map((t: { path: string; type: string }) => ({
      path: t.path,
      type: t.type,
    }));
  } catch {
    return [];
  }
}

export type GitHubRepoMeta = {
  id: number;
  stars: number;
  fork: boolean;
  archived: boolean;
  default_branch: string;
  license_spdx: string | null;
};

/**
 * Resolve GitHub's stable numeric repo id from a repository URL.
 * Returns null for non-GitHub URLs or when the repo cannot be read.
 */
export async function resolveGithubRepoIdFromRepository(
  repository: string | null | undefined,
  opts: FetchOptions = {},
): Promise<number | null> {
  if (!repository) return null;
  const parsed = parseGitHubUrl(repository);
  if (!parsed) return null;
  const meta = await fetchGitHubRepoMeta(parsed.owner, parsed.repo, opts);
  return meta?.id ?? null;
}

export async function fetchGitHubRepoMeta(
  owner: string,
  repo: string,
  opts: FetchOptions = {},
): Promise<GitHubRepoMeta | null> {
  try {
    const res = await fetchWithRateLimit(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github.v3+json",
          ...githubAuthHeaders(),
        },
        maxWaitMs: opts.maxWaitMs,
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      id: Number(data.id),
      stars: Number(data.stargazers_count ?? 0),
      fork: Boolean(data.fork),
      archived: Boolean(data.archived),
      default_branch: String(data.default_branch ?? "HEAD"),
      license_spdx: data.license?.spdx_id ?? null,
    };
  } catch {
    return null;
  }
}

export async function parseGitHubPlugin(
  url: string,
  options: {
    repoMeta?: GitHubRepoMeta | null;
    /**
     * Caller-controlled rate-limit retry budget for the underlying GitHub API
     * calls. Server actions should pass a small value (e.g. 3000) to stay
     * under their function timeout; bulk scripts can pass 30000 (the default).
     */
    maxWaitMs?: number;
  } = {},
): Promise<ParsedPlugin> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    throw new GitHubParseError(
      "Invalid GitHub URL. Expected format: https://github.com/owner/repo",
      "invalid_url",
    );
  }

  const { owner, repo } = parsed;
  const fetchOpts: FetchOptions = { maxWaitMs: options.maxWaitMs };

  const tree = await fetchGitHubTree(owner, repo, fetchOpts);
  if (tree.length === 0) {
    throw new GitHubParseError(
      "Could not read repository. Make sure the repo exists, is public, and the URL is correct.",
      "repo_unreadable",
    );
  }

  const rootManifestPaths = [
    ".plugin/plugin.json",
    ".cursor-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    ".cursor-plugin/marketplace.json",
  ];
  let manifest: Record<string, unknown> = {};
  for (const mp of rootManifestPaths) {
    const content = await fetchGitHubFile(owner, repo, mp);
    if (content) {
      try {
        manifest = JSON.parse(content);
      } catch {
        // ignore invalid JSON
      }
      break;
    }
  }

  // Discover sub-plugin dirs. Two patterns are supported:
  //   1. Marketplace manifest lists `plugins[].source` (relative dirs).
  //   2. Any `<dir>/.cursor-plugin/plugin.json` in the tree.
  const subPluginDirs = new Set<string>();

  if (Array.isArray(manifest.plugins)) {
    for (const entry of manifest.plugins as Array<unknown>) {
      if (entry && typeof entry === "object") {
        const source = (entry as Record<string, unknown>).source;
        if (typeof source === "string" && source && !source.includes("..")) {
          subPluginDirs.add(`${source.replace(/^\/+|\/+$/g, "")}/`);
        }
      }
    }
  }

  for (const f of tree) {
    if (f.type !== "blob") continue;
    const m = f.path.match(/^(.+)\/\.cursor-plugin\/plugin\.json$/);
    if (m) subPluginDirs.add(`${m[1]}/`);
  }

  if (!manifest.name) {
    for (const dir of subPluginDirs) {
      const content = await fetchGitHubFile(
        owner,
        repo,
        `${dir}.cursor-plugin/plugin.json`,
      );
      if (!content) continue;
      try {
        const sub = JSON.parse(content);
        if (!manifest.name && sub.name) manifest.name = sub.name;
        if (!manifest.description && sub.description)
          manifest.description = sub.description;
        if (!manifest.version && sub.version) manifest.version = sub.version;
        if (!manifest.author && sub.author) manifest.author = sub.author;
        if (!manifest.keywords && sub.keywords)
          manifest.keywords = sub.keywords;
        if (!manifest.license && sub.license) manifest.license = sub.license;
        break;
      } catch {
        // ignore
      }
    }
  }

  const components: ParsedComponent[] = [];

  const prefixes = ["", ...subPluginDirs];

  for (const prefix of prefixes) {
    const ruleFiles = tree.filter(
      (f) =>
        f.type === "blob" &&
        new RegExp(`^${prefix}rules/.*\\.mdc$`).test(f.path),
    );
    for (const rf of ruleFiles) {
      const raw = await fetchGitHubFile(owner, repo, rf.path);
      if (!raw) continue;
      const { data, body } = parseFrontmatter(raw);
      const filename = rf.path.split("/").pop()?.replace(".mdc", "") ?? "";

      components.push({
        type: "rule",
        name:
          (data.title as string) || (data.description as string) || filename,
        slug: slugify(filename),
        description: (data.description as string) || body.trim().slice(0, 200),
        content: body.trim(),
        metadata: {
          tags: (data.tags as string[]) ?? [],
          libs: (data.libs as string[]) ?? [],
          ...(data.globs ? { globs: data.globs } : {}),
          ...(data.alwaysApply === true || data.alwaysApply === "true"
            ? { always_apply: true }
            : {}),
          ...(data.author
            ? {
                author_name: (data.author as Record<string, string>).name,
                author_url: (data.author as Record<string, string>).url,
                author_avatar: (data.author as Record<string, string>).avatar,
              }
            : {}),
        },
      });
    }

    for (const mcpPath of [`${prefix}.mcp.json`, `${prefix}mcp.json`]) {
      const mcpContent = await fetchGitHubFile(owner, repo, mcpPath);
      if (!mcpContent) continue;
      try {
        const mcpConfig = JSON.parse(mcpContent);
        const servers = mcpConfig.mcpServers ?? mcpConfig;
        for (const [name, config] of Object.entries(servers)) {
          const cfg = config as Record<string, unknown>;
          components.push({
            type: "mcp_server",
            name,
            slug: slugify(name),
            description: `MCP server: ${name}`,
            content: JSON.stringify(cfg, null, 2),
            metadata: {
              name,
              command: cfg.command,
              args: cfg.args,
              env: cfg.env,
              link: `https://github.com/${owner}/${repo}`,
            },
          });
        }
      } catch {
        // ignore
      }
    }

    const agentFiles = tree.filter(
      (f) =>
        f.type === "blob" &&
        new RegExp(`^${prefix}agents/.*\\.md$`).test(f.path),
    );
    for (const af of agentFiles) {
      const raw = await fetchGitHubFile(owner, repo, af.path);
      if (!raw) continue;
      const { data, body } = parseFrontmatter(raw);
      const filename = af.path.split("/").pop()?.replace(".md", "") ?? "";

      components.push({
        type: "agent",
        name: (data.name as string) || filename,
        slug: slugify(filename),
        description: (data.description as string) || body.trim().slice(0, 200),
        content: body.trim(),
        metadata: {},
      });
    }

    const skillFiles = tree.filter(
      (f) =>
        f.type === "blob" &&
        new RegExp(`^${prefix}skills/[^/]+/SKILL\\.md$`).test(f.path),
    );
    for (const sf of skillFiles) {
      const raw = await fetchGitHubFile(owner, repo, sf.path);
      if (!raw) continue;
      const { data, body } = parseFrontmatter(raw);
      const parts = sf.path.split("/");
      const dirName = parts[parts.indexOf("skills") + 1] ?? "";

      components.push({
        type: "skill",
        name: (data.name as string) || dirName,
        slug: slugify(dirName),
        description: (data.description as string) || body.trim().slice(0, 200),
        content: body.trim(),
        metadata: {},
      });
    }

    const commandFiles = tree.filter(
      (f) =>
        f.type === "blob" &&
        new RegExp(`^${prefix}commands/.*\\.md$`).test(f.path),
    );
    for (const cf of commandFiles) {
      const raw = await fetchGitHubFile(owner, repo, cf.path);
      if (!raw) continue;
      const { data, body } = parseFrontmatter(raw);
      const filename = cf.path.split("/").pop()?.replace(".md", "") ?? "";

      components.push({
        type: "command",
        name: filename,
        slug: slugify(filename),
        description: (data.description as string) || body.trim().slice(0, 200),
        content: body.trim(),
        metadata: {},
      });
    }

    const hooksContent = await fetchGitHubFile(
      owner,
      repo,
      `${prefix}hooks/hooks.json`,
    );
    if (hooksContent) {
      try {
        const hooksConfig = JSON.parse(hooksContent);
        components.push({
          type: "hook",
          name: "hooks",
          slug: `hooks${prefix ? `-${slugify(prefix)}` : ""}`,
          description: "Event hooks configuration",
          content: JSON.stringify(hooksConfig, null, 2),
          metadata: {},
        });
      } catch {
        // ignore
      }
    }

    const lspContent = await fetchGitHubFile(owner, repo, `${prefix}.lsp.json`);
    if (lspContent) {
      try {
        const lspConfig = JSON.parse(lspContent);
        for (const [name, config] of Object.entries(lspConfig)) {
          components.push({
            type: "lsp_server",
            name,
            slug: slugify(name),
            description: `LSP server: ${name}`,
            content: JSON.stringify(config, null, 2),
            metadata: config as Record<string, unknown>,
          });
        }
      } catch {
        // ignore
      }
    }
  }

  const seen = new Set<string>();
  const deduped = components.filter((c) => {
    const key = `${c.type}:${c.slug}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (deduped.length === 0) {
    const scannedPrefixes = prefixes
      .map((p) => (p === "" ? "repo root" : p.replace(/\/$/, "")))
      .join(", ");
    const hints = [
      "rules/*.mdc",
      ".mcp.json or mcp.json",
      "skills/*/SKILL.md",
      "agents/*.md",
      "commands/*.md",
      "hooks/hooks.json",
      ".lsp.json",
    ];
    throw new GitHubParseError(
      `No plugin components found in: ${scannedPrefixes}. ` +
        `We looked for: ${hints.join(", ")}. ` +
        `Make sure your repo follows the Open Plugins standard (https://open-plugins.com).`,
      "no_components",
    );
  }

  const author = manifest.author as Record<string, string> | undefined;

  let logo: string | undefined;
  if (typeof manifest.logo === "string" && manifest.logo) {
    try {
      const u = new URL(manifest.logo);
      if (u.protocol === "https:" || u.protocol === "http:") {
        logo = manifest.logo;
      }
    } catch {
      logo = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${manifest.logo.replace(/^\.?\//, "")}`;
    }
  }

  const repoMeta =
    options.repoMeta !== undefined
      ? options.repoMeta
      : await fetchGitHubRepoMeta(owner, repo, fetchOpts);

  return {
    name: (manifest.name as string) || repo,
    description:
      (manifest.description as string) || `${repo} plugin for Cursor`,
    version: (manifest.version as string) || "1.0.0",
    logo,
    homepage: (manifest.homepage as string) || undefined,
    repository: `https://github.com/${owner}/${repo}`,
    license:
      (manifest.license as string) ?? repoMeta?.license_spdx ?? undefined,
    keywords: (manifest.keywords as string[]) || [],
    author_name: author?.name,
    author_url: author?.url || author?.email,
    author_avatar: author?.avatar,
    github_repo_id: repoMeta?.id,
    stars: repoMeta?.stars,
    components: deduped,
  };
}
