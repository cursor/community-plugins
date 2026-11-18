"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getBotByShareId, removedByOwner, uniqueBotSlug } from "@/data/bots";
import { reviewBot } from "@/lib/ai-review";
import { getViewer } from "@/lib/auth";
import { guessCategory } from "@/lib/category-pick";
import { authorToCredit } from "@/lib/credit";
import {
  type BotAuthor,
  getPublicTemplate,
  type ShareTemplate,
} from "@/lib/grok-bot-api";
import { submitLimit } from "@/lib/rate-limit";
import { parseShareId } from "@/lib/share-link";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

export type PreviewResult =
  | {
      ok: true;
      template: ShareTemplate;
      /** Who the listing will credit; null is the submitter's profile. */
      author: BotAuthor | null;
      existing: {
        slug: string;
        status: string;
        yours: boolean;
        /** The viewer may submit it again (see mayResubmit). */
        resubmit: boolean;
      } | null;
    }
  | { ok: false; error: "invalid" | "not_found" | "team" | "unavailable" };

/**
 * One listing per bot, across everyone. Its owner may send it again when a
 * reviewer declined it or when they took it down themselves; a bot an admin
 * unlisted stays down.
 */
async function mayResubmit(
  existing: { id: string; status: string; owner_id: string | null },
  viewerId: string | undefined,
): Promise<boolean> {
  if (!viewerId || existing.owner_id !== viewerId) return false;
  if (existing.status === "declined") return true;
  if (existing.status !== "unlisted") return false;
  return (await removedByOwner([existing.id], viewerId)).has(existing.id);
}

/** Reads a pasted share link so the form can show the bot before submitting. */
export async function previewShareLink(link: string): Promise<PreviewResult> {
  const shareId = parseShareId(String(link ?? ""));
  if (!shareId) return { ok: false, error: "invalid" };
  const lookup = await getPublicTemplate(shareId);
  if (lookup.status !== "ok") return { ok: false, error: lookup.status };
  const [viewer, row] = await Promise.all([
    getViewer(),
    getBotByShareId(shareId),
  ]);
  const author = await authorToCredit(lookup.template, viewer);
  const existing = row
    ? {
        slug: row.slug,
        status: row.status,
        yours: !!viewer && row.owner_id === viewer.id,
        resubmit: await mayResubmit(row, viewer?.id),
      }
    : null;
  return { ok: true, template: lookup.template, author, existing };
}

export type SubmitResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error:
        | "signed_out"
        | "rate_limited"
        | "invalid"
        | "not_found"
        | "team"
        | "unavailable"
        | "duplicate";
    };

export async function submitBot(link: string): Promise<SubmitResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "signed_out" };
  if (!(await submitLimit(viewer.id)).success)
    return { ok: false, error: "rate_limited" };

  const shareId = parseShareId(String(link ?? ""));
  if (!shareId) return { ok: false, error: "invalid" };
  // Read the template again server-side; never trust what the form showed.
  const lookup = await getPublicTemplate(shareId);
  if (lookup.status !== "ok") return { ok: false, error: lookup.status };
  const { template } = lookup;

  const existing = await getBotByShareId(shareId);
  if (existing && !(await mayResubmit(existing, viewer.id))) {
    return { ok: false, error: "duplicate" };
  }

  // A keyword guess until the AI review (started below) picks the category.
  const category = guessCategory(template.name, template.description);
  // With no author to credit, the listing credits the submitter's profile.
  const author = await authorToCredit(template, viewer);
  const admin = await createAdminClient();
  const fields = {
    name: template.name,
    description: template.description,
    avatar_shape: template.shape,
    avatar_color: template.color,
    creator_name: author?.name ?? null,
    creator_image: author?.image ?? null,
    creator_x_handle: author?.xHandle ?? null,
    category,
    status: "pending" as const,
    review_note: null,
    reviewed_at: null,
    template_updated_at: template.updatedAt,
    submitted_at: new Date().toISOString(),
    ai_review_status: "queued" as const,
    ai_review: null,
    ai_reviewed_at: null,
    ai_review_attempts: 0,
    ai_review_started_at: null,
  };

  const { data, error } = existing
    ? await admin
        .from("grok_bots")
        .update(fields)
        .eq("id", existing.id)
        .select("id")
        .single()
    : await admin
        .from("grok_bots")
        .insert({
          ...fields,
          share_id: shareId,
          slug: await uniqueBotSlug(template.name),
          source: "submission",
          owner_id: viewer.id,
        })
        .select("id")
        .single();
  if (error) {
    // Unique share_id: someone submitted the same bot a moment earlier.
    if (error.code === "23505") return { ok: false, error: "duplicate" };
    throw error;
  }
  revalidatePath("/my-bots");
  // Review after responding, so submitting stays instant. If this run is
  // lost, the review cron (/api/cron/review-bots) picks the bot up.
  after(() => reviewBot(data.id));
  return { ok: true, id: data.id };
}
