---
name: grok-bot-whats-new
description: Adds an entry to the Grok Bot Directory's What's new list (apps/grok-bot/src/lib/whats-new.ts) when a change people will notice ships. Use when finishing, opening a PR for, merging or deploying a feature or visible change in apps/grok-bot, or when the user mentions What's new, the changelog, release notes, or announcing a change to members.
---

# What's new entries (Grok Bot Directory)

`apps/grok-bot/src/lib/whats-new.ts` holds `UPDATES`, newest first. The
`/whats-new` page shows all of them. A signed-in member is shown the ones
newer than their browser last saw, two at most, once, in a card in the corner
(`src/components/whats-new.tsx`).

## When a change gets an entry

Add one when someone using grok-bot.directory can do something new, or
something they already do now works differently: a new page, button or
setting; a new way to submit, edit, claim or find a listing; a rule that
changes what gets listed.

Don't add one for bug fixes, speed, refactors, admin or moderation tools,
tests, copy tweaks, or anything in `apps/cursor` only. If it's unclear whether
people would care, ask the user.

## Adding it

1. Put the entry at the **top** of `UPDATES`, in the same PR as the change, so
   it goes live in the same deploy.
2. Fill it in:

   ```ts
   {
     id: "claim-apps",
     date: "2026-11-23",
     title: "Claim your app",
     body: "If your app was added to the directory for you, it’s now yours to claim. Open its page and choose “Claim it”, then prove it with your GitHub account or a small file.",
     link: { href: "/?tab=apps", label: "Find your app" },
   },
   ```

   - `id`: kebab-case and unique. Browsers remember the newest id they've
     shown, so never change, reuse or delete an existing id.
   - `date`: the day it ships, Pacific time, `YYYY-MM-DD`.
   - `title`: what the person can do, in a few words, sentence case.
   - `body`: one or two plain sentences to the reader ("you", "your"), saying
     what they can do and where. No internal names, no jargon, no hype.
   - `link` (optional): a path on the site where they use it, with a short
     label.
3. Several things shipping the same day: one entry each, the most important
   first, since the card shows only the newest two. Fold small related
   changes into one entry.
4. Show the user the entry's wording before merging. It's public copy in
   their voice.
5. Check it: `bun run typecheck` and
   `bunx playwright test e2e/whats-new.spec.ts` from `apps/grok-bot` (the
   tests read `UPDATES`, so they need no edits for a new entry).

Mention the entry in the PR description, and after the deploy confirm it's on
https://grok-bot.directory/whats-new.
