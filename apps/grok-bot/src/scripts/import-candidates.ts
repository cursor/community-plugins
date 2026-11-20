// Adds candidate apps in bulk, each the way a member's submission would be:
// a GitHub repository is parsed and must pass the "Grok Bot can add it" rule;
// a server address is connected to as an MCP client. Nothing is listed until
// cursor.directory's security scan passes it.
//
//   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY=… GITHUB_TOKEN=… \
//     bun run --conditions=react-server src/scripts/import-candidates.ts \
//     <candidates.json> <log.jsonl> --park [--limit N]
//
// <candidates.json> is a list of { kind: "repo" | "server", key, name,
// description, logo, homepage, cursor, sharedName } (see Candidate below),
// plus optional publisher, rename, slug and allowSameName for ones a person
// decided on.
//
// The scan queue handles about one plugin a minute and members' submissions
// share it, so imports must not be queued all at once:
//   --park      adds every candidate hidden and unqueued; the site's
//               feed-parked-scans cron then queues them one at a time. Use
//               this: the script finishes in minutes.
//   (default)   queues each one itself, and adds the next only when at most
//               `--waiting` plugins (default 2) are waiting for a scan. This
//               takes as long as the scans do.
// It can be stopped and started again; the log says what is already done.
//
// A large import needn't run on anyone's machine: load the candidates into
// the `app_import_candidates` table and the site's import-apps job works
// through them (see scripts/load-import-candidates.ts).
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  addBuilt,
  buildCandidate,
  type Candidate,
  type Outcome,
  RETRY,
} from "@/lib/app-import";

const POLL_MS = 30_000;
const GIVE_UP_WAITING_MS = 45 * 60_000;

const args = process.argv.slice(2);
const [input, logFile] = args;
const flag = (name: string, fallback: number) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : Number(args[at + 1]);
};
const park = args.includes("--park");
const limit = flag("--limit", Number.POSITIVE_INFINITY);
const maxWaiting = flag("--waiting", 2);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!input || !logFile || !url || !secret) {
  console.error("needs <candidates.json> <log.jsonl> and the Supabase env");
  process.exit(1);
}
const supabase = createClient(url, secret, { auth: { persistSession: false } });

const candidates = JSON.parse(readFileSync(input, "utf8")) as Candidate[];
const settled = new Set<string>();
if (existsSync(logFile)) {
  for (const line of readFileSync(logFile, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as { key: string; outcome: Outcome };
    if (RETRY.includes(entry.outcome)) settled.delete(entry.key);
    else settled.add(entry.key);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);

function record(
  c: Candidate,
  outcome: Outcome,
  detail: Record<string, unknown> = {},
) {
  appendFileSync(
    logFile,
    `${JSON.stringify({ at: new Date().toISOString(), key: c.key, kind: c.kind, outcome, ...detail })}\n`,
  );
  console.log(
    `${stamp()} ${outcome.padEnd(20)} ${c.key}${detail.slug ? ` -> ${detail.slug}` : ""}`,
  );
}

/** Plugins waiting for, or in, a security scan. */
async function waiting(): Promise<number> {
  const { count, error } = await supabase
    .from("plugins")
    .select("id", { count: "exact", head: true })
    .in("scan_status", ["pending", "scanning"]);
  if (error) throw new Error(`count failed: ${error.message}`);
  return count ?? 0;
}

async function waitForRoom() {
  const started = Date.now();
  for (;;) {
    const n = await waiting();
    if (n <= maxWaiting) return;
    if (Date.now() - started > GIVE_UP_WAITING_MS) {
      throw new Error(
        `${n} plugins have been waiting for a scan for 45 minutes; the scan queue isn't draining. Stopped.`,
      );
    }
    await sleep(POLL_MS);
  }
}

let added = 0;
let failures = 0;
for (const c of candidates) {
  if (added >= limit) break;
  if (settled.has(c.key)) continue;
  try {
    const built = await buildCandidate(supabase, c, 120_000);
    if ("outcome" in built) {
      record(c, built.outcome, built.detail);
      continue;
    }
    if (!park) await waitForRoom();
    const result = await addBuilt(supabase, c, built, park);
    record(c, result.outcome, result.detail);
    if (result.outcome === "added") {
      added++;
      failures = 0;
    }
  } catch (err) {
    record(c, "error", { message: String(err).slice(0, 300) });
    if (++failures >= 5 || String(err).includes("Stopped.")) {
      console.error("stopping:", String(err));
      process.exit(1);
    }
  }
}
console.log(`${stamp()} finished this run: ${added} added`);
