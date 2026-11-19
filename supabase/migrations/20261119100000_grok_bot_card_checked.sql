-- Listings are kept in step with the bot's card on x.ai: its owner can
-- refresh one, and a scheduled job goes round all of them. This is when a
-- listing was last compared with its card, so the job takes the ones it
-- hasn't looked at for longest.
alter table public.grok_bots
  add column if not exists card_checked_at timestamptz;
