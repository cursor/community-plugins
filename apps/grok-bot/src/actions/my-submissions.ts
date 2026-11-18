"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { CREDIT_CHANGED, cardAuthor } from "@/lib/credit";
import { getPublicTemplate } from "@/lib/grok-bot-api";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

// What a member can do to their own submissions without an admin: take a bot
// out of the directory, and choose the name their bots are credited to.

export type MineResult =
  | { ok: true; changed: number }
  | { ok: false; error: "signed_out" | "invalid" | "not_found" };

const REMOVED_BY_OWNER = "Removed by its owner";

/**
 * Takes one of the member's own bots out of the directory (or withdraws it
 * from review). It stops being listed at once; they can submit it again
 * later, and it's reviewed again then.
 */
export async function removeMyBot(botId: string): Promise<MineResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "signed_out" };
  if (!z.string().uuid().safeParse(botId).success)
    return { ok: false, error: "invalid" };
  const admin = await createAdminClient();
  const { data: before } = await admin
    .from("grok_bots")
    .select("id, slug, status, category, review_note")
    .eq("id", botId)
    .eq("owner_id", viewer.id)
    .in("status", ["pending", "listed"])
    .maybeSingle();
  if (!before) return { ok: false, error: "not_found" };

  const after = {
    status: "unlisted" as const,
    review_note: null,
    reviewed_at: new Date().toISOString(),
  };
  const { error } = await admin
    .from("grok_bots")
    .update(after)
    .eq("id", botId)
    .eq("owner_id", viewer.id);
  if (error) throw error;
  // The same log admins' decisions go to; the owner being the actor is what
  // marks it as theirs to undo (removedByOwner in data/bots.ts).
  const { error: logError } = await admin
    .from("grok_bot_moderation_events")
    .insert({
      bot_id: botId,
      bot_slug: before.slug,
      action: "unlist",
      actor_id: viewer.id,
      source: "web",
      reason: REMOVED_BY_OWNER,
      before: {
        status: before.status,
        category: before.category,
        review_note: before.review_note,
      },
      after,
    });
  // Submitting it again depends on this entry, so a failed write is an error.
  if (logError) throw logError;
  revalidatePath("/");
  revalidatePath("/my-bots");
  revalidatePath(`/bots/${before.slug}`);
  return { ok: true, changed: 1 };
}

type OwnBot = {
  id: string;
  slug: string;
  share_id: string;
  creator_name: string | null;
  creator_image: string | null;
  creator_x_handle: string | null;
};

/**
 * Sets the name the member's listed and pending bots are credited to:
 *
 * - "profile": their directory profile (the name and photo they sign in
 *   with), dropping the name copied from each bot's share card, which is
 *   often the full name on their x.ai account;
 * - "card": the share card's name again, read back from x.ai.
 */
export async function creditMyBots(
  to: "profile" | "card",
): Promise<MineResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "signed_out" };
  if (to !== "profile" && to !== "card") return { ok: false, error: "invalid" };
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("grok_bots")
    .select("id, slug, share_id, creator_name, creator_image, creator_x_handle")
    .eq("owner_id", viewer.id)
    .in("status", ["pending", "listed"])
    .order("id")
    .limit(100);
  if (error) throw error;
  const bots = (data ?? []) as OwnBot[];

  let changed = 0;
  const log = async (bot: OwnBot, after: Partial<OwnBot>) => {
    const { error: updateError } = await admin
      .from("grok_bots")
      .update(after)
      .eq("id", bot.id)
      .eq("owner_id", viewer.id);
    if (updateError) throw updateError;
    const { error: logError } = await admin
      .from("grok_bot_moderation_events")
      .insert({
        bot_id: bot.id,
        bot_slug: bot.slug,
        action: "edit",
        actor_id: viewer.id,
        source: "web",
        reason: CREDIT_CHANGED,
        before: { creator_name: bot.creator_name },
        after: { creator_name: after.creator_name ?? null },
      });
    // Later submissions read the choice from this entry.
    if (logError) throw logError;
    changed++;
  };

  if (to === "profile") {
    for (const bot of bots.filter((b) => b.creator_name)) {
      await log(bot, {
        creator_name: null,
        creator_image: null,
        creator_x_handle: null,
      });
    }
  } else {
    // One at a time: each asks x.ai for the bot's card.
    for (const bot of bots.filter((b) => !b.creator_name)) {
      const lookup = await getPublicTemplate(bot.share_id);
      if (lookup.status !== "ok") continue;
      const author = await cardAuthor(lookup.template, viewer);
      if (!author) continue;
      await log(bot, {
        creator_name: author.name,
        creator_image: author.image,
        creator_x_handle: author.xHandle,
      });
    }
  }
  if (changed > 0) {
    revalidatePath("/");
    revalidatePath("/my-bots");
    for (const bot of bots) revalidatePath(`/bots/${bot.slug}`);
  }
  return { ok: true, changed };
}
