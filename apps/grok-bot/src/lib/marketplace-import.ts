import "server-only";

import slugify from "slugify";
import { DESCRIPTION_MAX, fit, NAME_MAX } from "@/lib/card-limits";
import { categoryIdForLabel } from "@/lib/categories";
import { listMarketplace } from "@/lib/grok-bot-api";
import { isShareId } from "@/lib/share-link";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";
import { allRows } from "@/utils/supabase/all-rows";

const TEAM_CATEGORY = "From Grok Bot Team";

type Admin = Awaited<ReturnType<typeof createAdminClient>>;

async function uniqueSlug(
  admin: Admin,
  name: string,
  taken: Set<string>,
): Promise<string> {
  const base =
    slugify(name, { lower: true, strict: true }).slice(0, 60) || "bot";
  if (taken.size === 0) {
    const rows = await allRows<{ slug: string }>((from, to) =>
      admin
        .from("grok_bots")
        .select("slug", { count: "exact" })
        .order("slug")
        .range(from, to),
    );
    for (const r of rows) taken.add(r.slug);
  }
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

export type MarketplaceReport = {
  listings: number;
  community: number;
  imported: number;
  refreshed: number;
};

/**
 * Imports community listings from the official x.ai/bot marketplace (not
 * "From Grok Bot Team") as listed bots, and refreshes the card and creator of
 * ones imported before. Member submissions of the same bot keep their owner
 * and status.
 */
export async function importMarketplace(): Promise<MarketplaceReport> {
  const admin = await createAdminClient();
  const listings = await listMarketplace();
  const community = listings.filter(
    (l) =>
      !l.categories.includes(TEAM_CATEGORY) &&
      isShareId(l.shareId) &&
      l.defaultAvatar,
  );
  const existing = await allRows<{ share_id: string; source: string }>(
    (from, to) =>
      admin
        .from("grok_bots")
        .select("share_id, source", { count: "exact" })
        .order("share_id")
        .range(from, to),
  );
  const sourceOf = new Map(existing.map((r) => [r.share_id, r.source]));
  const taken = new Set<string>();
  const report: MarketplaceReport = {
    listings: listings.length,
    community: community.length,
    imported: 0,
    refreshed: 0,
  };
  const now = new Date().toISOString();

  for (const l of community) {
    const card = {
      name: fit(l.name.trim(), NAME_MAX),
      description: fit(l.description.trim(), DESCRIPTION_MAX),
      avatar_shape: l.defaultAvatar!.shape,
      avatar_color: l.defaultAvatar!.color,
      creator_name: l.creator?.name || null,
      creator_image: l.creator?.profilePhotoUrl || null,
      creator_x_handle: l.creator?.handles?.x || null,
      template_updated_at: l.updatedAtMs
        ? new Date(Number(l.updatedAtMs)).toISOString()
        : null,
    };
    const source = sourceOf.get(l.shareId);
    if (source === "submission") continue;
    if (source === "marketplace") {
      const { error: e } = await admin
        .from("grok_bots")
        .update(card)
        .eq("share_id", l.shareId);
      if (e) throw e;
      report.refreshed++;
    } else {
      const category =
        l.categories.map(categoryIdForLabel).find((c) => c !== null) ??
        "personal";
      const { error: e } = await admin.from("grok_bots").insert({
        ...card,
        category,
        share_id: l.shareId,
        slug: await uniqueSlug(admin, l.name, taken),
        status: "listed",
        source: "marketplace",
        reviewed_at: now,
      });
      if (e) throw e;
      report.imported++;
    }
  }
  return report;
}
