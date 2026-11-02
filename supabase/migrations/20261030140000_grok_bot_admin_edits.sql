-- Web admin edits for Grok Bot Directory: admins can change a listed bot's
-- category from /admin, logged as action 'edit'.

alter table public.grok_bot_moderation_events
  drop constraint if exists grok_bot_moderation_events_action_check;
alter table public.grok_bot_moderation_events
  add constraint grok_bot_moderation_events_action_check
  check (action in ('list', 'decline', 'unlist', 'flag', 'rereview', 'edit'));
