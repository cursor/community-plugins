"use server";

import { resolveGithubRepoIdFromRepository } from "@directories/plugins/github";
import { InsertPluginError, insertPlugin } from "@directories/plugins/insert";
import { componentInputSchema } from "@directories/plugins/types";
import { updateTag } from "next/cache";
import { z } from "zod";
import { kickDrainAfterResponse } from "@/lib/plugins/queue";
import { pluginScanLimit } from "@/lib/rate-limit";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";
import { ActionError, authActionClient } from "./safe-action";

export const createPluginAction = authActionClient
  .metadata({
    actionName: "create-plugin",
  })
  .schema(
    z.object({
      name: z.string().min(2, "Name must be at least 2 characters"),
      description: z
        .string()
        .min(10, "Description must be at least 10 characters"),
      logo: z.string().nullable().optional(),
      repository: z.string().url().nullable().optional(),
      homepage: z.string().url().nullable().optional(),
      keywords: z.array(z.string()).optional(),
      components: z
        .array(componentInputSchema)
        .min(1, "At least one component is required"),
    }),
  )
  .action(
    async ({
      parsedInput: {
        name,
        description,
        logo,
        repository,
        homepage,
        keywords,
        components,
      },
      ctx: { userId },
    }) => {
      const { success } = await pluginScanLimit(userId);
      if (!success) {
        throw new ActionError(
          "Too many plugin submissions in the last hour. Please try again later.",
        );
      }

      // Never trust a client-supplied github_repo_id — resolve from the
      // repository URL via GitHub so squatters cannot block idempotent imports.
      const githubRepoId = await resolveGithubRepoIdFromRepository(repository, {
        maxWaitMs: 3000,
      });

      let result: { id: string; slug: string; enqueued: boolean };
      try {
        result = await insertPlugin(
          await createAdminClient(),
          {
            name,
            description,
            logo,
            repository,
            homepage,
            keywords,
            components,
          },
          {
            ownerId: userId,
            source: "user",
            skipScan: false,
            githubRepoId,
          },
        );
      } catch (err) {
        if (err instanceof InsertPluginError) {
          if (err.code === "duplicate_name" || err.code === "duplicate_repo") {
            throw new ActionError(
              "A plugin with this name or repository already exists. Please choose a different name or repository.",
            );
          }
          throw new ActionError(err.message);
        }
        throw err;
      }

      if (result.enqueued) kickDrainAfterResponse();
      updateTag("plugins");

      return { slug: result.slug };
    },
  );
