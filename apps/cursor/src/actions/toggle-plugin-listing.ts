"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/utils/supabase/admin-client";
import { ActionError, authActionClient } from "./safe-action";

export const togglePluginListingAction = authActionClient
  .metadata({
    actionName: "toggle-plugin-listing",
  })
  .schema(
    z.object({
      id: z.string().uuid(),
      active: z.boolean(),
    }),
  )
  .action(async ({ parsedInput: { id, active }, ctx: { userId } }) => {
    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("plugins")
      .select("id, owner_id, slug, permanently_blocked, scan_status")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      throw new ActionError("Plugin not found.");
    }

    if (existing.owner_id !== userId) {
      throw new ActionError(
        "You do not have permission to update this plugin.",
      );
    }

    if (active && existing.permanently_blocked) {
      throw new ActionError(
        "This plugin cannot be published. Contact support if you believe this is a mistake.",
      );
    }

    // Only a plugin the security scan has passed goes live: publishing must
    // not skip review. One that was never scanned is scanned when it's edited.
    if (active && existing.scan_status !== "safe") {
      throw new ActionError(
        "This plugin can't be published until it has passed review.",
      );
    }

    const { data, error } = await supabase
      .from("plugins")
      .update({ active })
      .eq("id", id)
      .eq("owner_id", userId)
      .select("slug")
      .single();

    if (error) {
      throw new ActionError(error.message);
    }

    // Publish/unpublish must be visible to the owner on the next render.
    updateTag("plugins");
    updateTag(`plugin-${data.slug}`);

    return data;
  });
