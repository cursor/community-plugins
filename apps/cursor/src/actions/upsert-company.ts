"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/utils/supabase/admin-client";
import { ActionError, authActionClient } from "./safe-action";

// Postgres unique_violation. Raised when an insert/update collides with the
// case-insensitive company name index (companies_name_key_unique).
const UNIQUE_VIOLATION = "23505";

export const upsertCompanyAction = authActionClient
  .metadata({
    actionName: "upsert-company",
  })
  .schema(
    z.object({
      id: z.string().optional(),
      name: z
        .string()
        .trim()
        .min(2, { message: "Name must be at least 2 characters." }),
      image: z.string().url().nullable(),
      slug: z.string().optional(),
      location: z.string().nullable(),
      bio: z.string().nullable(),
      website: z.string().nullable(),
      social_x_link: z.string().nullable(),
      is_public: z.boolean(),
      redirect: z.boolean().optional(),
    }),
  )
  .action(
    async ({
      parsedInput: {
        id,
        name,
        image,
        slug,
        location,
        bio,
        website,
        social_x_link,
        is_public,
        redirect: shouldRedirect,
      },
      ctx: { userId },
    }) => {
      const supabase = await createClient();

      const nameKey = name.toLowerCase();

      // Only treat the request as an edit when a row with the provided id
      // already exists. The form always generates a client-side nanoid for new
      // companies, so the presence of `id` alone does not imply an edit.
      if (id) {
        const { data: existing } = await supabase
          .from("companies")
          .select("id, owner_id")
          .eq("id", id)
          .maybeSingle();

        if (existing) {
          if (existing.owner_id !== userId) {
            throw new ActionError(
              "You don't have permission to edit this company",
            );
          }

          const { data, error } = await supabase
            .from("companies")
            .update({
              name,
              image,
              location,
              bio,
              website,
              social_x_link,
              public: is_public,
            })
            .eq("id", id)
            .eq("owner_id", userId)
            .select("id, slug")
            .single();

          if (error) {
            if (error.code === UNIQUE_VIOLATION) {
              throw new ActionError("A company with this name already exists.");
            }
            throw new ActionError(error.message);
          }

          if (shouldRedirect) {
            redirect(`/c/${data?.slug}`);
          }

          return data;
        }
      }

      // New company. Insert directly so the case-insensitive unique index can
      // reject duplicates even under concurrent/double submissions. The slug is
      // assigned by the `generate_company_slug` trigger.
      const { data, error } = await supabase
        .from("companies")
        .insert({
          id: id ?? undefined,
          name,
          image,
          location,
          slug: slug ?? undefined,
          bio,
          website,
          social_x_link,
          public: is_public,
          owner_id: userId,
        })
        .select("id, slug")
        .single();

      if (error) {
        // A company with this name already exists. Reuse it instead of creating
        // a duplicate so retries/double-clicks resolve to the same record.
        if (error.code === UNIQUE_VIOLATION) {
          const { data: existing } = await supabase
            .from("companies")
            .select("id, slug")
            .eq("name_key", nameKey)
            .maybeSingle();

          if (existing) {
            if (shouldRedirect) {
              redirect(`/c/${existing.slug}`);
            }

            return existing;
          }

          throw new ActionError("A company with this name already exists.");
        }

        throw new ActionError(error.message);
      }

      if (shouldRedirect) {
        redirect(`/c/${data?.slug}`);
      }

      return data;
    },
  );
