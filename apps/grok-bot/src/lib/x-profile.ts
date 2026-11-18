import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;

/** The X handle from a user's X sign-in identity, if they have one. */
export function xHandleOf(user: User): string | null {
  const identity = user.identities?.find((i) => i.provider === "x");
  const data = identity?.identity_data ?? {};
  const handle = String(data.user_name ?? data.preferred_username ?? "");
  return X_HANDLE.test(handle) ? handle : null;
}

/**
 * After an X sign-in, records what X said about the member:
 *
 * - `x_handle`, the handle itself. X checked it, so it is the address of
 *   their profile (/u/@handle). It follows them if they rename
 *   on X, and a handle someone else held before is taken from that account.
 * - `social_x_link`, the profile link cursor.directory's form edits, when it
 *   is empty. A link the member set is never replaced.
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
  const { error: handleError } = await admin
    .from("users")
    .update({ x_handle: handle })
    .eq("id", user.id);
  if (handleError) console.error("saveXProfile", handleError.message);
  const { error } = await admin
    .from("users")
    .update({ social_x_link: `https://x.com/${handle}` })
    .eq("id", user.id)
    .is("social_x_link", null);
  if (error) console.error("saveXProfile", error.message);
}
