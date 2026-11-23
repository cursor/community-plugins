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
  SpaceXSI SDK (`src/lib/ai-review.ts`), mirroring cursor.directory's plugin
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
  `/admin` (Bots side; apps are under Apps, see below) or with the Community
  Plugins MCP server's `grok_bot` tools. The
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
- **Profiles:** `/u/<handle>` (as on cursor.directory, whose member
  profiles these share) lists a member's listed bots and apps with their
  name, photo and X handle, and nothing else: no pending
  or declined submissions, no email, and no page for a member whose
  cursor.directory profile isn't public or who has nothing listed. A member
  who signed in with X goes by that handle (`users.x_handle`, written at each
  X sign-in, so X has checked it); everyone else by their profile's slug:
  `/u/kevinrose`, `/u/pontus`. An address is read as an X handle first and a
  slug second, so a slug that equals someone else's X handle gives way to
  it. A member's slug redirects to their X handle when they have one, as
  does `/u/@handle`, the form these addresses had at first. Author names on bot
  rows and bot pages link there, the account menu has "Your profile", and
  "Your submissions" has the link to copy. `/creators/<handle>`, the first
  address, redirects.
- **What's new:** `src/lib/whats-new.ts` lists what has changed for people
  who list here, newest first. `/whats-new` shows all of it. A signed-in
  member is shown the updates newer than their browser last saw (two at
  most) in a card in the corner, once; the browser remembers the newest
  update's id in `localStorage`. To announce something, add an entry at the
  top of the list.
- **Sharing:** `sitemap.xml` (listed bots and apps, and profiles),
  `robots.txt`, and Open Graph images for the home page, each bot, each app
  and each profile (`opengraph-image.tsx`).
- **Long lists:** the hosted Data API returns at most 100 rows a request (a
  local stack returns 1,000), so lists that can grow past that go through
  `allRows` (`src/utils/supabase/all-rows.ts`) or a SQL function that returns
  one JSON value.

## Apps

"Apps" is Grok Bot's name for plugins: bundles of MCP servers and skills a
bot can use. The Apps tab (`/?tab=apps`) and app pages (`/apps/<slug>`) show
cursor.directory's plugins, the same rows in the shared `plugins` table, so a
plugin submitted on either site appears on both.

- **Which plugins:** `list_grok_bot_apps()` applies Grok Bot's own rule:
  active plugins with MCP servers or skills, or with none of the parts only
  Cursor runs (rules, hooks, commands, subagents, LSP servers), minus those
  marked `unavailable_in = {grok_bot}`. `worksInGrokBot` in
  `packages/plugins/src/apps.ts` is the same rule in TypeScript.
- **Official apps** come from the Cursor Marketplace. cursor.directory's
  daily cron (`/api/cron/sync-marketplace-plugins`, or
  `bun run seed:marketplace-plugins` in `apps/cursor`) imports the public
  `ListMarketplacePlugins` catalog into `plugins` (`discovery_source =
  'marketplace'`, `marketplace_plugin_id` set) and keeps it in sync. They
  carry an Official badge; **Add to Grok Bot** opens
  `x.ai/bot/plugin/<id>`, which opens the app in Grok Bot. The catalog
  doesn't include MCP configs, so their component rows hold names only.
- **Community apps** are every other plugin Grok Bot can use. Their **Add to
  Grok Bot** opens Grok Bot's prefilled-message link
  (`cursor.com/grok-bot/link/v1/prompt?text=…`, one line, at most 1,000
  characters) with a message like "Add the MCP server https://… (call it
  "x")". Grok Bot's AddMcpServer tool then asks the user to confirm before
  adding it (`packages/plugins/src/grok-bot-add.ts`). The message names the headers or
  environment variables a server needs but never their values, since the link
  travels wherever it's pasted. Skills go in the same message: "Add the skill
  "x" from https://…/apps/<slug>/skills/<skill>/SKILL.md (fetch it and save
  it as a skill)", which the agent's `skill.write` saves. The directory serves
  that SKILL.md from the stored copy the security scan reviewed, not the
  repository's current state. Apps whose message can't be built (an unreadable
  server config, or over 1,000 characters) show no Add button.
- **Owners keep a listing up to date** from Your submissions
  (`src/lib/app-owner.ts`). A listing is a copy of its source, made when the
  app was submitted. **Refresh** reads the source again: a repository's
  plugin (found by GitHub's id for the repository, so a rename or a move to
  another owner is followed), or what a remote server reports. **Edit**
  (`/apps/<slug>/edit`) changes the logo and website of any app, and the name
  and description of a server; a repository's name and description come from
  the repository. A change to the name, the description or what the app is
  made of hides it and queues the security scan again; a new logo or website
  shows at once. Only listed apps can be changed, each change is recorded in
  `plugin_moderation_events` (`owner_edit`, `owner_refresh`), and the address
  never changes.
- **Claiming:** apps imported in bulk have no owner, so nobody can edit
  them. An unowned community app's page links to `/apps/<slug>/claim`, where
  its maker proves it's theirs (`src/lib/app-claim-proof.ts`): their GitHub
  account owns the repository (a person's own repository only, matched by
  GitHub's id for the account; also done automatically at a GitHub sign-in),
  or a file names them: `grok-bot-directory.txt` in the repository's root,
  or at `/.well-known/grok-bot-directory.txt` on the server's host (or on
  the listing's website, when the server sits under it), holding the line
  `grok-bot-directory-owner=<member id>`. The line isn't a secret: what
  counts is where it's published. A claim only fills an empty owner and is
  recorded in `plugin_moderation_events` (`owner_claim`).
- **Moderation** happens on either site: the Grok Bot Directory's `/admin`
  has an Apps side (review queue of flagged, failed, stuck and scanning
  plugins; Listed community apps; Removed) next to Bots. Both sites call the
  same operations (`packages/plugins/src/moderation.ts`) on the same rows,
  and log to the same `plugin_moderation_events`. After a decision here, the
  directory asks cursor.directory to refresh its cached plugin pages
  (`/api/plugins/revalidate`, `PLUGIN_REVALIDATE_SECRET` shared by both
  projects); re-scans run on cursor.directory's drain cron.
- **Submitting** (`/submit?kind=app`) takes a GitHub repository (parsed like
  cursor.directory does) or a remote MCP server URL, and creates the same
  plugin row cursor.directory's form creates (`discovery_source =
  'grok-bot'`). cursor.directory's security scan reviews it: safe plugins
  are listed on both sites, flagged ones wait in cursor.directory's
  `/admin/plugins` queue. The scan runs on cursor.directory's drain cron,
  whichever site queued it.
- **Pasted URLs fill in the form.** An MCP server URL is connected to like a
  client would (`initialize`, then `tools/list`; `packages/plugins/src/mcp-inspect.ts`):
  its name, website and icons, its tools, and whether it asks for an OAuth
  sign-in, with the site's own title, description and icon as fallbacks.
  Only servers that answer are accepted. The tools and sign-in requirement
  are stored on the server's component metadata, so the app page lists them
  and the security scan sees them. Every fetch is guarded (https only, no
  credentials in the URL, no private addresses after DNS, redirects
  re-checked, 5s timeouts, capped bodies). GitHub repositories fall back to
  the repo's description, website, topics and owner avatar where the plugin
  manifest is silent, and the preview shows stars, last push and whether
  it's archived.
- **Shared code:** plugin types, the GitHub parser, `insertPlugin`, the scan
  queue and the marketplace import live in `packages/plugins`
  (`@directories/plugins`), used by both apps.
- **No ranking:** apps list official first, then community, each shuffled
  on every visit, with the marketplace's categories as filters. Installs
  aren't counted.

## Local development

1. Start the Supabase stack from the repo root: `bunx supabase start`
   (applies the migrations).
2. `cp .env.example .env` and fill in the local keys `supabase status` prints.
   Set `GROK_BOT_DEV_LOGIN=1` to get a "Local dev sign-in" button, since
   GitHub and Google OAuth aren't configured locally.
3. Seed from the official marketplace: `bun run seed:marketplace` (bots),
   and `bun run seed:marketplace-plugins` from `apps/cursor` (apps).
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
- **Database:** apply the four migrations (`20261030120000_grok_bots.sql`,
  `20261030130000_grok_bot_ai_review.sql`,
  `20261030140000_grok_bot_admin_edits.sql`,
  `20261110120000_marketplace_plugins.sql`)
  to the shared project, run `seed:marketplace` once, and run
  cursor.directory's `seed:marketplace-plugins` once (its daily cron keeps
  apps in sync after that).
- **Apps install path:** try a community app's Add to Grok Bot on desktop
  and mobile, to confirm the prefilled message reaches AddMcpServer and that
  the agent fetches and saves skills.
- **Secrets:** `XAI_API_KEY` (AI review) and `CRON_SECRET` (review retries)
  in the Vercel project; `PLUGIN_REVALIDATE_SECRET` in both this project and
  cursor.directory's (a team-level shared variable), with
  `CURSOR_DIRECTORY_URL` here.
- **Grok Bot API:** confirm with the Grok Bot backend owners that the directory
  may depend on the public template RPCs.
- **Brand:** design team sign-off.
