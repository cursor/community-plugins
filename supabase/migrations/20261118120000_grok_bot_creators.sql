-- Creator profiles on the Grok Bot Directory: /creators/<handle> lists a
-- member's listed bots and apps.

-- A member's X handle as X reported it when they signed in with X. Members
-- type `social_x_link` themselves in the profile form, so it can't be the
-- address of a profile; this one is checked, so it can: /creators/@handle.
-- The Grok Bot Directory writes it on every X sign-in (src/lib/x-profile.ts).
alter table public.users
  add column if not exists x_handle text;

update public.users u
set x_handle = i.identity_data ->> 'user_name'
from auth.identities i
where i.user_id = u.id
  and i.provider = 'x'
  and u.x_handle is null
  and (i.identity_data ->> 'user_name') ~ '^[A-Za-z0-9_]{1,15}$'
  -- A handle two accounts have held goes to the one that signed in last.
  and not exists (
    select 1
    from auth.identities j
    where j.provider = 'x'
      and j.id <> i.id
      and lower(j.identity_data ->> 'user_name') = lower(i.identity_data ->> 'user_name')
      and coalesce(j.last_sign_in_at, j.created_at) > coalesce(i.last_sign_in_at, i.created_at)
  );

-- X handles don't differ by case.
create unique index if not exists users_x_handle_key
  on public.users (lower(x_handle));

-- A member's apps in the Grok Bot Directory: their plugins that are listed
-- and that Grok Bot can add. The same columns and rule as
-- list_grok_bot_apps(), for one owner, newest first. One JSON value, because
-- the hosted Data API caps a response's rows.
create or replace function public.grok_bot_creator_apps_json(p_owner uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
  from (
    select
      p.id, p.slug, p.name, p.description, p.logo, p.author_name, p.author_url,
      p.homepage, p.repository, p.verified, p.marketplace_plugin_id,
      case
        when cardinality(p.marketplace_categories) > 0 then p.marketplace_categories
        when p.app_category is not null then array[p.app_category]
        else '{}'::text[]
      end as categories,
      p.created_at,
      coalesce(array_agg(c.name order by c.sort_order) filter (where c.type = 'mcp_server'), '{}') as mcp_servers,
      coalesce(array_agg(c.name order by c.sort_order) filter (where c.type = 'skill'), '{}') as skills
    from public.plugins p
    left join public.plugin_components c on c.plugin_id = p.id
    where p.owner_id = p_owner
      and p.active
      and p.grok_bot_addable
      and not ('grok_bot' = any (p.unavailable_in))
    group by p.id
    having count(c.id) filter (where c.type in ('mcp_server', 'skill')) > 0
      or count(c.id) filter (where c.type in ('rule', 'hook', 'command', 'agent', 'lsp_server')) = 0
  ) a;
$$;

revoke execute on function public.grok_bot_creator_apps_json(uuid) from public, anon, authenticated;
grant execute on function public.grok_bot_creator_apps_json(uuid) to service_role;

-- Every member with a public profile and at least one listed bot or app, for
-- the sitemap: their profile's slug, their X handle, how many listings they
-- have and when the newest was listed.
create or replace function public.grok_bot_creators_json()
returns jsonb
language sql
stable
set search_path = public
as $$
  with listed as (
    select b.owner_id, count(*) as n, max(coalesce(b.reviewed_at, b.submitted_at)) as at
    from public.grok_bots b
    where b.status = 'listed' and b.owner_id is not null
    group by b.owner_id
    union all
    select p.owner_id, count(*), max(a.created_at)
    from public.list_grok_bot_apps() a
    join public.plugins p on p.id = a.id
    where p.owner_id is not null
    group by p.owner_id
  ),
  totals as (
    select owner_id, sum(n)::int as n, max(at) as at
    from listed
    group by owner_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('slug', u.slug, 'x_handle', u.x_handle, 'listings', t.n, 'updated_at', t.at)
      order by t.n desc, u.slug
    ),
    '[]'::jsonb
  )
  from totals t
  join public.users u on u.id = t.owner_id
  where u.public;
$$;

revoke execute on function public.grok_bot_creators_json() from public, anon, authenticated;
grant execute on function public.grok_bot_creators_json() to service_role;
