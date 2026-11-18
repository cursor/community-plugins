import "server-only";

import slugify from "slugify";
import { type Body, bodyForShape } from "@/lib/avatar";
import { creatorHandle } from "@/lib/creator-handle";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";
import { allRows, allRowsIn } from "@/utils/supabase/all-rows";

export type BotStatus = "pending" | "listed" | "declined" | "unlisted";
export type AiReviewStatus =
  | "queued"
  | "reviewing"
  | "safe"
  | "flagged"
  | "error";
export type AiReview =
  | {
      verdict: "safe" | "suspicious" | "malicious";
      severity: "low" | "medium" | "high";
      categories: string[];
      reasons: string[];
      summary: string;
      model: string;
    }
  | { error: string };

export type DirectoryBot = {
  id: string;
  slug: string;
  shareId: string;
  name: string;
  description: string;
  body: Body;
  color: string;
  category: string;
  status: BotStatus;
  reviewNote: string | null;
  installs: number;
  /** Installs over the last 30 days, for Trending. */
  installsRecent: number;
  submittedAt: string;
  reviewedAt: string | null;
  aiReviewStatus: AiReviewStatus | null;
  aiReview: AiReview | null;
  creator: {
    name: string;
    image: string | null;
    xHandle: string | null;
    /**
     * The handle of the profile that lists this creator's bots and apps
     * (/u/<handle>): the member who submitted the bot, when their
     * profile is public.
     */
    profile: string | null;
  };
  /** The member who submitted it, when their profile is public. */
  submitter: string | null;
};

type BotRow = {
  id: string;
  slug: string;
  share_id: string;
  name: string;
  description: string;
  avatar_shape: string;
  avatar_color: string;
  category: string;
  status: BotStatus;
  review_note: string | null;
  owner_id: string | null;
  creator_name: string | null;
  creator_image: string | null;
  creator_x_handle: string | null;
  install_count: number;
  submitted_at: string;
  reviewed_at: string | null;
  ai_review_status: AiReviewStatus | null;
  ai_review: AiReview | null;
};

const BOT_COLUMNS =
  "id, slug, share_id, name, description, avatar_shape, avatar_color, category, status, review_note, owner_id, creator_name, creator_image, creator_x_handle, install_count, submitted_at, reviewed_at, ai_review_status, ai_review";

type Owner = {
  id: string;
  name: string;
  image: string | null;
  slug: string;
  social_x_link: string | null;
  x_handle: string | null;
};

function xHandleFromLink(link: string | null): string | null {
  const match = link?.match(/(?:x|twitter)\.com\/@?([A-Za-z0-9_]{1,15})/i);
  return match?.[1] ?? null;
}

async function toDirectoryBots(
  rows: BotRow[],
  recent?: Map<string, number>,
): Promise<DirectoryBot[]> {
  // Owner profiles are shared with cursor.directory; only public ones are
  // shown as bylines (users RLS is owner-only, so read them as admin).
  const ownerIds = [
    ...new Set(rows.map((r) => r.owner_id).filter((id): id is string => !!id)),
  ];
  const owners = new Map<string, Owner>();
  if (ownerIds.length > 0) {
    const admin = await createAdminClient();
    const found = await allRowsIn<Owner>(ownerIds, (group, from, to) =>
      admin
        .from("users")
        .select("id, name, image, slug, social_x_link, x_handle", {
          count: "exact",
        })
        .in("id", group)
        .eq("public", true)
        .order("id")
        .range(from, to),
    );
    for (const owner of found) owners.set(owner.id, owner);
  }
  return rows.map((row) => {
    const owner = row.owner_id ? owners.get(row.owner_id) : undefined;
    const profile = owner ? creatorHandle(owner) : null;
    return {
      id: row.id,
      slug: row.slug,
      shareId: row.share_id,
      name: row.name,
      description: row.description,
      body: bodyForShape(row.avatar_shape),
      color: row.avatar_color,
      category: row.category,
      status: row.status,
      reviewNote: row.review_note,
      installs: row.install_count,
      installsRecent: recent?.get(row.id) ?? 0,
      submittedAt: row.submitted_at,
      reviewedAt: row.reviewed_at,
      aiReviewStatus: row.ai_review_status,
      aiReview: row.ai_review,
      // The author x.ai names (marketplace creator, or saved at submission)
      // comes first; otherwise the submitter's public profile.
      creator: row.creator_name
        ? {
            name: row.creator_name,
            image: row.creator_image,
            xHandle: row.creator_x_handle,
            profile,
          }
        : owner
          ? {
              name: owner.name,
              image: owner.image,
              xHandle: owner.x_handle ?? xHandleFromLink(owner.social_x_link),
              profile,
            }
          : {
              name: "Grok Bot community",
              image: null,
              xHandle: null,
              profile: null,
            },
      submitter: owner?.name ?? null,
    };
  });
}

export async function listListedBots(): Promise<DirectoryBot[]> {
  const admin = await createAdminClient();
  const [rows, velocity] = await Promise.all([
    allRows<BotRow>((from, to) =>
      admin
        .from("grok_bots")
        .select(BOT_COLUMNS, { count: "exact" })
        .eq("status", "listed")
        .order("id")
        .range(from, to),
    ),
    allRows<{ bot_id: string; installs_window: number }>((from, to) =>
      admin
        .rpc(
          "grok_bot_install_velocity",
          { window_days: 30 },
          { count: "exact" },
        )
        .order("bot_id")
        .range(from, to),
    ),
  ]);
  const recent = new Map<string, number>(
    velocity.map((v) => [v.bot_id, v.installs_window]),
  );
  return toDirectoryBots(rows, recent);
}

export async function getListedBot(slug: string): Promise<DirectoryBot | null> {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("grok_bots")
    .select(BOT_COLUMNS)
    .eq("slug", slug)
    .eq("status", "listed")
    .maybeSingle();
  if (!data) return null;
  const [bot] = await toDirectoryBots([data as BotRow]);
  return bot;
}

/** A member's listed bots, most added first: what their profile shows. */
export async function listListedBotsByOwner(
  ownerId: string,
): Promise<DirectoryBot[]> {
  const admin = await createAdminClient();
  const rows = await allRows<BotRow>((from, to) =>
    admin
      .from("grok_bots")
      .select(BOT_COLUMNS, { count: "exact" })
      .eq("owner_id", ownerId)
      .eq("status", "listed")
      .order("install_count", { ascending: false })
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .order("id")
      .range(from, to),
  );
  return toDirectoryBots(rows);
}

export async function listBotsByOwner(
  ownerId: string,
): Promise<DirectoryBot[]> {
  const admin = await createAdminClient();
  const rows = await allRows<BotRow>((from, to) =>
    admin
      .from("grok_bots")
      .select(BOT_COLUMNS, { count: "exact" })
      .eq("owner_id", ownerId)
      .order("submitted_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  return toDirectoryBots(rows);
}

export async function listBotsForReview(): Promise<DirectoryBot[]> {
  const admin = await createAdminClient();
  const rows = await allRows<BotRow>((from, to) =>
    admin
      .from("grok_bots")
      .select(BOT_COLUMNS, { count: "exact" })
      .eq("status", "pending")
      .order("submitted_at", { ascending: true })
      .order("id")
      .range(from, to),
  );
  // Flagged and failed reviews need a person first; then bots still being
  // checked. Oldest first within each.
  const rank: Record<string, number> = {
    flagged: 0,
    error: 1,
    reviewing: 2,
    queued: 3,
  };
  const bots = await toDirectoryBots(rows);
  return bots.sort(
    (a, b) =>
      (rank[a.aiReviewStatus ?? ""] ?? 4) - (rank[b.aiReviewStatus ?? ""] ?? 4),
  );
}

export async function getBotByShareId(shareId: string): Promise<{
  id: string;
  slug: string;
  status: BotStatus;
  owner_id: string | null;
} | null> {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("grok_bots")
    .select("id, slug, status, owner_id")
    .eq("share_id", shareId)
    .maybeSingle();
  return data;
}

/** A URL slug from the bot's name, made unique with a short suffix. */
export async function uniqueBotSlug(name: string): Promise<string> {
  const base =
    slugify(name, { lower: true, strict: true }).slice(0, 60) || "bot";
  const admin = await createAdminClient();
  const { data } = await admin
    .from("grok_bots")
    .select("slug")
    .like("slug", `${base}%`);
  const taken = new Set((data ?? []).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Bots in the given statuses, most recently reviewed first (admin views). */
export async function listBotsByStatus(
  statuses: BotStatus[],
): Promise<DirectoryBot[]> {
  const admin = await createAdminClient();
  const rows = await allRows<BotRow>((from, to) =>
    admin
      .from("grok_bots")
      .select(BOT_COLUMNS, { count: "exact" })
      .in("status", statuses)
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .order("submitted_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  return toDirectoryBots(rows);
}

export async function countBotsByStatus(): Promise<Record<BotStatus, number>> {
  const admin = await createAdminClient();
  const counts: Record<BotStatus, number> = {
    pending: 0,
    listed: 0,
    declined: 0,
    unlisted: 0,
  };
  await Promise.all(
    (Object.keys(counts) as BotStatus[]).map(async (status) => {
      const { count } = await admin
        .from("grok_bots")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      counts[status] = count ?? 0;
    }),
  );
  return counts;
}

export type ModerationEvent = {
  id: number;
  createdAt: string;
  action: string;
  source: "web" | "mcp" | "ai" | "system";
  actor: string | null;
  reason: string | null;
};

/** Moderation history per bot, newest first, with admins' names. */
export async function listModerationHistory(
  botIds: string[],
): Promise<Map<string, ModerationEvent[]>> {
  const history = new Map<string, ModerationEvent[]>();
  if (botIds.length === 0) return history;
  const admin = await createAdminClient();
  type EventRow = {
    id: number;
    created_at: string;
    bot_id: string;
    action: string;
    source: ModerationEvent["source"];
    actor_id: string | null;
    reason: string | null;
  };
  const events = (
    await allRowsIn<EventRow>(botIds, (group, from, to) =>
      admin
        .from("grok_bot_moderation_events")
        .select("id, created_at, bot_id, action, source, actor_id, reason", {
          count: "exact",
        })
        .in("bot_id", group)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    )
  ).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  const actorIds = [
    ...new Set(
      events.map((e) => e.actor_id).filter((id): id is string => !!id),
    ),
  ];
  const names = new Map<string, string>();
  const users = await allRowsIn<{ id: string; name: string }>(
    actorIds,
    (group, from, to) =>
      admin
        .from("users")
        .select("id, name", { count: "exact" })
        .in("id", group)
        .order("id")
        .range(from, to),
  );
  for (const u of users) names.set(u.id, u.name);
  for (const e of events) {
    const list = history.get(e.bot_id) ?? [];
    list.push({
      id: e.id,
      createdAt: e.created_at,
      action: e.action,
      source: e.source,
      actor: e.actor_id ? (names.get(e.actor_id) ?? "An admin") : null,
      reason: e.reason,
    });
    history.set(e.bot_id, list);
  }
  return history;
}
