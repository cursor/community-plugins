"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
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
      .select("id, owner_id, slug, active")
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

    const { data: deleted, error } = await supabase
      .from("plugins")
      .delete()
      .eq("id", id)
      .eq("owner_id", userId)
      .select("id");

    if (error) {
      throw new ActionError(`Failed to delete plugin: ${error.message}`);
    }

    // A delete that matches no rows is not an error for PostgREST, so without
    // this check a row the policy refuses to delete would still produce the
    // "Plugin deleted." toast while staying live and keeping its slug.
    if (!deleted || deleted.length === 0) {
      throw new ActionError(
        "The plugin could not be deleted. It is still listed; contact support to have it removed.",
      );
    }

    // Deletions must disappear from cached lists immediately for the owner.
    updateTag("plugins");
    updateTag(`plugin-${existing.slug}`);
    revalidatePath("/admin/plugins");

    return { slug: existing.slug };
  });
