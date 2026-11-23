-- The database answers only to the sites' servers.
--
-- Both sites read and write through the Data API from their servers, with the
-- secret key (`service_role`), and check who is signed in themselves. Nothing
-- reads or writes tables with the publishable key any more: not the browser,
-- and not a member's own session. So the two roles that key maps to, `anon`
-- (nobody signed in) and `authenticated` (a member), lose every privilege on
-- `public`. Row-level security stays on as a second lock.
--
-- Signing in, and uploading a picture to storage, don't go through these
-- tables and are unaffected.
--
-- Run this only once every deployment that used the publishable key for data
-- is gone.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Functions are executable by everyone unless that is taken away, and `anon`
-- and `authenticated` inherit it. Triggers still fire: a trigger's function
-- isn't checked against the role whose write fired it.
revoke execute on all functions in schema public
  from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Replaced by toggle_plugin_star_as, which the server calls for the member.
drop function if exists public.toggle_plugin_star(uuid);

-- New tables and sequences start out closed too, so one added later isn't
-- exposed by default. Postgres still lets everyone execute a new function
-- (that default can't be changed for one schema), which is harmless for a
-- function that runs as its caller, since the caller can't touch a table. A
-- new SECURITY DEFINER function must say
-- `revoke all on function ... from public` itself.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;
