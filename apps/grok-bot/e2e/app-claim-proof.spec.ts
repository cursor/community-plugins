import { expect, test } from "@playwright/test";
import {
  type ClaimDeps,
  findProof,
  hasProof,
  proofLine,
  type RepoOwner,
  serverProofAddresses,
} from "../src/lib/app-claim-proof";

// The rule for claiming an app, checked without GitHub or the network: what
// GitHub says and what an address serves are given here.

const MEMBER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ada = { id: MEMBER, github: { id: 42, login: "ada" } };

/** GitHub and the web as a test describes them, with what was asked. */
function world(given: {
  repo?: RepoOwner | "gone" | null;
  files?: Record<string, string>;
}): ClaimDeps & { read: string[] } {
  const read: string[] = [];
  return {
    read,
    repoOwner: async () => given.repo ?? null,
    text: async (url) => {
      read.push(url);
      return given.files?.[url] ?? null;
    },
  };
}

const repoApp = (githubRepoId: number | null = 7) => ({
  source: { kind: "repo" as const, repository: "https://github.com/ada/app" },
  homepage: null,
  githubRepoId,
});
const serverApp = {
  source: { kind: "server" as const, url: "https://mcp.acme.test/mcp" },
  homepage: "https://www.acme.test/product",
  githubRepoId: null,
};

test.describe("claiming an app: what counts as proof", () => {
  test("the line has to be on a line of its own, for this member", () => {
    const line = proofLine(MEMBER);
    expect(hasProof(line, MEMBER)).toBe(true);
    expect(
      hasProof(`# ours\r\n  ${line}  \r\n${proofLine(OTHER)}\n`, MEMBER),
    ).toBe(true);
    expect(hasProof(proofLine(OTHER), MEMBER)).toBe(false);
    expect(hasProof(`${line}0`, MEMBER)).toBe(false);
    expect(hasProof(`see ${line}`, MEMBER)).toBe(false);
    expect(hasProof(null, MEMBER)).toBe(false);
  });

  test("a server's file goes on its own host, or the website it sits under", () => {
    const file = "/.well-known/grok-bot-directory.txt";
    expect(
      serverProofAddresses(
        "https://mcp.acme.test/mcp",
        "https://www.acme.test",
      ),
    ).toEqual([`https://mcp.acme.test${file}`, `https://www.acme.test${file}`]);
    // A website somewhere else says nothing about the server.
    expect(
      serverProofAddresses("https://acme.vercel.test/mcp", "https://acme.test"),
    ).toEqual([`https://acme.vercel.test${file}`]);
    // Nor does one under the server: a subdomain can be someone else's.
    expect(
      serverProofAddresses("https://acme.test/mcp", "https://docs.acme.test"),
    ).toEqual([`https://acme.test${file}`]);
    expect(serverProofAddresses("https://acme.test/mcp", null)).toEqual([
      `https://acme.test${file}`,
    ]);
  });

  test("a person's own repository is theirs on GitHub's word", async () => {
    const github = world({
      repo: { fullName: "ada/app", ownerId: 42, ownerType: "User" },
    });
    expect(await findProof(repoApp(), ada, github)).toEqual({
      proof: { how: "github", login: "ada" },
    });
    expect(github.read).toEqual([]);
  });

  test("the account is matched by GitHub's id, not by its name", async () => {
    // Someone else now holds the login the listing's address names.
    const github = world({
      repo: { fullName: "ada/app", ownerId: 99, ownerType: "User" },
    });
    expect(await findProof(repoApp(), ada, github)).toEqual({
      proof: null,
      githubBusy: false,
    });
  });

  test("an organization's repository needs the file, read where it is now", async () => {
    const moved =
      "https://raw.githubusercontent.com/acme/renamed/HEAD/grok-bot-directory.txt";
    const repo = {
      fullName: "acme/renamed",
      ownerId: 42,
      ownerType: "Organization",
    };
    expect(await findProof(repoApp(), ada, world({ repo }))).toEqual({
      proof: null,
      githubBusy: false,
    });
    expect(
      await findProof(
        repoApp(),
        // Not signed in with GitHub at all.
        { id: MEMBER, github: null },
        world({ repo, files: { [moved]: proofLine(MEMBER) } }),
      ),
    ).toEqual({ proof: { how: "file", address: moved } });
    // The file names someone else.
    expect(
      await findProof(
        repoApp(),
        ada,
        world({ repo, files: { [moved]: proofLine(OTHER) } }),
      ),
    ).toEqual({ proof: null, githubBusy: false });
  });

  test("when GitHub can't be asked, a repository known by its id isn't judged", async () => {
    const old =
      "https://raw.githubusercontent.com/ada/app/HEAD/grok-bot-directory.txt";
    const github = world({ repo: null, files: { [old]: proofLine(MEMBER) } });
    expect(await findProof(repoApp(7), ada, github)).toEqual({
      proof: null,
      githubBusy: true,
    });
    expect(github.read).toEqual([]);
    // With no id on record, the listing's address is all there is.
    expect(await findProof(repoApp(null), ada, github)).toEqual({
      proof: { how: "file", address: old },
    });
  });

  test("a repository that's gone proves nothing", async () => {
    expect(await findProof(repoApp(), ada, world({ repo: "gone" }))).toEqual({
      proof: null,
      githubBusy: false,
    });
  });

  test("a server is claimed with the file, on either address", async () => {
    const site = "https://www.acme.test/.well-known/grok-bot-directory.txt";
    const web = world({ files: { [site]: `${proofLine(MEMBER)}\n` } });
    expect(await findProof(serverApp, ada, web)).toEqual({
      proof: { how: "file", address: site },
    });
    expect(web.read).toEqual([
      "https://mcp.acme.test/.well-known/grok-bot-directory.txt",
      site,
    ]);
    // A GitHub account says nothing about a server.
    expect(await findProof(serverApp, ada, world({}))).toEqual({
      proof: null,
      githubBusy: false,
    });
  });
});
