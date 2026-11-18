-- Official plugins from the Cursor plugin marketplace, imported into plugins
-- so cursor.directory and the Grok Bot Directory (apps/grok-bot, where
-- plugins are called "Apps") list them alongside community plugins. The
-- import (cursor.directory's /api/cron/sync-marketplace-plugins) owns these
-- columns; community plugins leave them at their defaults.

alter table public.plugins
  add column if not exists marketplace_plugin_id text,
  -- The marketplace's updatedAt, so a sync only rewrites changed plugins.
  add column if not exists marketplace_updated_at timestamptz,
  -- The marketplace's curated category keys (PRODUCTIVITY, PAYMENTS, ...).
  add column if not exists marketplace_categories text[] not null default '{}',
  -- Clients a plugin doesn't work in. The marketplace marks some plugins as
  -- Cursor-only or Grok Bot-only; each site hides the ones naming it.
  add column if not exists unavailable_in text[] not null default '{}';

create unique index if not exists plugins_marketplace_plugin_id_key
  on public.plugins (marketplace_plugin_id)
  where marketplace_plugin_id is not null;

alter table public.plugins
  drop constraint if exists plugins_unavailable_in_check;
alter table public.plugins
  add constraint plugins_unavailable_in_check
  check (unavailable_in <@ array['cursor', 'grok_bot']::text[]);

-- Every active plugin that works in Grok Bot, with its MCP server and skill
-- names, for the Grok Bot Directory's Apps tab. Grok Bot's own rule: a plugin
-- is usable when it has MCP servers or skills, or has none of the parts only
-- Cursor runs (rules, hooks, commands, subagents, LSP servers).
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
    p.marketplace_categories, p.created_at,
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
