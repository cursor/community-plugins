import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import {
  botsToRefresh,
  type RefreshOutcome,
  refreshBot,
} from "@/lib/refresh-bot";

// Keeps listings in step with their bots' cards on x.ai: each run compares
// the listed bots it hasn't looked at for longest (see lib/refresh-bot.ts).
// Scheduled in vercel.json; guarded like the other crons.
export const maxDuration = 300;

// One request to x.ai per bot. At this size and schedule every listing is
// looked at a few times a day.
const BATCH = 50;
// x.ai limits how often cards can be read, and submitting a bot reads one
// too. A run that keeps being turned away stops and leaves the rest for the
// next run, rather than using up what submissions need.
const GIVE_UP_AFTER = 3;
// A changed card is reviewed, which can take two minutes: no bot is started
// after this long, so a run ends inside maxDuration.
const START_WITHIN_MS = 150_000;

export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  const ids = await botsToRefresh(BATCH);
  const outcomes: Record<RefreshOutcome, number> = {
    unchanged: 0,
    updated: 0,
    held: 0,
    unshared: 0,
    unavailable: 0,
    not_listed: 0,
  };
  // One at a time keeps the load on x.ai and the reviewer predictable.
  let checked = 0;
  let turnedAway = 0;
  const started = Date.now();
  for (const id of ids) {
    if (Date.now() - started > START_WITHIN_MS) break;
    let outcome: RefreshOutcome;
    try {
      outcome = await refreshBot(id, null);
    } catch (err) {
      console.error(`[refresh-bots] ${id} failed:`, err);
      outcome = "unavailable";
    }
    checked++;
    outcomes[outcome]++;
    turnedAway = outcome === "unavailable" ? turnedAway + 1 : 0;
    if (turnedAway >= GIVE_UP_AFTER) break;
  }
  return NextResponse.json({ checked, ...outcomes });
}
