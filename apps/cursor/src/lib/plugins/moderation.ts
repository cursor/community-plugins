import "server-only";
import {
  type ModerationContext,
  type PluginModerationState,
  getPluginModerationState as readModerationState,
} from "@directories/plugins/moderation";
import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { kickDrainAfterResponse } from "@/lib/plugins/queue";
import { createClient } from "@/utils/supabase/admin-client";

/**
 * cursor.directory's contexts for the shared moderation operations
 * (`@directories/plugins/moderation`), used by the web admin UI (server
 * actions) and the Community Plugins MCP server. Callers are responsible for
 * checking that the actor is an admin.
 */

export {
  approveFlaggedPlugin,
  approvePlugin,
  blockPlugin,
  deletePlugin,
  dismissVerificationRequest,
  type ModerationAction,
  type ModerationContext,
  ModerationError,
  type ModerationResult,
  type PluginModerationState,
  rescanPlugin,
  setPluginVerified,
  unpublishPlugin,
} from "@directories/plugins/moderation";

export function webModerationContext(actorId: string): ModerationContext {
  return {
    actorId,
    source: "web",
    db: createClient,
    onEnqueued: kickDrainAfterResponse,
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
    db: createClient,
    onEnqueued: kickDrainAfterResponse,
    invalidate: (slug) => {
      revalidatePath("/admin/plugins");
      revalidateTag("plugins", { expire: 0 });
      revalidateTag(`plugin-${slug}`, { expire: 0 });
    },
  };
}

export function getPluginModerationState(
  pluginId: string,
): Promise<PluginModerationState> {
  return readModerationState({ db: createClient }, pluginId);
}
