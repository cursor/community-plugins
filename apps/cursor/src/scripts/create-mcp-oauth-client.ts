/**
 * Registers the public OAuth client Cursor uses to sign in to the Community
 * Plugins MCP server (/api/mcp) and prints its client ID, which goes into
 * the app's allowlist (PRODUCTION_MCP_CLIENT_ID in src/lib/mcp/auth.ts, or
 * MCP_OAUTH_CLIENT_IDS) and the `auth.CLIENT_ID` of each admin's mcp.json.
 *
 * Re-running is safe: an existing client with the same name is reused, and
 * any missing redirect URIs are added to it.
 *
 * Usage (from apps/cursor):
 *   bun run mcp:create-oauth-client [--redirect-uri <url> ...]
 */

import { createClient } from "@supabase/supabase-js";

const CLIENT_NAME = "Cursor (Community Plugins MCP)";

// Cursor's fixed MCP OAuth callbacks: web + Cloud Agents, and the desktop app.
const CURSOR_REDIRECT_URIS = [
  "https://www.cursor.com/agents/mcp/oauth/callback",
  "http://localhost:8787/callback",
];

function parseArgs(): { redirectUris: string[] } {
  const argv = process.argv.slice(2);
  const redirectUris: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--redirect-uri")
      redirectUris.push(new URL(argv[++i]).toString());
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: create-mcp-oauth-client.ts [--redirect-uri <url> ...]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(1);
    }
  }
  return { redirectUris };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set.",
    );
  }

  const supabase = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const redirectUris = [
    ...new Set([...CURSOR_REDIRECT_URIS, ...parseArgs().redirectUris]),
  ];

  const { data: list, error: listError } =
    await supabase.auth.admin.oauth.listClients();
  if (listError) throw listError;

  // The Auth server omits `clients` entirely when there are none.
  let client = (list.clients ?? []).find((c) => c.client_name === CLIENT_NAME);

  if (client) {
    const missing = redirectUris.filter(
      (uri) => !client?.redirect_uris.includes(uri),
    );
    if (missing.length > 0) {
      const { data, error } = await supabase.auth.admin.oauth.updateClient(
        client.client_id,
        { redirect_uris: [...client.redirect_uris, ...missing] },
      );
      if (error) throw error;
      client = data;
      console.log(`Added redirect URIs: ${missing.join(", ")}`);
    }
    console.log(`Reusing existing OAuth client "${CLIENT_NAME}".`);
  } else {
    const { data, error } = await supabase.auth.admin.oauth.createClient({
      client_name: CLIENT_NAME,
      redirect_uris: redirectUris,
      // Public client (PKCE, no secret): nothing to distribute to admins.
      token_endpoint_auth_method: "none",
    });
    if (error) throw error;
    client = data;
    console.log(`Created OAuth client "${CLIENT_NAME}".`);
  }

  if (!client) throw new Error("OAuth client was not returned.");

  console.log(`
client_id:     ${client.client_id}
redirect_uris: ${client.redirect_uris.join(", ")}

Next steps:
  1. Allowlist it: MCP_OAUTH_CLIENT_IDS in the app environment, or
     PRODUCTION_MCP_CLIENT_ID in src/lib/mcp/auth.ts for production.
  2. Admins add this to their Cursor mcp.json:

     "community-plugins": {
       "url": "<app origin>/api/mcp",
       "auth": { "CLIENT_ID": "${client.client_id}", "scopes": ["email"] }
     }
`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
