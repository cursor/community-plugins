"use server";

import {
  approveFlaggedPlugin,
  approvePlugin,
  blockPlugin,
  getPluginModerationState,
  ModerationError,
  rescanPlugin,
  unpublishPlugin,
} from "@directories/plugins/moderation";
import { appModerationContext } from "@/lib/app-moderation";
import { getViewer, isAdmin } from "@/lib/auth";

export type AppModeration = "approve" | "block" | "rescan" | "unpublish";

export type ModerateAppResult =
  | { ok: true }
  | { ok: false; error: "forbidden" | "invalid" | "failed" };

const ACTIONS = new Set<AppModeration>([
  "approve",
  "block",
  "rescan",
  "unpublish",
]);

/**
 * Moderates an app (a cursor.directory plugin) from the Grok Bot Directory's
 * admin. Same operations, rows and audit log as cursor.directory's admin.
 */
export async function moderateApp(input: {
  appId: string;
  action: AppModeration;
  reason?: string;
}): Promise<ModerateAppResult> {
  const viewer = await getViewer();
  if (!viewer || !(await isAdmin(viewer.id)))
    return { ok: false, error: "forbidden" };
  const appId = String(input?.appId ?? "");
  const action = input?.action;
  if (!/^[0-9a-f-]{36}$/i.test(appId) || !ACTIONS.has(action))
    return { ok: false, error: "invalid" };
  const reason =
    String(input?.reason ?? "")
      .trim()
      .slice(0, 500) || undefined;

  const ctx = appModerationContext(viewer.id);
  try {
    if (action === "rescan") await rescanPlugin(ctx, appId);
    else if (action === "block") await blockPlugin(ctx, appId, { reason });
    else if (action === "unpublish")
      await unpublishPlugin(ctx, appId, { reason });
    else {
      // Approving a flagged or blocked plugin also clears its flags and block.
      const state = await getPluginModerationState(ctx, appId);
      if (state.scan_status === "flagged" || state.permanently_blocked)
        await approveFlaggedPlugin(ctx, appId);
      else await approvePlugin(ctx, appId);
    }
  } catch (err) {
    if (err instanceof ModerationError) {
      console.error("[moderate-app]", err.message);
      return { ok: false, error: "failed" };
    }
    throw err;
  }
  return { ok: true };
}
