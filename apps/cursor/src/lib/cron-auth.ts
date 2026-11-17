import { NextResponse } from "next/server";

/**
 * Guard a cron route by requiring `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Fail-closed: if `CRON_SECRET` is missing/empty in the environment we return
 * 500 instead of letting the route run unauthenticated. The previous
 * `if (cronSecret) { ... }` pattern silently disarmed the check whenever the
 * env var was unset, which is unsafe for routes that trigger billable work
 * (plugin security scans, Airtable syncs).
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

  const header = request.headers.get("authorization");
  if (header !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
