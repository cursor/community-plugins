import type { SupabaseClient } from "@supabase/supabase-js";

export const PLUGIN_SCAN_QUEUE = "plugin_scans";

export type PluginScanMessage = { plugin_id: string };

/**
 * Queue a plugin's security scan. cursor.directory's drain route
 * (`/api/queue/plugin-scans/drain`, every minute) runs it, whichever site
 * queued it. Needs a service-role client.
 */
export async function enqueuePluginScan(
  supabase: SupabaseClient,
  pluginId: string,
): Promise<void> {
  const { error } = await supabase
    // biome-ignore lint/suspicious/noExplicitAny: pgmq_public is not in the generated types
    .schema("pgmq_public" as any)
    .rpc("send", {
      queue_name: PLUGIN_SCAN_QUEUE,
      message: { plugin_id: pluginId } satisfies PluginScanMessage,
      sleep_seconds: 0,
    });

  if (error) {
    throw new Error(`pgmq_public.send failed: ${error.message}`);
  }
}
