# Grok Bot Directory (`apps/grok-bot`)

A community directory of Grok Bots, at grok-bot.directory. It shares the
cursor.directory Supabase project: members (`public.users`), admins and auth
are the same; bots live in their own tables (`supabase/migrations/20261030120000_grok_bots.sql`).

## How it works

- **A bot is a share link.** Submitting takes one `https://x.ai/bot/<id>` link.
  The server reads the bot's public card (name, description, shape, color) with
  the public `GetPublicGrokBotTemplate` RPC (`src/lib/grok-bot-api.ts`) and
  stores it, so pages never depend on a live fetch.
- **AI review:** every submission is reviewed by Grok 4.7 through the official
  xAI SDK (`src/lib/ai-review.ts`), mirroring cursor.directory's plugin
  security scan. It reads the bot's public card and similarly named bots
  (`find_similar_grok_bots`) and returns a verdict (safe, suspicious,
  malicious), severity, flags (spam, impersonation, prompt injection, harmful,
  NSFW, deceptive, duplicate, low quality), reasons, and the bot's category.
  Safe bots are listed automatically; flagged ones wait for an admin. Submitting
  returns at once and the review runs after the response (`after()`);
  `/api/cron/review-bots` (every 5 minutes, `CRON_SECRET`) retries queued,
  failed and stuck reviews, up to 3 attempts. Categories follow the
  x.ai/bot marketplace catalog, minus "From Grok Bot Team". The reviewer only
  sees the public card: a bot's full instructions need a Grok Bot login.
- **Review:** admins (`public.admins`, shared with cursor.directory) work at
  `/admin` or with the Community Plugins MCP server's `grok_bot` tools. The
  Review queue tab lists, declines (with a note) or re-runs the AI review;
  Listed changes a bot's category or unlists it (with a note); Removed shows
  declined and unlisted bots and relists them. Every decision, by the AI, the
  web or MCP, is logged in `grok_bot_moderation_events` and shown under each
  card's History.
- **Listings are snapshots.** A bot's card is copied when it's submitted;
  nothing re-reads it later. Owners resubmit to change a declined bot, and
  admins unlist bots that are no longer shared. `bun run seed:marketplace`
  imports new marketplace bots and refreshes imported ones when run.
- **Credit:** a listing credits the author x.ai names, in order: the
  marketplace creator (name, photo, X handle), then the owner name on the
  share card (`ownerDisplayName`, set for person-owned bots that aren't on
  the marketplace), then the submitter's profile. An owner name matching the
  submitter uses their profile instead (`src/actions/submit-bot.ts`).
- **Installs** are "Add to Grok Bot" clicks (they open the x.ai share page),
  counted and ranked like cursor.directory plugin installs: rate limited, daily
  snapshots by `pg_cron`, Trending = last 30 days.
- **Bot art** is the brand tool's Grok Bot geometry: the faces in
  `public/bots` (12 bodies × 9 expressions) and the round bot's front-facing
  eyes in `public/eyes-front`. Every bot next to a listing (rows, bot pages,
  the submit preview, Your bots, admin) uses the avatar engine (`src/components/bot-rig.tsx`):
  `bun src/scripts/build-rig.ts` splits each face losslessly into body and
  eyes (`public/rig/<shape>.svg`, `src/lib/rig-meta.ts`), and the engine moves
  those parts (gaze with foreshortening and lean, blinks, expression
  crossfades, squash-and-stretch hops) without drawing any new geometry.
  The empty, error and not-found pages use the faces as static CSS masks.
- **Sharing:** `sitemap.xml` (listed bots), `robots.txt`, and Open Graph
  images for the home page and each bot (`opengraph-image.tsx`).

## Local development

1. Start the Supabase stack from the repo root: `bunx supabase start`
   (applies the migrations).
2. `cp .env.example .env` and fill in the local keys `supabase status` prints.
   Set `GROK_BOT_DEV_LOGIN=1` to get a "Local dev sign-in" button, since
   GitHub and Google OAuth aren't configured locally.
3. Seed from the official marketplace: `bun run seed:marketplace`.
4. `bun dev` → http://localhost:3001.
5. To review submissions, make the dev user an admin:
   `insert into public.admins (user_id, note) select id, 'local dev' from auth.users where email = 'dev@grok-bot.local';`

## Browser tests

`bun run test:e2e` runs the Playwright suite in `e2e/` against the local
Supabase stack and `bun dev` (started for you, or reused on port 3001), in
your installed Chrome. It needs `.env` with the local keys and
`GROK_BOT_DEV_LOGIN=1`. The tests seed their own bots (slugs starting with
`e2e-`), sign in with the local dev sign-in, switch the dev user's admin flag
as needed, and restore everything when they finish; they refuse to run
against a non-local Supabase URL. `E2E_NETWORK=1` adds a test that previews
a real shared bot from x.ai.

## Before launch

- **Sign-in:** the same GitHub and Google sign-in as cursor.directory, through
  the shared Supabase project (one account across both sites). Add
  `https://grok-bot.directory/auth/callback` to the project's redirect allow
  list. The GitHub and Google consent screens show the shared OAuth apps'
  names ("Cursor Directory"). Plan: rename both shared apps to "Grok Community
  Connectors" (it changes cursor.directory's screens too; nothing else
  changes). Needs someone with access: GitHub OAuth app
  `Ov23lip6HkefAzyKnn6V` (Developer settings → OAuth Apps → Application name)
  and Google client `116600415733-87trmhlru33adgoe1e1tlti2drr6m1ug` (Google
  Auth Platform → Branding → App name; Google may re-verify).
- **Sign in with X (optional):** an X developer app "Grok Community
  Connectors" (OAuth 2.0, Web App, read, request email) with callback
  `https://service.cursor.directory/auth/v1/callback`. A project owner turns
  on Authentication → Sign In / Providers → X / Twitter (OAuth 2.0) with its
  client id and secret; then set `GROK_BOT_X_SIGN_IN=1` on Vercel to show the
  button. cursor.directory is unaffected (it has no X button).
- **Vercel:** a new project with root directory `apps/grok-bot`, the domain,
  the env vars in `.env.example`, and the Firewall rules listed there.
- **Database:** apply the three migrations (`20261030120000_grok_bots.sql`,
  `20261030130000_grok_bot_ai_review.sql`,
  `20261030140000_grok_bot_admin_edits.sql`)
  to the shared project and run
  `seed:marketplace` once.
- **Secrets:** `XAI_API_KEY` (AI review) and `CRON_SECRET` (review retries)
  in the Vercel project.
- **Grok Bot API:** confirm with the Grok Bot backend owners that the directory
  may depend on the public template RPCs.
- **Brand:** design team sign-off.
