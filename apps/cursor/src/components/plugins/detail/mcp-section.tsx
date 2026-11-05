"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { CursorDeepLink } from "@/components/cursor-deeplink";
import { ExternalLinkIcon } from "@/components/icons/external-link-icon";
import type { PluginComponent } from "@/lib/plugins/types";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { buildMCPInstallDeepLink } from "./deeplinks";

function resolveMcpConfig(
  content: string | null,
  meta: Record<string, unknown>,
  fallbackName: string,
): { name: string; config: Record<string, unknown> } | null {
  // Try content first, then metadata.config
  let parsed: Record<string, unknown> | null = null;

  if (content) {
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }
  } else {
    const cfg = (meta?.config as Record<string, unknown>) ?? {};
    if (cfg.mcpServers) {
      parsed = { mcpServers: cfg.mcpServers } as Record<string, unknown>;
    }
  }

  if (!parsed) return null;

  // Unwrap mcpServers wrapper if present
  const servers = parsed.mcpServers as Record<string, unknown> | undefined;
  if (servers && typeof servers === "object") {
    const keys = Object.keys(servers);
    if (keys.length > 0) {
      return {
        name: keys[0],
        config: servers[keys[0]] as Record<string, unknown>,
      };
    }
  }

  // Content is already a raw config (no mcpServers wrapper). Ingestion strips
  // the wrapper, so fall back to the component name before the generic default
  // -- otherwise every such server installs as literally "server".
  return {
    name: (meta?.name as string) ?? fallbackName ?? "server",
    config: parsed,
  };
}

export function McpSection({
  mcps,
  onInstall,
  installable,
  expandedMcp,
  setExpandedMcp,
}: {
  mcps: PluginComponent[];
  onInstall: () => void;
  installable: boolean;
  expandedMcp: string | null;
  setExpandedMcp: (slug: string | null) => void;
}) {
  return (
    <div className="space-y-3">
      {mcps.map((mcp) => {
        const meta = mcp.metadata as Record<string, unknown>;
        const link = meta?.link as string | undefined;
        const mcpLink = meta?.mcp_link as string | undefined;

        let installLink = mcpLink ?? null;
        let configPreview: string | null = null;
        try {
          const resolved = resolveMcpConfig(mcp.content, meta, mcp.name);
          if (resolved) {
            // Show the wrapped form: this is what a user pastes into
            // ~/.cursor/mcp.json. The bare inner object is not valid there.
            configPreview = JSON.stringify(
              { mcpServers: { [resolved.name]: resolved.config } },
              null,
              2,
            );
            if (!installLink) {
              installLink = buildMCPInstallDeepLink(
                resolved.name,
                JSON.stringify(resolved.config),
              );
            }
          }
        } catch {
          installLink = installLink ?? null;
        }
        if (!configPreview && mcp.content) {
          configPreview = mcp.content;
        }

        const isExpanded = expandedMcp === mcp.slug;
        const canExpand = Boolean(configPreview);

        return (
          <div key={mcp.slug} className="rounded-lg border border-border">
            <div className="flex items-center justify-between gap-4 p-4">
              <button
                type="button"
                className="flex items-center gap-2 min-w-0 text-left disabled:cursor-default"
                onClick={() =>
                  canExpand && setExpandedMcp(isExpanded ? null : mcp.slug)
                }
                disabled={!canExpand}
              >
                {canExpand ? (
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      isExpanded && "rotate-180",
                    )}
                  />
                ) : (
                  <span className="size-4 shrink-0" />
                )}
                <span className="shrink-0 rounded-md border border-border bg-muted px-2 py-1 text-xs font-mono text-muted-foreground">
                  MCP
                </span>
                <span className="truncate text-sm font-medium">{mcp.name}</span>
              </button>
              <div className="flex items-center gap-3 shrink-0">
                {link && (
                  <Link
                    href={link}
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    target="_blank"
                  >
                    <span>Source</span>
                    <ExternalLinkIcon />
                  </Link>
                )}
                {installable && installLink ? (
                  <CursorDeepLink
                    mcp_link={installLink}
                    onInstall={onInstall}
                  />
                ) : installable && (configPreview ?? mcp.content) ? (
                  <CopyButton
                    text={configPreview ?? mcp.content ?? ""}
                    onCopy={onInstall}
                  />
                ) : null}
              </div>
            </div>

            {isExpanded && configPreview && (
              <div className="px-4 pb-4">
                <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground/80">
                  This config will be passed to Cursor on install, and is
                  what you paste into `~/.cursor/mcp.json` to add the server by
                  hand. Inspect `command`, `args`, and `env` before continuing.
                </p>
                <div className="max-h-96 overflow-y-auto rounded-lg border border-border bg-editor p-4 font-mono text-xs leading-6 text-muted-foreground">
                  <code className="block whitespace-pre-wrap">
                    {configPreview}
                  </code>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
