-- The Grok Bot Directory admin's app lists (apps/grok-bot/src/data/
-- app-moderation.ts): filtering to plugins Grok Bot can use, searching,
-- ordering and paging happen here, so each page is exact however many
-- plugins there are (the Data API returns at most 100 rows per request).

-- The admin tab a plugin Grok Bot can use is in, or null.
create or replace function public.grok_bot_admin_app_tab(p public.plugins)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when not p.active and not p.permanently_blocked
      and p.scan_status in ('flagged', 'error', 'pending', 'scanning') then 'queue'
    when p.active and p.marketplace_plugin_id is null then 'listed'
    when not p.active
      and (p.permanently_blocked or p.scan_status in ('safe', 'unscanned')) then 'removed'
  end;
$$;

create or replace function public.grok_bot_admin_apps_usable()
returns setof public.plugins
language sql
stable
set search_path = public
as $$
  select p.*
  from public.plugins p
  where not ('grok_bot' = any (p.unavailable_in))
    and (
      exists (
        select 1 from public.plugin_components c
        where c.plugin_id = p.id and c.type in ('mcp_server', 'skill')
      )
      or not exists (
        select 1 from public.plugin_components c
        where c.plugin_id = p.id
          and c.type in ('rule', 'hook', 'command', 'agent', 'lsp_server')
      )
    );
$$;

-- One page of a tab: ids in display order, with the tab's total (matching
-- p_query, when given). The queue puts flagged scans first, then failed,
-- stuck (pending or scanning for 15 minutes) and in-progress ones.
create or replace function public.list_grok_bot_admin_apps(
  p_tab text,
  p_query text default null,
  p_limit int default 25,
  p_offset int default 0
)
returns table (id uuid, total bigint)
language sql
stable
set search_path = public
as $$
  select p.id, count(*) over () as total
  from public.grok_bot_admin_apps_usable() p
  where public.grok_bot_admin_app_tab(p) = p_tab
    and (
      coalesce(btrim(p_query), '') = ''
      or p.name ilike '%' || btrim(p_query) || '%'
      or p.slug ilike '%' || btrim(p_query) || '%'
      or p.repository ilike '%' || btrim(p_query) || '%'
    )
  order by
    case when p_tab = 'queue' then
      case
        when p.scan_status = 'flagged' then 0
        when p.scan_status = 'error' then 1
        when p.updated_at < now() - interval '15 minutes' then 2
        when p.scan_status = 'scanning' then 3
        else 4
      end
    end,
    case when p_tab = 'queue' then
      case p.flag_severity when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end
    end,
    p.updated_at desc,
    p.id
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

create or replace function public.count_grok_bot_admin_apps()
returns table (queue bigint, listed bigint, removed bigint)
language sql
stable
set search_path = public
as $$
  select
    count(*) filter (where t = 'queue'),
    count(*) filter (where t = 'listed'),
    count(*) filter (where t = 'removed')
  from (
    select public.grok_bot_admin_app_tab(p) as t
    from public.grok_bot_admin_apps_usable() p
  ) tabs;
$$;

revoke execute on function public.grok_bot_admin_app_tab(public.plugins) from public, anon, authenticated;
revoke execute on function public.grok_bot_admin_apps_usable() from public, anon, authenticated;
revoke execute on function public.list_grok_bot_admin_apps(text, text, int, int) from public, anon, authenticated;
revoke execute on function public.count_grok_bot_admin_apps() from public, anon, authenticated;
grant execute on function public.grok_bot_admin_app_tab(public.plugins) to service_role;
grant execute on function public.grok_bot_admin_apps_usable() to service_role;
grant execute on function public.list_grok_bot_admin_apps(text, text, int, int) to service_role;
grant execute on function public.count_grok_bot_admin_apps() to service_role;
