"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/utils/supabase/admin-client";
import { authActionClient } from "./safe-action";

export const updateMCPListingAction = authActionClient
  .metadata({
    actionName: "update-mcp-listing",
  })
  .schema(
    z.object({
      id: z.string(),
      name: z.string(),
      company_id: z.string().optional(),
      description: z.string(),
      config: z.record(z.string(), z.any()).nullable(),
      link: z.string().url(),
      logo: z.string().optional(),
    }),
  )
  .action(
    async ({
      parsedInput: { id, name, company_id, description, link, logo, config },
      ctx: { userId },
    }) => {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from("mcps")
        .update({
          name,
          description,
          company_id,
          config,
          link,
          logo,
        })
        .eq("id", id)
        .eq("owner_id", userId)
        .select("id, slug")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      updateTag("mcps");
      updateTag(`mcp-${data.slug}`);

      return data;
    },
  );
