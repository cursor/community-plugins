-- AI review for Grok Bot Directory submissions (apps/grok-bot), mirroring the
-- cursor.directory plugin security scan: every submission gets a Grok 4.7
-- review; safe bots are listed automatically, flagged ones wait for an admin.

alter table public.grok_bots
  add column if not exists ai_review_status text
    check (ai_review_status in ('queued', 'reviewing', 'safe', 'flagged', 'error')),
  -- { verdict, severity, categories, reasons, summary, model } or { error }.
  add column if not exists ai_review jsonb,
  add column if not exists ai_reviewed_at timestamptz,
  add column if not exists ai_review_attempts integer not null default 0,
  add column if not exists ai_review_started_at timestamptz;

create index if not exists grok_bots_ai_review_status_idx
  on public.grok_bots (ai_review_status)
  where status = 'pending';

-- Near-duplicate names, as context for the reviewer (see
-- find_similar_plugins). A similar name alone isn't disqualifying; the
-- reviewer decides.
create extension if not exists pg_trgm with schema extensions;

create index if not exists grok_bots_name_trgm_idx
  on public.grok_bots
  using gin (name extensions.gin_trgm_ops);

create or replace function public.find_similar_grok_bots(
  p_bot_id uuid,
  p_threshold real default 0.5,
  p_limit int default 5
)
returns table (id uuid, name text, slug text, status text, description text, similarity real)
language sql
stable
set search_path = public, extensions
as $$
  with src as (select id, name from public.grok_bots where id = p_bot_id)
  select b.id, b.name, b.slug, b.status, b.description,
    extensions.similarity(b.name, src.name) as similarity
  from public.grok_bots b
  cross join src
  where b.id <> src.id
    and b.status in ('listed', 'pending')
    and extensions.similarity(b.name, src.name) > p_threshold
  order by similarity desc
  limit p_limit;
$$;

revoke execute on function public.find_similar_grok_bots(uuid, real, int) from public, anon, authenticated;
grant execute on function public.find_similar_grok_bots(uuid, real, int) to service_role;

-- The AI reviewer records its decisions too: 'list' when it auto-lists a
-- safe bot, 'flag' when it holds one for an admin. It has no user id.
alter table public.grok_bot_moderation_events alter column actor_id drop not null;

alter table public.grok_bot_moderation_events
  drop constraint if exists grok_bot_moderation_events_source_check;
alter table public.grok_bot_moderation_events
  add constraint grok_bot_moderation_events_source_check
  check (source in ('web', 'mcp', 'ai'));

alter table public.grok_bot_moderation_events
  drop constraint if exists grok_bot_moderation_events_action_check;
alter table public.grok_bot_moderation_events
  add constraint grok_bot_moderation_events_action_check
  check (action in ('list', 'decline', 'unlist', 'flag', 'rereview'));

alter table public.grok_bot_moderation_events
  drop constraint if exists grok_bot_moderation_events_actor_check;
alter table public.grok_bot_moderation_events
  add constraint grok_bot_moderation_events_actor_check
  check (source = 'ai' or actor_id is not null);
