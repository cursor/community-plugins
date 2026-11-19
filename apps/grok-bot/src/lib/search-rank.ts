import type { FuseResult } from "fuse.js";

/**
 * How loosely a search matches. Looser than this and a short word matches
 * most of the directory ("seo" found nearly every bot); this still forgives
 * a typo ("recipt", "calender").
 */
export const SEARCH_THRESHOLD = 0.3;

// Scores this close count as equally relevant, so the list's own order
// (most added, newest) decides between them.
const STEP = 0.05;

/**
 * Search results in the order to show them: a name that is exactly what was
 * typed, then the closest matches, and `listOrder` among equally close ones.
 * (Sorting matches by adds alone buried the bot someone searched for by name
 * under popular bots that barely matched.)
 */
export function rankResults<T extends { name: string }>(
  results: FuseResult<T>[],
  query: string,
  listOrder: (a: T, b: T) => number,
): T[] {
  const q = query.trim().toLowerCase();
  const exact = (item: T) => Number(item.name.toLowerCase() === q);
  const closeness = (r: FuseResult<T>) => Math.round((r.score ?? 0) / STEP);
  return [...results]
    .sort(
      (a, b) =>
        exact(b.item) - exact(a.item) ||
        closeness(a) - closeness(b) ||
        listOrder(a.item, b.item),
    )
    .map((r) => r.item);
}
