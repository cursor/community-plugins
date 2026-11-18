import "server-only";
import type { Viewer } from "@/lib/auth";
import {
  type BotAuthor,
  findAuthor,
  type ShareTemplate,
} from "@/lib/grok-bot-api";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

// Who a member's bot is credited to: the name on its share card, or the
// member's own directory profile.

/** The moderation-log reason for a member changing their own credit. */
export const CREDIT_CHANGED = "Credit changed by its owner";

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\s+/g, " ") ===
  b.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * The person the share card credits, in order: the marketplace creator, the
 * owner x.ai names on the card, or (null) the submitter. A bare x.ai name
 * that matches the submitter is them, so their profile (photo, X handle)
 * wins.
 */
export async function cardAuthor(
  template: ShareTemplate,
  viewer: Viewer | null,
): Promise<BotAuthor | null> {
  const author = await findAuthor(template);
  if (
    author &&
    viewer &&
    !author.image &&
    !author.xHandle &&
    sameName(author.name, viewer.name)
  )
    return null;
  return author;
}

/**
 * Whether the member chose their profile over their share cards' names (on
 * "Your bots"). Their latest choice, read from the moderation log, so it
 * also holds for bots they submit afterwards.
 */
export async function prefersProfileCredit(ownerId: string): Promise<boolean> {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("grok_bot_moderation_events")
    .select("after")
    .eq("actor_id", ownerId)
    .eq("action", "edit")
    .eq("reason", CREDIT_CHANGED)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return false;
  return (data.after as { creator_name?: string | null })?.creator_name == null;
}

/** Who a bot this member submits is credited to; null is their profile. */
export async function authorToCredit(
  template: ShareTemplate,
  viewer: Viewer | null,
): Promise<BotAuthor | null> {
  if (viewer && (await prefersProfileCredit(viewer.id))) return null;
  return cardAuthor(template, viewer);
}
