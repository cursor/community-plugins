-- A category for every app (plugins Grok Bot can use), so the Grok Bot
-- Directory's category filters cover community apps too. Official apps keep
-- the marketplace's own (marketplace_categories, owned by the marketplace
-- sync); the security scan picks one of the same ids for every other plugin.
-- The ids are packages/plugins/src/apps.ts APP_CATEGORIES.

alter table public.plugins
  add column if not exists app_category text;

alter table public.plugins
  drop constraint if exists plugins_app_category_check;
alter table public.plugins
  add constraint plugins_app_category_check
  check (app_category is null or app_category ~ '^[A-Z][A-Z_]*$');

create or replace function public.list_grok_bot_apps()
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
  skills text[]
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
    coalesce(array_agg(c.name order by c.sort_order) filter (where c.type = 'skill'), '{}')
  from public.plugins p
  left join public.plugin_components c on c.plugin_id = p.id
  where p.active
    and not ('grok_bot' = any (p.unavailable_in))
  group by p.id
  having count(c.id) filter (where c.type in ('mcp_server', 'skill')) > 0
    or count(c.id) filter (where c.type in ('rule', 'hook', 'command', 'agent', 'lsp_server')) = 0;
$$;

grant execute on function public.list_grok_bot_apps() to anon, authenticated, service_role;

-- Every app as one JSON array: one row, so it isn't cut off by the Data
-- API's max_rows (100 on the hosted project), and one query instead of a
-- page per 100 apps.
create or replace function public.list_grok_bot_apps_json()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
  from public.list_grok_bot_apps() a;
$$;

revoke execute on function public.list_grok_bot_apps_json() from public, anon, authenticated;
grant execute on function public.list_grok_bot_apps_json() to service_role;
