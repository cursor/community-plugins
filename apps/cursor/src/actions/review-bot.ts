"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/utils/supabase/admin-client";
import { ActionError, adminActionClient } from "./safe-action";

export const approveBotAction = adminActionClient
  .metadata({ actionName: "approve-bot" })
  .schema(z.object({ botId: z.string().uuid() }))
  .action(async ({ parsedInput: { botId } }) => {
    const supabase = await createClient();

    const { error } = await supabase
      .from("bots")
      .update({ active: true })
      .eq("id", botId);

    if (error) {
      throw new ActionError(`Failed to approve bot: ${error.message}`);
    }

    const { data: bot } = await supabase
      .from("bots")
      .select("slug")
      .eq("id", botId)
      .single();

    revalidatePath("/admin/bots");
    updateTag("bots");

    if (bot?.slug) {
      updateTag(`bot-${bot.slug}`);
    }

    return { success: true };
  });

export const declineBotAction = adminActionClient
  .metadata({ actionName: "decline-bot" })
  .schema(z.object({ botId: z.string().uuid() }))
  .action(async ({ parsedInput: { botId } }) => {
    const supabase = await createClient();

    const { error } = await supabase.from("bots").delete().eq("id", botId);

    if (error) {
      throw new ActionError(`Failed to decline bot: ${error.message}`);
    }

    revalidatePath("/admin/bots");
    updateTag("bots");

    return { success: true };
  });
