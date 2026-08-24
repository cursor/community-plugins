import type { BotRow } from "./types";

/**
 * Editorial use-case used when `public.bots` is not in the connected
 * database yet (preview/prod before `20260824_bots.sql`). Keep in sync
 * with the insert in that migration. Queries prefer the table when it exists.
 */
export const SEED_BOT_SLUG = "review-a-pull-request";

export const SEED_BOT: BotRow = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Review a pull request",
  slug: SEED_BOT_SLUG,
  description:
    "Paste this template into Cursor, install the plugins it lists, and review a GitHub pull request from the agent chat.",
  writeup: `Review a pull request from Cursor without leaving the editor.

This page is a use-case listing, not a plugin. It ships a copyable bot template, the plugins and skills that template expects, and the steps to run it. Search engines should rank this URL for the job (review a PR in Cursor), not for a plugin name.

A bot listing is not an Open Plugins agent file. \`agents/*.md\` in a repo is a plugin component. Submit that repo at /plugins/new. Submit a bot when the repo describes a use case: a template someone can copy, plus the plugins or skills it needs.

How it works

Copy the template on this page. Paste it into Cursor agent chat. Install any listed plugins you do not already have. Then give the agent the pull request URL or the local branch.

What to ask the agent

Name the files that changed. Ask it to check tests, error handling, and secrets. Ask it to say what it would not merge, and why.`,
  template: `You are reviewing a GitHub pull request in this repo.

1. Identify the PR (URL, branch, or \`gh pr view\` output I paste).
2. Summarize the change in three sentences or fewer.
3. List the files that matter and what each one does in this diff.
4. Call out bugs, missing tests, secret leaks, and API contract breaks.
5. Say whether you would merge, request changes, or reject. Give one reason.

Do not invent files that are not in the diff. If you cannot see the PR, ask me for the URL.`,
  needs: [
    { kind: "plugin", name: "GitHub", slug: "github" },
    { kind: "skill", name: "code-review" },
  ],
  repository: "https://github.com/cursor/community-plugins",
  homepage: null,
  logo: null,
  owner_id: null,
  active: true,
  scan_status: "unscanned",
  discovery_source: "seed:cursor-directory",
  github_repo_id: null,
  created_at: "2026-08-24T00:00:00.000Z",
  updated_at: "2026-08-24T00:00:00.000Z",
};

export function isMissingRelationError(
  error: unknown,
  relation: string,
): boolean {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "");
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes(`public.${relation}`) ||
    message.includes(`relation "${relation}"`)
  );
}
