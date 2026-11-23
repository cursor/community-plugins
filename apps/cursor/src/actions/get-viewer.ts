"use server";

import { createClient } from "@/utils/supabase/admin-client";
import { getSession } from "@/utils/supabase/auth";
import { actionClient } from "./safe-action";

/** The signed-in member's own profile, for the account menus. */
export const getViewerAction = actionClient
  .metadata({ actionName: "get-viewer" })
  .action(async () => {
    const session = await getSession();
    if (!session) return { user: null };

    const supabase = await createClient();
    const { data } = await supabase
      .from("users")
      .select("id, slug, name, image")
      .eq("id", session.user.id)
      .maybeSingle();

    return { user: data };
  });
