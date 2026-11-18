import "server-only";

import { cache } from "react";
import { type AppListItem, listAppsByCreator } from "@/data/apps";
import { type DirectoryBot, listListedBotsByOwner } from "@/data/bots";
import {
  creatorHandle,
  creatorPath,
  isXHandle,
  xHandleIn,
} from "@/lib/creator-handle";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

/**
 * A member as their public profile shows them. Only these columns are ever
 * read for it: no email, and nothing from a profile that isn't public.
 */
export type Creator = {
  id: string;
  name: string;
  image: string | null;
  /** The last part of /u/<handle>: "@xhandle" or the profile's slug. */
  handle: string;
  /** Their X handle, when they signed in with X. */
  xHandle: string | null;
};

type MemberRow = {
  id: string;
  name: string;
  image: string | null;
  slug: string;
  x_handle: string | null;
};

const MEMBER_COLUMNS = "id, name, image, slug, x_handle";

const toCreator = (row: MemberRow): Creator => ({
  id: row.id,
  name: row.name,
  image: row.image,
  handle: creatorHandle(row),
  xHandle: row.x_handle,
});

// `ilike` reads "_" and "%" as wildcards, and X handles use "_".
const exactly = (value: string) => value.replace(/[\\%_]/g, "\\$&");

async function byXHandle(name: string): Promise<Creator | null> {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("users")
    .select(MEMBER_COLUMNS)
    .ilike("x_handle", exactly(name))
    .eq("public", true)
    .maybeSingle();
  return data ? toCreator(data as MemberRow) : null;
}

/** The member a handle in an address names, whichever way it's written. */
async function findCreator(handle: string): Promise<Creator | null> {
  if (!handle || handle.length > 100) return null;
  if (handle.startsWith("@")) {
    const name = xHandleIn(handle);
    return name ? byXHandle(name) : null;
  }
  const admin = await createAdminClient();
  const { data } = await admin
    .from("users")
    .select(MEMBER_COLUMNS)
    .eq("slug", handle)
    .eq("public", true)
    .maybeSingle();
  if (data) return toCreator(data as MemberRow);
  // An X handle typed without its "@".
  return isXHandle(handle) ? byXHandle(handle) : null;
}

/** A member as their profile shows them. Null when it isn't public. */
async function creatorById(id: string): Promise<Creator | null> {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("users")
    .select(MEMBER_COLUMNS)
    .eq("id", id)
    .eq("public", true)
    .maybeSingle();
  return data ? toCreator(data as MemberRow) : null;
}

export type CreatorProfile = {
  creator: Creator;
  /** Listed bots, most added first. */
  bots: DirectoryBot[];
  /** Listed apps, newest first. */
  apps: AppListItem[];
};

/**
 * A creator's profile: who they are and what they have listed. Null when the
 * handle names nobody, or somebody with nothing listed, so a profile never
 * shows a member who has only pending or declined submissions.
 */
export const getCreatorProfile = cache(
  async (handle: string): Promise<CreatorProfile | null> => {
    const creator = await findCreator(handle);
    if (!creator) return null;
    const [bots, apps] = await Promise.all([
      listListedBotsByOwner(creator.id),
      listAppsByCreator(creator.id),
    ]);
    if (bots.length + apps.length === 0) return null;
    return { creator, bots, apps };
  },
);

/**
 * Whether a member has something listed, so a profile to link to. It only
 * counts, since the header asks on every page a signed-in member opens.
 */
async function hasListings(id: string): Promise<boolean> {
  const admin = await createAdminClient();
  const [bots, apps] = await Promise.all([
    admin
      .from("grok_bots")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", id)
      .eq("status", "listed"),
    admin
      .from("plugins")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", id)
      .eq("active", true)
      .eq("grok_bot_addable", true)
      .not("unavailable_in", "cs", "{grok_bot}"),
  ]);
  return (bots.count ?? 0) + (apps.count ?? 0) > 0;
}

/**
 * The address of a member's own profile, or null when they have none: their
 * cursor.directory profile isn't public, or nothing of theirs is listed.
 */
export async function ownProfilePath(id: string): Promise<string | null> {
  const [creator, listed] = await Promise.all([
    creatorById(id),
    hasListings(id),
  ]);
  return creator && listed ? creatorPath(creator.handle) : null;
}

export type CreatorEntry = {
  handle: string;
  listings: number;
  updatedAt: string | null;
};

/** Every creator with something listed, for the sitemap. */
export async function listCreators(): Promise<CreatorEntry[]> {
  const admin = await createAdminClient();
  const { data, error } = await admin.rpc("grok_bot_creators_json");
  if (error) throw error;
  return (
    (data ?? []) as {
      slug: string;
      x_handle: string | null;
      listings: number;
      updated_at: string | null;
    }[]
  ).map((row) => ({
    handle: creatorHandle(row),
    listings: row.listings,
    updatedAt: row.updated_at,
  }));
}
