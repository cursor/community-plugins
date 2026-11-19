"use server";

import { z } from "zod";
import { installGlobalLimit, installPerBotLimit } from "@/lib/rate-limit";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

const Input = z.object({ slug: z.string().min(1).max(200) });

/**
 * Counts an "Add to Grok Bot" click on an app as an install of the plugin,
 * in the counter cursor.directory keeps (`increment_install_count`): one
 * number for the plugin, wherever it was added. Rate limited per IP, like
 * trackInstall for bots. The list shows it within a few minutes.
 */
export async function trackAppAdd(input: {
  slug: string;
}): Promise<{ tracked: boolean }> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { tracked: false };
  const { slug } = parsed.data;
  const [global, perApp] = await Promise.all([
    installGlobalLimit(),
    installPerBotLimit(`app:${slug}`),
  ]);
  if (!global.success || !perApp.success) return { tracked: false };

  const admin = await createAdminClient();
  // Only an app the directory lists; list rows know the slug, not the id.
  const { data: app } = await admin
    .from("plugins")
    .select("id")
    .eq("slug", slug)
    .eq("active", true)
    .eq("grok_bot_addable", true)
    .not("unavailable_in", "cs", "{grok_bot}")
    .maybeSingle();
  if (!app) return { tracked: false };
  await admin.rpc("increment_install_count", { plugin_id_input: app.id });
  return { tracked: true };
}
