-- Starring a plugin, called by the site's server for the signed-in member.
--
-- `toggle_plugin_star(plugin_id)` read the member from their own Data API
-- session (`auth.uid()`). The sites now make every database call from the
-- server with the secret key, where there is no such session, so this takes
-- the member as an argument. Only the server can call it.
create or replace function public.toggle_plugin_star_as(
  plugin_id_input uuid,
  user_id_input uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_inserted boolean := false;
  v_new_count integer;
begin
  if user_id_input is null then
    raise exception 'not authenticated'
      using errcode = '28000';
  end if;

  -- Serialize concurrent toggles for the same plugin.
  perform 1 from plugins where id = plugin_id_input for update;

  insert into plugin_stars (plugin_id, user_id)
  values (plugin_id_input, user_id_input)
  on conflict (plugin_id, user_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    delete from plugin_stars
    where plugin_id = plugin_id_input
      and user_id = user_id_input;
  end if;

  -- Derive star_count from count(*) so the cached value can't drift.
  update plugins
  set star_count = (
    select count(*) from plugin_stars where plugin_id = plugin_id_input
  )
  where id = plugin_id_input
  returning star_count into v_new_count;

  return jsonb_build_object(
    'starred', coalesce(v_inserted, false),
    'count', coalesce(v_new_count, 0)
  );
end;
$$;

revoke all on function public.toggle_plugin_star_as(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.toggle_plugin_star_as(uuid, uuid)
  to service_role;
