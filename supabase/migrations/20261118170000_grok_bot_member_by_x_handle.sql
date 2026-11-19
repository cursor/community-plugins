-- A profile's address is the member's X handle in any capitalisation
-- (/u/KevinRose and /u/kevinrose are the same person). The site looked the
-- handle up with ILIKE, which can't use users_x_handle_key (an index on
-- lower(x_handle)), so every profile view read the whole users table. This
-- asks the way the index is built.
create or replace function public.grok_bot_member_by_x_handle(p_handle text)
returns setof public.users
language sql
stable
set search_path = public
as $$
  select u.*
  from public.users u
  where lower(u.x_handle) = lower(p_handle)
    and u.public
  limit 1;
$$;

revoke execute on function public.grok_bot_member_by_x_handle(text) from public, anon, authenticated;
grant execute on function public.grok_bot_member_by_x_handle(text) to service_role;
