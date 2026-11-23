"use server";

import { z } from "zod";
import { createClient } from "@/utils/supabase/admin-client";
import { getSession } from "@/utils/supabase/auth";
import { actionClient } from "./safe-action";

/** Whether the signed-in member has starred this plugin. */
export const getStarStatusAction = actionClient
  .metadata({ actionName: "get-star-status" })
  .schema(z.object({ pluginId: z.string().uuid() }))
  .action(async ({ parsedInput: { pluginId } }) => {
    const session = await getSession();
    if (!session) return { starred: false };

    const supabase = await createClient();
    const { data } = await supabase
      .from("plugin_stars")
      .select("plugin_id")
      .eq("plugin_id", pluginId)
      .eq("user_id", session.user.id)
      .maybeSingle();

    return { starred: !!data };
  });
