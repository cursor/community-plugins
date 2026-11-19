import "server-only";

import { revalidatePath } from "next/cache";
import {
  type AiVerdict,
  judgeBot,
  type SimilarBot,
  type StoredAiReview,
} from "@/lib/ai-review";
import { expireListings } from "@/lib/data-cache";
import { getPublicTemplate } from "@/lib/grok-bot-api";
import { SPACEXSI_MODEL, spacexsiConfigured } from "@/lib/spacexsi";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

// Keeps a listing in step with the bot's card on x.ai. A listing is a copy
// of the card (name, description, avatar) made when the bot was submitted;
// "Add to Grok Bot" adds the bot as it is now. Its owner can refresh it from
// Your submissions, and a scheduled job goes round every listed bot.

export type RefreshOutcome =
  /** The card hasn't changed. */
  | "unchanged"
  /** The card changed, passed review, and the listing now shows it. */
  | "updated"
  /** The card changed and review flagged it: back to the admin queue. */
  | "held"
  /** The bot isn't shared publicly on x.ai any more. */
  | "unshared"
  /** x.ai or the reviewer couldn't be reached; nothing changed. */
  | "unavailable"
  /** It isn't listed (any more), so there's nothing to refresh. */
  | "not_listed";

/** Shown to its owner when the job takes down a bot that's no longer shared. */
export const UNSHARED_NOTE =
  "This bot is no longer shared publicly on x.ai, so it was taken out of the directory. Share it again, then submit it again to list it.";

const CARD = ["name", "description", "avatar_shape", "avatar_color"] as const;

// How long the review of a changed card is waited for.
const OWNER_WAIT_MS = 60_000;
const JOB_WAIT_MS = 120_000;

/**
 * Compares one listed bot with its card on x.ai and brings the listing up to
 * date. `by` is the owner who asked; null for the scheduled job.
 *
 * A changed card is reviewed before it's shown. If the review flags it the
 * bot goes back to the admin queue with the new text: the listing would
 * otherwise go on describing a bot that has since become something else.
 *
 * When the bot is no longer shared, its owner is told and decides; the job
 * takes it out of the directory, since its Add button leads nowhere.
 */
export async function refreshBot(
  botId: string,
  by: { id: string } | null,
): Promise<RefreshOutcome> {
  const admin = await createAdminClient();
  const { data: bot, error } = await admin
    .from("grok_bots")
    .select(
      "id, slug, share_id, name, description, avatar_shape, avatar_color, category",
    )
    .eq("id", botId)
    .eq("status", "listed")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!bot) return "not_listed";

  const now = new Date().toISOString();
  // The job moves on from a bot it couldn't check, and comes back to it.
  const unavailable = async (): Promise<RefreshOutcome> => {
    if (!by)
      await admin
        .from("grok_bots")
        .update({ card_checked_at: now })
        .eq("id", bot.id);
    return "unavailable";
  };
  const lookup = await getPublicTemplate(bot.share_id);
  if (lookup.status === "unavailable") return unavailable();

  if (lookup.status !== "ok") {
    if (by) return "unshared";
    // Twice, a moment apart, before a listing comes down over it.
    const again = await getPublicTemplate(bot.share_id);
    if (again.status !== lookup.status) return unavailable();
    const after = {
      status: "declined" as const,
      review_note: UNSHARED_NOTE,
      reviewed_at: now,
      card_checked_at: now,
    };
    const { data: taken } = await admin
      .from("grok_bots")
      .update(after)
      .eq("id", bot.id)
      .eq("status", "listed")
      .select("id")
      .maybeSingle();
    if (!taken) return "not_listed";
    await admin.from("grok_bot_moderation_events").insert({
      bot_id: bot.id,
      bot_slug: bot.slug,
      action: "decline",
      actor_id: null,
      source: "ai",
      reason: "No longer shared on x.ai",
      before: { status: "listed" },
      after: { status: "declined" },
    });
    changed(bot.slug);
    return "unshared";
  }

  const card = {
    name: lookup.template.name,
    description: lookup.template.description,
    avatar_shape: lookup.template.shape,
    avatar_color: lookup.template.color,
  };
  const stamp = {
    card_checked_at: now,
    template_updated_at: lookup.template.updatedAt,
  };
  if (CARD.every((field) => card[field] === bot[field])) {
    await admin.from("grok_bots").update(stamp).eq("id", bot.id);
    return "unchanged";
  }

  // Changed: reviewed before anyone sees it.
  if (!spacexsiConfigured()) return unavailable();
  let verdict: AiVerdict;
  try {
    const { data: similar } = await admin.rpc("find_similar_grok_bots", {
      p_bot_id: bot.id,
      p_threshold: 0.5,
      p_limit: 5,
    });
    verdict = await judgeBot(
      card,
      (similar ?? []) as SimilarBot[],
      // A review can take over a minute. The owner is waiting on a button,
      // so theirs is given up on sooner and they're asked to try again; the
      // job's has to fit in its run.
      { signal: AbortSignal.timeout(by ? OWNER_WAIT_MS : JOB_WAIT_MS) },
    );
  } catch (err) {
    console.error(`[refresh-bot] reviewing ${bot.slug} failed:`, err);
    return unavailable();
  }
  const stored: StoredAiReview = { ...verdict, model: SPACEXSI_MODEL };
  const safe = verdict.verdict === "safe";
  const { data: applied } = await admin
    .from("grok_bots")
    .update({
      ...card,
      ...stamp,
      ai_review: stored,
      ai_reviewed_at: now,
      ai_review_status: safe ? "safe" : "flagged",
      ...(safe ? {} : { status: "pending", reviewed_at: null }),
    })
    .eq("id", bot.id)
    .eq("status", "listed")
    .select("id")
    .maybeSingle();
  if (!applied) return "not_listed";

  await admin.from("grok_bot_moderation_events").insert(
    safe
      ? {
          bot_id: bot.id,
          bot_slug: bot.slug,
          action: "edit",
          // The scheduled job has no user: it's recorded like the reviewer.
          actor_id: by?.id ?? null,
          source: by ? "web" : "ai",
          reason: "Refreshed from x.ai",
          before: { name: bot.name },
          after: { name: card.name },
        }
      : {
          bot_id: bot.id,
          bot_slug: bot.slug,
          action: "flag",
          actor_id: null,
          source: "ai",
          reason: verdict.summary,
          before: { status: "listed", name: bot.name },
          after: {
            status: "pending",
            name: card.name,
            verdict: verdict.verdict,
            severity: verdict.severity,
          },
        },
  );
  changed(bot.slug);
  return safe ? "updated" : "held";
}

function changed(slug: string) {
  expireListings("bots");
  try {
    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath("/my-bots");
    revalidatePath(`/bots/${slug}`);
  } catch {
    // Outside a request there's nothing to revalidate.
  }
}

/**
 * The listed bots that have gone longest without being compared with their
 * card, for the scheduled job.
 */
export async function botsToRefresh(limit: number): Promise<string[]> {
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("grok_bots")
    .select("id")
    .eq("status", "listed")
    .order("card_checked_at", { ascending: true, nullsFirst: true })
    .order("id")
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id as string);
}
