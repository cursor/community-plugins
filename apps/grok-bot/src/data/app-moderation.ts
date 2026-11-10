import "server-only";

import { worksInGrokBot } from "@directories/plugins/apps";
import { createClient as createAdminClient } from "@/utils/supabase/admin-client";
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

async function fetchRows(tab: AppAdminTab): Promise<Row[]> {
  const admin = await createAdminClient();
  let query = admin.from("plugins").select(COLUMNS);
  if (tab === "queue") {
    // Waiting on a person or a scan: flagged, failed, or still scanning.
    query = query
      .eq("active", false)
      .eq("permanently_blocked", false)
      .in("scan_status", ["flagged", "error", "pending", "scanning"]);
  } else if (tab === "listed") {
    // Official apps follow the marketplace sync; community ones are ours.
    query = query.eq("active", true).is("marketplace_plugin_id", null);
  } else {
    query = query
      .eq("active", false)
      .or("permanently_blocked.eq.true,scan_status.in.(safe,unscanned)");
  }
  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as Row[]).filter(
    (r) =>
      !(r.unavailable_in ?? []).includes("grok_bot") &&
      worksInGrokBot((r.plugin_components ?? []).map((c) => c.type)),
  );
}

const QUEUE_RANK: Record<string, number> = {
  flagged: 0,
  error: 1,
  stuck: 2,
  scanning: 3,
  pending: 4,
};
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/** Flagged and failed scans first, then stuck ones, then scans in progress. */
export function queueStatus(app: AdminApp): string {
  if (app.scanStatus === "pending" || app.scanStatus === "scanning") {
    const age = Date.now() - new Date(app.updatedAt).getTime();
    if (age > STUCK_AFTER_MS) return "stuck";
  }
  return app.scanStatus;
}

export async function listAppsForAdmin(tab: AppAdminTab): Promise<AdminApp[]> {
  const rows = await fetchRows(tab);
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
  if (tab !== "queue") return apps;
  return apps.sort(
    (a, b) =>
      (QUEUE_RANK[queueStatus(a)] ?? 9) - (QUEUE_RANK[queueStatus(b)] ?? 9) ||
      (a.flagSeverity ? SEVERITY_RANK[a.flagSeverity] : 3) -
        (b.flagSeverity ? SEVERITY_RANK[b.flagSeverity] : 3),
  );
}

export async function countAppsForAdmin(): Promise<
  Record<AppAdminTab, number>
> {
  const [queue, listed, removed] = await Promise.all(
    (["queue", "listed", "removed"] as const).map((t) => fetchRows(t)),
  );
  return {
    queue: queue.length,
    listed: listed.length,
    removed: removed.length,
  };
}

/** Moderation history per app from either site, newest first. */
export async function listAppModerationHistory(
  appIds: string[],
): Promise<Map<string, ModerationEvent[]>> {
  const history = new Map<string, ModerationEvent[]>();
  if (appIds.length === 0) return history;
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("plugin_moderation_events")
    .select("id, created_at, plugin_id, action, source, actor_id, reason")
    .in("plugin_id", appIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const actorIds = [
    ...new Set(
      (data ?? []).map((e) => e.actor_id).filter((id): id is string => !!id),
    ),
  ];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: users } = await admin
      .from("users")
      .select("id, name")
      .in("id", actorIds);
    for (const u of users ?? []) names.set(u.id, u.name);
  }
  for (const e of data ?? []) {
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
