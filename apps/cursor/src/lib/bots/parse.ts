/**
 * Parse a public GitHub repo into a bot listing.
 *
 * Do not call parseGitHubPlugin here. That parser requires Open Plugins
 * files and maps `agents/*.md` to plugin components. A bot listing is a
 * use-case template (`bot.json` / `BOT.md`). Reuse would reject a valid bot
 * repo (`no_components`) and would ingest agent files as this listing's body.
 */

import {
  type FetchOptions,
  fetchGitHubRepoMeta,
  fetchWithRateLimit,
  githubAuthHeaders,
  parseGitHubUrl,
} from "@/lib/github-plugin/parse";
import { slugify } from "@/lib/slug";
import { type BotNeed, botNeedSchema } from "./types";

export type ParsedBot = {
  name: string;
  description: string;
  writeup: string;
  template: string;
  needs: BotNeed[];
  repository: string;
  homepage?: string;
  github_repo_id?: number;
};

export class BotParseError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid_url"
      | "repo_unreadable"
      | "no_bot"
      | "open_plugin_agent",
  ) {
    super(message);
    this.name = "BotParseError";
  }
}

const MANIFEST_PATHS = ["bot.json", ".cursor/bot.json"];
const TEMPLATE_PATHS = ["BOT.md", "bot.md", "template.md"];
const WRITEUP_PATHS = ["WRITEUP.md", "writeup.md", "README.md"];

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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parseNeeds(manifest: Record<string, unknown>): BotNeed[] {
  const needs: BotNeed[] = [];

  const plugins = manifest.plugins;
  if (Array.isArray(plugins)) {
    for (const entry of plugins) {
      if (typeof entry === "string" && entry.trim()) {
        const name = entry.trim();
        needs.push({ kind: "plugin", name, slug: slugify(name) });
        continue;
      }
      const rec = asRecord(entry);
      if (!rec) continue;
      const name = typeof rec.name === "string" ? rec.name.trim() : "";
      if (!name) continue;
      const parsed = botNeedSchema.safeParse({
        kind: "plugin",
        name,
        ...(typeof rec.slug === "string" && rec.slug.trim()
          ? { slug: rec.slug.trim() }
          : { slug: slugify(name) }),
        ...(typeof rec.repository === "string" && rec.repository.trim()
          ? { repository: rec.repository.trim() }
          : {}),
      });
      if (parsed.success) needs.push(parsed.data);
    }
  }

  const skills = manifest.skills;
  if (Array.isArray(skills)) {
    for (const entry of skills) {
      if (typeof entry === "string" && entry.trim()) {
        needs.push({ kind: "skill", name: entry.trim() });
        continue;
      }
      const rec = asRecord(entry);
      if (!rec) continue;
      const name = typeof rec.name === "string" ? rec.name.trim() : "";
      if (!name) continue;
      needs.push({ kind: "skill", name });
    }
  }

  return needs;
}

function hasOpenPluginAgents(tree: { path: string; type: string }[]): boolean {
  return tree.some(
    (f) => f.type === "blob" && /(^|\/)agents\/[^/]+\.md$/.test(f.path),
  );
}

export async function parseGitHubBot(
  url: string,
  options: { maxWaitMs?: number } = {},
): Promise<ParsedBot> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    throw new BotParseError(
      "Invalid GitHub URL. Expected format: https://github.com/owner/repo",
      "invalid_url",
    );
  }

  const { owner, repo } = parsed;
  const fetchOpts: FetchOptions = { maxWaitMs: options.maxWaitMs };

  const tree = await fetchGitHubTree(owner, repo, fetchOpts);
  if (tree.length === 0) {
    throw new BotParseError(
      "Could not read repository. Make sure the repo exists, is public, and the URL is correct.",
      "repo_unreadable",
    );
  }

  let manifest: Record<string, unknown> = {};
  let foundManifest = false;
  for (const path of MANIFEST_PATHS) {
    const content = await fetchGitHubFile(owner, repo, path);
    if (!content) continue;
    try {
      const json: unknown = JSON.parse(content);
      const rec = asRecord(json);
      if (rec) {
        manifest = rec;
        foundManifest = true;
        break;
      }
    } catch {
      throw new BotParseError(`Could not parse ${path} as JSON.`, "no_bot");
    }
  }

  let template =
    typeof manifest.template === "string" ? manifest.template.trim() : "";
  if (!template) {
    for (const path of TEMPLATE_PATHS) {
      const content = await fetchGitHubFile(owner, repo, path);
      if (content?.trim()) {
        template = content.trim();
        break;
      }
    }
  }

  let writeup =
    typeof manifest.writeup === "string" ? manifest.writeup.trim() : "";
  if (!writeup) {
    for (const path of WRITEUP_PATHS) {
      const content = await fetchGitHubFile(owner, repo, path);
      if (content?.trim()) {
        writeup = content.trim();
        break;
      }
    }
  }

  const name =
    (typeof manifest.name === "string" && manifest.name.trim()) ||
    repo.replace(/[-_]+/g, " ");
  const description =
    (typeof manifest.description === "string" && manifest.description.trim()) ||
    writeup.slice(0, 180) ||
    template.slice(0, 180);

  if (!template || !writeup) {
    if (!foundManifest && hasOpenPluginAgents(tree)) {
      throw new BotParseError(
        "This repo looks like an Open Plugins agent (`agents/*.md`). That is a plugin component, not a bot listing. Submit it at /plugins/new. A bot repo needs bot.json or BOT.md plus a use-case writeup.",
        "open_plugin_agent",
      );
    }
    throw new BotParseError(
      "No bot listing found. Add bot.json (name, description, template, writeup, plugins, skills) or BOT.md plus a README/WRITEUP.md. Open Plugins `agents/*.md` files are plugins, not bots.",
      "no_bot",
    );
  }

  const homepage =
    typeof manifest.homepage === "string" && manifest.homepage.trim()
      ? manifest.homepage.trim()
      : undefined;

  const meta = await fetchGitHubRepoMeta(owner, repo, fetchOpts);

  return {
    name,
    description: description.slice(0, 280),
    writeup,
    template,
    needs: parseNeeds(manifest),
    repository: `https://github.com/${owner}/${repo}`,
    homepage,
    github_repo_id: meta?.id,
  };
}
