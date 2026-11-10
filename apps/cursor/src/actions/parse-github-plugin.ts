"use server";

import {
  GitHubParseError,
  parseGitHubPlugin,
} from "@directories/plugins/github";
import { z } from "zod";
import { ActionError, authActionClient } from "./safe-action";

export const parseGitHubPluginAction = authActionClient
  .metadata({ actionName: "parse-github-plugin" })
  .schema(
    z.object({
      url: z.string().url("Please enter a valid GitHub URL"),
    }),
  )
  .action(async ({ parsedInput: { url } }) => {
    try {
      // Cap GitHub rate-limit retry to 3s so a transient 429 doesn't push the
      // user-facing submission past the Vercel function timeout. The bulk seed
      // script doesn't impose this cap.
      return await parseGitHubPlugin(url, { maxWaitMs: 3000 });
    } catch (err) {
      if (err instanceof GitHubParseError) {
        throw new ActionError(err.message);
      }
      throw err;
    }
  });
