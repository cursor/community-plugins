-- The Grok Bot Directory's Apps tab becomes one ranked list (Trending, Top,
-- New), like bots. Apps are cursor.directory's plugins, and those already
-- count installs (plugins.install_count, with daily snapshots and
-- plugin_install_velocity for the last 30 days), so the list ranks by the
-- same numbers. "Add to Grok Bot" on an app counts into them too, through
-- increment_install_count.

-- The apps list, now with each app's installs and its installs in the last
-- 30 days. The return type changes, so the function is dropped first; the
-- functions that read it are plain SQL and pick the new columns up.
drop function if exists public.list_grok_bot_apps();

create function public.list_grok_bot_apps()
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  logo text,
  author_name text,
  author_url text,
  homepage text,
  repository text,
  verified boolean,
  marketplace_plugin_id text,
  categories text[],
  created_at timestamptz,
  mcp_servers text[],
  skills text[],
  installs integer,
  installs_recent integer
)
language sql
stable
set search_path = public
as $$
  select
    p.id, p.slug, p.name, p.description, p.logo, p.author_name, p.author_url,
    p.homepage, p.repository, p.verified, p.marketplace_plugin_id,
    case
      when cardinality(p.marketplace_categories) > 0 then p.marketplace_categories
      when p.app_category is not null then array[p.app_category]
      else '{}'::text[]
    end,
    p.created_at,
    coalesce(array_agg(c.name order by c.sort_order) filter (where c.type = 'mcp_server'), '{}'),
    coalesce(array_agg(c.name order by c.sort_order) filter (where c.type = 'skill'), '{}'),
    coalesce(p.install_count, 0),
    coalesce(max(v.installs_window), 0)
  from public.plugins p
  left join public.plugin_components c on c.plugin_id = p.id
  left join public.plugin_install_velocity(30) v on v.plugin_id = p.id
  where p.active
    and p.grok_bot_addable
    and not ('grok_bot' = any (p.unavailable_in))
  group by p.id
  having count(c.id) filter (where c.type in ('mcp_server', 'skill')) > 0
    or count(c.id) filter (where c.type in ('rule', 'hook', 'command', 'agent', 'lsp_server')) = 0;
$$;

grant execute on function public.list_grok_bot_apps() to anon, authenticated, service_role;

-- The first rows of the Apps list in Trending order: installs in the last 30
-- days, then all installs, then newest. Replaces grok_bot_apps_first_page (a
-- random pick of official and of community apps), which stays until nothing
-- deployed calls it.
--
-- p_category limits the rows and `total` to one category. p_exclude leaves
-- one app out (an app page's "more in this category"). all_total always
-- counts every app.
create or replace function public.grok_bot_apps_page(
  p_limit int default 60,
  p_category text default null,
  p_exclude uuid default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with apps as materialized (
    select a.* from public.list_grok_bot_apps() a
  ),
  picked as materialized (
    select a.* from apps a
    where (p_category is null or p_category = any (a.categories))
      and (p_exclude is null or a.id <> p_exclude)
  ),
  top as (
    select p.* from picked p
    order by p.installs_recent desc, p.installs desc, p.created_at desc, p.slug
    limit greatest(p_limit, 0)
  )
  select jsonb_build_object(
    'apps', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.installs_recent desc,
        t.installs desc, t.created_at desc, t.slug)
      from top t
    ), '[]'::jsonb),
    'total', (select count(*) from picked),
    'all_total', (select count(*) from apps)
  );
$$;

revoke execute on function public.grok_bot_apps_page(int, text, uuid) from public, anon, authenticated;
grant execute on function public.grok_bot_apps_page(int, text, uuid) to service_role;

-- A member's apps on their profile, now with each app's installs. Filtered
-- by owner before anything is joined, since a profile shows a handful.
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
      coalesce(array_agg(c.name order by c.sort_order) filter (where c.type = 'skill'), '{}') as skills,
      coalesce(p.install_count, 0) as installs
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
