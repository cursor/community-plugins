/**
 * An MCP server's setup as cursor.directory stores it: the component's
 * content, which is either the server's own config (`{ url, headers }` or
 * `{ command, args, env }`) or an `mcp.json` with one entry under
 * `mcpServers`. Older listings have no content and keep it in metadata
 * instead: `config` (an `mcp.json`) or `mcp_link` (a Cursor install link
 * carrying the config).
 */
export type McpSetup =
  | {
      kind: "remote";
      url: string;
      /** Header names; values are the user's own (keys, tokens). */
      headers: string[];
    }
  | {
      kind: "local";
      command: string;
      args: string[];
      /** Environment variable names the server expects. */
      env: string[];
    };

// Placeholders such as <YOUR_PATH> stand for something only the user knows,
// so the agent can't add the server from the message alone.
const PLACEHOLDER = /<[^<>]+>/;

const record = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

/** JSON, or the JSONC people paste from their editors (comments, trailing commas). */
function parseJson(text: string): Record<string, unknown> | null {
  try {
    return record(JSON.parse(text));
  } catch {
    try {
      return record(
        JSON.parse(
          text
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/(^|\s)\/\/.*$/gm, "$1")
            .replace(/,(\s*[}\]])/g, "$1"),
        ),
      );
    } catch {
      return null;
    }
  }
}

/** cursor://anysphere.cursor-deeplink/mcp/install?name=…&config=<base64 JSON> */
function fromInstallLink(link: unknown): Record<string, unknown> | null {
  if (typeof link !== "string") return null;
  try {
    const url = new URL(link);
    if (url.protocol !== "cursor:") return null;
    // URLSearchParams turns base64's "+" into a space.
    const encoded = url.searchParams.get("config")?.replaceAll(" ", "+");
    if (!encoded) return null;
    return parseJson(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export function parseMcpSetup(
  name: string,
  content: string | null,
  metadata: Record<string, unknown> | null,
): McpSetup | null {
  // The first place that holds a usable setup wins: some components keep a
  // description in content and the setup in metadata.
  for (const config of [
    content === null ? null : parseJson(content),
    record(metadata?.config),
    fromInstallLink(metadata?.mcp_link),
  ]) {
    const setup = config && setupFrom(name, config);
    if (setup) return setup;
  }
  return null;
}

function setupFrom(
  name: string,
  parsed: Record<string, unknown>,
): McpSetup | null {
  let config: Record<string, unknown> | null = parsed;
  const servers = record(config.mcpServers);
  if (servers) config = record(servers[name] ?? Object.values(servers)[0]);
  if (!config) return null;

  const url = config.url ?? config.serverUrl;
  if (typeof url === "string" && url) {
    if (PLACEHOLDER.test(url)) return null;
    return {
      kind: "remote",
      url,
      headers: Object.keys(record(config.headers) ?? {}),
    };
  }
  if (typeof config.command === "string" && config.command) {
    const args = Array.isArray(config.args) ? config.args.map(String) : [];
    if ([config.command, ...args].some((part) => PLACEHOLDER.test(part)))
      return null;
    return {
      kind: "local",
      command: config.command,
      args,
      env: Object.keys(record(config.env) ?? {}),
    };
  }
  return null;
}
