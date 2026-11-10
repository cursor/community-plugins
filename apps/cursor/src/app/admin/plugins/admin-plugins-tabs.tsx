"use client";

import type { PluginRow } from "@directories/plugins/types";
import { useQueryState } from "nuqs";
import { cn } from "@/lib/utils";
import { FlaggedReviewList } from "./flagged-review-list";
import { PluginReviewList } from "./plugin-review-list";
import { StuckScanList } from "./stuck-scan-list";
import { VerificationRequestList } from "./verification-request-list";

type TabKey = "flagged" | "stuck" | "pending" | "verification";

// Order = urgency. The query keys are kept stable (`stuck`, `pending`,
// `verification`) so existing bookmarks don't break — only the labels change.
const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "flagged", label: "Flagged" },
  { key: "stuck", label: "Scan issues" },
  { key: "verification", label: "Verification requests" },
  { key: "pending", label: "Hidden" },
];

export function AdminPluginsTabs({
  flagged,
  stuck,
  pending,
  verification,
}: {
  flagged: PluginRow[];
  stuck: PluginRow[];
  pending: PluginRow[];
  verification: PluginRow[];
}) {
  const [tab, setTab] = useQueryState("tab", { defaultValue: "flagged" });
  const active = (TABS.some((t) => t.key === tab) ? tab : "flagged") as TabKey;

  const counts: Record<TabKey, number> = {
    flagged: flagged.length,
    stuck: stuck.length,
    pending: pending.length,
    verification: verification.length,
  };

  return (
    <div>
      <div className="mb-6 inline-flex min-h-11 items-center justify-start gap-1 rounded-full border border-border bg-card p-1 text-muted-foreground">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key === "flagged" ? null : t.key)}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors",
              active === t.key
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{t.label}</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-mono",
                active === t.key
                  ? "bg-background text-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {active === "flagged" && <FlaggedReviewList plugins={flagged} />}
      {active === "stuck" && <StuckScanList plugins={stuck} />}
      {active === "pending" && <PluginReviewList plugins={pending} />}
      {active === "verification" && (
        <VerificationRequestList plugins={verification} />
      )}
    </div>
  );
}
