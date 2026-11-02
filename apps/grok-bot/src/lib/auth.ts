import "server-only";

import { redirect } from "next/navigation";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";
import { createClient } from "@/utils/supabase/server";

export type Viewer = {
  id: string;
  name: string;
  image: string | null;
  slug: string;
};

/** The signed-in member with their shared cursor.directory profile, or null. */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("users")
    .select("name, image, slug")
    .eq("id", user.id)
    .maybeSingle();
  return {
    id: user.id,
    name: profile?.name ?? user.email ?? "Member",
    image: profile?.image ?? null,
    slug: profile?.slug ?? "",
  };
}

/** For pages that need an account: sign in first, then come straight back. */
export async function requireViewer(next: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(next)}`);
  return viewer;
}

/** Admins are shared with cursor.directory (public.admins + is_admin). */
export async function isAdmin(userId: string): Promise<boolean> {
  const admin = await createAdminClient();
  const { data } = await admin.rpc("is_admin", { p_user_id: userId });
  return data === true;
}
