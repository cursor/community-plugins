"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/utils/supabase/admin-client";
import { authActionClient } from "./safe-action";

export const updateSettingsAction = authActionClient
  .metadata({
    actionName: "update-settings",
  })
  .schema(
    z.object({
      follow_email: z.boolean(),
    }),
  )
  .action(async ({ parsedInput: { follow_email }, ctx: { userId } }) => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("users")
      .update({
        follow_email,
      })
      .eq("id", userId)
      .select("id, slug")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(`/u/${data.slug}/settings`);

    return data;
  });
