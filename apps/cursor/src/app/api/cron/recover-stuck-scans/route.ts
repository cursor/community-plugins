import { type NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { enqueuePluginScan } from "@/lib/plugins/queue";
import { createClient } from "@/utils/supabase/admin-client";

export const maxDuration = 60;

// Retry plugins that have been sitting in pending/scanning longer than this.
// 15 min matches the threshold in getStuckScans() so the admin "Stuck" tab
// and this cron see the same set of rows.
const STALE_AFTER_MS = 15 * 60 * 1000;

// Hard cap per cron tick. Each enqueuePluginScan() is cheap (just a pgmq.send)
// but we don't want to flood the queue if a backlog builds up.
const MAX_RETRIES_PER_RUN = 25;

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const supabase = await createClient();
    const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();

    const { data: stuck, error } = await supabase
      .from("plugins")
      .select("id, slug, scan_status")
      .in("scan_status", ["pending", "scanning"])
      .lt("updated_at", cutoff)
      .order("updated_at", { ascending: true })
      .limit(MAX_RETRIES_PER_RUN);

    if (error) {
      throw new Error(`Failed to query stuck plugins: ${error.message}`);
    }

    const results: Array<{
      id: string;
      slug: string;
      ok: boolean;
      action: "reset" | "enqueued";
      error?: string;
    }> = [];

    for (const plugin of stuck ?? []) {
      // A row still at `scanning` after the threshold was left by a worker
      // that died mid-run. Its queue message was never archived (the drain
      // archives only after runPluginScan has written a terminal status), so
      // it comes back on its own once the visibility timeout expires, and
      // the minute drain picks it up. Enqueueing here as well would put a
      // second message for the same plugin in the queue: two agent runs
      // racing to write the verdict. So only reset the status, which makes
      // the worker's loadPlugin → markScanning transition idempotent (the
      // prevActive snapshot is recomputed). If the message really is gone
      // (a row from before the queue existed), the next tick sees this row
      // as stale `pending` and enqueues it then.
      if (plugin.scan_status === "scanning") {
        const { error: resetError } = await supabase
          .from("plugins")
          .update({ scan_status: "pending" })
          .eq("id", plugin.id);
        results.push({
          id: plugin.id,
          slug: plugin.slug,
          ok: !resetError,
          action: "reset",
          ...(resetError ? { error: resetError.message } : {}),
        });
        continue;
      }

      try {
        await enqueuePluginScan(plugin.id);
        results.push({
          id: plugin.id,
          slug: plugin.slug,
          ok: true,
          action: "enqueued",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `recover-stuck-scans: failed to enqueue ${plugin.slug}`,
          message,
        );
        results.push({
          id: plugin.id,
          slug: plugin.slug,
          ok: false,
          action: "enqueued",
          error: message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      considered: stuck?.length ?? 0,
      retried: results.filter((r) => r.ok && r.action === "enqueued").length,
      reset: results.filter((r) => r.ok && r.action === "reset").length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("recover-stuck-scans failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
