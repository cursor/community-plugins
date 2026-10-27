# Cursor Directory

The directory of plugins from the Cursor community.

**[cursor.directory](https://cursor.directory)**

---

## Project Structure

```
├── apps/
│   └── cursor/          # Next.js app
├── supabase/
│   └── migrations/      # Database migrations
└── package.json         # Bun workspace config
```

All data lives in the database — there is no local data in the repo.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh)
- A [Supabase](https://supabase.com) project

### Setup

1. **Clone the repo**

```bash
git clone https://github.com/cursor/community-plugins.git
cd community-plugins
```

2. **Install dependencies**

```bash
bun install
```

3. **Configure environment variables**

```bash
cp apps/cursor/.env.example apps/cursor/.env
```

Fill in the required values:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase Publishable key (`sb_publishable_...`, replaces the legacy anon key) |
| `SUPABASE_SECRET_KEY` | Yes | Supabase Secret key (`sb_secret_...`, replaces the legacy service role key) |
| `NEXT_PUBLIC_APP_URL` | No | Defaults to `http://localhost:3000` |

4. **Run the database migrations**

Apply the migrations in `supabase/migrations/` to your Supabase project.

5. **Start the dev server**

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Contributing

All content is submitted through the website — no pull requests needed for data.

### Submit a Plugin

1. Go to [cursor.directory/plugins/new](https://cursor.directory/plugins/new)
2. Sign in with GitHub or Google
3. Paste a GitHub repo URL — we auto-detect components following the [Open Plugins](https://agent-plugins.org) standard
4. Click **Submit**

Auto-detected components:

| Component | Path |
|-----------|------|
| Rules | `rules/*.mdc` |
| MCP Servers | `.mcp.json` or `mcp.json` |
| Skills | `skills/*/SKILL.md` |
| Agents | `agents/*.md` |
| Commands | `commands/*.md` |
| Hooks | `hooks/hooks.json` |
| LSP Servers | `.lsp.json` |

The manifest is read from `.plugin/plugin.json`, `.cursor-plugin/plugin.json` or `.claude-plugin/plugin.json` (first match wins). For monorepos, the same paths are also scanned inside every directory listed as `plugins[].source` in `.cursor-plugin/marketplace.json` and every directory that contains its own `.cursor-plugin/plugin.json`.

See the [Open Plugins specification](https://agent-plugins.org/specification) and [plugin template](https://github.com/cursor/plugin-template) for details.

---

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org) (App Router, Turbopack)
- **Runtime**: [Bun](https://bun.sh)
- **Database**: [Supabase](https://supabase.com) (PostgreSQL)
- **Job Queue**: [Supabase Queues](https://supabase.com/docs/guides/queues) (`pgmq`) drained by a 1-min Vercel cron
- **Styling**: [Tailwind CSS](https://tailwindcss.com)
- **UI**: [Radix UI](https://radix-ui.com) + [shadcn/ui](https://ui.shadcn.com)
- **Search**: [Fuse.js](https://fusejs.io) (client-side fuzzy search)
- **URL State**: [nuqs](https://nuqs.dev)
- **Linting**: [Biome](https://biomejs.dev)

## Plugin security scan

Submitted plugins are auto-reviewed by a Cursor SDK agent (`composer-2`) running
in `local` mode against a fresh clone of the plugin's repo plus its inline
component content. The verdict (`safe` / `suspicious` / `malicious`) is written
back to `plugins.scan_status` and surfaces in the admin queue.

The scan is asynchronous and runs out of the request lifecycle:

1. **Enqueue** — server actions and the recover-stuck-scans cron call
   `enqueuePluginScan(pluginId)` which sends a message to the `plugin_scans`
   pgmq queue.
2. **Kick** — user-facing actions also fire `kickDrainAfterResponse()` so the
   drain route is called via `next/server` `after()` immediately after the
   response is flushed. Scans typically start within a few hundred ms.
3. **Drain** — `/api/queue/plugin-scans/drain` reads one message
   (`vt=900s`, `n=1`), runs `runPluginScan(pluginId)`, archives the message on
   success, leaves it for VT-expiry on retryable error, or buries it after
   `MAX_ATTEMPTS=5` deliveries.
4. **Cron safety net** — Vercel cron hits the same drain route every minute so
   any messages that missed their kick still get processed.

The drain route uses `maxDuration = 800` (Vercel Pro+ Fluid Compute ceiling) and
relies on `CURSOR_API_KEY` + `CRON_SECRET` from the env file.


## Managing plugins via MCP (admins)

Admins can moderate Community Plugins from Cursor through the MCP server at
`/api/mcp`. It exposes the same operations as `/admin/plugins`:

| Tool | Effect |
|------|--------|
| `list_moderation_queue` | Flagged, scan issues, verification requests, or hidden plugins |
| `search_plugins`, `get_plugin` | Find a plugin and see its status, scan verdict, owner, and components |
| `list_moderation_events` | Moderation audit log (web and MCP) |
| `approve_plugin`, `approve_flagged_plugin` | Publish a hidden plugin; flagged/blocked plugins need the explicit `approve_flagged_plugin` |
| `unpublish_plugin`, `block_plugin` | Hide a plugin, or hide and permanently block it (with a reason) |
| `rescan_plugin` | Queue a new security scan (refused while one is in progress) |
| `set_plugin_verified`, `dismiss_verification_request` | Manage the verified badge |

Deleting plugins stays in the web admin. Write tools are rate-limited per admin
(`mcp-moderation` Vercel Firewall rule), and every change from the web admin or
MCP is recorded in the append-only `plugin_moderation_events` table.

### Who is an admin

Admins are rows in the `public.admins` table, which also controls
`/admin/plugins`. Add or remove people in the Supabase dashboard (Table
Editor → `admins`) or with SQL. Changes apply on the next request; nothing
needs a redeploy. Fill in one of:

- `user_id`: an existing account (`auth.users.id`).
- `email`: someone who hasn't signed in yet, or any of their accounts. It only
  matches a Google or GitHub sign-in whose provider verified that address; an
  email typed into an email/password signup never counts.

```sql
-- By email, works before they sign in with Google or GitHub
insert into public.admins (email, note) values ('jane@cursor.com', 'plugin moderation');

-- By account (check it's the right one first)
insert into public.admins (user_id, note)
select id, 'plugin moderation' from auth.users where email = 'jane@cursor.com';

-- Remove
delete from public.admins where email = 'jane@cursor.com';
```

### How access works

- Supabase Auth is the OAuth 2.1 authorization server. Cursor signs in through
  a pre-registered public OAuth client (PKCE, no secret); dynamic client
  registration stays off.
- The consent page (`/oauth/consent`) only lets admins approve, and only for
  the allowlisted OAuth client. The production client's ID is built into
  `src/lib/mcp/auth.ts`; a comma-separated `MCP_OAUTH_CLIENT_IDS` replaces it,
  for example for a local Supabase stack.
- `/api/mcp` verifies every bearer token (signature and expiry via
  `getClaims`, plus a session check with the Auth server), requires the
  allowlisted `client_id`, and requires the user to be an admin. Deleting someone's `admins` row or signing them out cuts off MCP
  access immediately. Website session tokens are not accepted by the MCP
  server, and MCP tokens are not accepted as website sessions.

### Setup

1. In the Supabase dashboard, enable **Authentication → OAuth Server**, set the
   authorization path to `/oauth/consent`, and leave dynamic client
   registration off. The Site URL must be the app's origin. Use asymmetric JWT
   signing keys if clients request the `openid` scope. Locally,
   `supabase/config.toml` already enables this.
2. Apply the migrations (adds `plugin_moderation_events` and `admins`) and add
   the admins. When moving off the old `ADMIN_USER_IDS` env var, copy its IDs
   in before deploying, then delete `ADMIN_USER_IDS` and
   `NEXT_PUBLIC_ADMIN_USER_IDS`:

   ```sql
   insert into public.admins (user_id, note)
   select btrim(id)::uuid, 'migrated from ADMIN_USER_IDS'
   from unnest(string_to_array('<ADMIN_USER_IDS value>', ',')) as id;
   ```

3. Production's OAuth client is already registered and built in. For another
   Supabase project, register one and set `MCP_OAUTH_CLIENT_IDS` to the
   printed client ID:

   ```bash
   cd apps/cursor && bun run mcp:create-oauth-client
   ```

   It registers Cursor's fixed callbacks
   (`https://www.cursor.com/agents/mcp/oauth/callback` and
   `http://localhost:8787/callback`); pass `--redirect-uri <url>` for others.
4. Add the `mcp-moderation` rate limit rule (60 requests / 1h, keyed by user)
   in Vercel Firewall. Until it exists, write tools aren't rate limited and
   the server logs an error.
5. Admins add the server to their Cursor `mcp.json`:

   ```json
   {
     "mcpServers": {
       "cursor-directory": {
         "url": "https://cursor.directory/api/mcp",
         "auth": {
           "CLIENT_ID": "12bb4179-e29a-4f99-a718-335ef4d0edb2",
           "scopes": ["email"]
         }
       }
     }
   }
   ```

   Cursor opens the consent page on first use. Keep the write tools out of
   Cursor's auto-run allowlist so each change is approved by a person.

   Prefer this per-admin `mcp.json` entry over a Cursor Team MCP server: team
   servers are also available to Cloud Agents, which run tools without asking
   for approval, and Cursor's docs don't say whether team servers accept a
   pre-registered OAuth client ID.
