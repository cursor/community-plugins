import { worksInGrokBot } from "@directories/plugins/apps";
import type { ParsedPlugin } from "@directories/plugins/github";
import { addParts, grokBotAddUrl } from "@directories/plugins/grok-bot-add";
import type { McpInspection } from "@directories/plugins/mcp-inspect";
import { resolveComponentSlug, slugify } from "@directories/plugins/slug";

// What an app is made of, worked out the same way wherever an app is read
// from its source: the submit form, the bulk import, and an owner's refresh.

/**
 * Grok Bot can add a repository's plugin as it stands: it has MCP servers or
 * skills, every server has a setup that works as written, and every skill has
 * its SKILL.md. The same rule decides `plugins.grok_bot_addable` once it's
 * stored.
 */
export function repoAddable(parsed: ParsedPlugin): boolean {
  return (
    worksInGrokBot(parsed.components.map((c) => c.type)) &&
    grokBotAddUrl(
      slugify(parsed.name) || "app",
      addParts(
        parsed.components.map((c) => ({
          type: c.type,
          name: c.name,
          slug: resolveComponentSlug(c),
          content: c.content ?? null,
          metadata: c.metadata ?? null,
        })),
      ),
    ) !== null
  );
}

/**
 * What a remote MCP server reported when it was connected to, as stored on
 * its component: the app page shows it and the security scan reads it.
 */
export function serverMetadata(
  url: string,
  inspection: Extract<McpInspection, { ok: true }>,
): Record<string, unknown> {
  return {
    url,
    auth: inspection.auth,
    ...(inspection.server.name || inspection.server.version
      ? {
          server: {
            name: inspection.server.name,
            version: inspection.server.version,
          },
        }
      : {}),
    ...(inspection.tools ? { tools: inspection.tools } : {}),
  };
}
