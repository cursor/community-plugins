import { NextResponse } from "next/server";
import {
  type ReviewOutcome,
  reviewableBotIds,
  reviewBot,
} from "@/lib/ai-review";
import { requireCronAuth } from "@/lib/cron-auth";

// Picks up AI reviews that didn't finish after submission: queued, failed
// (up to 3 attempts) or stuck. Scheduled in vercel.json; guarded like the
// cursor.directory crons (Authorization: Bearer $CRON_SECRET, fail-closed).
export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  const ids = await reviewableBotIds(10);
  const outcomes: Record<ReviewOutcome, number> = {
    listed: 0,
    flagged: 0,
    error: 0,
    skipped: 0,
  };
  // One at a time keeps SpaceXSI usage and database writes predictable.
  for (const id of ids) outcomes[await reviewBot(id)]++;
  return NextResponse.json({ reviewed: ids.length, ...outcomes });
}
