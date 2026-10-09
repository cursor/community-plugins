import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Guard a cron route by requiring `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Fail-closed: if `CRON_SECRET` is missing/empty in the environment we return
 * 500 instead of letting the route run unauthenticated. The previous
 * `if (cronSecret) { ... }` pattern silently disarmed the check whenever the
 * env var was unset, which is unsafe for routes that trigger billable work
 * (Cursor SDK runs, Airtable syncs).
 *
 * Returns a `NextResponse` to short-circuit the handler, or `null` when the
 * request is authorized.
 */
export function requireCronAuth(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error(
      "[cron-auth] CRON_SECRET is not set; refusing to run cron route.",
    );
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const received = Buffer.from(header);
  // Constant-time compare so the response time does not leak how much of
  // the secret matched. Lengths must match first or timingSafeEqual throws.
  const authorized =
    received.length === expected.length && timingSafeEqual(received, expected);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
