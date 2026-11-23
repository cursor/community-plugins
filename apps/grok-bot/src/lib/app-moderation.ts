import "server-only";

import type { ModerationContext } from "@directories/plugins/moderation";
import { revalidatePath } from "next/cache";
import { expireListings } from "@/lib/data-cache";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";

/**
 * cursor.directory caches plugin pages; it refreshes them when told about a
 * change made here. Best effort: a failure is logged, never a failed decision.
 */
async function refreshCursorDirectory(slug: string) {
  const base = process.env.CURSOR_DIRECTORY_URL;
  const secret = process.env.PLUGIN_REVALIDATE_SECRET;
  if (!base || !secret) {
    console.warn(
      "[app-moderation] CURSOR_DIRECTORY_URL or PLUGIN_REVALIDATE_SECRET is not set; cursor.directory keeps its cached pages until they expire.",
    );
    return;
  }
  try {
    const res = await fetch(`${base}/api/plugins/revalidate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ slug }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok)
      console.error(
        `[app-moderation] cursor.directory revalidate answered ${res.status}`,
      );
  } catch (err) {
    console.error("[app-moderation] cursor.directory revalidate failed", err);
  }
}

/**
 * An app was changed: drops what's cached about apps here and tells
 * cursor.directory, which lists the same plugin.
 */
export async function appChanged(slug: string) {
  expireListings("apps");
  revalidatePath("/admin");
  revalidatePath("/my-bots");
  revalidatePath("/");
  revalidatePath(`/apps/${slug}`);
  await refreshCursorDirectory(slug);
}

/** The Grok Bot Directory's context for the shared moderation operations. */
export function appModerationContext(actorId: string): ModerationContext {
  return {
    actorId,
    source: "web",
    db: createAdminClient,
    invalidate: appChanged,
  };
}
