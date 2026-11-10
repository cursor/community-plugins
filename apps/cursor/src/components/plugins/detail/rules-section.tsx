"use client";

import type { PluginComponent } from "@directories/plugins/types";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddToCursorOrCopy } from "./add-to-cursor-or-copy";

export function RulesSection({
  rules,
  expandedRule,
  setExpandedRule,
  onInstall,
  installable,
}: {
  rules: PluginComponent[];
  expandedRule: string | null;
  setExpandedRule: (slug: string | null) => void;
  onInstall: () => void;
  installable: boolean;
}) {
  return (
    <div>
      <h2 className="section-eyebrow mb-4">
        {rules.length} {rules.length === 1 ? "rule" : "rules"}
      </h2>
      <div className="space-y-3">
        {rules.map((rule) => {
          const isExpanded = expandedRule === rule.slug;

          return (
            <div key={rule.slug} className="rounded-lg border border-border">
              <div className="flex items-center justify-between gap-4 p-4">
                <button
                  type="button"
                  className="flex items-center gap-2 min-w-0 text-left"
                  onClick={() => setExpandedRule(isExpanded ? null : rule.slug)}
                >
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      isExpanded && "rotate-180",
                    )}
                  />
                  <span className="truncate text-sm font-medium">
                    {rule.name}
                  </span>
                </button>
                {installable && (
                  <AddToCursorOrCopy
                    kind="rule"
                    slug={rule.slug}
                    content={rule.content ?? ""}
                    onInstall={onInstall}
                  />
                )}
              </div>

              {isExpanded && (
                <div className="px-4 pb-4">
                  <div className="max-h-96 overflow-y-auto rounded-lg border border-border bg-editor p-4 font-mono text-xs leading-6 text-muted-foreground">
                    <code className="block whitespace-pre-wrap">
                      {rule.content}
                    </code>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
