-- Members no longer write to storage themselves.
--
-- A signed-in member could put a file anywhere in the pictures bucket. The
-- sites now ask the server where a picture goes: it picks the folder (the
-- member's own, or a company's they own) and the file name, and hands back a
-- one-time token for exactly that address. So the policies that let a member
-- insert or update objects go, and with no policy left only the servers can
-- write. The bucket is public, so reading a picture by its address never
-- needed one.
--
-- Run this only once every deployment that uploaded with the member's own
-- session is gone.
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end
$$;
