import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";

// A short shared cache in front of the queries every visitor's page runs
// (the bot list, one bot, one profile, the apps list, one app). The pages
// still render per request; they just stop asking the database for the same
// rows thousands of times a minute.

/**
 * How long a result is reused, in seconds. Off outside production, so local
 * development and the browser tests always read the database.
 */
const SECONDS = Number(
  process.env.GROK_BOT_CACHE_SECONDS ??
    (process.env.NODE_ENV === "production" ? 60 : 0),
);

/** Whether results are being reused at all. */
export const CACHE_ON = SECONDS > 0;

export type ListingKind = "bots" | "apps" | "profiles";
const TAG: Record<ListingKind, string> = {
  bots: "grok-bot-listings",
  apps: "grok-app-listings",
  // Who a profile address belongs to (and that it belongs to nobody).
  profiles: "grok-profiles",
};

/**
 * `load`, with its results kept for a minute per set of arguments. Results
 * come back as plain JSON, so `load` must return only JSON values.
 */
export function cached<Args extends unknown[], Result>(
  name: string,
  kinds: ListingKind[],
  load: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  if (!CACHE_ON) return load;
  return unstable_cache(load, [name], {
    revalidate: SECONDS,
    tags: kinds.map((kind) => TAG[kind]),
  });
}

/**
 * Drops what's cached about bots, apps or profiles, so a listing that was
 * just approved, removed or edited, or a profile whose address just changed,
 * shows (or stops showing) at once.
 */
export function expireListings(kind: ListingKind) {
  try {
    revalidateTag(TAG[kind], { expire: 0 });
  } catch (err) {
    // Outside a request there's no cache to reach; it expires by itself.
    console.error(`[data-cache] couldn't expire ${kind}`, err);
  }
}
