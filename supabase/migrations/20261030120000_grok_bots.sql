-- Grok Bot Directory (apps/grok-bot) shares this project with cursor.directory.
-- It reuses public.users (members and profiles), public.admins and Supabase
-- Auth; bots live in their own tables so no plugin query, policy or queue can
-- ever see them.
--
-- A bot is a public Grok Bot template, keyed by its share id
-- (x.ai/bot/{share_id}). Name, description and avatar are copied from the
-- public template at submission (GetPublicGrokBotTemplate) so pages never
-- depend on a live fetch.

create table if not exists public.grok_bots (
  id uuid primary key default gen_random_uuid(),
  share_id text not null unique check (share_id ~ '^[A-Za-z0-9_-]{10,40}$'),
  slug text not null unique,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  avatar_shape text not null,
  avatar_color text not null,
  category text not null,
  -- pending: waiting for review; listed: public; declined: rejected with a
  -- note; unlisted: taken down after listing.
  status text not null default 'pending'
    check (status in ('pending', 'listed', 'declined', 'unlisted')),
  review_note text,
  -- submission: a signed-in member submitted it; marketplace: imported from
  -- the official x.ai/bot marketplace.
  source text not null default 'submission' check (source in ('submission', 'marketplace')),
  owner_id uuid references public.users (id) on delete set null,
  -- Display byline. Marketplace imports carry the creator from x.ai; member
  -- submissions show the owner's profile instead.
  creator_name text,
  creator_image text,
  creator_x_handle text,
  install_count integer not null default 0,
  template_updated_at timestamptz,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grok_bots_status_idx on public.grok_bots (status);
create index if not exists grok_bots_owner_idx on public.grok_bots (owner_id);
create index if not exists grok_bots_category_idx on public.grok_bots (category) where status = 'listed';

create or replace function public.set_grok_bots_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists grok_bots_set_updated_at on public.grok_bots;
create trigger grok_bots_set_updated_at
  before update on public.grok_bots
  for each row execute function public.set_grok_bots_updated_at();

-- Listed bots are world-readable; owners also read their own submissions in
-- any status. All writes go through the app's service-role client, which
-- validates the share link first, so there are no insert/update policies.
alter table public.grok_bots enable row level security;

drop policy if exists grok_bots_select_listed_or_own on public.grok_bots;
create policy grok_bots_select_listed_or_own on public.grok_bots
  for select using (status = 'listed' or (select auth.uid()) = owner_id);

grant select on table public.grok_bots to anon, authenticated;
revoke insert, update, delete on table public.grok_bots from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Installs: "Add to Grok Bot" clicks, counted like plugin installs.
-- ---------------------------------------------------------------------------
create or replace function public.increment_grok_bot_install_count(bot_id_input uuid)
returns void
language sql
set search_path = public
as $$
  update public.grok_bots
    set install_count = install_count + 1
    where id = bot_id_input and status = 'listed';
$$;

-- Service role only, so anon/authenticated callers can't inflate counts.
revoke execute on function public.increment_grok_bot_install_count(uuid) from public, anon, authenticated;
grant execute on function public.increment_grok_bot_install_count(uuid) to service_role;

create table if not exists public.grok_bot_install_snapshots (
  bot_id uuid not null references public.grok_bots (id) on delete cascade,
  snapshot_date date not null,
  install_count integer not null,
  primary key (bot_id, snapshot_date)
);

create index if not exists grok_bot_install_snapshots_date_idx
  on public.grok_bot_install_snapshots (snapshot_date desc);

alter table public.grok_bot_install_snapshots enable row level security;
revoke all on table public.grok_bot_install_snapshots from anon, authenticated;

-- Installs over the last `window_days`, for Trending. Same rules as
-- plugin_install_velocity: bots younger than the window count every install,
-- older ones the delta from the snapshot `window_days` ago (or the earliest
-- one we have), clamped at 0.
create or replace function public.grok_bot_install_velocity(window_days int default 30)
returns table (bot_id uuid, installs_window int)
language sql
stable
set search_path = public
as $$
  with target as (
    select
      b.id as bot_id,
      b.install_count as current_count,
      coalesce(b.reviewed_at, b.created_at)::date as listed_date,
      coalesce(
        (
          select s.install_count from public.grok_bot_install_snapshots s
          where s.bot_id = b.id and s.snapshot_date <= (current_date - window_days)
          order by s.snapshot_date desc limit 1
        ),
        (
          select s.install_count from public.grok_bot_install_snapshots s
          where s.bot_id = b.id
          order by s.snapshot_date asc limit 1
        )
      ) as baseline
    from public.grok_bots b
    where b.status = 'listed'
  )
  select
    bot_id,
    case
      when listed_date >= (current_date - window_days) then current_count
      else greatest(current_count - coalesce(baseline, current_count), 0)::int
    end as installs_window
  from target;
$$;

grant execute on function public.grok_bot_install_velocity(int) to anon, authenticated, service_role;

create or replace function public.snapshot_grok_bot_installs()
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into public.grok_bot_install_snapshots (bot_id, snapshot_date, install_count)
  select id, current_date, install_count
  from public.grok_bots
  where status = 'listed'
  on conflict (bot_id, snapshot_date) do update
    set install_count = excluded.install_count;

  delete from public.grok_bot_install_snapshots
  where snapshot_date < current_date - interval '400 days';
end;
$$;

revoke execute on function public.snapshot_grok_bot_installs() from public, anon, authenticated;

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'grok-bot-install-daily-snapshot') then
    perform cron.unschedule('grok-bot-install-daily-snapshot');
  end if;
end$$;

select cron.schedule(
  'grok-bot-install-daily-snapshot',
  '10 0 * * *',
  $$ select public.snapshot_grok_bot_installs(); $$
);

-- ---------------------------------------------------------------------------
-- Moderation audit trail (web admin and the Community Plugins MCP server).
-- Append-only, service role only; no foreign keys so history survives
-- deletions, mirroring plugin_moderation_events.
-- ---------------------------------------------------------------------------
create table if not exists public.grok_bot_moderation_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  bot_id uuid not null,
  bot_slug text not null,
  action text not null check (action in ('list', 'decline', 'unlist')),
  actor_id uuid not null,
  source text not null check (source in ('web', 'mcp')),
  -- OAuth client for MCP writes.
  client_id text,
  reason text,
  before jsonb,
  after jsonb
);

create index if not exists grok_bot_moderation_events_bot_idx
  on public.grok_bot_moderation_events (bot_id, created_at desc);

alter table public.grok_bot_moderation_events enable row level security;
revoke all on table public.grok_bot_moderation_events from anon, authenticated;

create or replace function public.prevent_grok_bot_moderation_event_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'grok_bot_moderation_events is append-only';
end;
$$;

drop trigger if exists grok_bot_moderation_events_append_only on public.grok_bot_moderation_events;
create trigger grok_bot_moderation_events_append_only
  before update or delete on public.grok_bot_moderation_events
  for each row execute function public.prevent_grok_bot_moderation_event_changes();
