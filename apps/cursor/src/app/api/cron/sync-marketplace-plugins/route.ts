import { syncMarketplacePlugins } from "@directories/plugins/marketplace";
import { revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { createClient } from "@/utils/supabase/admin-client";

// The first run inserts every marketplace plugin (about 500); later runs only
// touch the ones that changed.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const summary = await syncMarketplacePlugins(await createClient(), (line) =>
      console.log(`[sync-marketplace-plugins] ${line}`),
    );
    if (
      summary.inserted +
      summary.updated +
      summary.linked +
      summary.deactivated
    ) {
      revalidateTag("plugins", "max");
    }
    return NextResponse.json({ ok: summary.failed === 0, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("sync-marketplace-plugins failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
