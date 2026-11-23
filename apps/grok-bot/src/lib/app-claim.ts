import "server-only";

import { fetchGitHubRepoOwner } from "@directories/plugins/github";
import { fetchPublicText } from "@directories/plugins/mcp-inspect";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  type ClaimDeps,
  type ClaimedHow,
  findProof,
} from "@/lib/app-claim-proof";
import { appChanged } from "@/lib/app-moderation";
import { appSource } from "@/lib/app-source";
import { expireListings } from "@/lib/data-cache";
import { type GitHubAccount, githubAccountOf } from "@/lib/github-account";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

// Gives an app with no owner to the member who made it. Apps imported in
// bulk have no owner, so nobody can edit or refresh them and they're on
// nobody's profile. See app-claim-proof.ts for what counts as proof.
//
// A claim only ever fills an empty owner, so the first one proved wins, and
// it's recorded in plugin_moderation_events. What it grants is what any
// owner has: Edit and Refresh, which can't change where the app comes from.

// A server action runs under the function timeout; a long GitHub rate-limit
// pause isn't waited out.
const GITHUB_MAX_WAIT_MS = 3000;

const DEPS: ClaimDeps = {
  repoOwner: (ref) =>
    fetchGitHubRepoOwner(ref, { maxWaitMs: GITHUB_MAX_WAIT_MS }),
  text: fetchPublicText,
};

export type ClaimOutcome =
  | "claimed"
  /** It has an owner, isn't listed, is official, or has no source to check. */
  | "not_claimable"
  /** Nothing proved it: the account doesn't own it and the file isn't there. */
  | "no_proof"
  /** GitHub couldn't be asked who owns the repository. */
  | "github_busy";

const COLUMNS =
  "id, slug, homepage, repository, github_repo_id, marketplace_plugin_id, plugin_components(type, metadata)";

type Unowned = {
  id: string;
  slug: string;
  homepage: string | null;
  repository: string | null;
  github_repo_id: number | null;
  marketplace_plugin_id: string | null;
  plugin_components: {
    type: string;
    metadata: Record<string, unknown> | null;
  }[];
};

/** A listed community app nobody owns yet, with the columns a claim reads. */
function unownedApps(admin: SupabaseClient) {
  return admin
    .from("plugins")
    .select(COLUMNS)
    .is("owner_id", null)
    .is("marketplace_plugin_id", null)
    .eq("active", true)
    .eq("permanently_blocked", false)
    .eq("grok_bot_addable", true)
    .not("unavailable_in", "cs", "{grok_bot}");
}

async function claim(
  admin: SupabaseClient,
  app: Unowned,
  member: { id: string; github: GitHubAccount | null },
): Promise<{ outcome: ClaimOutcome; proof?: ClaimedHow }> {
  const source = appSource({
    repository: app.repository,
    marketplace_plugin_id: app.marketplace_plugin_id,
    components: app.plugin_components,
  });
  if (!source) return { outcome: "not_claimable" };
  const found = await findProof(
    { source, homepage: app.homepage, githubRepoId: app.github_repo_id },
    member,
    DEPS,
  );
  if (!found.proof)
    return { outcome: found.githubBusy ? "github_busy" : "no_proof" };

  const { data: taken, error } = await admin
    .from("plugins")
    .update({ owner_id: member.id })
    .eq("id", app.id)
    .is("owner_id", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  // Someone else's claim landed first.
  if (!taken) return { outcome: "not_claimable" };

  const { error: logError } = await admin
    .from("plugin_moderation_events")
    .insert({
      plugin_id: app.id,
      plugin_slug: app.slug,
      action: "owner_claim",
      actor_id: member.id,
      source: "web",
      reason:
        found.proof.how === "github"
          ? `GitHub account ${found.proof.login} owns its repository`
          : `Named in ${found.proof.address}`,
      before: { owner_id: null },
      after: { owner_id: member.id },
    });
  // The claim is already made; a failed audit write is logged, not undone.
  if (logError)
    console.error(`[app-claim] recording the claim of ${app.slug} failed:`, {
      error: logError.message,
    });
  return { outcome: "claimed", proof: found.proof };
}

/** The app now shows on a profile and under Your submissions. */
async function claimed(slugs: string[]) {
  expireListings("profiles");
  for (const slug of slugs) await appChanged(slug);
}

/** Claims one app for the member, if they can prove it's theirs. */
export async function claimApp(
  pluginId: string,
  member: { id: string; github: GitHubAccount | null },
): Promise<ClaimOutcome> {
  const admin = await createAdminClient();
  const { data, error } = await unownedApps(admin)
    .eq("id", pluginId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return "not_claimable";
  const app = data as Unowned;
  const result = await claim(admin, app, member);
  if (result.outcome === "claimed") await claimed([app.slug]);
  return result.outcome;
}

// A member rarely has more than a few; GitHub is asked about each.
const MAX_AT_SIGN_IN = 10;

/**
 * After a GitHub sign-in, hands the member the unowned apps whose repository
 * is under their GitHub login, each confirmed with GitHub (the login in a
 * listing's address is only where the repository was when it was listed).
 * Returns how many changed hands.
 */
export async function claimOwnGitHubApps(user: User): Promise<number> {
  const github = githubAccountOf(user);
  if (!github) return 0;
  const admin = await createAdminClient();
  const { data, error } = await unownedApps(admin)
    // GitHub logins hold no `ilike` wildcards, and the match is by prefix.
    .ilike("repository", `https://github.com/${github.login}/%`)
    .order("id")
    .limit(MAX_AT_SIGN_IN);
  if (error) {
    console.error("claimOwnGitHubApps", error.message);
    return 0;
  }
  const slugs: string[] = [];
  for (const app of (data ?? []) as Unowned[]) {
    const result = await claim(admin, app, { id: user.id, github });
    if (result.outcome === "claimed") slugs.push(app.slug);
  }
  if (slugs.length > 0) await claimed(slugs);
  return slugs.length;
}
