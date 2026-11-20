import { NextResponse } from "next/server";
import {
  type Candidate,
  importCandidate,
  type Outcome,
  RETRY,
} from "@/lib/app-import";
import { requireCronAuth } from "@/lib/cron-auth";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

// Works through `app_import_candidates`: checks each candidate app and adds
// the ones that pass, hidden and unqueued, for feed-parked-scans to send to
// the security scan one at a time. A bulk import is loaded into the table
// (scripts/load-import-candidates.ts) and runs here, not on someone's
// machine. Scheduled in vercel.json; guarded like the other crons.
export const maxDuration = 300;

// No candidate is started after this long. One takes a few seconds, or up to
// about half a minute when a server is slow to answer.
const BUDGET_MS = 40_000;
// The scan handles about one app a minute, so there's no use adding them
// faster: stop while this many are already parked.
const MAX_PARKED = 20;
// A server that didn't answer, or GitHub turning us away, is tried again
// later, this many times in all.
const MAX_ATTEMPTS = 4;
const RETRY_AFTER_MS = 20 * 60_000;
// GitHub allows few requests without a token; don't wait out its limit here.
const GITHUB_WAIT_MS = 5_000;

type Row = {
  id: number;
  kind: "repo" | "server";
  key: string;
  name: string;
  description: string;
  logo: string;
  homepage: string;
  cursor: boolean;
  shared_name: boolean;
  publisher: string | null;
  rename: string | null;
  slug: string | null;
  allow_same_name: boolean;
  attempts: number;
};

const toCandidate = (row: Row): Candidate => ({
  kind: row.kind,
  key: row.key,
  name: row.name,
  description: row.description,
  logo: row.logo,
  homepage: row.homepage,
  cursor: row.cursor,
  sharedName: row.shared_name,
  ...(row.publisher ? { publisher: row.publisher } : {}),
  ...(row.rename ? { rename: row.rename } : {}),
  ...(row.slug ? { slug: row.slug } : {}),
  ...(row.allow_same_name ? { allowSameName: true } : {}),
});

export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  const admin = await createAdminClient();
  const started = Date.now();
  const outcomes: Partial<Record<Outcome | "retry_later", number>> = {};

  while (Date.now() - started < BUDGET_MS) {
    // The same rows feed-parked-scans takes from.
    const { count: parked, error: parkedError } = await admin
      .from("plugins")
      .select("id", { count: "exact", head: true })
      .like("discovery_source", "import:%")
      .eq("scan_status", "unscanned")
      .eq("active", false)
      .is("last_scanned_at", null);
    if (parkedError) throw new Error(`count failed: ${parkedError.message}`);
    if ((parked ?? 0) >= MAX_PARKED)
      return NextResponse.json({ ...outcomes, parked, waiting: true });

    const retryBefore = new Date(Date.now() - RETRY_AFTER_MS).toISOString();
    const { data: next, error: nextError } = await admin
      .from("app_import_candidates")
      .select(
        "id, kind, key, name, description, logo, homepage, cursor, shared_name, publisher, rename, slug, allow_same_name, attempts",
      )
      .is("outcome", null)
      .or(`attempted_at.is.null,attempted_at.lt.${retryBefore}`)
      .order("priority", { ascending: false })
      .order("id")
      .limit(1)
      .maybeSingle();
    if (nextError) throw new Error(`lookup failed: ${nextError.message}`);
    if (!next) break;
    const row = next as Row;

    // Claim it, so two runs can't work on the same candidate.
    const attempts = row.attempts + 1;
    const { data: claimed, error: claimError } = await admin
      .from("app_import_candidates")
      .update({ attempts, attempted_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("attempts", row.attempts)
      .is("outcome", null)
      .select("id");
    if (claimError) throw new Error(`claim failed: ${claimError.message}`);
    if (!claimed?.length) continue;

    const result = await importCandidate(
      admin,
      toCandidate(row),
      GITHUB_WAIT_MS,
    );
    const settled = !RETRY.includes(result.outcome) || attempts >= MAX_ATTEMPTS;
    const { error: saveError } = await admin
      .from("app_import_candidates")
      .update(
        settled
          ? {
              outcome: result.outcome,
              detail: result.detail ?? null,
              settled_at: new Date().toISOString(),
            }
          : { detail: { ...result.detail, last: result.outcome } },
      )
      .eq("id", row.id);
    if (saveError) throw new Error(`save failed: ${saveError.message}`);
    const counted = settled ? result.outcome : "retry_later";
    outcomes[counted] = (outcomes[counted] ?? 0) + 1;
  }
  return NextResponse.json(outcomes);
}
