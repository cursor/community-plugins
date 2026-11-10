/**
 * Shared slug helpers for plugins and their components.
 *
 * Pure module (no server-only deps) so it's safe to import from client forms,
 * server actions, the GitHub parser, and seed scripts alike.
 */

// Cap slugs at 80 chars. Per-slug static routes (e.g. the legacy `/[slug]`
// redirects) are prerendered, so Vercel writes a `<slug>.prerender-config.json`
// file per known slug at build time; a longer slug blows past the 255-byte filesystem
// name limit (ENAMETOOLONG) and breaks the build. It also satisfies the
// `plugin_components_slug_length_check` Postgres constraint. 80 chars leaves
// ample headroom for disambiguating suffixes.
export const MAX_SLUG_LENGTH = 80;

/**
 * Derive a URL/filename-safe slug from arbitrary text, capped at
 * `MAX_SLUG_LENGTH`. Quotes and dots are dropped (so `react.js` → `reactjs`)
 * rather than turned into separators.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/['".]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
}

/**
 * Resolve a component's effective slug: an explicit slug if provided, else one
 * derived from its name. Always capped so DB writes satisfy the length
 * constraint and rescan-diff keys match the value stored on the row.
 */
export function resolveComponentSlug(comp: {
  slug?: string | null;
  name: string;
}): string {
  if (comp.slug) {
    return comp.slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "");
  }
  return slugify(comp.name);
}
