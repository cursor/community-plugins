"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { InsertBotError, insertBot } from "@/lib/bots/insert";
import { botNeedSchema } from "@/lib/bots/types";
import { resolveGithubRepoIdFromRepository } from "@/lib/github-plugin/parse";
import { pluginScanLimit } from "@/lib/rate-limit";
import { ActionError, authActionClient } from "./safe-action";

export const createBotAction = authActionClient
  .metadata({
    actionName: "create-bot",
  })
  .schema(
    z.object({
      name: z.string().min(2, "Name must be at least 2 characters"),
      description: z
        .string()
        .min(10, "Description must be at least 10 characters"),
      writeup: z.string().min(40, "Writeup must be at least 40 characters"),
      template: z.string().min(20, "Template must be at least 20 characters"),
      needs: z.array(botNeedSchema).optional(),
      repository: z.string().url().nullable().optional(),
      homepage: z.string().url().nullable().optional(),
    }),
  )
  .action(
    async ({
      parsedInput: {
        name,
        description,
        writeup,
        template,
        needs,
        repository,
        homepage,
      },
      ctx: { userId },
    }) => {
      const { success } = await pluginScanLimit(userId);
      if (!success) {
        throw new ActionError(
          "Too many submissions in the last hour. Please try again later.",
        );
      }

      const githubRepoId = await resolveGithubRepoIdFromRepository(repository, {
        maxWaitMs: 3000,
      });

      let result: { id: string; slug: string };
      try {
        result = await insertBot(
          {
            name,
            description,
            writeup,
            template,
            needs,
            repository,
            homepage,
          },
          {
            ownerId: userId,
            source: "user",
            skipReview: false,
            githubRepoId,
          },
        );
      } catch (err) {
        if (err instanceof InsertBotError) {
          if (err.code === "duplicate_name" || err.code === "duplicate_repo") {
            throw new ActionError(
              "A bot with this name or repository already exists. Please choose a different name or repository.",
            );
          }
          throw new ActionError(err.message);
        }
        throw err;
      }

      updateTag("bots");

      return { slug: result.slug };
    },
  );
