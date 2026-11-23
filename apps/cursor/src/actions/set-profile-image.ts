"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/utils/supabase/admin-client";
import { ownUploadUrl } from "@/utils/uploads";
import { ActionError, authActionClient } from "./safe-action";

/** Saves a picture the member just uploaded as their photo or cover. */
export const setProfileImageAction = authActionClient
  .metadata({ actionName: "set-profile-image" })
  .schema(
    z.object({
      field: z.enum(["image", "hero"]),
      url: z.string().url().max(2000),
    }),
  )
  .action(async ({ parsedInput: { field, url }, ctx: { userId } }) => {
    const folder = field === "image" ? "avatar" : "hero";
    const saved = ownUploadUrl(url, `${userId}/${folder}`);
    if (!saved) {
      throw new ActionError("That image can't be used. Upload it again.");
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("users")
      .update({ [field]: saved })
      .eq("id", userId)
      .select("slug")
      .single();

    if (error) {
      throw new ActionError(error.message);
    }

    updateTag(`user-${data.slug}`);
    return { url: saved };
  });
