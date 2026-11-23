-- What a member may change by writing to the Data API as themselves.
--
-- Row-level security lets a member update their own rows in `plugins` and
-- `users`, and manage the components of their own plugins. It says which rows,
-- not which columns: a member could set any column of a row that was theirs,
-- including the ones only review, the security scan or an admin decides
-- (`active`, `scan_status`, `verified`, `install_count`,
-- `marketplace_plugin_id`, `is_ambassador`, `x_handle`), and could rewrite a
-- listed plugin's components after the scan had passed them.
--
-- These triggers leave the policies as they are and limit the columns. They
-- apply only to writes made as `authenticated` or `anon`, the roles the Data
-- API uses for a member and for nobody. The sites' servers write as
-- `service_role`, and the SQL functions members call for installs and stars
-- are SECURITY DEFINER, so they run as their owner and are unaffected.

-- plugins: a member publishes or unpublishes their own plugin (the Unpublish
-- and Publish buttons) and nothing else. Publishing needs a plugin the scan
-- has passed that isn't blocked. Everything else about a plugin changes
-- through the sites.
create or replace function public.guard_plugins_member_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  wanted_active boolean := new.active;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'Plugins are submitted through the site.'
      using errcode = '42501';
  end if;
  new := old;
  if wanted_active is distinct from old.active then
    if wanted_active and (
      old.permanently_blocked
      or old.scan_status is distinct from 'safe'
    ) then
      raise exception 'This plugin can''t be published until it has passed review.'
        using errcode = '42501';
    end if;
    new.active := wanted_active;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_plugins_member_write on public.plugins;
create trigger guard_plugins_member_write
  before insert or update on public.plugins
  for each row execute function public.guard_plugins_member_write();

-- plugin_components: what a plugin installs is what the scan reviewed. A
-- member's edits go through the sites, which queue the scan again. Deleting
-- their own plugin still removes its components: that cascade runs as the
-- table's owner, not as the member.
create or replace function public.guard_plugin_components_member_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'A plugin''s components are edited through the site.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists guard_plugin_components_member_write
  on public.plugin_components;
create trigger guard_plugin_components_member_write
  before insert or update or delete on public.plugin_components
  for each row execute function public.guard_plugin_components_member_write();

-- users: a member edits their own profile (name, bio, links, photo, whether
-- it's public). Who they are and what they've been granted stay as they were:
-- the email comes from their sign-in, the X handle from an X sign-in, and the
-- ambassador badge from an admin. Named to run before the trigger that reads
-- `email` to promote a pending ambassador.
create or replace function public.guard_users_member_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  new.id := old.id;
  new.email := old.email;
  new.created_at := old.created_at;
  new.is_ambassador := old.is_ambassador;
  new.x_handle := old.x_handle;
  return new;
end;
$$;

drop trigger if exists guard_users_member_write on public.users;
create trigger guard_users_member_write
  before update on public.users
  for each row execute function public.guard_users_member_write();
