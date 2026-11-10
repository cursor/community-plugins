/**
 * Grok Bot's rule for which plugins it can use (it calls them "Apps"): a
 * plugin is usable when it has MCP servers or skills, or has none of the
 * parts only Cursor runs. `list_grok_bot_apps()` applies the same rule in SQL.
 */

const GROK_BOT_TYPES = new Set(["mcp_server", "skill"]);
const CURSOR_ONLY_TYPES = new Set([
  "rule",
  "hook",
  "command",
  "agent",
  "lsp_server",
]);

export function worksInGrokBot(componentTypes: readonly string[]): boolean {
  return (
    componentTypes.some((t) => GROK_BOT_TYPES.has(t)) ||
    !componentTypes.some((t) => CURSOR_ONLY_TYPES.has(t))
  );
}

/** The public page for an official app; it opens the app in Grok Bot. */
export function grokBotPluginUrl(marketplacePluginId: string): string {
  return `https://x.ai/bot/plugin/${marketplacePluginId}`;
}

/** The Cursor Marketplace page for an official plugin. */
export function cursorMarketplaceUrl(marketplacePluginId: string): string {
  return `https://cursor.com/marketplace?pluginId=${encodeURIComponent(marketplacePluginId)}`;
}
