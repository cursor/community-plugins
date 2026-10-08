# AGENTS.md

## Cursor Cloud specific instructions

### Services

| Service | How to run | Port |
|---|---|---|
| Supabase stack (Postgres, Auth, PostgREST, Storage, pgmq) | `sudo supabase start` from repo root (Docker; start the daemon first with `sudo service docker start` if needed) | 54321 (API), 54322 (DB), 54323 (Studio) |
| Next.js app (`apps/cursor`) | `bun dev` from `apps/cursor` (see README and `apps/cursor/package.json` for standard commands: `lint`, `typecheck`, `seed:*`) | 3000 |

Lint from repo root: `bunx biome ci .` (matches CI in `.github/workflows/ci.yml`). There is no automated test suite.

### Non-obvious caveats

- `bun` is installed via npm into `~/.local/bin` (on `PATH` via `~/.bashrc`); the standalone bun.sh installer is blocked by the network egress policy.
- The repo's dated migrations assume a pre-existing hosted base schema. `supabase/migrations/00000000000000_local_base_schema.sql` reconstructs it (tables, signup trigger, slug triggers, `pgmq_public` wrappers, storage policies) so a fresh `supabase start` / `supabase db reset` works locally. It is guarded to be a no-op where objects already exist.
- App env lives in `apps/cursor/.env` (gitignored). For local dev it uses the Supabase CLI's well-known local default keys (`supabase status` prints them) with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`. `CRON_SECRET` guards `/api/queue/plugin-scans/drain` and `/api/cron/*`.
- The login page only offers GitHub/Google OAuth, which are not configured locally. Create a confirmed user via the GoTrue admin API (`POST {SUPABASE_URL}/auth/v1/admin/users` with the secret key, `"email_confirm": true`); a DB trigger provisions the `public.users` profile row. To get a browser session, add a temporary route that calls `supabase.auth.signInWithPassword(...)` with the server client (do not commit it). Put the user's id in `ADMIN_USER_IDS`/`NEXT_PUBLIC_ADMIN_USER_IDS` to use `/admin/plugins`.
- Cache Components (`cacheComponents: true`) makes pages with `generateStaticParams` throw 500 on an empty database — seed at least one active plugin. Use `bun run seed:extract` / `seed:insert`, but note: the insert script must be run as `bun run --conditions=react-server --env-file=apps/cursor/.env apps/cursor/src/scripts/insert-from-jsonl.ts` or the `server-only` import throws under plain `bun run`. GitHub Code Search (used by `seed:extract` discovery) is heavily rate-limited; hand-writing `apps/cursor/.seed/candidates.json` with `{"candidates":[{"owner":...,"repo":...,"source":"seed:topic","matchedQuery":"manual"}]}` skips discovery.
- Plugin logos are rendered `unoptimized` in `PluginLogo`, so hosts outside `next.config.mjs` `images.remotePatterns` (for example `raw.githubusercontent.com` for manifests with a relative `logo`) no longer 500 the plugin page. Only `next/image` usages that go through the optimizer need the allowlist.
- After changing `.env` or database content backing cached pages, restart `bun dev` (and `rm -rf apps/cursor/.next` if stale renders persist) — hot reload does not invalidate Cache Components output.
- Without `CURSOR_API_KEY`, plugin submission works but the security scan errors (plugin lands in the admin "Scan issues" queue, where an admin can publish it manually). This is expected locally.
- Supabase `edge_runtime` is disabled in `supabase/config.toml` (no edge functions in this app; its boot probe needs deno.land which is blocked).
