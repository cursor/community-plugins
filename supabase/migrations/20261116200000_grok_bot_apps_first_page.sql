-- The first rows of the Grok Bot Directory's Apps list, so a page doesn't
-- load every app to show sixty: a random pick of official and of community
-- apps (apps aren't ranked; each visit gets a fresh order), with the totals.
-- The full list (list_grok_bot_apps_json) is only fetched when someone
-- searches or asks for more.
--
-- p_category limits the pick and its totals to one category. p_exclude leaves
-- one app out (an app page's "more in this category"). all_total always
-- counts every app.
create or replace function public.grok_bot_apps_first_page(
  p_limit int default 60,
  p_category text default null,
  p_exclude uuid default null
)
returns jsonb
language sql
volatile
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
  official as (
    select p.* from picked p
    where p.marketplace_plugin_id is not null
    order by random()
    limit greatest(p_limit, 0)
  ),
  community as (
    select p.* from picked p
    where p.marketplace_plugin_id is null
    order by random()
    limit greatest(p_limit, 0)
  )
  select jsonb_build_object(
    'official', coalesce((select jsonb_agg(to_jsonb(o)) from official o), '[]'::jsonb),
    'community', coalesce((select jsonb_agg(to_jsonb(c)) from community c), '[]'::jsonb),
    'official_total', (select count(*) from picked where marketplace_plugin_id is not null),
    'community_total', (select count(*) from picked where marketplace_plugin_id is null),
    'all_total', (select count(*) from apps)
  );
$$;

revoke execute on function public.grok_bot_apps_first_page(int, text, uuid) from public, anon, authenticated;
grant execute on function public.grok_bot_apps_first_page(int, text, uuid) to service_role;
