/**
 * Plugin domain vocabulary: component types, scan/flag enums, and the
 * hand-maintained row shapes for the `plugins` / `plugin_components` tables.
 *
 * This module is dependency-free (besides zod) and safe to import from
 * server and client code alike. Keep it the single source of truth — the
 * forms, server actions, API routes, and scan pipeline all derive their
 * constants and schemas from here.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Component types
// ---------------------------------------------------------------------------

export const COMPONENT_TYPES = [
  "rule",
  "mcp_server",
  "skill",
  "agent",
  "hook",
  "lsp_server",
  "command",
] as const;

export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const COMPONENT_TYPE_LABELS: Record<ComponentType, string> = {
  rule: "Rule",
  mcp_server: "MCP Server",
  skill: "Skill",
  agent: "Agent",
  hook: "Hook",
  lsp_server: "LSP Server",
  command: "Command",
};

export const COMPONENT_TYPE_LABELS_PLURAL: Record<ComponentType, string> = {
  rule: "Rules",
  mcp_server: "MCP Servers",
  skill: "Skills",
  agent: "Agents",
  hook: "Hooks",
  lsp_server: "LSP Servers",
  command: "Commands",
};

/**
 * Component payload accepted by the create/update plugin server actions.
 */
export const componentInputSchema = z.object({
  type: z.enum(COMPONENT_TYPES),
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ComponentInput = z.infer<typeof componentInputSchema>;

// ---------------------------------------------------------------------------
// Security scan enums
// ---------------------------------------------------------------------------

export const SCAN_VERDICTS = ["safe", "suspicious", "malicious"] as const;

export const FLAG_SEVERITIES = ["low", "medium", "high"] as const;
export type FlagSeverity = (typeof FLAG_SEVERITIES)[number];

export const FLAG_CATEGORIES = [
  "malicious_code",
  "prompt_injection",
  "spam",
  "nsfw",
  "impersonation",
  "low_quality",
] as const;
export type FlagCategory = (typeof FLAG_CATEGORIES)[number];

export type ScanStatus =
  | "pending"
  | "scanning"
  | "safe"
  | "flagged"
  | "error"
  | "unscanned";

export type ScanVerdict = {
  verdict: (typeof SCAN_VERDICTS)[number];
  severity: FlagSeverity;
  categories: FlagCategory[];
  reasons: string[];
  summary: string;
};

// ---------------------------------------------------------------------------
// Database row shapes (hand-maintained until generated Supabase types are
// adopted; keep in sync with supabase/migrations)
// ---------------------------------------------------------------------------

export type PluginComponent = {
  id: string;
  plugin_id: string;
  type: ComponentType;
  name: string;
  slug: string;
  description: string | null;
  content: string | null;
  metadata: Record<string, unknown>;
  sort_order: number;
  created_at: string;
};

export type PluginRow = {
  id: string;
  name: string;
  slug: string;
  version: string;
  description: string | null;
  homepage: string | null;
  repository: string | null;
  license: string | null;
  logo: string | null;
  keywords: string[];
  author_name: string | null;
  author_url: string | null;
  author_avatar: string | null;
  owner_id: string | null;
  active: boolean;
  plan: string;
  order: number;
  install_count: number;
  star_count: number;
  created_at: string;
  updated_at: string;
  scan_status: ScanStatus;
  scan_verdict: ScanVerdict | null;
  flag_reasons: string[];
  flag_severity: FlagSeverity | null;
  flag_summary: string | null;
  flagged_at: string | null;
  last_scanned_at: string | null;
  scan_run_id: string | null;
  permanently_blocked: boolean;
  discovery_source: string | null;
  github_repo_id: number | null;
  verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  verification_requested_at: string | null;
  /** Set for plugins from the Cursor Marketplace (imported or linked). */
  marketplace_plugin_id: string | null;
  marketplace_updated_at: string | null;
  marketplace_categories: string[];
  /** Clients the plugin doesn't work in: "cursor" and/or "grok_bot". */
  unavailable_in: string[];
  plugin_components?: PluginComponent[];
};
