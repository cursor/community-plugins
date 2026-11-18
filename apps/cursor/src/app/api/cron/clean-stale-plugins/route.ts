import { cleanStalePlugins } from "@directories/plugins/stale";
import { revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { createClient } from "@/utils/supabase/admin-client";

// Weekly: unpublishes community plugins whose GitHub repository has gone
// away (the rule is in packages/plugins/src/stale.ts). Each one is recorded
// as a moderation event, so an admin can find and restore it. Needs
// GITHUB_TOKEN (any token; it only reads public repositories); without it
// the run does nothing.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("[clean-stale-plugins] GITHUB_TOKEN is not set; skipped.");
    return NextResponse.json({ ok: false, skipped: "GITHUB_TOKEN is not set" });
  }

  try {
    const summary = await cleanStalePlugins(await createClient(), {
      token,
      log: (line) => console.log(`[clean-stale-plugins] ${line}`),
    });
    if (summary.unpublished.length > 0 && !summary.stopped) {
      revalidateTag("plugins", "max");
      for (const slug of summary.unpublished)
        revalidateTag(`plugin-${slug}`, "max");
    }
    return NextResponse.json({ ok: !summary.stopped, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("clean-stale-plugins failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
