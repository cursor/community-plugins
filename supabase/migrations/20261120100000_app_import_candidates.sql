-- Apps waiting to be added to the directories in bulk. The Grok Bot
-- Directory's import-apps job (apps/grok-bot/src/app/api/cron/import-apps)
-- works through them a few at a time, so a large import doesn't depend on
-- anyone's machine. Each row is a candidate as apps/grok-bot/src/lib/
-- app-import.ts takes it, plus where it got to.
create table if not exists public.app_import_candidates (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('repo', 'server')),
  -- "owner/name", or the server's address as submitted.
  key text not null unique,
  name text not null default '',
  description text not null default '',
  logo text not null default '',
  homepage text not null default '',
  cursor boolean not null default false,
  shared_name boolean not null default false,
  publisher text,
  rename text,
  slug text,
  allow_same_name boolean not null default false,
  -- Which load it came in with, and which go first (higher first).
  batch text not null default '',
  priority integer not null default 0,
  -- Null until it's settled: added, or the reason it wasn't.
  outcome text,
  detail jsonb,
  attempts integer not null default 0,
  attempted_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_import_candidates_waiting
  on public.app_import_candidates (priority desc, id)
  where outcome is null;

-- Only the service role reads or writes it.
alter table public.app_import_candidates enable row level security;
