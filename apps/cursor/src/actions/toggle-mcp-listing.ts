"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/utils/supabase/admin-client";
import { authActionClient } from "./safe-action";

export const toggleMCPListingAction = authActionClient
  .metadata({
    actionName: "toggle-mcp-listing",
  })
  .schema(
    z.object({
      id: z.string(),
      active: z.boolean(),
    }),
  )
  .action(async ({ parsedInput: { id, active }, ctx: { userId } }) => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("mcps")
      .update({
        active,
      })
      .eq("id", id)
      .eq("owner_id", userId)
      .select("slug")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    updateTag("mcps");
    updateTag(`mcp-${data.slug}`);

    return data;
  });
