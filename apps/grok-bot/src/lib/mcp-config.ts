/**
 * An MCP server's setup as cursor.directory stores it: either the server's
 * own config (`{ url, headers }` or `{ command, args, env }`) or an
 * `mcp.json` with one entry under `mcpServers`.
 */
export type McpSetup =
  | {
      kind: "remote";
      url: string;
      /** Header names; values are the user's own (keys, tokens). */
      headers: string[];
      json: string;
    }
  | {
      kind: "local";
      command: string;
      args: string[];
      /** Environment variable names the server expects. */
      env: string[];
      json: string;
    };

const record = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

export function parseMcpSetup(
  name: string,
  content: string | null,
): McpSetup | null {
  if (!content) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  let config = record(parsed);
  const servers = record(config?.mcpServers);
  if (servers) config = record(servers[name] ?? Object.values(servers)[0]);
  if (!config) return null;

  const json = JSON.stringify({ mcpServers: { [name]: config } }, null, 2);
  const url = config.url ?? config.serverUrl;
  if (typeof url === "string" && url) {
    return {
      kind: "remote",
      url,
      headers: Object.keys(record(config.headers) ?? {}),
      json,
    };
  }
  if (typeof config.command === "string" && config.command) {
    return {
      kind: "local",
      command: config.command,
      args: Array.isArray(config.args) ? config.args.map(String) : [],
      env: Object.keys(record(config.env) ?? {}),
      json,
    };
  }
  return null;
}
