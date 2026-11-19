import "server-only";

import { expireListings } from "@/lib/data-cache";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

/**
 * Gives a member the marketplace bots that are theirs. Bots imported from
 * the official marketplace have no owner here, so they're on nobody's
 * profile. The marketplace names each creator's X handle, and an X sign-in
 * proves a member's, so a match on the two is the creator: the bot goes on
 * their profile and under Your submissions, where they can take it out of
 * this directory (it stays on the marketplace).
 *
 * Returns how many bots changed hands.
 */
export async function claimMarketplaceBots(
  userId: string,
  xHandle: string,
): Promise<number> {
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("grok_bots")
    .update({ owner_id: userId })
    .eq("source", "marketplace")
    .is("owner_id", null)
    // `ilike` reads "_" as a wildcard, and X handles use it.
    .ilike("creator_x_handle", xHandle.replace(/[\\%_]/g, "\\$&"))
    .select("id, slug");
  if (error) {
    console.error("claimMarketplaceBots", error.message);
    return 0;
  }
  const claimed = data ?? [];
  if (claimed.length === 0) return 0;
  await admin.from("grok_bot_moderation_events").insert(
    claimed.map((bot) => ({
      bot_id: bot.id,
      bot_slug: bot.slug,
      action: "edit",
      actor_id: userId,
      source: "web",
      reason: "Claimed by its creator: their X handle is the marketplace's",
      before: { owner_id: null },
      after: { owner_id: userId },
    })),
  );
  expireListings("bots");
  expireListings("profiles");
  return claimed.length;
}
