import { NextResponse } from "next/server";

/**
 * Guards a cron route with `Authorization: Bearer ${CRON_SECRET}` (Vercel
 * sends it). Fail-closed: without CRON_SECRET nothing runs. Mirrors
 * apps/cursor/src/lib/cron-auth.ts. Returns a response to send, or null.
 */
export function requireCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set; refusing to run.");
    return NextResponse.json(
      { error: "Cron is not configured" },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
