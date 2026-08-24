"use server";

import { z } from "zod";
import { BotParseError, parseGitHubBot } from "@/lib/bots/parse";
import { ActionError, authActionClient } from "./safe-action";

export const parseGitHubBotAction = authActionClient
  .metadata({ actionName: "parse-github-bot" })
  .schema(
    z.object({
      url: z.string().url("Please enter a valid GitHub URL"),
    }),
  )
  .action(async ({ parsedInput: { url } }) => {
    try {
      return await parseGitHubBot(url, { maxWaitMs: 3000 });
    } catch (err) {
      if (err instanceof BotParseError) {
        throw new ActionError(err.message);
      }
      throw err;
    }
  });
