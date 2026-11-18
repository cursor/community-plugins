import { enqueuePluginScan } from "@directories/plugins/queue";
import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

// Queues the security scan for apps a bulk import parked (insertPlugin's
// `park`: hidden, unscanned, with an `import:…` source), one a minute and
// only while the queue is nearly empty. cursor.directory scans about one
// plugin a minute and members' submissions share that queue, so a few
// hundred imports queued at once would hold a new submission up for hours.
// Scheduled in vercel.json; guarded like the other crons.

// Queue the next parked app only when at most this many plugins are waiting
// for, or in, a scan.
const MAX_WAITING = 2;

export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  const admin = await createAdminClient();

  const { count, error: countError } = await admin
    .from("plugins")
    .select("id", { count: "exact", head: true })
    .in("scan_status", ["pending", "scanning"]);
  if (countError) throw new Error(`count failed: ${countError.message}`);
  const waiting = count ?? 0;
  if (waiting > MAX_WAITING)
    return NextResponse.json({ queued: null, waiting });

  const { data: next, error: nextError } = await admin
    .from("plugins")
    .select("id, slug")
    .like("discovery_source", "import:%")
    .eq("scan_status", "unscanned")
    .eq("active", false)
    // Never scanned: an import an admin later hid stays as they left it.
    .is("last_scanned_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (nextError) throw new Error(`lookup failed: ${nextError.message}`);
  if (!next) return NextResponse.json({ queued: null, waiting, parked: 0 });

  // Claim it first, so two runs can't queue the same app. If queuing then
  // fails, cursor.directory's recover-stuck-scans cron queues it again.
  const { data: claimed, error: claimError } = await admin
    .from("plugins")
    .update({ scan_status: "pending" })
    .eq("id", next.id)
    .eq("scan_status", "unscanned")
    .select("id");
  if (claimError) throw new Error(`claim failed: ${claimError.message}`);
  if (!claimed?.length) return NextResponse.json({ queued: null, waiting });

  await enqueuePluginScan(admin, next.id);
  return NextResponse.json({ queued: next.slug, waiting });
}
