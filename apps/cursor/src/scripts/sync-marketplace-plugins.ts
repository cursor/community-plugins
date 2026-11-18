/**
 * Imports the Cursor plugin marketplace into `plugins` by hand; the daily
 * cron (/api/cron/sync-marketplace-plugins) does the same.
 *
 * Usage (from apps/cursor):
 *   bun run seed:marketplace-plugins
 */

import { syncMarketplacePlugins } from "@directories/plugins/marketplace";
import { createClient } from "@/utils/supabase/admin-client";

const summary = await syncMarketplacePlugins(await createClient(), (line) =>
  console.log(line),
);
console.log(summary);
process.exit(summary.failed === 0 ? 0 : 1);
