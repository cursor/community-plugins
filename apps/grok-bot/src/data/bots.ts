import "server-only";

import slugify from "slugify";
import { type Body, bodyForShape } from "@/lib/avatar";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

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
    profileSlug: string | null;
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
    const { data } = await admin
      .from("users")
      .select("id, name, image, slug, social_x_link")
      .in("id", ownerIds)
      .eq("public", true);
    for (const owner of (data ?? []) as Owner[]) owners.set(owner.id, owner);
  }
  return rows.map((row) => {
    const owner = row.owner_id ? owners.get(row.owner_id) : undefined;
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
            profileSlug: null,
          }
        : owner
          ? {
              name: owner.name,
              image: owner.image,
              xHandle: xHandleFromLink(owner.social_x_link),
              profileSlug: owner.slug,
            }
          : {
              name: "Grok Bot community",
              image: null,
              xHandle: null,
              profileSlug: null,
            },
      submitter: owner?.name ?? null,
    };
  });
}

export async function listListedBots(): Promise<DirectoryBot[]> {
  const admin = await createAdminClient();
  const [{ data: rows, error }, { data: velocity }] = await Promise.all([
    admin.from("grok_bots").select(BOT_COLUMNS).eq("status", "listed"),
    admin.rpc("grok_bot_install_velocity", { window_days: 30 }),
  ]);
  if (error) throw error;
  const recent = new Map<string, number>(
    ((velocity ?? []) as { bot_id: string; installs_window: number }[]).map(
      (v) => [v.bot_id, v.installs_window],
    ),
  );
  return toDirectoryBots((rows ?? []) as BotRow[], recent);
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

export async function listBotsByOwner(
  ownerId: string,
): Promise<DirectoryBot[]> {
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("grok_bots")
    .select(BOT_COLUMNS)
    .eq("owner_id", ownerId)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return toDirectoryBots((data ?? []) as BotRow[]);
}

export async function listBotsForReview(): Promise<DirectoryBot[]> {
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("grok_bots")
    .select(BOT_COLUMNS)
    .eq("status", "pending")
    .order("submitted_at", { ascending: true });
  if (error) throw error;
  // Flagged and failed reviews need a person first; then bots still being
  // checked. Oldest first within each.
  const rank: Record<string, number> = {
    flagged: 0,
    error: 1,
    reviewing: 2,
    queued: 3,
  };
  const bots = await toDirectoryBots((data ?? []) as BotRow[]);
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
  const { data, error } = await admin
    .from("grok_bots")
    .select(BOT_COLUMNS)
    .in("status", statuses)
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return toDirectoryBots((data ?? []) as BotRow[]);
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
  const { data, error } = await admin
    .from("grok_bot_moderation_events")
    .select("id, created_at, bot_id, action, source, actor_id, reason")
    .in("bot_id", botIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const actorIds = [
    ...new Set(
      (data ?? []).map((e) => e.actor_id).filter((id): id is string => !!id),
    ),
  ];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: users } = await admin
      .from("users")
      .select("id, name")
      .in("id", actorIds);
    for (const u of users ?? []) names.set(u.id, u.name);
  }
  for (const e of data ?? []) {
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
