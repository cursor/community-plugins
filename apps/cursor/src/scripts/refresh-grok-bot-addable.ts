// Recomputes plugins.grok_bot_addable for every plugin from what is stored
// (packages/plugins/src/grok-bot-add.ts). Both directories keep it up to date
// as plugins change and a weekly cron repairs it; run this after changing the
// rule or the stored setups (recover:mcp-setups). Safe to re-run.
//
//   bun run refresh:grok-bot-addable [--dry-run]
import { refreshAllGrokBotAddable } from "@directories/plugins/grok-bot-add";
import { createClient } from "@/utils/supabase/admin-client";

const dryRun = process.argv.includes("--dry-run");

refreshAllGrokBotAddable(await createClient(), { dryRun })
  .then((s) => {
    console.log(
      `refresh-grok-bot-addable: ${s.plugins} plugins; of the active ones, Grok Bot can add ${s.addable} and can't add ${s.notAddable}`,
    );
    console.log(
      `  ${s.becameAddable} became addable, ${s.stoppedBeingAddable} stopped being addable${dryRun ? " (dry run, nothing saved)" : "; saved"}`,
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
