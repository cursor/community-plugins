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

