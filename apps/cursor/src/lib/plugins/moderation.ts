import "server-only";
import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { enqueuePluginScan, kickDrainAfterResponse } from "@/lib/plugins/queue";
import type { FlagSeverity, ScanStatus } from "@/lib/plugins/types";
import { createClient } from "@/utils/supabase/admin-client";

/**
 * Admin moderation operations shared by the web admin UI (server actions) and
 * the Community Plugins MCP server. Callers are responsible for checking that
 * the actor is an admin; every operation here writes with the secret-key
 * client and records an entry in `plugin_moderation_events`.
 */

export class ModerationError extends Error {}

export type ModerationAction =
  | "approve"
  | "unpublish"
  | "approve_flagged"
  | "block"
  | "rescan"
  | "verify"
  | "unverify"
  | "dismiss_verification_request"
  | "delete";

export type ModerationContext = {
  actorId: string;
  source: "web" | "mcp";
  clientId?: string;
  /** Refreshes cached reads that show the plugin. */
  invalidate: (slug: string) => void;
};

export type PluginModerationState = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  scan_status: ScanStatus;
  permanently_blocked: boolean;
  verified: boolean;
  verification_requested_at: string | null;
  flag_severity: FlagSeverity | null;
  updated_at: string;
};

export type ModerationResult = {
  before: PluginModerationState;
  after: PluginModerationState | null;
};

const STATE_COLUMNS =
  "id, slug, name, active, scan_status, permanently_blocked, verified, verification_requested_at, flag_severity, updated_at";

export function webModerationContext(actorId: string): ModerationContext {
  return {
    actorId,
    source: "web",
    invalidate: (slug) => {
      revalidatePath("/admin/plugins");
      updateTag("plugins");
      updateTag(`plugin-${slug}`);
    },
  };
}

// `updateTag` only works inside server actions; route handlers expire the
// tags immediately instead.
export function mcpModerationContext({
  actorId,
  clientId,
}: {
  actorId: string;
  clientId: string;
}): ModerationContext {
  return {
    actorId,
    source: "mcp",
    clientId,
    invalidate: (slug) => {
      revalidatePath("/admin/plugins");
      revalidateTag("plugins", { expire: 0 });
      revalidateTag(`plugin-${slug}`, { expire: 0 });
    },
  };
}

export async function getPluginModerationState(
  pluginId: string,
): Promise<PluginModerationState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plugins")
    .select(STATE_COLUMNS)
    .eq("id", pluginId)
    .maybeSingle();

  if (error) {
    throw new ModerationError(`Failed to load plugin: ${error.message}`);
  }
  if (!data) {
    throw new ModerationError("Plugin not found.");
  }
  return data as PluginModerationState;
}

async function recordEvent(
  ctx: ModerationContext,
  action: ModerationAction,
  before: PluginModerationState,
  after: PluginModerationState | null,
  reason?: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("plugin_moderation_events").insert({
    plugin_id: before.id,
    plugin_slug: before.slug,
    action,
    actor_id: ctx.actorId,
    source: ctx.source,
    client_id: ctx.clientId ?? null,
    reason: reason ?? null,
    before,
    after,
  });

  // The plugin change has already been applied, so a failed audit write is
  // surfaced in logs rather than reported as a failed moderation action.
  if (error) {
    console.error("[moderation] failed to record event", {
      action,
      pluginId: before.id,
      error: error.message,
    });
  }
}

async function updatePlugin(
  ctx: ModerationContext,
  action: ModerationAction,
  pluginId: string,
  changes: Record<string, unknown>,
  reason?: string,
): Promise<ModerationResult> {
  const before = await getPluginModerationState(pluginId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("plugins")
    .update(changes)
    .eq("id", pluginId)
    .select(STATE_COLUMNS)
    .single();

  if (error || !data) {
    throw new ModerationError(
      `Failed to update plugin: ${error?.message ?? "not found"}`,
    );
  }

  const after = data as PluginModerationState;
  ctx.invalidate(after.slug);
  await recordEvent(ctx, action, before, after, reason);
  return { before, after };
}

export function approvePlugin(ctx: ModerationContext, pluginId: string) {
  return updatePlugin(ctx, "approve", pluginId, { active: true });
}

/**
 * Hides the plugin without blocking it, so the owner (or an admin) can
 * re-publish. Use `blockPlugin` when the plugin should stay down.
 */
export function unpublishPlugin(ctx: ModerationContext, pluginId: string) {
  return updatePlugin(ctx, "unpublish", pluginId, { active: false });
}

export function approveFlaggedPlugin(ctx: ModerationContext, pluginId: string) {
  return updatePlugin(ctx, "approve_flagged", pluginId, {
    active: true,
    scan_status: "safe",
    flag_summary: null,
    flag_reasons: [],
    flag_severity: null,
    flagged_at: null,
    permanently_blocked: false,
  });
}

export function blockPlugin(
  ctx: ModerationContext,
  pluginId: string,
  { reason }: { reason?: string } = {},
) {
  return updatePlugin(
    ctx,
    "block",
    pluginId,
    { active: false, scan_status: "flagged", permanently_blocked: true },
    reason,
  );
}

/**
 * A pending/scanning row younger than this still has a live queue message or
 * a running worker behind it. Matches the stuck-scan threshold shared by
 * getStuckScans() and the recover-stuck-scans cron: an older row is treated
 * as stuck and may be re-scanned.
 */
export const SCAN_IN_PROGRESS_MS = 15 * 60 * 1000;

export function isScanInProgress(
  state: Pick<PluginModerationState, "scan_status" | "updated_at">,
  now = Date.now(),
): boolean {
  if (state.scan_status !== "pending" && state.scan_status !== "scanning") {
    return false;
  }
  return now - new Date(state.updated_at).getTime() < SCAN_IN_PROGRESS_MS;
}

export async function rescanPlugin(ctx: ModerationContext, pluginId: string) {
  // Every re-scan entry point (admin UI buttons, MCP tool) lands here, so the
  // in-progress check lives here too. Without it a second click while the
  // first scan is queued or running enqueues a second message for the same
  // plugin: two billable agent runs whose verdicts race each other.
  const state = await getPluginModerationState(pluginId);
  if (isScanInProgress(state)) {
    throw new ModerationError(
      `A scan for "${state.slug}" is already ${state.scan_status}. Check again in a few minutes.`,
    );
  }

  // The status reset must reach cached readers (detail banner, leaderboard)
  // before enqueueing, so a queue failure can't leave cached views showing a
  // stale status while the row is already pending. The drain route only
  // invalidates again once the scan ends.
  const result = await updatePlugin(ctx, "rescan", pluginId, {
    scan_status: "pending",
  });

  try {
    await enqueuePluginScan(pluginId);
    kickDrainAfterResponse();
  } catch (err) {
    throw new ModerationError(
      `Failed to enqueue scan: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return result;
}

export function setPluginVerified(
  ctx: ModerationContext,
  pluginId: string,
  verified: boolean,
) {
  return updatePlugin(ctx, verified ? "verify" : "unverify", pluginId, {
    verified,
    verified_at: verified ? new Date().toISOString() : null,
    verified_by: verified ? ctx.actorId : null,
    // Approving or unverifying always clears any open request.
    verification_requested_at: null,
  });
}

export function dismissVerificationRequest(
  ctx: ModerationContext,
  pluginId: string,
) {
  return updatePlugin(ctx, "dismiss_verification_request", pluginId, {
    verification_requested_at: null,
  });
}

export async function deletePlugin(
  ctx: ModerationContext,
  pluginId: string,
): Promise<ModerationResult> {
  const before = await getPluginModerationState(pluginId);
  const supabase = await createClient();

  const { error } = await supabase.from("plugins").delete().eq("id", pluginId);
  if (error) {
    throw new ModerationError(`Failed to delete plugin: ${error.message}`);
  }

  ctx.invalidate(before.slug);
  await recordEvent(ctx, "delete", before, null);
  return { before, after: null };
}
