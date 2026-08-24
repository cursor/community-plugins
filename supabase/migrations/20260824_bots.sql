create table if not exists public.bots (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text not null,
  writeup text not null,
  template text not null,
  needs jsonb not null default '[]'::jsonb,
  repository text,
  homepage text,
  logo text,
  owner_id uuid references public.users (id) on delete set null,
  active boolean not null default false,
  scan_status text not null default 'pending'
    check (scan_status in (
      'pending',
      'scanning',
      'safe',
      'flagged',
      'error',
      'unscanned'
    )),
  discovery_source text,
  github_repo_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bots_needs_is_array check (jsonb_typeof(needs) = 'array')
);

create unique index if not exists bots_github_repo_id_unique
  on public.bots (github_repo_id)
  where github_repo_id is not null;

create index if not exists bots_active_created_at_idx
  on public.bots (created_at desc)
  where active = true;

do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'generate_bot_slug'
  ) then
    create function public.generate_bot_slug()
    returns trigger
    language plpgsql
    set search_path = public
    as $fn$
    declare
      v_slug text;
    begin
      if new.slug is not null and new.slug <> '' then
        return new;
      end if;
      v_slug := btrim(regexp_replace(lower(new.name), '[^a-z0-9]+', '-', 'g'), '-');
      if v_slug is null or v_slug = '' then
        v_slug := 'bot';
      end if;
      v_slug := left(v_slug, 80);
      if exists (select 1 from public.bots b where b.slug = v_slug) then
        v_slug := left(v_slug, 73) || '-' || substr(md5(random()::text), 1, 6);
      end if;
      new.slug := v_slug;
      return new;
    end;
    $fn$;
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'bots_generate_slug') then
    create trigger bots_generate_slug
      before insert on public.bots
      for each row execute function public.generate_bot_slug();
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) and not exists (
    select 1 from pg_trigger where tgname = 'bots_set_updated_at'
  ) then
    create trigger bots_set_updated_at
      before update on public.bots
      for each row execute function public.set_updated_at();
  end if;
end$$;

alter table public.bots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bots'
      and policyname = 'bots_select_active_or_own'
  ) then
    create policy bots_select_active_or_own on public.bots
      for select using (active = true or (select auth.uid()) = owner_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bots'
      and policyname = 'bots_insert_own'
  ) then
    create policy bots_insert_own on public.bots
      for insert to authenticated
      with check ((select auth.uid()) = owner_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bots'
      and policyname = 'bots_update_own'
  ) then
    create policy bots_update_own on public.bots
      for update to authenticated
      using ((select auth.uid()) = owner_id)
      with check ((select auth.uid()) = owner_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bots'
      and policyname = 'bots_delete_own'
  ) then
    create policy bots_delete_own on public.bots
      for delete to authenticated using ((select auth.uid()) = owner_id);
  end if;
end$$;

-- Editorial seed so /bots and generateStaticParams have one use-case page
-- on an empty database. Idempotent on slug.
insert into public.bots (
  name,
  slug,
  description,
  writeup,
  template,
  needs,
  repository,
  active,
  scan_status,
  discovery_source
)
values (
  'Review a pull request',
  'review-a-pull-request',
  'Paste this template into Cursor, install the plugins it lists, and review a GitHub pull request from the agent chat.',
  $writeup$
Review a pull request from Cursor without leaving the editor.

This page is a use-case listing, not a plugin. It ships a copyable bot template, the plugins and skills that template expects, and the steps to run it. Search engines should rank this URL for the job (review a PR in Cursor), not for a plugin name.

A bot listing is not an Open Plugins agent file. `agents/*.md` in a repo is a plugin component. Submit that repo at /plugins/new. Submit a bot when the repo describes a use case: a template someone can copy, plus the plugins or skills it needs.

How it works

Copy the template on this page. Paste it into Cursor agent chat. Install any listed plugins you do not already have. Then give the agent the pull request URL or the local branch.

What to ask the agent

Name the files that changed. Ask it to check tests, error handling, and secrets. Ask it to say what it would not merge, and why.
$writeup$,
  $template$
You are reviewing a GitHub pull request in this repo.

1. Identify the PR (URL, branch, or `gh pr view` output I paste).
2. Summarize the change in three sentences or fewer.
3. List the files that matter and what each one does in this diff.
4. Call out bugs, missing tests, secret leaks, and API contract breaks.
5. Say whether you would merge, request changes, or reject. Give one reason.

Do not invent files that are not in the diff. If you cannot see the PR, ask me for the URL.
$template$,
  '[
    {"kind":"plugin","name":"GitHub","slug":"github"},
    {"kind":"skill","name":"code-review"}
  ]'::jsonb,
  'https://github.com/cursor/community-plugins',
  true,
  'unscanned',
  'seed:cursor-directory'
)
on conflict (slug) do nothing;
