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

// A setup is only kept when it works as written on anyone's machine, so the
// agent can add the server from the message alone. That rules out anything
// only one user has.
const NOT_PORTABLE: RegExp[] = [
  // A blank to fill in: <YOUR_PATH>, {{id}}, YOUR_KEY, "your host",
  // __BASE_URL__, example.com, "...", or a note in another script.
  /<[^<>]+>/,
  /\{[^{}]*\}/,
  /YOUR/,
  /\byour(\b|_)/i,
  /REPLACE|_HERE\b|x{4}/i,
  /__\w+_/,
  /\bexample\.(com|org|net)\b/i,
  /\.{3}|…/,
  /[^\x20-\x7E]/,
  // A value that is only a name: --header X-Token:API_KEY, API_KEY=abc.
  /[:=][A-Z][A-Z0-9]*(_[A-Z0-9]+)+\b/,
  /^[A-Z][A-Z0-9_]*=/,
  // A variable: $HOME, ${TOKEN}.
  /\$[A-Za-z_{(]/,
  // A path on their disk: /abs, ~/x, ./x, C:\x, --dir=/abs, a:/b.
  /^(~|\.{1,2})?[\\/]/,
  /^[A-Za-z]:\\/,
  /[=:](~|\.{1,2})?\/(?!\/)/,
  /\/path\/to\b/i,
  // A server on their own computer.
  /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i,
];
const portable = (text: string) => !NOT_PORTABLE.some((re) => re.test(text));

// Commands that fetch what they run. Anything else (node, python, a binary
// by name) needs files or an install the message can't provide.
const PACKAGE_RUNNERS = new Set([
  "npx",
  "uvx",
  "bunx",
  "pnpx",
  "pipx",
  "docker",
]);

function publicHttps(value: string): boolean {
  try {
    return new URL(value).protocol === "https:" && portable(value);
  } catch {
    return false;
  }
}

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
    if (!publicHttps(url)) return null;
    return {
      kind: "remote",
      url,
      headers: Object.keys(record(config.headers) ?? {}),
    };
  }
  if (typeof config.command === "string" && config.command) {
    const args = Array.isArray(config.args) ? config.args.map(String) : [];
    const command = config.command.toLowerCase();
    if (!PACKAGE_RUNNERS.has(command) || !args.every(portable)) return null;
    // An argument that is only a NAME stands for the user's own value, except
    // where docker passes an environment variable through by name.
    if (
      args.some(
        (arg, i) =>
          /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(arg) &&
          !["-e", "--env"].includes(args[i - 1]),
      )
    )
      return null;
    // A docker image without a namespace was built on the author's machine.
    if (
      command === "docker" &&
      !args.some((arg) => /^[\w.-]+(:\d+)?\/[\w./-]+(:[\w.-]+)?$/.test(arg))
    )
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
