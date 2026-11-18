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
 * After an X sign-in, fills the member's profile X link (the same
 * `social_x_link` cursor.directory's profile form edits) when it's empty, so
 * their bylines show their handle. A link the member set is never replaced.
 */
export async function fillXLink(user: User) {
  const handle = xHandleOf(user);
  if (!handle) return;
  const admin = await createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ social_x_link: `https://x.com/${handle}` })
    .eq("id", user.id)
    .is("social_x_link", null);
  if (error) console.error("fillXLink", error.message);
}
