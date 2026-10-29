-- Keep generated plugin slugs away from the static routes under /plugins/.
--
-- Why: `generate_plugin_slug` derives the slug from the plugin name and the
-- app always inserts without a slug. A plugin named "New" (or "new!", " NEW ")
-- gets the slug `new`, and `/plugins/new` is the submission form
-- (`apps/cursor/src/app/plugins/new/page.tsx`); Next.js resolves the static
-- segment before `[slug]`, so every link to that plugin opens the form instead
-- of the listing. `opengraph-image` is the other static sibling
-- (`apps/cursor/src/app/plugins/opengraph-image.tsx`). `next.config.mjs`
-- already carves `new` out of the `/mcp/:slug` redirect for the same reason.
--
-- Fix: when the derived slug is one of those names, append `-plugin` before
-- the existing duplicate check. Explicit slugs and existing rows are left as
-- they are.

create or replace function public.generate_plugin_slug()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_slug text;
begin
  if new.slug is not null and new.slug <> '' then
    return new;
  end if;
  v_slug := btrim(regexp_replace(lower(new.name), '[^a-z0-9]+', '-', 'g'), '-');
  if v_slug is null or v_slug = '' then
    v_slug := 'plugin';
  end if;
  -- Static routes under apps/cursor/src/app/plugins/ that would shadow /plugins/<slug>.
  if v_slug in ('new', 'opengraph-image') then
    v_slug := v_slug || '-plugin';
  end if;
  v_slug := left(v_slug, 80);
  if exists (select 1 from public.plugins p where p.slug = v_slug) then
    v_slug := left(v_slug, 73) || '-' || substr(md5(random()::text), 1, 6);
  end if;
  new.slug := v_slug;
  return new;
end;
$fn$;
