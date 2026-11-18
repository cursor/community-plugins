// Seeds or refreshes the directory from the official x.ai/bot marketplace
// (src/lib/marketplace-import.ts). Run it once for a new database, and again
// whenever you want new marketplace bots or refreshed cards.
//
//   bun run seed:marketplace            (from apps/grok-bot, reads .env)
import { importMarketplace } from "@/lib/marketplace-import";

importMarketplace()
  .then((r) =>
    console.log(
      `marketplace: ${r.listings} listings, ${r.community} community → ${r.imported} imported, ${r.refreshed} refreshed`,
    ),
  )
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
