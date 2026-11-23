-- Keep `public` closed, whatever is added to it later.
--
-- The publishable key already has no privileges on `public`
-- (20261123230000_server_only_data_api.sql). This removes what would open it
-- again by accident, and makes closed the default for anything new.

-- The row-level policies were written for members reading and writing as
-- themselves. Nothing does that any more, and a policy only matters once a
-- role has a grant: left in place, each one would come back to life the day a
-- grant did. With row-level security on and no policy, a role with a grant
-- still gets no rows. The servers' role bypasses row-level security.
do $$
declare
  p record;
  t record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format(
      'drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename
    );
  end loop;

  for t in
    select c.oid::regclass as name
    from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  loop
    execute format('alter table %s enable row level security', t.name);
  end loop;
end
$$;

-- A function without a fixed search_path looks names up in its caller's, so
-- whoever calls it decides which `users` or `slugify` it means. `extensions`
-- is where unaccent lives, which slugify uses.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) c
        where c like 'search_path=%'
      )
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format(
      'alter function %s set search_path = public, extensions', f.signature
    );
  end loop;
end
$$;

-- The queue wrappers are the other schema the Data API serves. The
-- publishable key couldn't call them; now it can't see the schema either.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'pgmq_public') then
    revoke usage on schema pgmq_public from anon, authenticated;
  end if;
end
$$;

-- New tables and functions in `public` close themselves. A table gets
-- row-level security and no grants for the publishable key; a function can be
-- called only by the servers. Default privileges already do most of this for
-- objects the migration role creates; this covers the rest (a table made from
-- the dashboard, a function's built-in "everyone may execute") and doesn't
-- depend on anyone remembering. A failure here is a warning, never a reason
-- for the DDL itself to fail.
create or replace function public.keep_public_schema_closed()
returns event_trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  obj record;
begin
  for obj in select * from pg_event_trigger_ddl_commands() loop
    begin
      if obj.schema_name = 'public' and obj.object_type = 'table' then
        execute format(
          'alter table %s enable row level security', obj.object_identity
        );
        execute format(
          'revoke all on table %s from anon, authenticated',
          obj.object_identity
        );
      elsif obj.schema_name = 'public' and obj.object_type = 'function' then
        execute format(
          'revoke all on function %s from public, anon, authenticated',
          obj.object_identity
        );
        execute format(
          'grant execute on function %s to service_role', obj.object_identity
        );
      end if;
    exception when others then
      raise warning 'keep_public_schema_closed: could not close %: %',
        obj.object_identity, sqlerrm;
    end;
  end loop;
end;
$$;

drop event trigger if exists keep_public_schema_closed;
create event trigger keep_public_schema_closed
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'CREATE FUNCTION')
  execute function public.keep_public_schema_closed();

-- Uploads are pictures: profile photos, covers and logos. The bucket took
-- any file type.
update storage.buckets
set allowed_mime_types = array['image/*']
where id = 'avatars';
