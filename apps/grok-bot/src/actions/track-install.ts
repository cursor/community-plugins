"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { installGlobalLimit, installPerBotLimit } from "@/lib/rate-limit";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

const Input = z.object({ botId: z.string().uuid(), slug: z.string().max(120) });

/**
 * Counts an "Add to Grok Bot" click, like cursor.directory counts plugin
 * installs: rate limited per IP, incremented atomically by the service role.
 */
export async function trackInstall(input: {
  botId: string;
  slug: string;
}): Promise<{ tracked: boolean }> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { tracked: false };
  const { botId, slug } = parsed.data;
  const [global, perBot] = await Promise.all([
    installGlobalLimit(),
    installPerBotLimit(botId),
  ]);
  if (!global.success || !perBot.success) return { tracked: false };

  const admin = await createAdminClient();
  await admin.rpc("increment_grok_bot_install_count", { bot_id_input: botId });
  revalidatePath("/");
  revalidatePath(`/bots/${slug}`);
  return { tracked: true };
}
