// Unpublishes community plugins whose GitHub repository has gone away
// (packages/plugins/src/stale.ts). The weekly cron does the same; this is
// for looking first, or for a run larger than the cron allows.
//
//   GITHUB_TOKEN=... bun run clean:stale-plugins [--dry-run] [--max N]
import { cleanStalePlugins } from "@directories/plugins/stale";
import { createClient } from "@/utils/supabase/admin-client";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const maxArg = args.indexOf("--max");
const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN is required (any token; public data only).");
  process.exit(1);
}

cleanStalePlugins(await createClient(), {
  token,
  dryRun,
  ...(maxArg >= 0 ? { maxUnpublish: Number(args[maxArg + 1]) } : {}),
  log: (line) => console.log(`  ${line}`),
})
  .then((s) => {
    console.log(
      `clean-stale-plugins: ${s.stopped ? `stopped (${s.stopped})` : `${s.unpublished.length} ${dryRun ? "would be unpublished (dry run)" : "unpublished"}`}`,
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
