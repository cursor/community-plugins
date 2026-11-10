import "server-only";
import {
  PLUGIN_SCAN_QUEUE,
  type PluginScanMessage,
  enqueuePluginScan as sendPluginScan,
} from "@directories/plugins/queue";
import { after } from "next/server";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

export { PLUGIN_SCAN_QUEUE };

export type PluginScanQueueRow = {
  msg_id: number;
  read_ct: number;
  message: PluginScanMessage;
};

export async function enqueuePluginScan(pluginId: string): Promise<void> {
  await sendPluginScan(await createAdminClient(), pluginId);
}

export async function readNextPluginScan(
  vtSeconds: number,
): Promise<PluginScanQueueRow | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    // biome-ignore lint/suspicious/noExplicitAny: pgmq_public is not in the generated types
    .schema("pgmq_public" as any)
    .rpc("read", {
      queue_name: PLUGIN_SCAN_QUEUE,
      sleep_seconds: vtSeconds,
      n: 1,
    });

  if (error) {
    throw new Error(`pgmq_public.read failed: ${error.message}`);
  }

  const rows = (data ?? []) as PluginScanQueueRow[];
  return rows[0] ?? null;
}

export async function archivePluginScan(messageId: number): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase
    // biome-ignore lint/suspicious/noExplicitAny: pgmq_public is not in the generated types
    .schema("pgmq_public" as any)
    .rpc("archive", {
      queue_name: PLUGIN_SCAN_QUEUE,
      message_id: messageId,
    });

  if (error) {
    throw new Error(`pgmq_public.archive failed: ${error.message}`);
  }
}

const DRAIN_PATH = "/api/queue/plugin-scans/drain";

function drainBaseUrl(): string {
  // VERCEL_URL is set on every Vercel deployment (production & preview).
  // Local dev falls back to NEXT_PUBLIC_APP_URL, which the rest of the app
  // already uses for absolute URLs.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Fire a non-blocking GET at the drain route after the response has been
 * flushed to the user. This keeps user-perceived latency on plugin submit /
 * update / rescan flows unchanged from the old Workflow setup — the scan
 * starts within a few hundred ms instead of waiting for the next cron tick.
 *
 * The 1-min Vercel cron remains the safety net: if the kick is dropped (edge
 * node killed, network blip, missing CRON_SECRET in dev), the same message is
 * still in the queue and gets drained on the next tick.
 */
export function kickDrainAfterResponse(): void {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // In dev without CRON_SECRET we silently skip the kick. The drain route
    // would 500 anyway (requireCronAuth fail-closes when CRON_SECRET is unset).
    return;
  }

  after(async () => {
    try {
      await fetch(`${drainBaseUrl()}${DRAIN_PATH}`, {
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
    } catch (err) {
      // Best-effort kick; the cron will retry. Logging keeps us honest about
      // how often the kick path fails so we can spot regressions.
      console.error("[queue] kick drain failed (cron will retry)", err);
    }
  });
}
