"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/utils/supabase/admin-client";
import { ownUploadUrl } from "@/utils/uploads";
import { ActionError, authActionClient } from "./safe-action";

/** Saves a picture the owner just uploaded as their company's cover. */
export const setCompanyHeroAction = authActionClient
  .metadata({ actionName: "set-company-hero" })
  .schema(
    z.object({
      companyId: z.string().min(1).max(100),
      url: z.string().url().max(2000),
    }),
  )
  .action(async ({ parsedInput: { companyId, url }, ctx: { userId } }) => {
    const saved = ownUploadUrl(url, `${companyId}/hero`);
    if (!saved) {
      throw new ActionError("That image can't be used. Upload it again.");
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("companies")
      .update({ hero: saved })
      .eq("id", companyId)
      .eq("owner_id", userId)
      .select("slug")
      .maybeSingle();

    if (error) {
      throw new ActionError(error.message);
    }
    if (!data) {
      throw new ActionError("You don't have permission to edit this company");
    }

    updateTag(`company-${data.slug}`);
    return { url: saved };
  });
