"use server";

import { z } from "zod";
import {
  ModerationError,
  rescanPlugin,
  webModerationContext,
} from "@/lib/plugins/moderation";
import { pluginScanLimit } from "@/lib/rate-limit";
import { createClient } from "@/utils/supabase/server";
import { ActionError, authActionClient } from "./safe-action";

/**
 * Scan states an owner may re-run themselves. `pending` and `scanning` are
 * already in flight; `safe` has nothing to fix; `permanently_blocked` rows are
 * excluded below regardless of status.
 */
const OWNER_RESCANNABLE = new Set(["flagged", "error", "unscanned"]);

/**
 * Owner-initiated re-scan. Same path as the admin "Rescan" (status reset,
 * queue, audit event with the owner as actor), gated by ownership, the
 * permanent block, and the per-user scan rate limit that already caps
 * create/update scans.
 */
export const rescanOwnPluginAction = authActionClient
  .metadata({ actionName: "rescan-own-plugin" })
  .schema(z.object({ pluginId: z.string().uuid() }))
  .action(async ({ parsedInput: { pluginId }, ctx: { userId } }) => {
    const supabase = await createClient();

    const { data: existing, error: fetchError } = await supabase
      .from("plugins")
      .select("id, owner_id, scan_status, permanently_blocked")
      .eq("id", pluginId)
      .single();

    if (fetchError || !existing) {
      throw new ActionError("Plugin not found.");
    }

    if (existing.owner_id !== userId) {
      throw new ActionError(
        "You do not have permission to update this plugin.",
      );
    }

    if (existing.permanently_blocked) {
      throw new ActionError(
        "This plugin has been blocked and cannot be re-scanned. Contact support if you believe this is a mistake.",
      );
    }

    if (!OWNER_RESCANNABLE.has(existing.scan_status)) {
      throw new ActionError(
        existing.scan_status === "safe"
          ? "This plugin already passed its last scan."
          : "A scan is already in progress.",
      );
    }

    const { success } = await pluginScanLimit(userId);
    if (!success) {
      throw new ActionError(
        "Too many scans in the last hour. Please try again later.",
      );
    }

    try {
      await rescanPlugin(webModerationContext(userId), pluginId);
    } catch (err) {
      throw new ActionError(
        err instanceof ModerationError
          ? err.message
          : "Failed to start the scan.",
      );
    }

    return { success: true };
  });
