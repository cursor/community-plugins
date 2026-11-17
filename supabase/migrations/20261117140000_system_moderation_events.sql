-- Moderation by a scheduled job has no admin behind it: the weekly clean-up
-- unpublishes plugins whose GitHub repository has gone away
-- (packages/plugins/src/stale.ts). Such events have source 'system' and no
-- actor; every other event still needs one.
alter table public.plugin_moderation_events
  alter column actor_id drop not null;

alter table public.plugin_moderation_events
  drop constraint if exists plugin_moderation_events_source_check;
alter table public.plugin_moderation_events
  add constraint plugin_moderation_events_source_check
  check (source in ('web', 'mcp', 'system'));

alter table public.plugin_moderation_events
  drop constraint if exists plugin_moderation_events_actor_check;
alter table public.plugin_moderation_events
  add constraint plugin_moderation_events_actor_check
  check (actor_id is not null or source = 'system');
