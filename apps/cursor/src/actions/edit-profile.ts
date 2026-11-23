"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/utils/supabase/admin-client";
import { authActionClient } from "./safe-action";

export const editProfileAction = authActionClient
  .metadata({
    actionName: "edit-profile",
  })
  .schema(
    z.object({
      name: z.string(),
      slug: z.string().nullable(),
      status: z.string().nullable(),
      bio: z.string().nullable(),
      work: z.string().nullable(),
      website: z.string().nullable(),
      social_x_link: z.string().nullable(),
      is_public: z.boolean(),
    }),
  )
  .action(
    async ({
      parsedInput: {
        name,
        slug,
        status,
        bio,
        work,
        website,
        social_x_link,
        is_public,
      },
      ctx: { userId },
    }) => {
      const supabase = await createClient();

      const { data, error } = await supabase
        .from("users")
        .update({
          name,
          status,
          slug: slug ?? undefined,
          bio,
          work,
          website,
          social_x_link,
          public: is_public,
        })
        .eq("id", userId)
        .select("id, slug")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      redirect(`/u/${slug}`);

      return data;
    },
  );
