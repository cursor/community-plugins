import "server-only";

import { createClient as createAdminClient } from "@/utils/supabase/admin-client";
import { allRowsIn } from "@/utils/supabase/all-rows";
import type { ModerationEvent } from "./bots";

/**
 * Admin views of apps: the cursor.directory plugins Grok Bot can use, in the
 * same moderation states cursor.directory's /admin/plugins shows. Decisions
 * made on either site land in the same rows and `plugin_moderation_events`.
 */

export type AppAdminTab = "queue" | "listed" | "removed";

export type ScanVerdict = {
  verdict: "safe" | "suspicious" | "malicious";
  severity: "low" | "medium" | "high";
  categories: string[];
  reasons: string[];
  summary: string;
};

export type AdminApp = {
  id: string;
  slug: string;
  name: string;
  description: string;
  logo: string | null;
  repository: string | null;
  createdAt: string;
  updatedAt: string;
  active: boolean;
  scanStatus: string;
  scanVerdict: ScanVerdict | null;
  flagSummary: string | null;
  flagSeverity: "low" | "medium" | "high" | null;
  lastScannedAt: string | null;
  permanentlyBlocked: boolean;
  official: boolean;
  submitter: string | null;
  mcpServers: number;
  skills: number;
};

const COLUMNS =
  "id, slug, name, description, logo, repository, created_at, updated_at, active, scan_status, scan_verdict, flag_summary, flag_severity, last_scanned_at, permanently_blocked, marketplace_plugin_id, owner_id, unavailable_in, plugin_components(type)";

type Row = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo: string | null;
  repository: string | null;
  created_at: string;
  updated_at: string;
  active: boolean;
  scan_status: string;
  scan_verdict: ScanVerdict | null;
  flag_summary: string | null;
  flag_severity: "low" | "medium" | "high" | null;
  last_scanned_at: string | null;
  permanently_blocked: boolean;
  marketplace_plugin_id: string | null;
  owner_id: string | null;
  unavailable_in: string[] | null;
  plugin_components: { type: string }[] | null;
};

// A scan that's been pending or running this long is stuck, not in progress
// (the same threshold as cursor.directory's recover-stuck-scans cron).
const STUCK_AFTER_MS = 15 * 60 * 1000;

export const ADMIN_PAGE_SIZE = 25;

/**
 * One page of a tab, in display order, and the tab's total. The tabs
 * (Review queue: flagged, failed or still scanning; Listed: live community
 * apps, since official ones follow the marketplace sync; Removed), the
 * search and the order are `list_grok_bot_admin_apps()` in SQL.
 */
async function fetchPage(
  tab: AppAdminTab,
  query: string,
  page: number,
): Promise<{ rows: Row[]; total: number }> {
  const admin = await createAdminClient();
  const ids = async (offset: number, limit: number) => {
    const { data, error } = await admin.rpc("list_grok_bot_admin_apps", {
      p_tab: tab,
      p_query: query || null,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw error;
    return (data ?? []) as { id: string; total: number }[];
  };
  const order = await ids((page - 1) * ADMIN_PAGE_SIZE, ADMIN_PAGE_SIZE);
  // Past the last page there are no rows to carry the total.
  const total =
    order[0]?.total ?? (page > 1 ? ((await ids(0, 1))[0]?.total ?? 0) : 0);
  if (order.length === 0) return { rows: [], total };

  const { data, error } = await admin
    .from("plugins")
    .select(COLUMNS)
    .in(
      "id",
      order.map((r) => r.id),
    );
  if (error) throw error;
  const byId = new Map(((data ?? []) as Row[]).map((r) => [r.id, r]));
  return {
    rows: order.flatMap((r) => byId.get(r.id) ?? []),
    total,
  };
}

/** Flagged and failed scans first, then stuck ones, then scans in progress. */
export function queueStatus(app: AdminApp): string {
  if (app.scanStatus === "pending" || app.scanStatus === "scanning") {
    const age = Date.now() - new Date(app.updatedAt).getTime();
    if (age > STUCK_AFTER_MS) return "stuck";
  }
  return app.scanStatus;
}

export async function listAppsForAdmin(
  tab: AppAdminTab,
  { query = "", page = 1 }: { query?: string; page?: number } = {},
): Promise<{ apps: AdminApp[]; total: number }> {
  const { rows, total } = await fetchPage(tab, query, page);
  const ownerIds = [
    ...new Set(rows.map((r) => r.owner_id).filter((id): id is string => !!id)),
  ];
  const names = new Map<string, string>();
  if (ownerIds.length > 0) {
    const admin = await createAdminClient();
    const { data } = await admin
      .from("users")
      .select("id, name")
      .in("id", ownerIds);
    for (const u of data ?? []) names.set(u.id, u.name);
  }
  const apps = rows.map(
    (r): AdminApp => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description ?? "",
      logo: r.logo,
      repository: r.repository,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      active: r.active,
      scanStatus: r.scan_status,
      scanVerdict: r.scan_verdict,
      flagSummary: r.flag_summary,
      flagSeverity: r.flag_severity,
      lastScannedAt: r.last_scanned_at,
      permanentlyBlocked: r.permanently_blocked,
      official: !!r.marketplace_plugin_id,
      submitter: r.owner_id ? (names.get(r.owner_id) ?? null) : null,
      mcpServers: (r.plugin_components ?? []).filter(
        (c) => c.type === "mcp_server",
      ).length,
      skills: (r.plugin_components ?? []).filter((c) => c.type === "skill")
        .length,
    }),
  );
  return { apps, total };
}

export async function countAppsForAdmin(): Promise<
  Record<AppAdminTab, number>
> {
  const admin = await createAdminClient();
  const { data, error } = await admin.rpc("count_grok_bot_admin_apps");
  if (error) throw error;
  const counts = (data?.[0] ?? {}) as Partial<Record<AppAdminTab, number>>;
  return {
    queue: Number(counts.queue ?? 0),
    listed: Number(counts.listed ?? 0),
    removed: Number(counts.removed ?? 0),
  };
}

/** Moderation history per app from either site, newest first. */
export async function listAppModerationHistory(
  appIds: string[],
): Promise<Map<string, ModerationEvent[]>> {
  const history = new Map<string, ModerationEvent[]>();
  if (appIds.length === 0) return history;
  const admin = await createAdminClient();
  // A page of apps can have more than a hundred events between them.
  const data = (
    await allRowsIn<{
      id: number;
      created_at: string;
      plugin_id: string;
      action: string;
      source: ModerationEvent["source"];
      actor_id: string | null;
      reason: string | null;
    }>(appIds, (group, from, to) =>
      admin
        .from("plugin_moderation_events")
        .select("id, created_at, plugin_id, action, source, actor_id, reason", {
          count: "exact",
        })
        .in("plugin_id", group)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    )
  ).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  const actorIds = [
    ...new Set(data.map((e) => e.actor_id).filter((id): id is string => !!id)),
  ];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: users } = await admin
      .from("users")
      .select("id, name")
      .in("id", actorIds);
    for (const u of users ?? []) names.set(u.id, u.name);
  }
  for (const e of data) {
    const list = history.get(e.plugin_id) ?? [];
    list.push({
      id: e.id,
      createdAt: e.created_at,
      action: e.action,
      source: e.source,
      actor: e.actor_id ? (names.get(e.actor_id) ?? "An admin") : null,
      reason: e.reason,
    });
    history.set(e.plugin_id, list);
  }
  return history;
}
