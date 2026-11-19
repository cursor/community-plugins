import "server-only";
import type { User } from "@supabase/supabase-js";
import { claimMarketplaceBots } from "@/lib/claim-bots";
import { expireListings } from "@/lib/data-cache";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;

/** The X handle from a user's X sign-in identity, if they have one. */
export function xHandleOf(user: User): string | null {
  const identity = user.identities?.find((i) => i.provider === "x");
  const data = identity?.identity_data ?? {};
  const handle = String(data.user_name ?? data.preferred_username ?? "");
  return X_HANDLE.test(handle) ? handle : null;
}

/** The profile photo from a user's X sign-in identity, if X sent one. */
export function xPhotoOf(user: User): string | null {
  const identity = user.identities?.find((i) => i.provider === "x");
  const data = identity?.identity_data ?? {};
  const photo = String(data.avatar_url ?? data.picture ?? "");
  return photo.startsWith("https://pbs.twimg.com/") ? photo : null;
}

/**
 * After an X sign-in, records what X said about the member:
 *
 * - `x_handle`, the handle itself. X checked it, so it is the address of
 *   their profile (/u/handle). It follows them if they rename
 *   on X, and a handle someone else held before is taken from that account.
 * - `image`, their X photo. It replaces a photo from an earlier Google or
 *   GitHub sign-in, so a profile here looks like the member does on X.
 * - `social_x_link`, the profile link cursor.directory's form edits, when it
 *   is empty. A link the member set is never replaced.
 *
 * It also hands them the marketplace bots credited to that handle (see
 * claimMarketplaceBots).
 */
export async function saveXProfile(user: User) {
  const handle = xHandleOf(user);
  if (!handle) return;
  const admin = await createAdminClient();
  // `ilike` reads "_" as a wildcard, and X handles use it.
  const { error: freeError } = await admin
    .from("users")
    .update({ x_handle: null })
    .ilike("x_handle", handle.replace(/_/g, "\\_"))
    .neq("id", user.id);
  if (freeError) console.error("saveXProfile", freeError.message);
  const photo = xPhotoOf(user);
  const { error: handleError } = await admin
    .from("users")
    .update({ x_handle: handle, ...(photo ? { image: photo } : {}) })
    .eq("id", user.id);
  if (handleError) console.error("saveXProfile", handleError.message);
  const { error } = await admin
    .from("users")
    .update({ social_x_link: `https://x.com/${handle}` })
    .eq("id", user.id)
    .is("social_x_link", null);
  if (error) console.error("saveXProfile", error.message);
  // Their profile now answers at /u/<handle>. Someone may have looked there
  // a moment ago and been told (and the site remembered) that nobody was:
  // a member's first X sign-in led straight to "this page doesn't exist".
  expireListings("profiles");
  // The marketplace bots credited to this handle are theirs.
  await claimMarketplaceBots(user.id, handle);
}
