import { parseGitHubUrl } from "@directories/plugins/github";
import type { AppSource } from "./app-source";
import type { GitHubAccount } from "./github-account";

// How a member proves an app with no owner is theirs. Two ways:
//
// - Their GitHub account owns the app's repository. GitHub vouches for the
//   account at sign-in, and for who owns the repository when asked.
// - A file where only the app's maker can put one (the repository's root, or
//   the server's own host) names the member. The line isn't a secret: what
//   counts is where it is published.
//
// This module only decides; it reads GitHub and the file through `deps`, so
// the rule can be checked without either.

export const PROOF_FILE = "grok-bot-directory.txt";

/** The line a maker publishes to name `memberId` as the app's owner. */
export const proofLine = (memberId: string) =>
  `grok-bot-directory-owner=${memberId}`;

/** Whether the file's text has the member's line, on a line of its own. */
export function hasProof(text: string | null, memberId: string): boolean {
  if (!text) return false;
  const wanted = proofLine(memberId);
  return text.split(/\r?\n/).some((line) => line.trim() === wanted);
}

const hostOf = (url: string | null): string | null => {
  try {
    return url ? new URL(url).hostname.toLowerCase() : null;
  } catch {
    return null;
  }
};

/**
 * Where a server's maker can publish the file: on the server's own host, or
 * on the listing's website when the server sits under it (`mcp.acme.com`
 * under `acme.com` or `www.acme.com`). A website anywhere else proves
 * nothing about the server.
 */
export function serverProofAddresses(
  serverUrl: string,
  homepage: string | null,
): string[] {
  const server = hostOf(serverUrl);
  if (!server) return [];
  const hosts = [server];
  const site = hostOf(homepage);
  if (
    site &&
    site !== server &&
    server.endsWith(`.${site.replace(/^www\./, "")}`)
  )
    hosts.push(site);
  return hosts.map((host) => `https://${host}/.well-known/${PROOF_FILE}`);
}

/** Where the file goes in a repository, as GitHub serves it. */
export const repoProofAddress = (fullName: string) =>
  `https://raw.githubusercontent.com/${fullName}/HEAD/${PROOF_FILE}`;

export type RepoOwner = {
  fullName: string;
  ownerId: number;
  ownerType: string;
};

export type ClaimDeps = {
  /** Who owns a repository now: "gone", or null when GitHub can't be asked. */
  repoOwner: (
    ref: { id: number } | { owner: string; repo: string },
  ) => Promise<RepoOwner | "gone" | null>;
  /** The text a public address serves, or null. */
  text: (url: string) => Promise<string | null>;
};

export type ClaimedHow =
  | { how: "github"; login: string }
  | { how: "file"; address: string };

export type ProofResult =
  | { proof: ClaimedHow }
  | {
      proof: null;
      /** GitHub couldn't be asked who owns the repository. */
      githubBusy: boolean;
    };

/**
 * Looks for proof that `member` made the app. A person's own repository is
 * theirs on GitHub's word; an organization's repository, like a server,
 * needs the file, since belonging to an organization isn't owning its work.
 */
export async function findProof(
  app: {
    source: AppSource;
    homepage: string | null;
    githubRepoId: number | null;
  },
  member: { id: string; github: GitHubAccount | null },
  deps: ClaimDeps,
): Promise<ProofResult> {
  if (app.source.kind === "server") {
    for (const address of serverProofAddresses(app.source.url, app.homepage)) {
      if (hasProof(await deps.text(address), member.id))
        return { proof: { how: "file", address } };
    }
    return { proof: null, githubBusy: false };
  }

  const named = parseGitHubUrl(app.source.repository);
  if (!named) return { proof: null, githubBusy: false };
  // By GitHub's id when it's known, so a repository that was renamed or
  // handed to someone else is judged by who has it now.
  const repo = await deps.repoOwner(
    app.githubRepoId != null ? { id: app.githubRepoId } : named,
  );
  if (repo === "gone") return { proof: null, githubBusy: false };
  if (
    repo &&
    member.github &&
    repo.ownerType === "User" &&
    repo.ownerId === member.github.id
  )
    return { proof: { how: "github", login: member.github.login } };
  // A repository known by its id may have moved since it was listed; without
  // GitHub's answer there's no telling whose file its old address serves.
  if (!repo && app.githubRepoId != null)
    return { proof: null, githubBusy: true };
  const address = repoProofAddress(
    repo ? repo.fullName : `${named.owner}/${named.repo}`,
  );
  if (hasProof(await deps.text(address), member.id))
    return { proof: { how: "file", address } };
  return { proof: null, githubBusy: !repo };
}
