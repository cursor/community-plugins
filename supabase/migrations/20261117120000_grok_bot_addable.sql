-- Whether Grok Bot can add a plugin as it is stored: an official app (added
-- through the marketplace), or a community plugin whose MCP servers all have
-- a setup that works as written and whose skills all have their SKILL.md.
-- The rule lives in packages/plugins/src/grok-bot-add.ts; both directories
-- write this column whenever a plugin's components or marketplace link
-- change, and `bun run refresh:grok-bot-addable` (apps/cursor) fills it in
-- for existing plugins. It is false until then, so a plugin nobody has
-- checked stays out of the Grok Bot Directory rather than showing a page
-- with no way to add it.
alter table public.plugins
  add column if not exists grok_bot_addable boolean not null default false;

update public.plugins
set grok_bot_addable = true
where marketplace_plugin_id is not null
  and not grok_bot_addable;

-- The Grok Bot Directory's apps: as before, and only those it can add.
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
    and p.grok_bot_addable
    and not ('grok_bot' = any (p.unavailable_in))
  group by p.id
  having count(c.id) filter (where c.type in ('mcp_server', 'skill')) > 0
    or count(c.id) filter (where c.type in ('rule', 'hook', 'command', 'agent', 'lsp_server')) = 0;
$$;
