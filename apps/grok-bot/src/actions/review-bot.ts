"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { reviewBot as runAiReview } from "@/lib/ai-review";
import { getViewer, isAdmin } from "@/lib/auth";
import { CATEGORY_IDS } from "@/lib/categories";
import { expireListings } from "@/lib/data-cache";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

const Input = z.object({
  botId: z.string().uuid(),
  action: z.enum(["list", "decline", "unlist"]),
  note: z.string().trim().max(500).optional(),
  category: z.enum(CATEGORY_IDS).optional(),
});

const STATUS_FOR_ACTION = {
  list: "listed",
  decline: "declined",
  unlist: "unlisted",
} as const;

export type ReviewResult =
  | { ok: true }
  | {
      ok: false;
      error: "forbidden" | "invalid" | "note_required" | "not_found";
    };

/**
 * Admin review: list (or relist), decline or unlist. Declines and unlists need
 * a note for the submitter.
 */
export async function reviewBot(
  input: z.input<typeof Input>,
): Promise<ReviewResult> {
  const viewer = await getViewer();
  if (!viewer || !(await isAdmin(viewer.id)))
    return { ok: false, error: "forbidden" };
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { botId, action, note, category } = parsed.data;
  // Declining and unlisting show the note to the submitter, so it's required.
  if ((action === "decline" || action === "unlist") && !note)
    return { ok: false, error: "note_required" };

  const admin = await createAdminClient();
  const { data: before } = await admin
    .from("grok_bots")
    .select("id, slug, status, category, review_note")
    .eq("id", botId)
    .maybeSingle();
  if (!before) return { ok: false, error: "not_found" };

  const after = {
    status: STATUS_FOR_ACTION[action],
    review_note: action === "list" ? null : (note ?? null),
    reviewed_at: new Date().toISOString(),
    ...(category ? { category } : {}),
  };
  const { error } = await admin.from("grok_bots").update(after).eq("id", botId);
  if (error) throw error;
  await admin.from("grok_bot_moderation_events").insert({
    bot_id: botId,
    bot_slug: before.slug,
    action,
    actor_id: viewer.id,
    source: "web",
    reason: note ?? null,
    before: {
      status: before.status,
      category: before.category,
      review_note: before.review_note,
    },
    after,
  });
  expireListings("bots");
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath(`/bots/${before.slug}`);
  return { ok: true };
}

/** Admin: run the AI review again (for a failed or doubtful review). */
export async function rerunAiReview(botId: string): Promise<ReviewResult> {
  const viewer = await getViewer();
  if (!viewer || !(await isAdmin(viewer.id)))
    return { ok: false, error: "forbidden" };
  if (!z.string().uuid().safeParse(botId).success)
    return { ok: false, error: "invalid" };
  const admin = await createAdminClient();
  const { data: bot } = await admin
    .from("grok_bots")
    .update({
      ai_review_status: "queued",
      ai_review_attempts: 0,
      ai_review_started_at: null,
    })
    .eq("id", botId)
    .eq("status", "pending")
    .select("id, slug")
    .maybeSingle();
  if (!bot) return { ok: false, error: "not_found" };
  await admin.from("grok_bot_moderation_events").insert({
    bot_id: bot.id,
    bot_slug: bot.slug,
    action: "rereview",
    actor_id: viewer.id,
    source: "web",
  });
  after(() => runAiReview(bot.id));
  revalidatePath("/admin");
  return { ok: true };
}

/** Admin: move a bot to another category without changing its status. */
export async function editBotCategory(
  botId: string,
  category: string,
): Promise<ReviewResult> {
  const viewer = await getViewer();
  if (!viewer || !(await isAdmin(viewer.id)))
    return { ok: false, error: "forbidden" };
  const parsed = z
    .object({ botId: z.string().uuid(), category: z.enum(CATEGORY_IDS) })
    .safeParse({ botId, category });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const admin = await createAdminClient();
  const { data: before } = await admin
    .from("grok_bots")
    .select("id, slug, category")
    .eq("id", parsed.data.botId)
    .maybeSingle();
  if (!before) return { ok: false, error: "not_found" };
  if (before.category === parsed.data.category) return { ok: true };
  const { error } = await admin
    .from("grok_bots")
    .update({ category: parsed.data.category })
    .eq("id", before.id);
  if (error) throw error;
  await admin.from("grok_bot_moderation_events").insert({
    bot_id: before.id,
    bot_slug: before.slug,
    action: "edit",
    actor_id: viewer.id,
    source: "web",
    before: { category: before.category },
    after: { category: parsed.data.category },
  });
  expireListings("bots");
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath(`/bots/${before.slug}`);
  return { ok: true };
}
