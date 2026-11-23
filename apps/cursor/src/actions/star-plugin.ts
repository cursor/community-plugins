"use server";

import { revalidateTag, updateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/utils/supabase/admin-client";
import { ActionError, authActionClient } from "./safe-action";

export const starPluginAction = authActionClient
  .metadata({
    actionName: "star-plugin",
  })
  .schema(
    z.object({
      pluginId: z.string().uuid(),
      slug: z.string(),
    }),
  )
  .action(async ({ parsedInput: { pluginId, slug }, ctx: { userId } }) => {
    const supabase = await createClient();

    const { error } = await supabase.rpc("toggle_plugin_star_as", {
      plugin_id_input: pluginId,
      user_id_input: userId,
    });

    if (error) {
      throw new ActionError(`Failed to update star: ${error.message}`);
    }

    // Star counts can refresh in the background, but the user's own starred
    // list must reflect the change immediately.
    revalidateTag("plugins", "max");
    revalidateTag(`plugin-${slug}`, "max");
    updateTag(`stars-${userId}`);
  });
