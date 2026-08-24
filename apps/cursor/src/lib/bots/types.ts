import { z } from "zod";
import type { ScanStatus } from "@/lib/plugins/types";

const SCAN_STATUSES: readonly ScanStatus[] = [
  "pending",
  "scanning",
  "safe",
  "flagged",
  "error",
  "unscanned",
];

export function parseScanStatus(value: unknown): ScanStatus {
  for (const status of SCAN_STATUSES) {
    if (value === status) return status;
  }
  return "pending";
}

export const botNeedSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("plugin"),
    name: z.string().min(1),
    slug: z.string().min(1).optional(),
    repository: z.string().url().optional(),
  }),
  z.object({
    kind: z.literal("skill"),
    name: z.string().min(1),
  }),
]);

export type BotNeed = z.infer<typeof botNeedSchema>;

export const botNeedsSchema = z.array(botNeedSchema);

export type ResolvedBotNeed =
  | (Extract<BotNeed, { kind: "plugin" }> & { href: string | null })
  | Extract<BotNeed, { kind: "skill" }>;

export type BotRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  writeup: string;
  template: string;
  needs: BotNeed[];
  repository: string | null;
  homepage: string | null;
  logo: string | null;
  owner_id: string | null;
  active: boolean;
  scan_status: ScanStatus;
  discovery_source: string | null;
  github_repo_id: number | null;
  created_at: string;
  updated_at: string;
};

export type BotDetail = Omit<BotRow, "needs"> & {
  needs: ResolvedBotNeed[];
};

export function parseBotNeeds(value: unknown): BotNeed[] {
  if (!Array.isArray(value)) return [];
  const needs: BotNeed[] = [];
  for (const item of value) {
    const parsed = botNeedSchema.safeParse(item);
    if (parsed.success) needs.push(parsed.data);
  }
  return needs;
}
