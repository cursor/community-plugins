import { parseGitHubUrl } from "@directories/plugins/github";

/**
 * Where an app's listing was read from, so it can be read again: a GitHub
 * repository, or one remote MCP server. Null for an official app (the
 * marketplace keeps it up to date) and for an older listing that is only a
 * link.
 */
export type AppSource =
  | { kind: "repo"; repository: string }
  | { kind: "server"; url: string };

export function appSource(app: {
  repository: string | null;
  marketplace_plugin_id: string | null;
  components: { type: string; metadata: Record<string, unknown> | null }[];
}): AppSource | null {
  if (app.marketplace_plugin_id) return null;
  if (app.repository) {
    return parseGitHubUrl(app.repository)
      ? { kind: "repo", repository: app.repository }
      : null;
  }
  const [only] = app.components;
  if (app.components.length !== 1 || only.type !== "mcp_server") return null;
  const url = only.metadata?.url;
  return typeof url === "string" && url.startsWith("https://")
    ? { kind: "server", url }
    : null;
}
