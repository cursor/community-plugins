"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/utils/supabase/admin-client";
import { ActionError, authActionClient } from "./safe-action";

export const deletePluginAction = authActionClient
  .metadata({
    actionName: "delete-plugin",
  })
  .schema(
    z.object({
      id: z.string().uuid(),
    }),
  )
  .action(async ({ parsedInput: { id }, ctx: { userId } }) => {
    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("plugins")
      .select("id, owner_id, slug, permanently_blocked")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      throw new ActionError("Plugin not found.");
    }

    if (existing.owner_id !== userId) {
      throw new ActionError(
        "You do not have permission to delete this plugin.",
      );
    }

    // A blocked plugin stays on record, so the same one can't be deleted and
    // submitted again.
    if (existing.permanently_blocked) {
      throw new ActionError(
        "This plugin cannot be deleted. Contact support if you believe this is a mistake.",
      );
    }

    const { error } = await supabase
      .from("plugins")
      .delete()
      .eq("id", id)
      .eq("owner_id", userId);

    if (error) {
      throw new ActionError(`Failed to delete plugin: ${error.message}`);
    }

    // Deletions must disappear from cached lists immediately for the owner.
    updateTag("plugins");
    updateTag(`plugin-${existing.slug}`);
    revalidatePath("/admin/plugins");

    return { slug: existing.slug };
  });
