/**
 * Insert a bot listing. The create-bot action owns auth and rate limits.
 * Does not enqueue plugin_scans: that queue's drain runs runPluginScan
 * and expects a plugins row.
 */

import { createClient } from "@/utils/supabase/admin-client";
import { type BotNeed, botNeedsSchema } from "./types";

export type InsertBotInput = {
  name: string;
  description: string;
  writeup: string;
  template: string;
  needs?: BotNeed[];
  repository?: string | null;
  homepage?: string | null;
  logo?: string | null;
};

export type InsertBotOptions = {
  ownerId: string | null;
  source: string;
  githubRepoId?: number | null;
  skipReview?: boolean;
};

export class InsertBotError extends Error {
  constructor(
    message: string,
    public readonly code: "duplicate_name" | "duplicate_repo" | "insert_failed",
  ) {
    super(message);
    this.name = "InsertBotError";
  }
}

export async function insertBot(
  input: InsertBotInput,
  options: InsertBotOptions,
): Promise<{ id: string; slug: string }> {
  const supabase = await createClient();
  const skipReview = options.skipReview === true;
  const needs = botNeedsSchema.parse(input.needs ?? []);

  const { data: bot, error } = await supabase
    .from("bots")
    .insert({
      name: input.name,
      description: input.description,
      writeup: input.writeup,
      template: input.template,
      needs,
      repository: input.repository || null,
      homepage: input.homepage || null,
      logo: input.logo || null,
      owner_id: options.ownerId,
      active: skipReview,
      scan_status: skipReview ? "unscanned" : "pending",
      discovery_source: options.source,
      github_repo_id: options.githubRepoId ?? null,
    })
    .select("id, slug")
    .single();

  if (error) {
    if (error.code === "23505") {
      const detail = error.message?.toLowerCase() ?? "";
      if (detail.includes("github_repo_id")) {
        throw new InsertBotError(
          "A bot with this GitHub repository already exists.",
          "duplicate_repo",
        );
      }
      throw new InsertBotError(
        "A bot with this name already exists.",
        "duplicate_name",
      );
    }
    throw new InsertBotError(
      `Failed to create bot: ${error.message}`,
      "insert_failed",
    );
  }

  return { id: bot.id, slug: bot.slug };
}
